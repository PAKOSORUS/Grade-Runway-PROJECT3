// Runs against the Firestore emulator: npm test.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const accounts = require("../lib/accounts");
const learners = require("../lib/learners");
const history = require("../lib/history");

if (getApps().length === 0) initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();
const admin = { uid: "admin-1" };
const code = (p) => p.then(() => null, (e) => e.code);

async function reset() {
  for (const name of ["users", "advisorAssignments", "configChangeAudits"]) {
    const snap = await db.collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  const users = {
    "admin-1": { name: "Admin", status: "active", roles: ["admin"] },
    "adv-1": { name: "Advisor 1", status: "active", roles: ["advisor"] },
    "adv-2": { name: "Advisor 2", status: "active", roles: ["advisor"] },
    "stu-1": { name: "Student 1", email: "s1@example.com", status: "active", roles: ["student"], source: "imported", legacyId: "L1" },
    "stu-2": { name: "Student 2", status: "active", roles: ["student"] },
    "lec-1": { name: "Lecturer", status: "active", roles: ["lecturer"] },
  };
  for (const [id, u] of Object.entries(users)) await db.collection("users").doc(id).set(u);
  await accounts.assignLearner(db, admin, { advisorId: "adv-1", learnerId: "stu-1" });
}

test.beforeEach(reset);

test("learner reads own profile; internals are not returned", async () => {
  const p = await learners.getLearnerProfile(db, { uid: "stu-1" }, { learnerId: "stu-1" });
  assert.deepEqual(p, { learnerId: "stu-1", name: "Student 1", email: "s1@example.com", status: "active" });
});

test("learner cannot read another learner", async () => {
  assert.equal(await code(learners.getLearnerProfile(db, { uid: "stu-2" }, { learnerId: "stu-1" })), "permission-denied");
});

test("advisor reads only learners assigned to them", async () => {
  const p = await learners.getLearnerProfile(db, { uid: "adv-1" }, { learnerId: "stu-1" });
  assert.equal(p.name, "Student 1");
  assert.equal(await code(learners.getLearnerProfile(db, { uid: "adv-1" }, { learnerId: "stu-2" })), "permission-denied");
  assert.equal(await code(learners.getLearnerProfile(db, { uid: "adv-2" }, { learnerId: "stu-1" })), "permission-denied");
});

test("access ends when the relationship is ended or transferred", async () => {
  await accounts.transferLearner(db, admin, { learnerId: "stu-1", fromAdvisorId: "adv-1", toAdvisorId: "adv-2" });
  assert.equal(await code(learners.getLearnerProfile(db, { uid: "adv-1" }, { learnerId: "stu-1" })), "permission-denied");
  assert.equal((await learners.getLearnerProfile(db, { uid: "adv-2" }, { learnerId: "stu-1" })).name, "Student 1");
});

test("lecturer, admin, unauthenticated and disabled accounts are denied", async () => {
  assert.equal(await code(learners.getLearnerProfile(db, { uid: "lec-1" }, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(learners.getLearnerProfile(db, admin, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(learners.getLearnerProfile(db, null, { learnerId: "stu-1" })), "unauthenticated");
  await db.collection("users").doc("stu-1").update({ status: "disabled" });
  assert.equal(await code(learners.getLearnerProfile(db, { uid: "stu-1" }, { learnerId: "stu-1" })), "permission-denied");
});

test("missing learnerId is rejected", async () => {
  assert.equal(await code(learners.getLearnerProfile(db, { uid: "stu-1" }, {})), "invalid-argument");
});

test("listMyLearners returns only the advisor's active learners", async () => {
  await accounts.assignLearner(db, admin, { advisorId: "adv-1", learnerId: "stu-2" });
  await accounts.unassignLearner(db, admin, { advisorId: "adv-1", learnerId: "stu-2" });
  const mine = await learners.listMyLearners(db, { uid: "adv-1" });
  assert.deepEqual(mine, [{ learnerId: "stu-1", name: "Student 1" }]);
  assert.deepEqual(await learners.listMyLearners(db, { uid: "adv-2" }), []);
  assert.equal(await code(learners.listMyLearners(db, { uid: "stu-1" })), "permission-denied");
});

test("admin lists change history newest first, filters, and caps limit", async () => {
  await accounts.upsertUser(db, admin, { uid: "n1", name: "N1", roles: ["student"] });
  await accounts.setUserStatus(db, admin, { uid: "n1", status: "disabled" });
  const all = await history.listChangeAudits(db, admin, {});
  assert.ok(all.length >= 3);
  assert.ok(all[0].at >= all[all.length - 1].at);
  const one = await history.listChangeAudits(db, admin, { targetId: "n1" });
  assert.deepEqual(one.map((x) => x.action).sort(), ["create", "update"]);
  assert.equal(one[0].actorId, "admin-1");
  const accountsOnly = await history.listChangeAudits(db, admin, { category: "advisorAssignment" });
  assert.ok(accountsOnly.every((x) => x.category === "advisorAssignment"));
  assert.equal((await history.listChangeAudits(db, admin, { limit: 1 })).length, 1);
  assert.equal(await code(history.listChangeAudits(db, admin, { limit: 0 })), "invalid-argument");
  assert.equal(await code(history.listChangeAudits(db, admin, { limit: 1000 })), "invalid-argument");
});

test("change history is Admin only", async () => {
  assert.equal(await code(history.listChangeAudits(db, { uid: "adv-1" }, {})), "permission-denied");
  assert.equal(await code(history.listChangeAudits(db, { uid: "lec-1" }, {})), "permission-denied");
  assert.equal(await code(history.listChangeAudits(db, null, {})), "unauthenticated");
});
