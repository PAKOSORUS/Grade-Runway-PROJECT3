// Runs against the Firestore emulator: npm test.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { migrateLegacyLocks } = require("../lib/migrate-locks");
const chat = require("../lib/chat");

if (getApps().length === 0) initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();

async function clear(name) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

const exp = Timestamp.fromMillis(Date.parse("2026-10-20T10:15:00Z"));

test.beforeEach(async () => {
  for (const c of ["chatMessages", "reviewLocks", "users", "auditEvents"]) await clear(c);
  await db.collection("users").doc("rev-1").set({ name: "R", status: "active", roles: ["lecturer"] });
  const base = { senderId: "stu-1", senderName: "S", content: "x", status: "pending", sentAt: Timestamp.now() };
  await db.collection("chatMessages").doc("m1").set({ ...base, lock: { holderId: "rev-1", token: "tok-1", expiresAt: exp } });
  await db.collection("chatMessages").doc("m2").set(base);
  await db.collection("chatMessages").doc("m3").set({ ...base, lock: { token: "no-holder" } });
  await db.collection("chatMessages").doc("m4").set({ ...base, lock: { holderId: "rev-1", token: "old", expiresAt: exp } });
  await db.collection("reviewLocks").doc("m4").set({ holderId: "rev-1", token: "new", expiresAt: exp });
});

test("dry run reports counts and writes nothing", async () => {
  const r = await migrateLegacyLocks(db);
  assert.deepEqual([r.found, r.moved, r.droppedMalformed, r.applied], [3, 2, 1, false]);
  assert.ok((await db.collection("chatMessages").doc("m1").get()).data().lock);
  assert.equal((await db.collection("reviewLocks").doc("m1").get()).exists, false);
});

test("apply moves valid locks, drops malformed ones, keeps an existing reviewLocks document", async () => {
  const r = await migrateLegacyLocks(db, { apply: true });
  assert.deepEqual([r.found, r.moved, r.droppedMalformed, r.alreadyMoved], [3, 1, 1, 1]);
  assert.deepEqual((await db.collection("reviewLocks").doc("m1").get()).data(), { holderId: "rev-1", token: "tok-1", expiresAt: exp });
  assert.equal((await db.collection("reviewLocks").doc("m3").get()).exists, false);
  assert.equal((await db.collection("reviewLocks").doc("m4").get()).data().token, "new");
  for (const id of ["m1", "m3", "m4"]) assert.equal("lock" in (await db.collection("chatMessages").doc(id).get()).data(), false);
});

test("is idempotent, and the moved lock is honoured by the chat handlers", async () => {
  await migrateLegacyLocks(db, { apply: true });
  const again = await migrateLegacyLocks(db, { apply: true });
  assert.equal(again.found, 0);
  const d = await chat.decideMessage(db, { uid: "rev-1" }, { messageId: "m1", token: "tok-1", outcome: "approve", negative: false }, { now: new Date("2026-10-20T10:00:00Z") });
  assert.equal(d.status, "approved");
});
