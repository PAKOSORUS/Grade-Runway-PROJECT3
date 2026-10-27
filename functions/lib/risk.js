// Risk analysis (FR-02, FR-03, FR-05, FR-04, NFR-02; T-4-01..T-4-07).
//
// evaluate() is pure: records + threshold rules in, metrics/trend/findings out.
// assessAll() is the OP-07 batch: read the threshold set once, then for every
// active student write the assessment, the recommendation and (when the alert
// condition is met) the in-app notification in ONE transaction, so an alert
// never points at an assessment that was not saved.
//
// Input data (collections written by the phase 2 sync, read only here):
//   syncState/current        { status: normal|stale|waiting, lastSuccessAt }
//   gradeRecords             { learnerId, course, period, grade }
//   attendanceRecords        { learnerId, course, period, rate }       (percent)
//   assignmentRecords        { learnerId, course, period, required, submitted }
// The legacy field names are still unknown (T-1-02 is waiting on that data);
// these are the minimum the four variables need (db-spec 3.9). `period` is
// compared as a string, so it must sort chronologically (e.g. "2568-1").
//
// How each variable is read (provisional: the spec gives no real thresholds):
//   grade       mean grade of the latest period; risk when below the threshold
//   attendance  mean attendance rate of the latest period; risk when below
//   assignment  submitted / required (%) of the latest period; risk when below
//   trend       consecutive periods in which the mean grade fell; risk when at
//               least `threshold` periods in a row
const { requireAdmin } = require("./access");
const { conflict } = require("./errors");

const VARIABLES = ["grade", "attendance", "assignment", "trend"];
const MIN_PERIODS_FOR_TREND = 2;

const round2 = (n) => Math.round(n * 100) / 100;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function byPeriod(records, valueOf) {
  const map = new Map();
  for (const r of records) {
    if (!map.has(r.period)) map.set(r.period, []);
    map.get(r.period).push(r);
  }
  return [...map.keys()]
    .sort()
    .map((period) => ({ period, rows: map.get(period), value: valueOf(map.get(period)) }));
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);

