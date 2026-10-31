// Runs against the Firestore emulator: npm test.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const chat = require("../lib/chat");

if (getApps().length === 0) initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();
const code = (p) => p.then(() => null, (e) => e.code);

const S1 = { uid: "stu-1" };
const S2 = { uid: "stu-2" };
const R1 = { uid: "rev-1" };
const R2 = { uid: "rev-2" };
const T0 = new Date("2026-10-20T10:00:00Z");
const at = (min) => new Date(T0.getTime() + min * 60_000);

async function clear(name) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function reset() {
  for (const c of ["users", "chatMessages", "reviewLocks", "auditEvents", "notifications", "eligibilityResults", "systemPolicy"]) await clear(c);
  const users = {
    "stu-1": { name: "Student 1", status: "active", roles: ["student"] },
    "stu-2": { name: "Student 2", status: "active", roles: ["student"] },
    "rev-1": { name: "Reviewer 1", status: "active", roles: ["lecturer"] },
    "rev-2": { name: "Reviewer 2", status: "active", roles: ["admin"] },
  };
  for (const [id, u] of Object.entries(users)) await db.collection("users").doc(id).set(u);
  await db.collection("eligibilityResults").doc("stu-1").set({ eligible: true });
  await db.collection("eligibilityResults").doc("stu-2").set({ eligible: false });
}

const msg = async (id) => (await db.collection("chatMessages").doc(id).get()).data();
const lockOf = async (id) => (await db.collection("reviewLocks").doc(id).get()).data();
const events = async (type) =>
  (await db.collection("auditEvents").get()).docs.map((d) => d.data()).filter((e) => !type || e.type === type);
const notes = async () => (await db.collection("notifications").get()).docs.map((d) => d.data());

async function sent(auth = S1, content = "แนะนำให้ทบทวนทุกวัน") {
  return (await chat.sendMessage(db, auth, { content })).messageId;
}

test.beforeEach(reset);

test("eligible student sends: message is pending; ineligible, unknown and non-students cannot", async () => {
  const id = await sent();
  const m = await msg(id);
  assert.equal(m.status, "pending");
  assert.equal(m.senderId, "stu-1");
  assert.equal(m.resubmitOfId, null);
  assert.equal(await code(chat.sendMessage(db, S2, { content: "x" })), "permission-denied");
  assert.equal(await code(chat.sendMessage(db, R1, { content: "x" })), "permission-denied");
  assert.equal(await code(chat.sendMessage(db, null, { content: "x" })), "unauthenticated");
  assert.equal(await code(chat.sendMessage(db, S1, { content: "  " })), "invalid-argument");
  await db.collection("eligibilityResults").doc("stu-1").delete();
  assert.equal(await code(chat.sendMessage(db, S1, { content: "x" })), "permission-denied");
});

test("room shows approved messages only, no sender name by default, name when policy says so", async () => {
  const a = await sent();
  await sent();
  const lock = await chat.lockMessage(db, R1, { messageId: a }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: a, token: lock.token, outcome: "approve", negative: false }, { now: at(1) });
  const room = await chat.listApprovedMessages(db, S2, {});
  assert.equal(room.length, 1);
  assert.equal(room[0].id, a);
  assert.equal("senderName" in room[0], false);
  assert.equal(JSON.stringify(room).includes("stu-1"), false);
  await db.collection("systemPolicy").doc("current").set({ showSenderName: true });
  assert.equal((await chat.listApprovedMessages(db, S2, {}))[0].senderName, "Student 1");
  assert.equal(await code(chat.listApprovedMessages(db, R1, {})), "permission-denied");
});

test("review queue: reviewers only, pending only, locked messages hidden, no lock data leaked", async () => {
  const a = await sent();
  const b = await sent();
  assert.equal(await code(chat.listReviewQueue(db, S1, {})), "permission-denied");
  assert.equal((await chat.listReviewQueue(db, R1, {}, { now: at(0) })).length, 2);
  await chat.lockMessage(db, R1, { messageId: a }, { now: at(0) });
  const q = await chat.listReviewQueue(db, R2, {}, { now: at(1) });
  assert.deepEqual(q.map((x) => x.id), [b]);
  assert.equal(JSON.stringify(q).includes("token"), false);
  // the holder still sees their own locked message, flagged, with the expiry
  const mine = await chat.listReviewQueue(db, R1, {}, { now: at(1) });
  assert.equal(mine.length, 2);
  const locked = mine.find((x) => x.id === a);
  assert.equal(locked.lockedByMe, true);
  assert.ok(locked.lockExpiresAt);
  assert.equal(mine.find((x) => x.id === b).lockedByMe, false);
  assert.equal(JSON.stringify(mine).includes("token"), false);
  // after the lock expires the message returns to the queue
  assert.equal((await chat.listReviewQueue(db, R2, {}, { now: at(60) })).length, 2);
});

