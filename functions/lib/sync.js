// Learning data intake in a source-neutral format (FR-01, FR-19, FR-23;
// T-2-02..T-2-08, T-5-02). The legacy LMS/registrar format is still unknown, so
// this takes one central format that any later connector (API pull, file
// export) can be mapped onto:
//
//   {
//     source: "manual-upload",                       // free text, optional
//     grades:      [{ learnerId, course, period, grade }],        // grade >= 0
//     attendance:  [{ learnerId, course, period, rate }],         // rate 0-100 (%)
//     assignments: [{ learnerId, course, period, required, submitted }],
//     assess: true                                   // optional, default true
//   }
//
// learnerId is the learner's users/{uid}. `period` must sort chronologically as
// a string (e.g. "2568-1"), see risk.js.
//
// A round either succeeds or fails as a whole:
//   - the payload is validated BEFORE anything is written; incomplete (a list
//     missing, or no records at all) or malformed rows fail the round and the
//     stored data is never touched (T-2-03, T-2-04)
//   - failed + earlier success: state = stale, the last good data keeps being
//     used (T-2-05, T-2-06); failed + never succeeded: state = waiting, nothing
//     is assessed (T-2-07, T-2-08). Every failed round notifies all active Admins
//   - success: the stored records are replaced by the new set, state = normal,
//     lastSuccessAt = now, then the risk assessment runs (OP-07)
// Records for learners that do not exist (or are not students) are skipped and
// reported, not treated as a failure.
//
// Failure causes a connector would see (legacy not answering, timeout) cannot
// happen here; add them when a connector exists.
const crypto = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");
const { requireAdmin } = require("./access");
const { invalid } = require("./errors");
const { assessAll } = require("./risk");

const MAX_RECORDS = 10000;
const CHUNK = 400;
const MAX_REPORTED = 10;

const KINDS = [
  { key: "grades", collection: "gradeRecords" },
  { key: "attendance", collection: "attendanceRecords" },
  { key: "assignments", collection: "assignmentRecords" },
];

const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";
const num = (v) => typeof v === "number" && Number.isFinite(v);
const count = (v) => Number.isInteger(v) && v >= 0;

function checkRow(key, r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return "ต้องเป็นออบเจ็กต์";
  if (!nonEmpty(r.learnerId)) return "ต้องมี learnerId";
  if (!nonEmpty(r.course)) return "ต้องมี course";
  if (!nonEmpty(r.period)) return "ต้องมี period";
  if (key === "grades" && !(num(r.grade) && r.grade >= 0)) return "grade ต้องเป็นตัวเลขไม่ติดลบ";
  if (key === "attendance" && !(num(r.rate) && r.rate >= 0 && r.rate <= 100)) return "rate ต้องเป็นตัวเลข 0-100";
  if (key === "assignments") {
    if (!count(r.required) || !count(r.submitted)) return "required และ submitted ต้องเป็นจำนวนเต็มไม่ติดลบ";
    if (r.submitted > r.required) return "submitted ต้องไม่เกิน required";
  }
  return null;
}

// Returns { reason, errors, total } on failure, or { rows } on success.
function validate(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { reason: "malformed", errors: ["รูปแบบข้อมูลไม่ถูกต้อง ต้องเป็นออบเจ็กต์ที่มี grades, attendance, assignments"], total: 1 };
  }
  const missing = KINDS.filter((k) => !Array.isArray(payload[k.key])).map((k) => `ไม่มีรายการ ${k.key}`);
  if (missing.length) return { reason: "incomplete", errors: missing, total: missing.length };

  const size = KINDS.reduce((n, k) => n + payload[k.key].length, 0);
  if (size === 0) return { reason: "incomplete", errors: ["ไม่มีข้อมูลสักรายการ"], total: 1 };
  if (size > MAX_RECORDS) return { reason: "malformed", errors: [`จำนวนรายการเกิน ${MAX_RECORDS}`], total: 1 };

  const errors = [];
  const rows = {};
  for (const { key } of KINDS) {
    const seen = new Set();
    rows[key] = [];
    payload[key].forEach((r, i) => {
      const problem = checkRow(key, r);
      if (problem) return errors.push(`${key}[${i}]: ${problem}`);
      const id = `${r.learnerId}\u0000${r.course}\u0000${r.period}`;
      if (seen.has(id)) return errors.push(`${key}[${i}]: ซ้ำกับรายการก่อนหน้า (learnerId, course, period เดียวกัน)`);
      seen.add(id);
      rows[key].push(r);
    });
  }
  if (errors.length) return { reason: "malformed", errors, total: errors.length };
  return { rows };
}

const docId = (r) =>
  crypto.createHash("sha1").update(`${r.learnerId}\u0000${r.course}\u0000${r.period}`).digest("hex");

async function commitInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + CHUNK)) op(batch);
    await batch.commit();
  }
}

async function activeAdminIds(db) {
  const snap = await db.collection("users").where("status", "==", "active").where("roles", "array-contains", "admin").get();
  return snap.docs.map((d) => d.id);
}