function evaluate({ grades = [], attendance = [], assignments = [], rules = [] }) {
  const gradeSeries = byPeriod(grades.filter((r) => finite(r.grade)), (rows) => mean(rows.map((r) => r.grade)));
  const attSeries = byPeriod(attendance.filter((r) => finite(r.rate)), (rows) => mean(rows.map((r) => r.rate)));
  const asgSeries = byPeriod(
    assignments.filter((r) => finite(r.required) && finite(r.submitted)),
    (rows) => {
      const required = rows.reduce((a, r) => a + r.required, 0);
      const submitted = rows.reduce((a, r) => a + r.submitted, 0);
      return required > 0 ? (submitted / required) * 100 : null;
    },
  );
  const last = (s) => (s.length ? s[s.length - 1] : null);

  // Trend (FR-02): per-period mean grade, oldest first.
  let trend = "insufficient";
  let consecutiveDeclines = 0;
  if (gradeSeries.length >= MIN_PERIODS_FOR_TREND) {
    for (let i = gradeSeries.length - 1; i > 0 && gradeSeries[i].value < gradeSeries[i - 1].value; i--) {
      consecutiveDeclines++;
    }
    const delta = gradeSeries[gradeSeries.length - 1].value - gradeSeries[gradeSeries.length - 2].value;
    trend = consecutiveDeclines > 0 ? "declining" : delta > 0 ? "improving" : "steady";
  }
  const basicOnly = trend === "insufficient";

  const g = last(gradeSeries);
  const a = last(attSeries);
  const s = last(asgSeries);
  const metrics = {
    grade: g ? { value: round2(g.value), period: g.period } : null,
    attendance: a ? { value: round2(a.value), period: a.period } : null,
    assignment: s && s.value !== null ? { value: round2(s.value), period: s.period } : null,
    trend: basicOnly ? null : { label: trend, consecutiveDeclines },
  };

  const findings = [];
  for (const rule of rules) {
    const t = rule.threshold;
    const m = metrics[rule.variable];
    if (!m) continue; // no data for this variable (or trend not computable): cannot be evaluated
    let hit = false;
    let observed;
    let explanation;
    if (rule.variable === "grade") {
      observed = m.value;
      hit = observed < t;
      explanation = `ผลการเรียนล่าสุด (${m.period}) เฉลี่ย ${observed} ต่ำกว่าเกณฑ์ ${t}`;
    } else if (rule.variable === "attendance") {
      observed = m.value;
      hit = observed < t;
      explanation = `อัตราการเข้าเรียนล่าสุด (${m.period}) ${observed}% ต่ำกว่าเกณฑ์ ${t}%`;
    } else if (rule.variable === "assignment") {
      observed = m.value;
      hit = observed < t;
      explanation = `ส่งงานแล้ว ${observed}% ของงานที่ต้องส่ง (${m.period}) ต่ำกว่าเกณฑ์ ${t}%`;
    } else if (rule.variable === "trend") {
      observed = m.consecutiveDeclines;
      hit = observed >= t;
      explanation = `ผลการเรียนลดลงต่อเนื่อง ${observed} ช่วงเวลา (เกณฑ์ตั้งแต่ ${t} ช่วงเวลาขึ้นไป)`;
    }
    if (!hit) continue;
    // threshold is copied so a later change by Admin never rewrites this result (NFR-02, FR-08)
    findings.push({
      ruleId: rule.id,
      variable: rule.variable,
      ruleName: rule.name,
      threshold: t,
      observed,
      explanation: `${rule.name}: ${explanation}`,
    });
  }

  return { trend, consecutiveDeclines, basicOnly, metrics, findings, atRisk: findings.length > 0 };
}

const ADVICE = {
  grade: "ทบทวนเนื้อหาของวิชาที่คะแนนต่ำ และปรึกษาผู้สอนหรือครูที่ปรึกษาเรื่องแนวทางปรับปรุงผลการเรียน",
  attendance: "เพิ่มการเข้าเรียนให้สม่ำเสมอ และแจ้งครูที่ปรึกษาหากมีอุปสรรคที่ทำให้เข้าเรียนไม่ได้",
  assignment: "จัดตารางส่งงานที่ค้างอยู่ เริ่มจากงานที่ใกล้กำหนดก่อน และขอคำแนะนำหากติดขัด",
  trend: "ผลการเรียนลดลงต่อเนื่อง ควรหาสาเหตุร่วมกับครูที่ปรึกษาก่อนผลจะแย่ลงอีก",
};

// FR-05: advice built from this learner's own findings. A new learner with too
// little history gets the basic rules only (assumption in REQ-01).
function recommend(result) {
  const lines = result.findings.map((f) => ADVICE[f.variable]);
  if (lines.length === 0) {
    lines.push(
      result.basicOnly
        ? "ข้อมูลย้อนหลังยังน้อย ระบบประเมินด้วยกฎพื้นฐานเท่านั้น ขณะนี้ยังไม่พบความเสี่ยง ให้ติดตามผลการเรียนต่อไป"
        : "ขณะนี้ผลการเรียน การเข้าเรียน และการส่งงานอยู่ในเกณฑ์ ให้รักษาความสม่ำเสมอต่อไป",
    );
  }
  return { text: lines.join("\n"), basic: result.basicOnly };
}

// Alert condition (api-spec section 8, choice B). `prev` is the learner's latest
// assessment BEFORE this round, or null.
function shouldNotify(prev, result) {
  if (!result.atRisk) return false;
  if (!prev || !prev.atRisk) return true;
  const ids = (fs) => (fs ?? []).map((f) => f.ruleId).sort().join("|");
  return ids(prev.findings) !== ids(result.findings);
}