test("only one reviewer can hold a live lock; the holder can refresh; expired lock can be taken", async () => {
  const id = await sent();
  const l1 = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  assert.equal(await code(chat.lockMessage(db, R2, { messageId: id }, { now: at(1) })), "failed-precondition");
  const again = await chat.lockMessage(db, R1, { messageId: id }, { now: at(2) });
  assert.notEqual(again.token, l1.token);
  const l2 = await chat.lockMessage(db, R2, { messageId: id }, { now: at(120) });
  assert.ok(l2.token);
  assert.equal(await code(chat.lockMessage(db, S1, { messageId: id })), "permission-denied");
});

test("approve and reject need the right fields; reject needs a reason; negative can still be approved", async () => {
  const id = await sent();
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  const base = { messageId: id, token, outcome: "approve", negative: false };
  assert.equal(await code(chat.decideMessage(db, R1, { ...base, outcome: "maybe" }, { now: at(1) })), "invalid-argument");
  assert.equal(await code(chat.decideMessage(db, R1, { ...base, negative: undefined }, { now: at(1) })), "invalid-argument");
  assert.equal(await code(chat.decideMessage(db, R1, { ...base, outcome: "reject" }, { now: at(1) })), "invalid-argument");
  assert.equal(await code(chat.decideMessage(db, R1, { ...base, token: undefined }, { now: at(1) })), "invalid-argument");
  assert.equal((await msg(id)).status, "pending");
  // negative message approved by the reviewer's own choice (no auto rejection)
  await chat.decideMessage(db, R1, { ...base, negative: true }, { now: at(1) });
  const m = await msg(id);
  assert.equal(m.status, "approved");
  assert.equal(m.decision.negative, true);
  assert.equal(await lockOf(id), undefined);
  assert.equal("lock" in m, false);
});

test("rejection stores reason, audits, and notifies the sender with the reason", async () => {
  const id = await sent();
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: id, token, outcome: "reject", negative: true, reason: "ไม่เหมาะสม" }, { now: at(1) });
  const m = await msg(id);
  assert.equal(m.status, "rejected");
  assert.equal(m.decision.reason, "ไม่เหมาะสม");
  const ev = await events("review_decision");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].actorId, "rev-1");
  assert.equal(ev[0].outcome, "reject");
  assert.equal(ev[0].negative, true);
  const n = (await notes()).filter((x) => x.type === "message_rejected");
  assert.equal(n.length, 1);
  assert.equal(n[0].recipientId, "stu-1");
  assert.equal(n[0].reason, "ไม่เหมาะสม");
});

test("decision without a valid lock is refused: stays pending, audited, reviewer notified", async () => {
  const id = await sent();
  const l1 = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  const attempt = (auth, token, now) =>
    chat.decideMessage(db, auth, { messageId: id, token, outcome: "approve", negative: false }, { now });

  // expired
  assert.equal(await code(attempt(R1, l1.token, at(60))), "failed-precondition");
  // wrong token
  assert.equal(await code(attempt(R1, "nope", at(1))), "failed-precondition");
  // someone else locked after expiry: the old holder's token no longer works
  const l2 = await chat.lockMessage(db, R2, { messageId: id }, { now: at(60) });
  assert.equal(await code(attempt(R1, l1.token, at(61))), "failed-precondition");
  // the new holder's token used by another reviewer
  assert.equal(await code(attempt(R1, l2.token, at(61))), "failed-precondition");
  // manual release, then the old holder tries again
  await chat.releaseLock(db, R1, { messageId: id });
  assert.equal(await code(attempt(R2, l2.token, at(62))), "failed-precondition");

  assert.equal((await msg(id)).status, "pending");
  assert.equal((await msg(id)).decision, undefined);
  assert.equal((await events("review_decision")).length, 0);
  assert.equal((await events("decision_rejected")).length, 5);
  assert.equal((await notes()).filter((x) => x.type === "decision_rejected").length, 5);
});

