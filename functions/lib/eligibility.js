// Eligibility criteria set by Admin (T-2-09, FR-27, NFR-07).
// The spec leaves the components of the criteria open, so `rules` is stored as an
// opaque object and versioned: every change creates a new document and marks the
// previous one not current; old versions are never edited or deleted.
// Evaluating each student against the current criteria (T-2-10) is NOT done here.
const { FieldValue } = require("firebase-admin/firestore");
const { requireAdmin } = require("./access");
const { recordChange } = require("./audit");
const { invalid } = require("./errors");

const COLLECTION = "eligibilityCriteria";
const MAX_JSON_BYTES = 20_000;

function cleanRules(rules) {
  if (rules === null || typeof rules !== "object" || Array.isArray(rules)) {
    throw invalid("rules ต้องเป็น object");
  }
  let json;
  try {
    json = JSON.stringify(rules);
  } catch {
    throw invalid("rules ไม่ถูกต้อง");
  }
  if (Buffer.byteLength(json, "utf8") > MAX_JSON_BYTES) throw invalid("rules ใหญ่เกินไป");
  // Round trip so only plain JSON values reach Firestore.
  return JSON.parse(json);
}

const publicView = (id, d) => ({
  id,
  version: d.version,
  rules: d.rules ?? {},
  setById: d.setById,
  setByName: d.setByName,
  setAt: d.setAt ? d.setAt.toDate().toISOString() : null,
});

async function setEligibilityCriteria(db, auth, data) {
  const actor = await requireAdmin(db, auth);
  const rules = cleanRules(data?.rules);
  const col = db.collection(COLLECTION);
  let created;
  await db.runTransaction(async (tx) => {
    const current = await tx.get(col.where("isCurrent", "==", true));
    const all = await tx.get(col.orderBy("version", "desc").limit(1));
    const version = all.empty ? 1 : all.docs[0].data().version + 1;
    const prev = current.docs[0];
    const ref = col.doc(`criteria-v${version}`);
    tx.create(ref, {
      version,
      isCurrent: true,
      rules,
      setById: actor.uid,
      setByName: actor.user.name,
      setAt: FieldValue.serverTimestamp(),
    });
    for (const d of current.docs) tx.update(d.ref, { isCurrent: false });
    recordChange(db, tx, {
      category: "eligibilityCriteria",
      action: prev ? "update" : "create",
      targetId: ref.id,
      actorId: actor.uid,
      before: prev ? { version: prev.data().version, rules: prev.data().rules ?? {} } : null,
      after: { version, rules },
    });
    created = { id: ref.id, version };
  });
  return created;
}

async function getEligibilityCriteria(db, auth) {
  await requireAdmin(db, auth);
  const snap = await db.collection(COLLECTION).where("isCurrent", "==", true).limit(1).get();
  return snap.empty ? null : publicView(snap.docs[0].id, snap.docs[0].data());
}

module.exports = { setEligibilityCriteria, getEligibilityCriteria };
