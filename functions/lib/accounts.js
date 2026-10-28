// Account, role and advisor-relationship management by Admin (FR-25, FR-26).
// Every write is one transaction that also writes its audit record (NFR-07).
const { FieldValue } = require("firebase-admin/firestore");
const { ROLES, requireAdmin } = require("./access");
const { recordChange } = require("./audit");
const { invalid, missing, conflict } = require("./errors");

const STATUSES = ["active", "disabled"];

function stripTimes(obj) {
  const { createdAt, updatedAt, ...rest } = obj;
  return rest;
}

function cleanRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) throw invalid("ต้องระบุบทบาทอย่างน้อยหนึ่งบทบาท");
  const unique = [...new Set(roles)];
  if (unique.some((r) => !ROLES.includes(r))) throw invalid("บทบาทไม่ถูกต้อง");
  return unique;
}

// Create or edit an account. The document id is the Firebase Auth uid.
// Documents written here are marked source "admin" so a later import must not
// overwrite them unless an Admin says so (T-1-04).
async function upsertUser(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const uid = typeof data?.uid === "string" ? data.uid.trim() : "";
  if (!uid) throw invalid("ต้องระบุ uid");

  const patch = {};
  if (data.name !== undefined) {
    if (typeof data.name !== "string" || !data.name.trim()) throw invalid("ชื่อไม่ถูกต้อง");
    patch.name = data.name.trim();
  }
  if (data.email !== undefined) {
    if (typeof data.email !== "string" || !data.email.includes("@")) throw invalid("อีเมลไม่ถูกต้อง");
    patch.email = data.email.trim();
  }
  if (data.roles !== undefined) patch.roles = cleanRoles(data.roles);
  if (data.status !== undefined) {
    if (!STATUSES.includes(data.status)) throw invalid("สถานะไม่ถูกต้อง");
    patch.status = data.status;
  }

  const ref = db.collection("users").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const before = snap.exists ? snap.data() : null;
    if (!before && (!patch.name || !patch.roles)) throw invalid("บัญชีใหม่ต้องมีชื่อและบทบาท");

    // Never let an Admin remove their own admin access or disable themselves.
    if (before && uid === actor.uid) {
      const nextRoles = patch.roles ?? before.roles;
      const nextStatus = patch.status ?? before.status;
      if (!nextRoles.includes("admin") || nextStatus !== "active") {
        throw conflict("ไม่สามารถถอนสิทธิ์ Admin หรือปิดบัญชีของตัวเองได้");
      }
    }

    const merged = { status: "active", ...(before ?? {}), ...patch, source: "admin" };
    tx.set(ref, {
      ...merged,
      ...(before ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    recordChange(db, tx, {
      category: "account",
      action: before ? "update" : "create",
      targetId: uid,
      actorId: actor.uid,
      before: before ? stripTimes(before) : null,
      after: merged,
    });
  });
  return { uid };
}

const setUserStatus = (db, auth, data) =>
  upsertUser(db, auth, { uid: data?.uid, status: data?.status });

// Assignment id is deterministic so a pair has at most one record.
const assignmentId = (advisorId, learnerId) => `${advisorId}_${learnerId}`;

function requireText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function readAdvisorAndLearner(tx, db, advisorId, learnerId) {
  const [a, l] = await Promise.all([
    tx.get(db.collection("users").doc(advisorId)),
    tx.get(db.collection("users").doc(learnerId)),
  ]);
  if (!a.exists || !l.exists) throw missing("ไม่พบบัญชีครู/อาจารย์ที่ปรึกษา หรือผู้เรียน");
  if (a.data().status !== "active" || !a.data().roles.includes("advisor")) {
    throw conflict("บัญชีครู/อาจารย์ที่ปรึกษาต้องใช้งานอยู่และมีบทบาท advisor");
  }
  if (l.data().status !== "active" || !l.data().roles.includes("student")) {
    throw conflict("บัญชีผู้เรียนต้องใช้งานอยู่และมีบทบาท student");
  }
  return { advisor: a.data(), learner: l.data() };
}

// Add a learner to an advisor's care (zero to many advisors per learner).
async function assignLearner(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const advisorId = requireText(data?.advisorId);
  const learnerId = requireText(data?.learnerId);
  if (!advisorId || !learnerId) throw invalid("ต้องระบุ advisorId และ learnerId");

  const ref = db.collection("advisorAssignments").doc(assignmentId(advisorId, learnerId));
  await db.runTransaction(async (tx) => {
    const { advisor, learner } = await readAdvisorAndLearner(tx, db, advisorId, learnerId);
    const cur = await tx.get(ref);
    if (cur.exists && cur.data().status === "active") {
      throw conflict("ผู้เรียนอยู่ในความดูแลของครูคนนี้แล้ว");
    }
    const after = {
      advisorId,
      learnerId,
      advisorName: advisor.name,
      learnerName: learner.name,
      status: "active",
      source: "admin",
    };
    tx.set(ref, { ...after, updatedAt: FieldValue.serverTimestamp() });
    recordChange(db, tx, {
      category: "advisorAssignment",
      action: "assign",
      targetId: ref.id,
      actorId: actor.uid,
      before: cur.exists ? stripTimes(cur.data()) : null,
      after,
    });
  });
  return { id: ref.id };
}

async function unassignLearner(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const advisorId = requireText(data?.advisorId);
  const learnerId = requireText(data?.learnerId);
  if (!advisorId || !learnerId) throw invalid("ต้องระบุ advisorId และ learnerId");

  const ref = db.collection("advisorAssignments").doc(assignmentId(advisorId, learnerId));
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists || cur.data().status !== "active") throw missing("ไม่พบความสัมพันธ์ที่ใช้งานอยู่");
    const before = stripTimes(cur.data());
    tx.update(ref, { status: "ended", source: "admin", updatedAt: FieldValue.serverTimestamp() });
    recordChange(db, tx, {
      category: "advisorAssignment",
      action: "unassign",
      targetId: ref.id,
      actorId: actor.uid,
      before,
      after: { ...before, status: "ended", source: "admin" },
    });
  });
  return { id: ref.id };
}