test("a decided message cannot be decided or locked again", async () => {
  const id = await sent();
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: id, token, outcome: "approve", negative: false }, { now: at(1) });
  assert.equal(await code(chat.decideMessage(db, R1, { messageId: id, token, outcome: "reject", negative: false, reason: "x" }, { now: at(2) })), "failed-precondition");
  assert.equal(await code(chat.lockMessage(db, R1, { messageId: id }, { now: at(2) })), "failed-precondition");
  assert.equal((await msg(id)).status, "approved");
});

test("manual unlock returns the message to the queue, is audited, and is not a decision", async () => {
  const id = await sent();
  await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.releaseLock(db, R2, { messageId: id });
  assert.equal((await msg(id)).status, "pending");
  assert.equal((await chat.listReviewQueue(db, R1, {}, { now: at(1) })).length, 1);
  assert.equal((await events("unlock_manual")).length, 1);
  assert.equal(await code(chat.releaseLock(db, R2, { messageId: id })), "failed-precondition");
  assert.equal(await code(chat.releaseLock(db, S1, { messageId: id })), "permission-denied");
});

test("expired locks are swept and audited; live locks are kept", async () => {
  const a = await sent();
  const b = await sent();
  await chat.lockMessage(db, R1, { messageId: a }, { now: at(0) });
  await chat.lockMessage(db, R1, { messageId: b }, { now: at(50) });
  const r = await chat.releaseExpiredLocks(db, { now: at(60) });
  assert.equal(r.released, 1);
  assert.equal(await lockOf(a), undefined);
  assert.ok(await lockOf(b));
  assert.equal((await events("unlock_expired")).length, 1);
});

test("configured lock duration is used", async () => {
  await db.collection("systemPolicy").doc("current").set({ lockDurationMinutes: 5 });
  const id = await sent();
  const l = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  assert.equal(new Date(l.expiresAt).getTime(), at(5).getTime());
});

test("resubmit: only after rejection, only by the sender, one at a time, linked and audited", async () => {
  const id = await sent();
  assert.equal(await code(chat.resubmitMessage(db, S1, { originalId: id, content: "new" })), "failed-precondition");
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: id, token, outcome: "reject", negative: true, reason: "r" }, { now: at(1) });

  assert.equal(await code(chat.resubmitMessage(db, S2, { originalId: id, content: "new" })), "permission-denied");
  const second = (await chat.resubmitMessage(db, S1, { originalId: id, content: "ปรับแล้ว" })).messageId;
  const m = await msg(second);
  assert.equal(m.status, "pending");
  assert.equal(m.resubmitOfId, id);
  assert.equal((await msg(id)).status, "rejected");
  assert.equal((await msg(id)).content, "แนะนำให้ทบทวนทุกวัน");
  assert.equal(await code(chat.resubmitMessage(db, S1, { originalId: id, content: "again" })), "failed-precondition");
  const rel = await events("resubmit");
  assert.equal(rel.length, 1);
  assert.equal(rel[0].messageId, second);
  assert.equal(rel[0].relatedMessageId, id);

  // if the new message is rejected too, the sender may try again from it
  const l2 = await chat.lockMessage(db, R1, { messageId: second }, { now: at(2) });
  await chat.decideMessage(db, R1, { messageId: second, token: l2.token, outcome: "reject", negative: true, reason: "r2" }, { now: at(3) });
  const third = (await chat.resubmitMessage(db, S1, { originalId: second, content: "ครั้งที่สาม" })).messageId;
  assert.equal((await msg(third)).resubmitOfId, second);
});

test("a rejected original can be resubmitted again only if the earlier resubmission was also rejected", async () => {
  const id = await sent();
  const l = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: id, token: l.token, outcome: "reject", negative: true, reason: "r" }, { now: at(1) });
  const child = (await chat.resubmitMessage(db, S1, { originalId: id, content: "v2" })).messageId;
  const l2 = await chat.lockMessage(db, R1, { messageId: child }, { now: at(2) });
  await chat.decideMessage(db, R1, { messageId: child, token: l2.token, outcome: "reject", negative: true, reason: "r2" }, { now: at(3) });
  // earlier resubmission is rejected, so another try from the original is allowed
  const again = (await chat.resubmitMessage(db, S1, { originalId: id, content: "v3" })).messageId;
  assert.equal((await msg(again)).resubmitOfId, id);
});

