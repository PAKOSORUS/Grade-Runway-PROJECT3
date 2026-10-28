// Runs against the Firestore emulator: npm test (uses firebase emulators:exec).
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const accounts = require("../lib/accounts");

initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();

const ADMIN = { uid: "admin-1" };
const asAdmin = ADMIN;

async function reset() {
  for (const name of ["users", "advisorAssignments", "configChangeAudits"]) {
    const snap = await db.collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.collection("users").doc("admin-1").set({
    name: "Admin", status: "active", roles: ["admin"], source: "admin",
  });
  await db.collection("users").doc("adv-1").set({ name: "Advisor 1", status: "active", roles: ["advisor"] });
  await db.collection("users").doc("adv-2").set({ name: "Advisor 2", status: "active", roles: ["advisor"] });
  await db.collection("users").doc("stu-1").set({ name: "Student 1", status: "active", roles: ["student"] });
  await db.collection("users").doc("lec-1").set({ name: "Lecturer", status: "active", roles: ["lecturer"] });
}

const audits = async () => (await db.collection("configChangeAudits").get()).docs.map((d) => d.data());
const code = (p) => p.then(() => null, (e) => e.code);

test.beforeEach(reset);

test("non-admin and unauthenticated callers are rejected and nothing is written", async () => {
  assert.equal(await code(accounts.upsertUser(db, null, { uid: "x", name: "X", roles: ["student"] })), "unauthenticated");
  assert.equal(await code(accounts.upsertUser(db, { uid: "lec-1" }, { uid: "x", name: "X", roles: ["student"] })), "permission-denied");
  assert.equal(await code(accounts.upsertUser(db, { uid: "ghost" }, { uid: "x", name: "X", roles: ["student"] })), "permission-denied");
  assert.equal((await db.collection("users").doc("x").get()).exists, false);
  assert.equal((await audits()).length, 0);
});

test("disabled admin is rejected", async () => {
  await db.collection("users").doc("admin-1").update({ status: "disabled" });
  assert.equal(await code(accounts.upsertUser(db, asAdmin, { uid: "x", name: "X", roles: ["student"] })), "permission-denied");
});

test("admin creates an account: marked source admin, audited with actor and after-value", async () => {
  await accounts.upsertUser(db, asAdmin, { uid: "new-1", name: "New", email: "n@example.com", roles: ["student"] });
  const u = (await db.collection("users").doc("new-1").get()).data();
  assert.equal(u.source, "admin");
  assert.equal(u.status, "active");
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].category, "account");
  assert.equal(a[0].action, "create");
  assert.equal(a[0].actorId, "admin-1");
  assert.equal(a[0].before, null);
  assert.deepEqual(a[0].after.roles, ["student"]);
  assert.ok(a[0].at);
});

test("edit records before and after values; disabling works", async () => {
  await accounts.setUserStatus(db, asAdmin, { uid: "stu-1", status: "disabled" });
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].before.status, "active");
  assert.equal(a[0].after.status, "disabled");
  assert.equal((await db.collection("users").doc("stu-1").get()).data().status, "disabled");
});

test("validation: bad role, missing fields for new account", async () => {
  assert.equal(await code(accounts.upsertUser(db, asAdmin, { uid: "n", name: "N", roles: ["boss"] })), "invalid-argument");
  assert.equal(await code(accounts.upsertUser(db, asAdmin, { uid: "n", roles: ["student"] })), "invalid-argument");
  assert.equal(await code(accounts.upsertUser(db, asAdmin, { name: "N", roles: ["student"] })), "invalid-argument");
  assert.equal((await audits()).length, 0);
});

test("admin cannot remove own admin role or disable self", async () => {
  assert.equal(await code(accounts.upsertUser(db, asAdmin, { uid: "admin-1", roles: ["lecturer"] })), "failed-precondition");
  assert.equal(await code(accounts.setUserStatus(db, asAdmin, { uid: "admin-1", status: "disabled" })), "failed-precondition");
  assert.equal((await audits()).length, 0);
});

