// System policy (OP-02, OP-43; T-3-15, NFR-06, NFR-07): one document
// systemPolicy/current. Admin sets only the fields they send; a change is
// written together with its audit record, and nothing is written when no value
// actually changes. chat.js reads lockDurationMinutes and showSenderName.
const { FieldValue } = require("firebase-admin/firestore");
const { requireAdmin } = require("./access");
const { recordChange } = require("./audit");
const { invalid } = require("./errors");

const DOC = "systemPolicy/current";
const FIELDS = ["syncIntervalMinutes", "lockDurationMinutes", "showSenderName", "maxMissingImportPercent"];

const positive = (v) => Number.isFinite(v) && v > 0;

function cleanPatch(data) {
  const patch = {};
  if (data?.syncIntervalMinutes !== undefined) {
    if (!positive(data.syncIntervalMinutes)) throw invalid("ความถี่รอบซิงก์ต้องเป็นตัวเลขมากกว่า 0");
    patch.syncIntervalMinutes = data.syncIntervalMinutes;
  }
  if (data?.lockDurationMinutes !== undefined) {
    if (!positive(data.lockDurationMinutes)) throw invalid("ระยะเวลาล็อกต้องเป็นตัวเลขมากกว่า 0");
    patch.lockDurationMinutes = data.lockDurationMinutes;
  }
  if (data?.showSenderName !== undefined) {
    if (typeof data.showSenderName !== "boolean") throw invalid("นโยบายแสดงชื่อต้องเป็นแสดงชื่อหรือซ่อนชื่อ");
    patch.showSenderName = data.showSenderName;
  }
  if (data?.maxMissingImportPercent !== undefined) {
    const v = data.maxMissingImportPercent;
    if (!Number.isFinite(v) || v < 0 || v > 100) throw invalid("เกณฑ์สัดส่วนต้องอยู่ระหว่าง 0-100");
    patch.maxMissingImportPercent = v;
  }
  return patch;
}

// Values as shown to Admin; unset optional values come back null and the
// sender-name policy defaults to hidden (provisional, NFR-06).
function present(d) {
  return {
    syncIntervalMinutes: d?.syncIntervalMinutes ?? null,
    lockDurationMinutes: d?.lockDurationMinutes ?? null,
    showSenderName: d?.showSenderName === true,
    maxMissingImportPercent: d?.maxMissingImportPercent ?? null,
    updatedBy: d?.updatedBy ?? null,
    updatedAt: d?.updatedAt ? d.updatedAt.toDate().toISOString() : null,
  };
}

async function getSystemPolicy(db, auth) {
  await requireAdmin(db, auth);
  const snap = await db.doc(DOC).get();
  return present(snap.exists ? snap.data() : null);
}

async function setSystemPolicy(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const patch = cleanPatch(data);
  if (Object.keys(patch).length === 0) throw invalid("ต้องระบุค่าที่จะแก้อย่างน้อยหนึ่งค่า");
  const ref = db.doc(DOC);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? snap.data() : {};
    const before = {};
    const after = {};
    for (const k of FIELDS) {
      if (patch[k] === undefined) continue;
      const was = k === "showSenderName" ? cur[k] === true : cur[k] ?? null;
      if (was === patch[k]) continue;
      before[k] = was;
      after[k] = patch[k];
    }
    if (Object.keys(after).length === 0) return;
    tx.set(ref, { ...after, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    recordChange(db, tx, {
      category: "systemPolicy",
      action: "set",
      targetId: "current",
      actorId: actor.uid,
      before,
      after,
    });
  });
  const snap = await ref.get();
  return present(snap.data());
}

module.exports = { getSystemPolicy, setSystemPolicy };