test("resubmit also requires the sender to be eligible now", async () => {
  const id = await sent();
  const l = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: id, token: l.token, outcome: "reject", negative: true, reason: "r" }, { now: at(1) });
  await db.collection("eligibilityResults").doc("stu-1").set({ eligible: false });
  assert.equal(await code(chat.resubmitMessage(db, S1, { originalId: id, content: "v2" })), "permission-denied");
});

test("a sender who lost eligibility after sending still has the message reviewed", async () => {
  const id = await sent();
  await db.collection("eligibilityResults").doc("stu-1").set({ eligible: false });
  const l = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: id, token: l.token, outcome: "approve", negative: false }, { now: at(1) });
  assert.equal((await msg(id)).status, "approved");
});

test("lock lives in reviewLocks (Timestamp expiry), never on the chatMessages document", async () => {
  const id = await sent();
  await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  assert.ok((await lockOf(id)).expiresAt instanceof Timestamp);
  // the token must never be on the message document that reviewers can read directly
  assert.equal(JSON.stringify(await msg(id)).includes("token"), false);
});

test("approving or rejecting changes only status and decision, never content or sender", async () => {
  for (const outcome of ["approve", "reject"]) {
    const id = await sent(S1, "ข้อความที่ต้องไม่ถูกแก้ " + outcome);
    const before = await msg(id);
    const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
    await chat.decideMessage(db, R1, { messageId: id, token, outcome, negative: false, reason: outcome === "reject" ? "เหตุผล" : undefined }, { now: at(1) });
    const after = await msg(id);
    const { status: s0, decision: d0, ...rest0 } = before;
    const { status: s1, decision: d1, ...rest1 } = after;
    assert.deepEqual(rest1, rest0, "no field other than status and decision may change");
    assert.equal(rest1.senderId, "stu-1");
    assert.equal(s0, "pending");
    assert.equal(s1, outcome === "approve" ? "approved" : "rejected");
    assert.deepEqual(Object.keys(d1).sort(), ["at", "negative", "outcome", "reason", "reviewerId"]);
    assert.equal(d0, undefined);
  }
});

test("listMyMessages returns only the caller's messages with status and the rejection reason, nothing about the reviewer", async () => {
  const pending = await sent(S1, "ยังรออยู่");
  const approved = await sent(S1, "ผ่านแล้ว");
  const rejected = await sent(S1, "ถูกปฏิเสธ");
  // stu-2 is not eligible in this fixture, so write the other sender's message directly
  await db.collection("chatMessages").add({ senderId: "stu-2", senderName: "Student 2", content: "ของคนอื่น", status: "pending", sentAt: Timestamp.fromDate(at(0)), resubmitOfId: null });
  for (const [id, outcome, reason] of [[approved, "approve", undefined], [rejected, "reject", "ไม่เหมาะสม"]]) {
    const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
    await chat.decideMessage(db, R1, { messageId: id, token, outcome, negative: true, reason }, { now: at(1) });
  }
  const list = await chat.listMyMessages(db, S1, {});
  assert.deepEqual(list.map((m) => m.id).sort(), [pending, approved, rejected].sort());
  const by = Object.fromEntries(list.map((m) => [m.id, m]));
  assert.equal(by[pending].status, "pending");
  assert.equal(by[pending].reason, null);
  assert.equal(by[approved].status, "approved");
  assert.equal(by[approved].reason, null);
  assert.equal(by[rejected].status, "rejected");
  assert.equal(by[rejected].reason, "ไม่เหมาะสม");
  for (const m of list) {
    assert.deepEqual(Object.keys(m).sort(), ["content", "id", "reason", "resubmitOfId", "sentAt", "status"]);
  }
  assert.equal(by[rejected].content, "ถูกปฏิเสธ");
});

test("listMyMessages is for students only and validates limit", async () => {
  assert.equal(await code(chat.listMyMessages(db, R1, {})), "permission-denied");
  assert.equal(await code(chat.listMyMessages(db, null, {})), "unauthenticated");
  assert.equal(await code(chat.listMyMessages(db, S1, { limit: 0 })), "invalid-argument");
  assert.deepEqual(await chat.listMyMessages(db, S1, {}), []);
});

