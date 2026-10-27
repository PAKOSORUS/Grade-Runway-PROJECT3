// Runs against the Firestore emulator: npm test.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const policy = require("../lib/policy");
const chat = require("../lib/chat");
const history = require("../lib/history");

if (getApps().length === 0) initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();
const code = (p) => p.then(() => null, (e) => e.code);

const ADMIN = { uid: "admin-1" };
const S1 = { uid: "stu-1" };
const S2 = { uid: "stu-2" };
const R1 = { uid: "rev-1" };
const T0 = new Date("2026-10-20T10:00:00Z");

async function clear(name) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

test.beforeEach(async () => {
  for (const c of ["users", "chatMessages", "reviewLocks", "auditEvents", "notifications", "eligibilityResults", "systemPolicy", "configChangeAudits"]) await clear(c);
  const users = {
    "admin-1": { name: "Admin", status: "active", roles: ["admin"] },
    "stu-1": { name: "Student 1", status: "active", roles: ["student"] },
    "stu-2": { name: "Student 2", status: "active", roles: ["student"] },
    "rev-1": { name: "Reviewer 1", status: "active", roles: ["lecturer"] },
  };
  for (const [id, u] of Object.entries(users)) await db.collection("users").doc(id).set(u);
  await db.collection("eligibilityResults").doc("stu-1").set({ eligible: true });
});

const audits = async () => (await db.collection("configChangeAudits").get()).docs.map((d) => d.data());

test("only Admin reads or sets the policy; nothing is written otherwise", async () => {
  assert.equal(await code(policy.getSystemPolicy(db, null)), "unauthenticated");
  assert.equal(await code(policy.getSystemPolicy(db, R1)), "permission-denied");
  assert.equal(await code(policy.setSystemPolicy(db, R1, { showSenderName: true })), "permission-denied");
  assert.equal(await code(policy.setSystemPolicy(db, S1, { showSenderName: true })), "permission-denied");
  assert.equal((await db.doc("systemPolicy/current").get()).exists, false);
  assert.equal((await audits()).length, 0);
});

test("defaults: sender name hidden, optional values empty", async () => {
  const p = await policy.getSystemPolicy(db, ADMIN);
  assert.equal(p.showSenderName, false);
  assert.equal(p.lockDurationMinutes, null);
  assert.equal(p.updatedBy, null);
});

test("invalid values are rejected and nothing is written", async () => {
  for (const bad of [
    {},
    { lockDurationMinutes: 0 },
    { lockDurationMinutes: "15" },
    { syncIntervalMinutes: -1 },
    { showSenderName: "yes" },
    { maxMissingImportPercent: 101 },
    { maxMissingImportPercent: -1 },
    { showSenderName: true, lockDurationMinutes: 0 },
  ]) {
    assert.equal(await code(policy.setSystemPolicy(db, ADMIN, bad)), "invalid-argument", JSON.stringify(bad));
  }
  assert.equal((await db.doc("systemPolicy/current").get()).exists, false);
  assert.equal((await audits()).length, 0);
});

test("a change is saved with who/when and an audit of only the changed fields", async () => {
  const p = await policy.setSystemPolicy(db, ADMIN, { showSenderName: true, lockDurationMinutes: 30, maxMissingImportPercent: 0 });
  assert.equal(p.showSenderName, true);
  assert.equal(p.lockDurationMinutes, 30);
  assert.equal(p.maxMissingImportPercent, 0);
  assert.equal(p.updatedBy, "admin-1");
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].category, "systemPolicy");
  assert.equal(a[0].actorId, "admin-1");
  assert.deepEqual(a[0].before, { showSenderName: false, lockDurationMinutes: null, maxMissingImportPercent: null });
  assert.deepEqual(a[0].after, { showSenderName: true, lockDurationMinutes: 30, maxMissingImportPercent: 0 });

  await policy.setSystemPolicy(db, ADMIN, { lockDurationMinutes: 10, showSenderName: true });
  const all = await audits();
  assert.equal(all.length, 2);
  const second = all.find((x) => x.after.lockDurationMinutes === 10);
  assert.deepEqual(second.before, { lockDurationMinutes: 30 });
  assert.deepEqual(second.after, { lockDurationMinutes: 10 });
});

test("setting the same values again writes no audit", async () => {
  await policy.setSystemPolicy(db, ADMIN, { lockDurationMinutes: 30 });
  await policy.setSystemPolicy(db, ADMIN, { lockDurationMinutes: 30 });
  await policy.setSystemPolicy(db, ADMIN, { showSenderName: false });
  assert.equal((await audits()).length, 1);
});

test("policy changes show in the Admin change history", async () => {
  await policy.setSystemPolicy(db, ADMIN, { showSenderName: true });
  const h = await history.listChangeAudits(db, ADMIN, { category: "systemPolicy" });
  assert.equal(h.length, 1);
  assert.equal(h[0].after.showSenderName, true);
});

test("sender-name policy applies to the room on the next read, without touching messages", async () => {
  const { messageId } = await chat.sendMessage(db, S1, { content: "แนะนำให้ทบทวนทุกวัน" });
  const lock = await chat.lockMessage(db, R1, { messageId }, { now: T0 });
  await chat.decideMessage(db, R1, { messageId, token: lock.token, outcome: "approve", negative: false }, { now: T0 });
  const before = (await db.collection("chatMessages").doc(messageId).get()).data();

  assert.equal("senderName" in (await chat.listApprovedMessages(db, S2, {}))[0], false);
  await policy.setSystemPolicy(db, ADMIN, { showSenderName: true });
  assert.equal((await chat.listApprovedMessages(db, S2, {}))[0].senderName, "Student 1");
  await policy.setSystemPolicy(db, ADMIN, { showSenderName: false });
  assert.equal("senderName" in (await chat.listApprovedMessages(db, S2, {}))[0], false);
  assert.deepEqual((await db.collection("chatMessages").doc(messageId).get()).data(), before);
});

test("new lock duration applies to later locks only", async () => {
  const a = (await chat.sendMessage(db, S1, { content: "ข้อความ ก" })).messageId;
  const b = (await chat.sendMessage(db, S1, { content: "ข้อความ ข" })).messageId;
  const l1 = await chat.lockMessage(db, R1, { messageId: a }, { now: T0 });
  await policy.setSystemPolicy(db, ADMIN, { lockDurationMinutes: 5 });
  const l2 = await chat.lockMessage(db, R1, { messageId: b }, { now: T0 });
  assert.equal(new Date(l1.expiresAt).getTime() - T0.getTime(), 15 * 60_000);
  assert.equal(new Date(l2.expiresAt).getTime() - T0.getTime(), 5 * 60_000);
});
