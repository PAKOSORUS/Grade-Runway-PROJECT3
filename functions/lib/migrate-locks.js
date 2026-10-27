// One-off migration: move the old `lock` field { holderId, token, expiresAt } on
// chatMessages documents to reviewLocks/{messageId}, and delete the field so the
// token is no longer readable by reviewers. Idempotent: a message already having
// a reviewLocks document keeps it (the field is just removed). With apply=false
// nothing is written and the counts are returned.
const { FieldValue } = require("firebase-admin/firestore");

async function migrateLegacyLocks(db, { apply = false } = {}) {
  const snap = await db.collection("chatMessages").get();
  const legacy = snap.docs.filter((d) => d.data().lock !== undefined);
  const result = { found: legacy.length, moved: 0, droppedMalformed: 0, alreadyMoved: 0, applied: apply };
  for (const d of legacy) {
    const lock = d.data().lock;
    const ok = lock && typeof lock.holderId === "string" && typeof lock.token === "string" && lock.expiresAt?.toMillis;
    const target = db.collection("reviewLocks").doc(d.id);
    if (!apply) {
      if (!ok) result.droppedMalformed++;
      else result.moved++;
      continue;
    }
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(target);
      if (existing.exists) result.alreadyMoved++;
      else if (ok) {
        tx.create(target, { holderId: lock.holderId, token: lock.token, expiresAt: lock.expiresAt });
        result.moved++;
      } else result.droppedMalformed++;
      tx.update(d.ref, { lock: FieldValue.delete() });
    });
  }
  return result;
}

module.exports = { migrateLegacyLocks };