test("assign: one learner can have several advisors; duplicates rejected; audited", async () => {
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-2", learnerId: "stu-1" });
  assert.equal(await code(accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" })), "failed-precondition");
  const active = (await db.collection("advisorAssignments").where("status", "==", "active").get()).size;
  assert.equal(active, 2);
  assert.equal((await audits()).length, 2);
});

test("assign rejects wrong roles and non-admin callers", async () => {
  assert.equal(await code(accounts.assignLearner(db, asAdmin, { advisorId: "lec-1", learnerId: "stu-1" })), "failed-precondition");
  assert.equal(await code(accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "adv-2" })), "failed-precondition");
  assert.equal(await code(accounts.assignLearner(db, { uid: "adv-1" }, { advisorId: "adv-1", learnerId: "stu-1" })), "permission-denied");
  assert.equal((await db.collection("advisorAssignments").get()).size, 0);
});

test("unassign ends the relationship and audits it; unknown pair is not-found", async () => {
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  await accounts.unassignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  assert.equal((await db.collection("advisorAssignments").doc("adv-1_stu-1").get()).data().status, "ended");
  assert.equal(await code(accounts.unassignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" })), "not-found");
  const a = (await audits()).filter((x) => x.action === "unassign");
  assert.equal(a.length, 1);
  assert.equal(a[0].before.status, "active");
  assert.equal(a[0].after.status, "ended");
});

test("transfer moves the learner atomically with one audit record", async () => {
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  await accounts.transferLearner(db, asAdmin, { learnerId: "stu-1", fromAdvisorId: "adv-1", toAdvisorId: "adv-2" });
  assert.equal((await db.collection("advisorAssignments").doc("adv-1_stu-1").get()).data().status, "ended");
  assert.equal((await db.collection("advisorAssignments").doc("adv-2_stu-1").get()).data().status, "active");
  assert.equal((await audits()).filter((x) => x.action === "transfer").length, 1);
});

test("failed transfer changes nothing (no partial write, no audit)", async () => {
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  const before = (await audits()).length;
  // target advisor lacks the advisor role -> whole transaction must fail
  assert.equal(await code(accounts.transferLearner(db, asAdmin, { learnerId: "stu-1", fromAdvisorId: "adv-1", toAdvisorId: "lec-1" })), "failed-precondition");
  assert.equal((await db.collection("advisorAssignments").doc("adv-1_stu-1").get()).data().status, "active");
  assert.equal((await audits()).length, before);
});

test("listAssignments is Admin only and returns active and ended relationships, active first", async () => {
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-2", learnerId: "stu-1" });
  await accounts.unassignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });

  assert.equal(await code(accounts.listAssignments(db, null, {})), "unauthenticated");
  assert.equal(await code(accounts.listAssignments(db, { uid: "lec-1" }, {})), "permission-denied");
  assert.equal(await code(accounts.listAssignments(db, { uid: "adv-1" }, {})), "permission-denied");

  const rows = await accounts.listAssignments(db, asAdmin, {});
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.advisorId, r.status]), [["adv-2", "active"], ["adv-1", "ended"]]);
  assert.equal(rows[0].learnerName, "Student 1");
  assert.equal(rows[0].advisorName, "Advisor 2");
  assert.equal(rows[0].source, "admin");
  assert.ok(rows[0].updatedAt);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["advisorId", "advisorName", "id", "learnerId", "learnerName", "source", "status", "updatedAt"]);
});

test("listAssignments filters by advisor and by learner, and an ended pair can be assigned again", async () => {
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-2", learnerId: "stu-1" });
  assert.deepEqual((await accounts.listAssignments(db, asAdmin, { advisorId: "adv-2" })).map((r) => r.advisorId), ["adv-2"]);
  assert.equal((await accounts.listAssignments(db, asAdmin, { learnerId: "stu-1" })).length, 2);
  assert.equal((await accounts.listAssignments(db, asAdmin, { learnerId: "nobody" })).length, 0);

  await accounts.unassignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  assert.equal((await accounts.listAssignments(db, asAdmin, { advisorId: "adv-1" }))[0].status, "ended");
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  const again = await accounts.listAssignments(db, asAdmin, { advisorId: "adv-1" });
  assert.equal(again.length, 1);
  assert.equal(again[0].status, "active");
});

test("listAssignments is read-only: it writes no audit record", async () => {
  await accounts.assignLearner(db, asAdmin, { advisorId: "adv-1", learnerId: "stu-1" });
  const before = (await audits()).length;
  await accounts.listAssignments(db, asAdmin, {});
  assert.equal((await audits()).length, before);
});