test("an account that is both student and lecturer cannot lock or decide its own message, but reviews others normally", async () => {
  for (const [uid, roles] of [["dual-1", ["student", "lecturer"]], ["dual-2", ["student", "admin"]]]) {
    await db.collection("users").doc(uid).set({ name: uid, status: "active", roles });
    await db.collection("eligibilityResults").doc(uid).set({ eligible: true });
    const D = { uid };
    const own = await sent(D, "ข้อความของผู้ตรวจเอง " + uid);
    const other = await sent(S1, "ข้อความของนักศึกษาคนอื่น " + uid);

    // lock: refused, no lock and no audit event are created
    const lockEvents = (await events("lock")).length;
    assert.equal(await code(chat.lockMessage(db, D, { messageId: own }, { now: at(0) })), "permission-denied");
    assert.equal(await lockOf(own), undefined);
    assert.equal((await events("lock")).length, lockEvents);

    // decide: refused even if a live lock for this caller somehow exists
    await db.collection("reviewLocks").doc(own).set({ holderId: uid, token: "t-own", expiresAt: Timestamp.fromDate(at(30)) });
    const decisions = (await events("review_decision")).length;
    for (const outcome of ["approve", "reject"]) {
      assert.equal(
        await code(chat.decideMessage(db, D, { messageId: own, token: "t-own", outcome, negative: false, reason: "x" }, { now: at(1) })),
        "permission-denied",
      );
    }
    const m = await msg(own);
    assert.equal(m.status, "pending");
    assert.equal(m.decision, undefined);
    assert.equal((await events("review_decision")).length, decisions);
    await db.collection("reviewLocks").doc(own).delete();

    // the queue still lists the own message, flagged; someone else's is not flagged
    const queue = await chat.listReviewQueue(db, D, {}, { now: at(2) });
    assert.equal(queue.find((q) => q.id === own).ownMessage, true);
    assert.equal(queue.find((q) => q.id === other).ownMessage, false);

    // reviewing another student's message works as usual
    const { token } = await chat.lockMessage(db, D, { messageId: other }, { now: at(3) });
    const res = await chat.decideMessage(db, D, { messageId: other, token, outcome: "approve", negative: false }, { now: at(4) });
    assert.equal(res.status, "approved");
  }
});

test("a lecturer who never sent the message is not affected by the self-review rule", async () => {
  const id = await sent(S1, "ปกติ");
  const queue = await chat.listReviewQueue(db, R1, {}, { now: at(0) });
  assert.equal(queue.find((q) => q.id === id).ownMessage, false);
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(1) });
  assert.equal((await chat.decideMessage(db, R1, { messageId: id, token, outcome: "approve", negative: true }, { now: at(2) })).status, "approved");
});

test("review queue: a resubmission carries the rejected original's content and reason, nothing identifying", async () => {
  const first = await sent(S1, "ข้อความแรก");
  const plain = await sent(S1, "ข้อความธรรมดา");
  const { token } = await chat.lockMessage(db, R1, { messageId: first }, { now: at(0) });
  await chat.decideMessage(db, R1, { messageId: first, token, outcome: "reject", negative: true, reason: "ภาษาไม่สุภาพ" }, { now: at(1) });
  const second = (await chat.resubmitMessage(db, S1, { originalId: first, content: "ข้อความที่แก้แล้ว" })).messageId;

  const queue = await chat.listReviewQueue(db, R2, {}, { now: at(2) });
  assert.equal(queue.some((q) => q.id === first), false);
  assert.deepEqual(queue.find((q) => q.id === second).previous, { content: "ข้อความแรก", reason: "ภาษาไม่สุภาพ" });
  assert.equal(queue.find((q) => q.id === plain).previous, null);
  for (const item of queue) {
    if (item.previous) assert.deepEqual(Object.keys(item.previous).sort(), ["content", "reason"]);
  }
});

// ---- saveAiSummary (AI summary kept on the message + append-only aiLog) ----

const SUMMARY = { topic: "แนะนำการทบทวนบทเรียน", cautions: ["ภาษาค่อนข้างแรง"], addressedPreviousReason: null };
const aiArgs = (messageId, token, over = {}) => ({
  messageId,
  token,
  summary: SUMMARY,
  input: { content: "แนะนำให้ทบทวนทุกวัน" },
  output: '{"topic":"แนะนำการทบทวนบทเรียน"}',
  model: "google/gemini-2.5-flash-lite",
  ...over,
});
const aiLogs = async (id) =>
  (await db.collection("chatMessages").doc(id).collection("aiLog").orderBy("createdAt", "asc").get()).docs.map((d) => d.data());

