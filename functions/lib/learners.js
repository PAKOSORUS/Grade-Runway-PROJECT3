// Read scope for learner data (T-1-07, NFR-01):
//   - a learner sees only their own record
//   - an advisor sees only learners with an active assignment to them
//   - everyone else, including Admin, is denied (Admin manages accounts and
//     relationships but is not listed as a reader of learner data in the spec;
//     widen this deliberately if that changes)
// Later phases (risk results, alerts, history) must reuse requireLearnerAccess.
const { requireActiveUser } = require("./access");
const { denied, invalid, missing } = require("./errors");

async function requireLearnerAccess(db, auth, learnerId) {
  const ctx = await requireActiveUser(db, auth);
  const roles = ctx.user.roles ?? [];
  if (ctx.uid === learnerId && roles.includes("student")) return ctx;
  if (roles.includes("advisor")) {
    const link = await db.collection("advisorAssignments").doc(`${ctx.uid}_${learnerId}`).get();
    if (link.exists && link.data().status === "active") return ctx;
  }
  throw denied();
}

// Basic profile only: never returns source, legacy ids or other internals.
async function getLearnerProfile(db, auth, data) {
  const learnerId = typeof data?.learnerId === "string" ? data.learnerId.trim() : "";
  if (!learnerId) throw invalid("ต้องระบุ learnerId");
  await requireLearnerAccess(db, auth, learnerId);
  const snap = await db.collection("users").doc(learnerId).get();
  if (!snap.exists) throw missing("ไม่พบผู้เรียน");
  const u = snap.data();
  return { learnerId, name: u.name, email: u.email ?? null, status: u.status };
}

// The advisor's own learners (active relationships only).
async function listMyLearners(db, auth) {
  const ctx = await requireActiveUser(db, auth);
  if (!(ctx.user.roles ?? []).includes("advisor")) throw denied();
  const snap = await db
    .collection("advisorAssignments")
    .where("advisorId", "==", ctx.uid)
    .where("status", "==", "active")
    .get();
  return snap.docs
    .map((d) => ({ learnerId: d.data().learnerId, name: d.data().learnerName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { requireLearnerAccess, getLearnerProfile, listMyLearners };
