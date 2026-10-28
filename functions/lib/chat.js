// Moderated advice chat (Phase 3): send, resubmit, review queue, lock, decide,
// unlock. Every state change is one transaction that also writes its audit
// record, so a decision never exists without its audit (NFR-04, NFR-05).
//
// Data model (collection chatMessages, same fields as the seed data):
//   senderId, senderName, content, status (pending|approved|rejected),
//   sentAt, resubmitOfId, criteriaId
//   (the review lock is NOT stored here: see reviewLocks below)
//   decision { reviewerId, outcome, negative, reason, at }   set once
// Collection reviewLocks/{messageId}: { holderId, token, expiresAt }, present only
// while locked. Kept apart from chatMessages because reviewers may read
// chatMessages directly under the Firestore rules, and the token must not be
// visible to other reviewers. reviewLocks is denied to every client.
const { randomUUID } = require("node:crypto");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { requireRole } = require("./access");
const { denied, invalid, missing, conflict } = require("./errors");

const REVIEWERS = ["lecturer", "admin"];
const MAX_CONTENT = 2000;
// Provisional until the lock duration is set in systemPolicy/current
// (the spec leaves the value open, FR-21).
const DEFAULT_LOCK_MINUTES = 15;

const messages = (db) => db.collection("chatMessages");
const locks = (db) => db.collection("reviewLocks");

function cleanContent(content) {
  if (typeof content !== "string" || !content.trim()) throw invalid("ต้องระบุข้อความ");
  if (content.length > MAX_CONTENT) throw invalid(`ข้อความยาวเกิน ${MAX_CONTENT} ตัวอักษร`);
  return content.trim();
}

function auditEvent(db, tx, event) {
  tx.create(db.collection("auditEvents").doc(), { ...event, at: FieldValue.serverTimestamp() });
}

function notify(db, tx, { recipientId, type, messageId, reason }) {
  tx.create(db.collection("notifications").doc(), {
    recipientId,
    type,
    messageId,
    reason: reason ?? null,
    read: false,
    at: FieldValue.serverTimestamp(),
  });
}

async function lockMinutes(db) {
  const snap = await db.collection("systemPolicy").doc("current").get();
  const v = snap.exists ? snap.data().lockDurationMinutes : undefined;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_LOCK_MINUTES;
}

// lock is the data of a reviewLocks document (or null).
const isLockLive = (lock, now) => !!lock && lock.expiresAt.toMillis() > now.getTime();

// FR-16, FR-27: the sender must currently be eligible. The result is the stored
// one (evaluated ahead of time, not at send time). No result means not eligible.
async function readEligibility(tx, db, learnerId) {
  const snap = await tx.get(db.collection("eligibilityResults").doc(learnerId));
  return snap.exists && snap.data().eligible === true;
}

// FR-10, FR-11, FR-20, FR-16: a student sends a message to the shared room; it
// starts as pending and is invisible to others.
async function sendMessage(db, auth, data) {
  const ctx = await requireRole(db, auth, ["student"]);
  const content = cleanContent(data?.content);
  const ref = messages(db).doc();
  await db.runTransaction(async (tx) => {
    if (!(await readEligibility(tx, db, ctx.uid))) throw denied("ไม่ผ่านเกณฑ์ผู้ส่งข้อความ");
    tx.create(ref, {
      senderId: ctx.uid,
      senderName: ctx.user.name,
      content,
      status: "pending",
      sentAt: FieldValue.serverTimestamp(),
      resubmitOfId: null,
    });
  });
  return { messageId: ref.id };
}

// FR-22: after a rejection the sender creates a NEW message linked to the
// original, one at a time. The original stays closed and unchanged.
async function resubmitMessage(db, auth, data) {
  const ctx = await requireRole(db, auth, ["student"]);
  const originalId = typeof data?.originalId === "string" ? data.originalId.trim() : "";
  if (!originalId) throw invalid("ต้องระบุ originalId");
  const content = cleanContent(data?.content);
  const origRef = messages(db).doc(originalId);
  const ref = messages(db).doc();
  await db.runTransaction(async (tx) => {
    const orig = await tx.get(origRef);
    if (!orig.exists) throw missing("ไม่พบข้อความเดิม");
    if (orig.data().senderId !== ctx.uid) throw denied();
    if (orig.data().status !== "rejected") throw conflict("ส่งใหม่ได้เฉพาะข้อความที่ถูกปฏิเสธ");
    const children = await tx.get(messages(db).where("resubmitOfId", "==", originalId));
    if (children.docs.some((d) => d.data().status !== "rejected")) {
      throw conflict("ข้อความนี้มีข้อความใหม่ที่รออนุมัติหรืออนุมัติแล้ว");
    }
    if (!(await readEligibility(tx, db, ctx.uid))) throw denied("ไม่ผ่านเกณฑ์ผู้ส่งข้อความ");
    tx.create(ref, {
      senderId: ctx.uid,
      senderName: ctx.user.name,
      content,
      status: "pending",
      sentAt: FieldValue.serverTimestamp(),
      resubmitOfId: originalId,
    });
    auditEvent(db, tx, {
      type: "resubmit",
      messageId: ref.id,
      relatedMessageId: originalId,
      actorId: ctx.uid,
    });
  });
  return { messageId: ref.id };
}

