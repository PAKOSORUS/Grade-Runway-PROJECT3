// Runs against the Firestore emulator: npm test.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const eligibility = require("../lib/eligibility");

if (getApps().length === 0) initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();
const admin = { uid: "admin-1" };
const code = (p) => p.then(() => null, (e) => e.code);

async function reset() {
  for (const c of ["users", "eligibilityCriteria", "configChangeAudits"]) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.collection("users").doc("admin-1").set({ name: "Admin", status: "active", roles: ["admin"] });
  await db.collection("users").doc("lec-1").set({ name: "Lecturer", status: "active", roles: ["lecturer"] });
  await db.collection("users").doc("stu-1").set({ name: "Student", status: "active", roles: ["student"] });
}

const audits = async () => (await db.collection("configChangeAudits").get()).docs.map((d) => d.data());

test.beforeEach(reset);

test("first criteria becomes version 1 and current; audited with no before-value", async () => {
  const r = await eligibility.setEligibilityCriteria(db, admin, { rules: { minAverage: 3.5 } });
  assert.deepEqual(r, { id: "criteria-v1", version: 1 });
  const doc = (await db.collection("eligibilityCriteria").doc("criteria-v1").get()).data();
  assert.equal(doc.isCurrent, true);
  assert.deepEqual(doc.rules, { minAverage: 3.5 });
  assert.equal(doc.setById, "admin-1");
  assert.equal(doc.setByName, "Admin");
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].category, "eligibilityCriteria");
  assert.equal(a[0].action, "create");
  assert.equal(a[0].before, null);
  assert.deepEqual(a[0].after, { version: 1, rules: { minAverage: 3.5 } });
});

test("changing the criteria creates a new version, keeps the old one unchanged, audits before and after", async () => {
  await eligibility.setEligibilityCriteria(db, admin, { rules: { minAverage: 3.5 } });
  const r = await eligibility.setEligibilityCriteria(db, admin, { rules: { minAverage: 3.0, minAttendance: 0.8 } });
  assert.equal(r.version, 2);
  const v1 = (await db.collection("eligibilityCriteria").doc("criteria-v1").get()).data();
  const v2 = (await db.collection("eligibilityCriteria").doc("criteria-v2").get()).data();
  assert.equal(v1.isCurrent, false);
  assert.deepEqual(v1.rules, { minAverage: 3.5 });
  assert.equal(v2.isCurrent, true);
  const current = (await db.collection("eligibilityCriteria").where("isCurrent", "==", true).get()).size;
  assert.equal(current, 1);
  const last = (await audits()).find((x) => x.action === "update");
  assert.deepEqual(last.before, { version: 1, rules: { minAverage: 3.5 } });
  assert.deepEqual(last.after, { version: 2, rules: { minAverage: 3.0, minAttendance: 0.8 } });
});

test("a seeded criteria document without rules is replaced by the next version", async () => {
  await db.collection("eligibilityCriteria").doc("criteria-v1").set({ version: 1, isCurrent: true, setById: "x", setByName: "x" });
  const r = await eligibility.setEligibilityCriteria(db, admin, { rules: { a: 1 } });
  assert.equal(r.version, 2);
  assert.equal((await db.collection("eligibilityCriteria").doc("criteria-v1").get()).data().isCurrent, false);
  assert.deepEqual((await audits())[0].before, { version: 1, rules: {} });
});

test("only Admin can set or read; invalid rules are rejected and nothing is written", async () => {
  assert.equal(await code(eligibility.setEligibilityCriteria(db, { uid: "lec-1" }, { rules: {} })), "permission-denied");
  assert.equal(await code(eligibility.setEligibilityCriteria(db, { uid: "stu-1" }, { rules: {} })), "permission-denied");
  assert.equal(await code(eligibility.setEligibilityCriteria(db, null, { rules: {} })), "unauthenticated");
  assert.equal(await code(eligibility.getEligibilityCriteria(db, { uid: "lec-1" })), "permission-denied");
  for (const bad of [undefined, null, "text", 5, [1, 2], { big: "x".repeat(30_000) }]) {
    assert.equal(await code(eligibility.setEligibilityCriteria(db, admin, { rules: bad })), "invalid-argument");
  }
  assert.equal((await db.collection("eligibilityCriteria").get()).size, 0);
  assert.equal((await audits()).length, 0);
});

test("Admin reads the current criteria; null when none", async () => {
  assert.equal(await eligibility.getEligibilityCriteria(db, admin), null);
  await eligibility.setEligibilityCriteria(db, admin, { rules: { minAverage: 3 } });
  await eligibility.setEligibilityCriteria(db, admin, { rules: { minAverage: 2.5 } });
  const c = await eligibility.getEligibilityCriteria(db, admin);
  assert.equal(c.version, 2);
  assert.deepEqual(c.rules, { minAverage: 2.5 });
  assert.equal(c.setByName, "Admin");
  assert.ok(c.setAt);
});
