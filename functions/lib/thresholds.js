// Risk threshold rules (FR-08, NFR-07; T-4-03; OP-03 / OP-04). Admin only.
// A rule change is written together with its audit record, and nothing is
// written when no value changes. assessAll() reads the whole set once at the
// start of a round, so a change made during a round applies from the next one.
const { FieldValue } = require("firebase-admin/firestore");
const { requireAdmin } = require("./access");
const { recordChange } = require("./audit");
const { invalid, missing } = require("./errors");
const { VARIABLES } = require("./risk");

const COLLECTION = "riskThresholdRules";

function checkThreshold(variable, v) {
  if (typeof v !== "number" || !Number.isFinite(v)) throw invalid("ค่า threshold ต้องเป็นตัวเลข");
  if ((variable === "attendance" || variable === "assignment") && (v < 0 || v > 100)) {
    throw invalid("ค่า threshold ของการเข้าเรียนและการส่งงานต้องอยู่ระหว่าง 0-100");
  }
  if (variable === "grade" && v < 0) throw invalid("ค่า threshold ของเกรดต้องไม่ติดลบ");
  if (variable === "trend" && (!Number.isInteger(v) || v < 1)) {
    throw invalid("ค่า threshold ของแนวโน้มต้องเป็นจำนวนช่วงเวลาที่ลดลงต่อเนื่อง (จำนวนเต็ม 1 ขึ้นไป)");
  }
}

function checkVariable(v) {
  if (!VARIABLES.includes(v)) throw invalid(`ตัวแปรที่ประเมินต้องเป็นหนึ่งใน ${VARIABLES.join(", ")}`);
}

function checkName(v) {
  if (typeof v !== "string" || !v.trim()) throw invalid("ต้องระบุชื่อกฎ");
  return v.trim();
}

function present(id, d) {
  return {
    ruleId: id,
    variable: d.variable,
    name: d.name,
    threshold: d.threshold,
    updatedBy: d.updatedBy ?? null,
    updatedAt: d.updatedAt ? d.updatedAt.toDate().toISOString() : null,
  };
}

async function listThresholds(db, auth) {
  await requireAdmin(db, auth);
  const snap = await db.collection(COLLECTION).get();
  return snap.docs.map((d) => present(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
}

// No ruleId = new rule (variable, name and threshold required).
// With ruleId = change the fields that were sent.
async function setThreshold(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const ruleId = data?.ruleId;
  if (ruleId !== undefined && (typeof ruleId !== "string" || !ruleId)) throw invalid("รหัสกฎไม่ถูกต้อง");

  if (ruleId === undefined) {
    checkVariable(data?.variable);
    const name = checkName(data?.name);
    checkThreshold(data.variable, data?.threshold);
    const ref = db.collection(COLLECTION).doc();
    const doc = { variable: data.variable, name, threshold: data.threshold };
    await db.runTransaction(async (tx) => {
      tx.create(ref, { ...doc, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
      recordChange(db, tx, {
        category: "threshold",
        action: "add",
        targetId: ref.id,
        actorId: actor.uid,
        before: null,
        after: doc,
      });
    });
    return present(ref.id, (await ref.get()).data());
  }

  const ref = db.collection(COLLECTION).doc(ruleId);
  const patch = {};
  if (data.variable !== undefined) {
    checkVariable(data.variable);
    patch.variable = data.variable;
  }
  if (data.name !== undefined) patch.name = checkName(data.name);
  if (data.threshold !== undefined) patch.threshold = data.threshold;
  if (Object.keys(patch).length === 0) throw invalid("ต้องระบุค่าที่จะแก้อย่างน้อยหนึ่งค่า");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw missing("ไม่พบกฎ threshold");
    const cur = snap.data();
    checkThreshold(patch.variable ?? cur.variable, patch.threshold ?? cur.threshold);
    const before = {};
    const after = {};
    for (const k of Object.keys(patch)) {
      if (cur[k] === patch[k]) continue;
      before[k] = cur[k];
      after[k] = patch[k];
    }
    if (Object.keys(after).length === 0) return;
    tx.update(ref, { ...after, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    recordChange(db, tx, {
      category: "threshold",
      action: "set",
      targetId: ruleId,
      actorId: actor.uid,
      before,
      after,
    });
  });
  return present(ruleId, (await ref.get()).data());
}

module.exports = { listThresholds, setThreshold };