// FR-11, FR-20, NFR-04, NFR-06: the room returns approved messages only, and the
// sender name only when the policy says so (hidden by default).
async function listApprovedMessages(db, auth, data) {
  await requireRole(db, auth, ["student"]);
  const limit = data?.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw invalid("limit ต้องเป็นจำนวนเต็ม 1-200");
  const policy = await db.collection("systemPolicy").doc("current").get();
  const showName = policy.exists && policy.data().showSenderName === true;
  const snap = await messages(db).where("status", "==", "approved").orderBy("sentAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const m = d.data();
    return {
      id: d.id,
      content: m.content,
      sentAt: m.sentAt.toDate().toISOString(),
      ...(showName ? { senderName: m.senderName } : {}),
    };
  });
}

// OP-17 (FR-11, FR-15, FR-22): the sender's own messages, newest first. The
// rejection reason is returned for rejected messages only; who reviewed and the
// negative/non-negative flag are never returned to the sender.
async function listMyMessages(db, auth, data) {
  const ctx = await requireRole(db, auth, ["student"]);
  const limit = data?.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw invalid("limit ต้องเป็นจำนวนเต็ม 1-200");
  const snap = await messages(db).where("senderId", "==", ctx.uid).orderBy("sentAt", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const m = d.data();
    return {
      id: d.id,
      content: m.content,
      status: m.status,
      sentAt: m.sentAt.toDate().toISOString(),
      resubmitOfId: m.resubmitOfId ?? null,
      reason: m.status === "rejected" ? (m.decision?.reason ?? null) : null,
    };
  });
}

// FR-13: pending messages that nobody else currently holds, oldest first. The
// caller's own live locks are included (flagged lockedByMe, with the expiry) so
// a reviewer can find them again after a reload. The lock token is never returned.
async function listReviewQueue(db, auth, _data, { now = new Date() } = {}) {
  const ctx = await requireRole(db, auth, REVIEWERS);
  const [snap, lockSnap] = await Promise.all([
    messages(db).where("status", "==", "pending").orderBy("sentAt", "asc").get(),
    locks(db).get(),
  ]);
  const live = new Map();
  for (const l of lockSnap.docs) if (isLockLive(l.data(), now)) live.set(l.id, l.data());
  return snap.docs
    .filter((d) => !live.has(d.id) || live.get(d.id).holderId === ctx.uid)
    .map((d) => {
      const m = d.data();
      const mine = live.get(d.id);
      return {
        id: d.id,
        senderName: m.senderName,
        content: m.content,
        sentAt: m.sentAt.toDate().toISOString(),
        resubmitOfId: m.resubmitOfId ?? null,
        lockedByMe: !!mine,
        lockExpiresAt: mine ? mine.expiresAt.toDate().toISOString() : null,
      };
    });
}

// FR-18: lock a message for review; only one live lock at a time. The token is
// returned to the holder only and must come back with the decision.
async function lockMessage(db, auth, data, { now = new Date() } = {}) {
  const ctx = await requireRole(db, auth, REVIEWERS);
  const messageId = typeof data?.messageId === "string" ? data.messageId.trim() : "";
  if (!messageId) throw invalid("ต้องระบุ messageId");
  const minutes = await lockMinutes(db);
  const ref = messages(db).doc(messageId);
  const lockRef = locks(db).doc(messageId);
  const token = randomUUID();
  const expiresAt = Timestamp.fromMillis(now.getTime() + minutes * 60_000);
  await db.runTransaction(async (tx) => {
    const [snap, cur] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
    if (!snap.exists) throw missing("ไม่พบข้อความ");
    if (snap.data().status !== "pending") throw conflict("ข้อความนี้ไม่ได้อยู่ในสถานะรออนุมัติ");
    if (cur.exists && isLockLive(cur.data(), now) && cur.data().holderId !== ctx.uid) {
      throw conflict("ข้อความนี้ถูกผู้ตรวจคนอื่นล็อกอยู่");
    }
    tx.set(lockRef, { holderId: ctx.uid, token, expiresAt });
    auditEvent(db, tx, { type: "lock", messageId, actorId: ctx.uid });
  });
  return { messageId, token, expiresAt: expiresAt.toDate().toISOString() };
}