// Move a learner from one advisor to another atomically.
async function transferLearner(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const learnerId = requireText(data?.learnerId);
  const fromAdvisorId = requireText(data?.fromAdvisorId);
  const toAdvisorId = requireText(data?.toAdvisorId);
  if (!learnerId || !fromAdvisorId || !toAdvisorId || fromAdvisorId === toAdvisorId) {
    throw invalid("ต้องระบุ learnerId, fromAdvisorId และ toAdvisorId ที่ต่างกัน");
  }

  const fromRef = db.collection("advisorAssignments").doc(assignmentId(fromAdvisorId, learnerId));
  const toRef = db.collection("advisorAssignments").doc(assignmentId(toAdvisorId, learnerId));
  await db.runTransaction(async (tx) => {
    const { advisor, learner } = await readAdvisorAndLearner(tx, db, toAdvisorId, learnerId);
    const [from, to] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    if (!from.exists || from.data().status !== "active") throw missing("ไม่พบความสัมพันธ์เดิมที่ใช้งานอยู่");
    if (to.exists && to.data().status === "active") throw conflict("ผู้เรียนอยู่ในความดูแลของครูปลายทางแล้ว");

    const toAfter = {
      advisorId: toAdvisorId,
      learnerId,
      advisorName: advisor.name,
      learnerName: learner.name,
      status: "active",
      source: "admin",
    };
    tx.update(fromRef, { status: "ended", source: "admin", updatedAt: FieldValue.serverTimestamp() });
    tx.set(toRef, { ...toAfter, updatedAt: FieldValue.serverTimestamp() });
    recordChange(db, tx, {
      category: "advisorAssignment",
      action: "transfer",
      targetId: learnerId,
      actorId: actor.uid,
      before: stripTimes(from.data()),
      after: toAfter,
    });
  });
  return { from: fromRef.id, to: toRef.id };
}

const MAX_ASSIGNMENTS = 500;

// OP-32 (FR-26): every advisor-learner relationship, active AND ended, so an
// Admin can see what exists and what was ended. Read-only: no audit. Optional
// filters advisorId / learnerId. Active first, then by advisor and learner name.
async function listAssignments(db, auth, data) {
  await requireAdmin(db, auth);
  let q = db.collection("advisorAssignments");
  const advisorId = requireText(data?.advisorId);
  const learnerId = requireText(data?.learnerId);
  if (advisorId) q = q.where("advisorId", "==", advisorId);
  if (learnerId) q = q.where("learnerId", "==", learnerId);
  const snap = await q.limit(MAX_ASSIGNMENTS).get();
  const rank = (status) => (status === "active" ? 0 : 1);
  return snap.docs
    .map((d) => {
      const a = d.data();
      return {
        id: d.id,
        advisorId: a.advisorId,
        advisorName: a.advisorName ?? null,
        learnerId: a.learnerId,
        learnerName: a.learnerName ?? null,
        status: a.status,
        source: a.source ?? null,
        updatedAt: a.updatedAt ? a.updatedAt.toDate().toISOString() : null,
      };
    })
    .sort(
      (x, y) =>
        rank(x.status) - rank(y.status) ||
        String(x.advisorName).localeCompare(String(y.advisorName)) ||
        String(x.learnerName).localeCompare(String(y.learnerName)),
    );
}

module.exports = { upsertUser, setUserStatus, assignLearner, unassignLearner, transferLearner, listAssignments };
