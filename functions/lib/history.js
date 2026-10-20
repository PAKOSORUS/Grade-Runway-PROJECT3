// Admin view of the change history (T-1-09, NFR-07). Read only, Admin only.
const { requireAdmin } = require("./access");
const { COLLECTION } = require("./audit");
const { invalid } = require("./errors");

const MAX_LIMIT = 200;

async function listChangeAudits(db, auth, data) {
  await requireAdmin(db, auth);
  let limit = data?.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw invalid(`limit ต้องเป็นจำนวนเต็ม 1-${MAX_LIMIT}`);
  }
  let q = db.collection(COLLECTION);
  if (data?.category !== undefined) {
    if (typeof data.category !== "string") throw invalid("category ไม่ถูกต้อง");
    q = q.where("category", "==", data.category);
  }
  if (data?.targetId !== undefined) {
    if (typeof data.targetId !== "string") throw invalid("targetId ไม่ถูกต้อง");
    q = q.where("targetId", "==", data.targetId);
  }
  const snap = await q.orderBy("at", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      category: x.category,
      action: x.action,
      targetId: x.targetId,
      actorId: x.actorId,
      at: x.at.toDate().toISOString(),
      before: x.before,
      after: x.after,
    };
  });
}

module.exports = { listChangeAudits };