// FR-12..15, FR-18, FR-24, NFR-04, NFR-05: record the decision only when the
// caller holds the live lock with the matching token. Otherwise nothing changes
// except an audit event and a notice to the reviewer (the message stays pending).
async function decideMessage(db, auth, data, { now = new Date() } = {}) {
  const ctx = await requireRole(db, auth, REVIEWERS);
  const messageId = typeof data?.messageId === "string" ? data.messageId.trim() : "";
  if (!messageId) throw invalid("ต้องระบุ messageId");
  if (data?.outcome !== "approve" && data?.outcome !== "reject") throw invalid("outcome ต้องเป็น approve หรือ reject");
  if (typeof data?.negative !== "boolean") throw invalid("ต้องระบุว่าเป็นเชิงลบหรือไม่เชิงลบ");
  const reason = typeof data?.reason === "string" ? data.reason.trim() : "";
  if (data.outcome === "reject" && !reason) throw invalid("การปฏิเสธต้องระบุเหตุผล");
  if (typeof data?.token !== "string" || !data.token) throw invalid("ต้องแนบ token ของล็อก");

  const ref = messages(db).doc(messageId);
  const lockRef = locks(db).doc(messageId);
  const result = await db.runTransaction(async (tx) => {
    const [snap, lockSnap] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
    if (!snap.exists) throw missing("ไม่พบข้อความ");
    const m = snap.data();
    const lock = lockSnap.exists ? lockSnap.data() : null;
    const valid = m.status === "pending" && isLockLive(lock, now) && lock.holderId === ctx.uid && lock.token === data.token;
    if (!valid) {
      auditEvent(db, tx, { type: "decision_rejected", messageId, actorId: ctx.uid });
      notify(db, tx, { recipientId: ctx.uid, type: "decision_rejected", messageId });
      return { ok: false };
    }
    const status = data.outcome === "approve" ? "approved" : "rejected";
    tx.update(ref, {
      status,
      decision: {
        reviewerId: ctx.uid,
        outcome: data.outcome,
        negative: data.negative,
        reason: reason || null,
        at: FieldValue.serverTimestamp(),
      },
    });
    tx.delete(lockRef);
    auditEvent(db, tx, {
      type: "review_decision",
      messageId,
      actorId: ctx.uid,
      outcome: data.outcome,
      negative: data.negative,
      reason: reason || null,
    });
    if (status === "rejected") {
      notify(db, tx, { recipientId: m.senderId, type: "message_rejected", messageId, reason });
    }
    return { ok: true, status };
  });
  if (!result.ok) throw conflict("คำตัดสินถูกปฏิเสธ: ไม่ได้ถือล็อกที่ใช้ได้ (หมดเวลา ถูกปลด หรือผู้อื่นล็อกต่อ)");
  return { messageId, status: result.status };
}

// FR-21: a reviewer (lecturer/Admin) releases a stuck lock by hand. Not a
// decision: the message stays pending and returns to the queue.
async function releaseLock(db, auth, data) {
  const ctx = await requireRole(db, auth, REVIEWERS);
  const messageId = typeof data?.messageId === "string" ? data.messageId.trim() : "";
  if (!messageId) throw invalid("ต้องระบุ messageId");
  const ref = messages(db).doc(messageId);
  const lockRef = locks(db).doc(messageId);
  await db.runTransaction(async (tx) => {
    const [snap, lockSnap] = await Promise.all([tx.get(ref), tx.get(lockRef)]);
    if (!snap.exists) throw missing("ไม่พบข้อความ");
    if (!lockSnap.exists) throw conflict("ข้อความนี้ไม่ได้ถูกล็อก");
    tx.delete(lockRef);
    auditEvent(db, tx, { type: "unlock_manual", messageId, actorId: ctx.uid });
  });
  return { messageId };
}

// FR-21: internal sweep for expired locks. Called by a scheduler later (phase 5);
// until then expired locks are already treated as free by the queue and the lock
// and decision checks, so this only tidies data and records the audit.
async function releaseExpiredLocks(db, { now = new Date() } = {}) {
  const snap = await locks(db).get();
  const expired = snap.docs.filter((d) => !isLockLive(d.data(), now));
  for (const d of expired) {
    await db.runTransaction(async (tx) => {
      const cur = await tx.get(d.ref);
      if (!cur.exists || isLockLive(cur.data(), now)) return;
      tx.delete(d.ref);
      auditEvent(db, tx, { type: "unlock_expired", messageId: d.id, actorId: "system" });
    });
  }
  return { released: expired.length };
}

module.exports = {
  sendMessage,
  resubmitMessage,
  listApprovedMessages,
  listMyMessages,
  listReviewQueue,
  lockMessage,
  decideMessage,
  releaseLock,
  releaseExpiredLocks,
};