async function readSyncState(db) {
  const snap = await db.doc("syncState/current").get();
  const d = snap.exists ? snap.data() : {};
  return { lastSuccessAt: d.lastSuccessAt ?? null, status: d.status ?? "waiting" };
}

async function loadRules(db) {
  const snap = await db.collection("riskThresholdRules").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const recordsOf = async (db, name, learnerId) =>
  (await db.collection(name).where("learnerId", "==", learnerId).get()).docs.map((d) => d.data());

async function assessOne(db, { learnerId, rules, syncRunId, dataAsOf, now }) {
  const [grades, attendance, assignments] = await Promise.all([
    recordsOf(db, "gradeRecords", learnerId),
    recordsOf(db, "attendanceRecords", learnerId),
    recordsOf(db, "assignmentRecords", learnerId),
  ]);
  const result = evaluate({ grades, attendance, assignments, rules });
  const advice = recommend(result);

  return db.runTransaction(async (tx) => {
    const prevSnap = await tx.get(
      db.collection("riskAssessments").where("learnerId", "==", learnerId).orderBy("assessedAt", "desc").limit(1),
    );
    const prev = prevSnap.empty ? null : prevSnap.docs[0].data();
    const notify = shouldNotify(prev, result);

    const ref = db.collection("riskAssessments").doc();
    tx.create(ref, {
      learnerId,
      syncRunId: syncRunId ?? null,
      assessedAt: now,
      dataAsOf,
      trend: result.trend,
      consecutiveDeclines: result.consecutiveDeclines,
      metrics: result.metrics,
      atRisk: result.atRisk,
      basicOnly: result.basicOnly,
      findings: result.findings,
      notified: notify,
    });
    tx.create(db.collection("recommendations").doc(ref.id), {
      learnerId,
      assessmentId: ref.id,
      text: advice.text,
      basic: advice.basic,
      createdAt: now,
    });
    if (notify) {
      tx.create(db.collection("notifications").doc(), {
        recipientId: learnerId,
        type: "risk",
        assessmentId: ref.id,
        reason: result.findings.map((f) => f.explanation).join("\n"),
        read: false,
        at: now,
      });
    }
    return { atRisk: result.atRisk, notified: notify };
  });
}

// OP-07. Not callable by clients directly: the Admin wrapper below, and later
// the sync job (phase 2/5), call this. No successful sync yet = nothing is
// assessed (FR-23).
async function assessAll(db, { syncRunId, now = new Date() } = {}) {
  const sync = await readSyncState(db);
  if (!sync.lastSuccessAt) throw conflict("ยังไม่เคยซิงก์สำเร็จ จึงไม่ประเมินความเสี่ยง");
  const rules = await loadRules(db); // one set for the whole round (FR-08)
  const learners = await db
    .collection("users")
    .where("status", "==", "active")
    .where("roles", "array-contains", "student")
    .get();

  const summary = { assessed: 0, atRisk: 0, notified: 0, failed: [] };
  for (const doc of learners.docs) {
    try {
      const r = await assessOne(db, {
        learnerId: doc.id,
        rules,
        syncRunId,
        dataAsOf: sync.lastSuccessAt,
        now,
      });
      summary.assessed++;
      if (r.atRisk) summary.atRisk++;
      if (r.notified) summary.notified++;
    } catch (e) {
      summary.failed.push({ learnerId: doc.id, error: e.message });
    }
  }
  return summary;
}

// Manual trigger until the sync job exists (T-2-02 is manual-first).
async function runRiskAssessment(db, auth, data) {
  await requireAdmin(db, auth);
  const syncRunId = typeof data?.syncRunId === "string" && data.syncRunId ? data.syncRunId : undefined;
  return assessAll(db, { syncRunId });
}

module.exports = { VARIABLES, evaluate, recommend, shouldNotify, assessAll, runRiskAssessment, readSyncState };
