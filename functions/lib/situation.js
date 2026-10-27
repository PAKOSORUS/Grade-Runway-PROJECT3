// Learner situation view (FR-06, FR-07, FR-19, FR-23, NFR-01, NFR-02;
// T-4-04, T-4-08, T-4-09). One handler for the learner's dashboard and the
// advisor's view: access goes through requireLearnerAccess, so a learner sees
// only themself and an advisor only learners with an active assignment.
// Read only. Nothing is pushed to advisors: how advisors are notified is not
// decided yet (T-4-09).
const { requireLearnerAccess } = require("./learners");
const { readSyncState } = require("./risk");
const { invalid, missing } = require("./errors");

const ALERT_LIMIT = 20;
const iso = (ts) => (ts ? ts.toDate().toISOString() : null);

async function getLearnerSituation(db, auth, data) {
  // A learner may omit learnerId; an advisor must name one.
  const learnerId = typeof data?.learnerId === "string" && data.learnerId.trim() ? data.learnerId.trim() : auth?.uid;
  if (!learnerId) throw invalid("ต้องระบุ learnerId");
  await requireLearnerAccess(db, auth, learnerId);

  const userSnap = await db.collection("users").doc(learnerId).get();
  if (!userSnap.exists) throw missing("ไม่พบผู้เรียน");

  const sync = await readSyncState(db);
  const out = {
    learnerId,
    name: userSnap.data().name,
    // waiting: never synced, so no result of any kind is shown (FR-23)
    // stale: last sync failed, the previous data is still used (FR-19)
    dataStatus: !sync.lastSuccessAt ? "waiting" : sync.status === "stale" ? "stale" : "normal",
    lastSyncAt: iso(sync.lastSuccessAt),
    assessment: null,
    recommendation: null,
    alerts: [],
  };
  if (out.dataStatus === "waiting") return out;

  const [aSnap, nSnap] = await Promise.all([
    db.collection("riskAssessments").where("learnerId", "==", learnerId).orderBy("assessedAt", "desc").limit(1).get(),
    db
      .collection("notifications")
      .where("recipientId", "==", learnerId)
      .where("type", "==", "risk")
      .orderBy("at", "desc")
      .limit(ALERT_LIMIT)
      .get(),
  ]);

  if (!aSnap.empty) {
    const doc = aSnap.docs[0];
    const a = doc.data();
    out.assessment = {
      assessedAt: iso(a.assessedAt),
      dataAsOf: iso(a.dataAsOf),
      trend: a.trend,
      consecutiveDeclines: a.consecutiveDeclines,
      atRisk: a.atRisk,
      basicOnly: a.basicOnly,
      metrics: a.metrics,
      findings: a.findings,
    };
    const rec = await db.collection("recommendations").doc(doc.id).get();
    if (rec.exists) {
      out.recommendation = { text: rec.data().text, basic: rec.data().basic, createdAt: iso(rec.data().createdAt) };
    }
  }
  out.alerts = nSnap.docs.map((d) => ({ id: d.id, reason: d.data().reason, at: iso(d.data().at), read: d.data().read === true }));
  return out;
}

// Past rounds, newest first (FR-09, T-5-05/T-5-06): every assessment is kept
// (nothing is edited or deleted), each with its reasons, the advice given and
// the alert sent that round, if any. Same access rule as the situation view,
// and nothing is shown before the first successful sync.
const HISTORY_MAX = 100;

async function getLearnerHistory(db, auth, data) {
  const learnerId = typeof data?.learnerId === "string" && data.learnerId.trim() ? data.learnerId.trim() : auth?.uid;
  if (!learnerId) throw invalid("ต้องระบุ learnerId");
  await requireLearnerAccess(db, auth, learnerId);
  const limit = data?.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_MAX) throw invalid(`limit ต้องเป็นจำนวนเต็ม 1-${HISTORY_MAX}`);

  const sync = await readSyncState(db);
  if (!sync.lastSuccessAt) return [];

  const aSnap = await db
    .collection("riskAssessments")
    .where("learnerId", "==", learnerId)
    .orderBy("assessedAt", "desc")
    .limit(limit)
    .get();
  if (aSnap.empty) return [];
  const oldest = aSnap.docs[aSnap.docs.length - 1].data().assessedAt;

  const [recs, alerts] = await Promise.all([
    db.getAll(...aSnap.docs.map((d) => db.collection("recommendations").doc(d.id))),
    db
      .collection("notifications")
      .where("recipientId", "==", learnerId)
      .where("type", "==", "risk")
      .where("at", ">=", oldest)
      .orderBy("at", "desc")
      .get(),
  ]);
  const alertBy = new Map(alerts.docs.map((d) => [d.data().assessmentId, d.data()]));

  return aSnap.docs.map((d, i) => {
    const a = d.data();
    const rec = recs[i].exists ? recs[i].data() : null;
    const alert = alertBy.get(d.id);
    return {
      assessmentId: d.id,
      assessedAt: iso(a.assessedAt),
      dataAsOf: iso(a.dataAsOf),
      atRisk: a.atRisk,
      basicOnly: a.basicOnly,
      trend: a.trend,
      metrics: a.metrics,
      findings: a.findings,
      recommendation: rec ? { text: rec.text, basic: rec.basic } : null,
      alert: alert ? { reason: alert.reason, at: iso(alert.at) } : null,
    };
  });
}

module.exports = { getLearnerSituation, getLearnerHistory };