test("saveAiSummary: lock holder stores aiSuggestion + an aiLog entry + audit; status and decision untouched", async () => {
  const id = await sent();
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  const before = await msg(id);
  assert.deepEqual(await chat.saveAiSummary(db, R1, aiArgs(id, token), { now: at(1) }), { messageId: id, saved: true });

  const m = await msg(id);
  assert.deepEqual(m.aiSuggestion, SUMMARY);
  assert.equal(m.aiSuggestionBy, "rev-1");
  assert.ok(m.aiSuggestionAt);
  assert.equal(m.status, "pending");
  assert.equal(m.decision, undefined);
  for (const k of ["content", "senderId", "senderName", "sentAt", "resubmitOfId"]) {
    assert.deepEqual(m[k] ?? null, before[k] ?? null, k);
  }

  const logs = await aiLogs(id);
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0].input, { content: "แนะนำให้ทบทวนทุกวัน" });
  assert.equal(logs[0].output, '{"topic":"แนะนำการทบทวนบทเรียน"}');
  assert.equal(logs[0].model, "google/gemini-2.5-flash-lite");
  assert.equal(logs[0].savedBy, "rev-1");
  assert.ok(logs[0].createdAt);
  assert.equal(JSON.stringify(logs[0]).includes("Student 1"), false);
  assert.equal(JSON.stringify(logs[0]).includes("stu-1"), false);

  const ev = await events("ai_summary");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].messageId, id);
  assert.equal(ev[0].actorId, "rev-1");
  assert.equal((await lockOf(id)).holderId, "rev-1");
});

test("saveAiSummary: a second call overwrites aiSuggestion but never the earlier aiLog entry; null summary only logs", async () => {
  const id = await sent();
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.saveAiSummary(db, R1, aiArgs(id, token), { now: at(1) });
  const second = { topic: "สรุปครั้งที่สอง", cautions: [], addressedPreviousReason: null };
  await chat.saveAiSummary(db, R1, aiArgs(id, token, { summary: second, output: "out-2" }), { now: at(2) });
  assert.deepEqual((await msg(id)).aiSuggestion, second);
  let logs = await aiLogs(id);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].output, '{"topic":"แนะนำการทบทวนบทเรียน"}');
  assert.equal(logs[1].output, "out-2");

  // the AI answered in an unusable shape: logged, but the last good summary stays
  const res = await chat.saveAiSummary(db, R1, aiArgs(id, token, { summary: null, output: "ไม่ใช่ JSON" }), { now: at(3) });
  assert.equal(res.saved, false);
  assert.deepEqual((await msg(id)).aiSuggestion, second);
  logs = await aiLogs(id);
  assert.equal(logs.length, 3);
  assert.equal(logs[2].output, "ไม่ใช่ JSON");
});

test("saveAiSummary: needs the live lock and its token, a reviewer who did not send it, and a pending message", async () => {
  const id = await sent();
  // a message the reviewer sent (they also hold a student role in this scenario), with a live lock
  const own = (await db.collection("chatMessages").add({ senderId: "rev-1", senderName: "Reviewer 1", content: "ของผู้ตรวจเอง", status: "pending", sentAt: Timestamp.fromDate(at(0)), resubmitOfId: null })).id;
  await db.collection("reviewLocks").doc(own).set({ holderId: "rev-1", token: "t-own", expiresAt: Timestamp.fromDate(at(30)) });
  assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs(id, "x"), { now: at(0) })), "failed-precondition"); // no lock
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs(id, "wrong"), { now: at(1) })), "failed-precondition");
  assert.equal(await code(chat.saveAiSummary(db, R2, aiArgs(id, token), { now: at(1) })), "failed-precondition"); // someone else's lock
  assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs(id, token), { now: at(60) })), "failed-precondition"); // expired
  assert.equal(await code(chat.saveAiSummary(db, S1, aiArgs(id, token), { now: at(1) })), "permission-denied");
  assert.equal(await code(chat.saveAiSummary(db, null, aiArgs(id, token), { now: at(1) })), "unauthenticated");
  assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs("nope", token), { now: at(1) })), "not-found");
  assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs(own, "t-own"), { now: at(1) })), "permission-denied"); // own message, even with a live lock
  assert.equal((await msg(id)).aiSuggestion, undefined);
  assert.equal((await aiLogs(id)).length, 0);
  assert.equal((await events("ai_summary")).length, 0);

  // after the decision the message is no longer pending
  const l = await chat.lockMessage(db, R1, { messageId: id }, { now: at(2) });
  await chat.decideMessage(db, R1, { messageId: id, token: l.token, outcome: "approve", negative: false }, { now: at(3) });
  assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs(id, l.token), { now: at(4) })), "failed-precondition");
});