async function recordFailure(db, { runRef, actor, source, startedAt, reason, errors, total }) {
  const admins = await activeAdminIds(db);
  let outcome;
  await db.runTransaction(async (tx) => {
    const stateRef = db.doc("syncState/current");
    const state = await tx.get(stateRef);
    const hadSuccess = state.exists && !!state.data().lastSuccessAt;
    outcome = hadSuccess ? "failedWithPrevious" : "failedFirst";
    tx.set(stateRef, { status: hadSuccess ? "stale" : "waiting", lastRunId: runRef.id }, { merge: true });
    tx.create(runRef, {
      startedAt,
      finishedAt: new Date(),
      outcome,
      reason,
      errorCount: total,
      errors: errors.slice(0, MAX_REPORTED),
      source,
      actorId: actor.uid,
    });
    const message = hadSuccess
      ? "ซิงก์ล้มเหลว ระบบใช้ข้อมูลที่ซิงก์สำเร็จครั้งล่าสุดต่อไป"
      : "ซิงก์ครั้งแรกล้มเหลว ระบบยังไม่ประเมินความเสี่ยงจนกว่าจะซิงก์สำเร็จ";
    for (const id of admins) {
      tx.create(db.collection("notifications").doc(), {
        recipientId: id,
        type: "syncFailed",
        syncRunId: runRef.id,
        reason: `${message}: ${errors[0]}${total > 1 ? ` (และอีก ${total - 1} รายการ)` : ""}`,
        read: false,
        at: new Date(),
      });
    }
  });
  return { ok: false, runId: runRef.id, outcome, reason, errorCount: total, errors: errors.slice(0, MAX_REPORTED) };
}

async function importLearningData(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const startedAt = new Date();
  const runRef = db.collection("syncRuns").doc();
  const source = nonEmpty(data?.source) ? data.source.trim() : "manual";
  const ctx = { runRef, actor, source, startedAt };

  const v = validate(data);
  if (v.errors) return recordFailure(db, { ...ctx, ...v });

  // Skip rows for learners that do not exist or are not students.
  const ids = [...new Set(KINDS.flatMap((k) => v.rows[k.key].map((r) => r.learnerId)))];
  const known = new Set();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const snaps = await db.getAll(...ids.slice(i, i + CHUNK).map((id) => db.collection("users").doc(id)));
    for (const s of snaps) if (s.exists && (s.data().roles ?? []).includes("student")) known.add(s.id);
  }
  const unknown = ids.filter((id) => !known.has(id));

  const counts = {};
  try {
    for (const { key, collection } of KINDS) {
      const rows = v.rows[key].filter((r) => known.has(r.learnerId));
      counts[key] = rows.length;
      const keep = new Set(rows.map(docId));
      const ops = rows.map((r) => (batch) =>
        batch.set(db.collection(collection).doc(docId(r)), { ...r, syncRunId: runRef.id }),
      );
      // the new set replaces the old one: anything not in it is removed
      const existing = await db.collection(collection).listDocuments();
      for (const ref of existing) if (!keep.has(ref.id)) ops.push((batch) => batch.delete(ref));
      await commitInChunks(db, ops);
    }
  } catch (e) {
    return recordFailure(db, { ...ctx, reason: "storage", errors: [`บันทึกข้อมูลไม่สำเร็จ: ${e.message}`], total: 1 });
  }

  const finishedAt = new Date();
  await db.runTransaction(async (tx) => {
    tx.set(db.doc("syncState/current"), { status: "normal", lastSuccessAt: finishedAt, lastRunId: runRef.id }, { merge: true });
    tx.create(runRef, {
      startedAt,
      finishedAt,
      outcome: "success",
      counts,
      skippedLearnerCount: unknown.length,
      skippedLearners: unknown.slice(0, MAX_REPORTED),
      source,
      actorId: actor.uid,
    });
  });

  const result = { ok: true, runId: runRef.id, outcome: "success", counts, skippedLearners: unknown.slice(0, MAX_REPORTED), skippedLearnerCount: unknown.length };
  if (data.assess !== false) result.assessment = await assessAll(db, { syncRunId: runRef.id, now: finishedAt });
  return result;
}

// Recent rounds for Admin (FR-19: Admin sees what failed and why).
async function listSyncRuns(db, auth, data) {
  await requireAdmin(db, auth);
  const limit = data?.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid("limit ต้องเป็นจำนวนเต็ม 1-100");
  const snap = await db.collection("syncRuns").orderBy("startedAt", "desc").limit(limit).get();
  const iso = (t) => (t ? t.toDate().toISOString() : null);
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      runId: d.id,
      startedAt: iso(x.startedAt),
      finishedAt: iso(x.finishedAt),
      outcome: x.outcome,
      reason: x.reason ?? null,
      errors: x.errors ?? [],
      errorCount: x.errorCount ?? 0,
      counts: x.counts ?? null,
      skippedLearnerCount: x.skippedLearnerCount ?? 0,
      source: x.source,
      actorId: x.actorId,
    };
  });
}

module.exports = { validate, importLearningData, listSyncRuns };
