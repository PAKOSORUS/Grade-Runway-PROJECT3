// Change audit (NFR-07, T-1-08, T-1-10): one append-only record per change with
// actor, time and before/after values. Reusable for any later category
// (eligibility criteria, connection settings, system policy, thresholds).
// Always called with the transaction that changes the data, so the change and
// its audit succeed or fail together.
const { FieldValue } = require("firebase-admin/firestore");

const COLLECTION = "configChangeAudits";

function recordChange(db, tx, { category, action, targetId, actorId, before, after }) {
  const ref = db.collection(COLLECTION).doc();
  tx.create(ref, {
    category,
    action,
    targetId,
    actorId,
    before: before ?? null,
    after: after ?? null,
    at: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

module.exports = { COLLECTION, recordChange };