test("saveAiSummary: input may hold message text only; malformed fields are refused and nothing is written", async () => {
  const id = await sent();
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  const bad = [
    { input: { content: "x", senderName: "Student 1" } },
    { input: { content: "x", senderId: "stu-1" } },
    { input: { content: "x", previous: { content: "o", reason: "r", senderName: "S" } } },
    { input: { content: "x", previous: { content: "o" } } },
    { input: { content: "  " } },
    { input: "text" },
    { summary: undefined },
    { summary: { topic: "", cautions: [], addressedPreviousReason: null } },
    { summary: { topic: "t", cautions: "no", addressedPreviousReason: null } },
    { summary: { topic: "t", cautions: [], addressedPreviousReason: "yes" } },
    { summary: { ...SUMMARY, status: "approved" } },
    { summary: { topic: "ก".repeat(301), cautions: [], addressedPreviousReason: null } },
    { summary: { topic: "t", cautions: Array(6).fill("c"), addressedPreviousReason: null } },
    { output: 5 },
    { output: "x".repeat(5001) },
    { model: "" },
  ];
  for (const over of bad) {
    assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs(id, token, over), { now: at(1) })), "invalid-argument", JSON.stringify(over));
  }
  assert.equal(await code(chat.saveAiSummary(db, R1, aiArgs(id, undefined), { now: at(1) })), "invalid-argument");
  assert.equal((await msg(id)).aiSuggestion, undefined);
  assert.equal((await aiLogs(id)).length, 0);
  // a resubmission's previous message text is allowed
  const ok = { input: { content: "ใหม่", previous: { content: "เดิม", reason: "สุภาพขึ้น" } } };
  assert.equal((await chat.saveAiSummary(db, R1, aiArgs(id, token, ok), { now: at(1) })).saved, true);
});

test("aiSuggestion survives the decision; the reviewer queue shows it", async () => {
  const id = await sent();
  const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
  await chat.saveAiSummary(db, R1, aiArgs(id, token), { now: at(1) });
  const q = await chat.listReviewQueue(db, R1, {}, { now: at(2) });
  assert.deepEqual(q.find((x) => x.id === id).aiSuggestion, SUMMARY);
  assert.ok(q.find((x) => x.id === id).aiSuggestionAt);

  await chat.decideMessage(db, R1, { messageId: id, token, outcome: "reject", negative: true, reason: "ไม่สุภาพ" }, { now: at(3) });
  const m = await msg(id);
  assert.equal(m.status, "rejected");
  assert.equal(m.decision.reason, "ไม่สุภาพ");
  assert.deepEqual(m.aiSuggestion, SUMMARY);
});

test("students never receive aiSuggestion: not in listMyMessages, not in listApprovedMessages", async () => {
  const rejected = await sent(S1, "ข้อความที่จะถูกปฏิเสธ");
  const approved = await sent(S1, "ข้อความที่จะอนุมัติ");
  for (const [id, outcome] of [[rejected, "reject"], [approved, "approve"]]) {
    const { token } = await chat.lockMessage(db, R1, { messageId: id }, { now: at(0) });
    await chat.saveAiSummary(db, R1, aiArgs(id, token, { summary: { ...SUMMARY, topic: "ความลับของผู้ตรวจ" } }), { now: at(1) });
    await chat.decideMessage(db, R1, { messageId: id, token, outcome, negative: outcome === "reject", reason: outcome === "reject" ? "r" : undefined }, { now: at(2) });
    assert.equal((await msg(id)).aiSuggestion.topic, "ความลับของผู้ตรวจ");
  }
  const mine = await chat.listMyMessages(db, S1, {});
  assert.equal(mine.length, 2);
  const shown = await chat.listApprovedMessages(db, S1, {});
  assert.equal(shown.length, 1);
  for (const item of [...mine, ...shown]) {
    assert.equal(Object.keys(item).some((k) => k.startsWith("aiSuggestion")), false);
  }
  const wire = JSON.stringify([mine, shown]);
  assert.equal(wire.includes("ความลับของผู้ตรวจ"), false);
  assert.equal(wire.includes("aiSuggestion"), false);
});
