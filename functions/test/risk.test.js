// Runs against the Firestore emulator: npm test.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const risk = require("../lib/risk");
const thresholds = require("../lib/thresholds");
const situation = require("../lib/situation");

if (getApps().length === 0) initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();
const code = (p) => p.then(() => null, (e) => e.code);

const ADMIN = { uid: "admin-1" };
const S1 = { uid: "stu-1" };
const S2 = { uid: "stu-2" };
const ADV = { uid: "adv-1" };
const ADV2 = { uid: "adv-2" };
const SYNC_AT = new Date("2026-10-20T08:00:00Z");
const t = (n) => new Date(`2026-10-2${n}T10:00:00Z`);

const COLLECTIONS = [
  "users", "advisorAssignments", "syncState", "gradeRecords", "attendanceRecords", "assignmentRecords",
  "riskThresholdRules", "riskAssessments", "recommendations", "notifications", "configChangeAudits",
];

async function clear(name) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

const grade = (learnerId, period, g) => db.collection("gradeRecords").add({ learnerId, course: "C1", period, grade: g });
const att = (learnerId, period, rate) => db.collection("attendanceRecords").add({ learnerId, course: "C1", period, rate });
const asg = (learnerId, period, required, submitted) =>
  db.collection("assignmentRecords").add({ learnerId, course: "C1", period, required, submitted });
const rule = (id, variable, name, threshold) =>
  db.collection("riskThresholdRules").doc(id).set({ variable, name, threshold });

test.beforeEach(async () => {
  for (const c of COLLECTIONS) await clear(c);
  const users = {
    "admin-1": { name: "Admin", status: "active", roles: ["admin"] },
    "stu-1": { name: "Student 1", status: "active", roles: ["student"] },
    "stu-2": { name: "Student 2", status: "active", roles: ["student"] },
    "adv-1": { name: "Advisor 1", status: "active", roles: ["advisor"] },
    "adv-2": { name: "Advisor 2", status: "active", roles: ["advisor"] },
  };
  for (const [id, u] of Object.entries(users)) await db.collection("users").doc(id).set(u);
  await db.doc("syncState/current").set({ status: "normal", lastSuccessAt: SYNC_AT });
  await db.collection("advisorAssignments").doc("adv-1_stu-1").set({
    advisorId: "adv-1", learnerId: "stu-1", learnerName: "Student 1", status: "active",
  });
});

// ---- pure evaluation ----

const R = (variable, threshold, id = variable) => ({ id, variable, name: `rule ${variable}`, threshold });

test("trend: improving, steady, declining and insufficient data", () => {
  const g = (...vals) => vals.map((v, i) => ({ period: `p${i + 1}`, grade: v }));
  assert.equal(risk.evaluate({ grades: g(2, 2.5) }).trend, "improving");
  assert.equal(risk.evaluate({ grades: g(2.5, 2.5) }).trend, "steady");
  const d = risk.evaluate({ grades: g(3.5, 3, 2.5, 2.8, 2.4, 2.0) });
  assert.equal(d.trend, "declining");
  assert.equal(d.consecutiveDeclines, 2);
  const one = risk.evaluate({ grades: g(3) });
  assert.equal(one.trend, "insufficient");
  assert.equal(one.basicOnly, true);
  assert.equal(one.metrics.trend, null);
});

test("each variable is compared with its own threshold and explains itself", () => {
  const r = risk.evaluate({
    grades: [{ period: "p1", grade: 3 }, { period: "p2", grade: 2 }, { period: "p3", grade: 1.5 }],
    attendance: [{ period: "p3", rate: 60 }],
    assignments: [{ period: "p3", required: 10, submitted: 4 }],
    rules: [R("grade", 2), R("attendance", 80), R("assignment", 50), R("trend", 2)],
  });
  assert.equal(r.atRisk, true);
  assert.deepEqual(r.findings.map((f) => f.variable).sort(), ["assignment", "attendance", "grade", "trend"]);
  const att = r.findings.find((f) => f.variable === "attendance");
  assert.equal(att.observed, 60);
  assert.equal(att.threshold, 80);
  assert.match(att.explanation, /60%/);
  assert.match(att.explanation, /80%/);
});

test("a value exactly at the threshold, or missing data, is not a finding", () => {
  const r = risk.evaluate({
    grades: [{ period: "p1", grade: 2 }],
    attendance: [{ period: "p1", rate: 80 }],
    rules: [R("grade", 2), R("attendance", 80), R("assignment", 50)],
  });
  assert.equal(r.atRisk, false);
  assert.equal(r.findings.length, 0);
});

test("new learner: trend rule is skipped, basic rules still apply, advice says so", () => {
  const r = risk.evaluate({
    grades: [{ period: "p1", grade: 1 }],
    rules: [R("grade", 2), R("trend", 1)],
  });
  assert.equal(r.basicOnly, true);
  assert.deepEqual(r.findings.map((f) => f.variable), ["grade"]);
  assert.equal(risk.recommend(r).basic, true);
  const ok = risk.evaluate({ grades: [{ period: "p1", grade: 3 }], rules: [R("grade", 2)] });
  assert.match(risk.recommend(ok).text, /กฎพื้นฐาน/);
});

test("alert condition: new risk, changed rule set; not for the same set or no risk", () => {
  const f = (...ids) => ({ atRisk: ids.length > 0, findings: ids.map((ruleId) => ({ ruleId })) });
  assert.equal(risk.shouldNotify(null, f("a")), true);
  assert.equal(risk.shouldNotify(f(), f("a")), true);
  assert.equal(risk.shouldNotify(f("a"), f("a")), false);
  assert.equal(risk.shouldNotify(f("a"), f("a", "b")), true);
  assert.equal(risk.shouldNotify(f("a"), f("b")), true);
  assert.equal(risk.shouldNotify(f("a"), f()), false);
  assert.equal(risk.shouldNotify(null, f()), false);
});

// ---- thresholds (T-4-03) ----

test("only Admin reads or sets thresholds", async () => {
  assert.equal(await code(thresholds.listThresholds(db, null)), "unauthenticated");
  assert.equal(await code(thresholds.listThresholds(db, S1)), "permission-denied");
  assert.equal(await code(thresholds.setThreshold(db, ADV, { variable: "grade", name: "x", threshold: 2 })), "permission-denied");
  assert.equal((await db.collection("riskThresholdRules").get()).size, 0);
});

test("invalid rules are rejected and nothing is written", async () => {
  for (const bad of [
    { variable: "mood", name: "x", threshold: 1 },
    { variable: "grade", name: "", threshold: 1 },
    { variable: "grade", name: "x", threshold: "2" },
    { variable: "attendance", name: "x", threshold: 120 },
    { variable: "grade", name: "x", threshold: -1 },
    { variable: "trend", name: "x", threshold: 1.5 },
    { variable: "trend", name: "x", threshold: 0 },
  ]) {
    assert.equal(await code(thresholds.setThreshold(db, ADMIN, bad)), "invalid-argument", JSON.stringify(bad));
  }
  assert.equal((await db.collection("riskThresholdRules").get()).size, 0);
  assert.equal((await db.collection("configChangeAudits").get()).size, 0);
});

test("add and change a rule write audit with before/after; unchanged writes nothing", async () => {
  const added = await thresholds.setThreshold(db, ADMIN, { variable: "attendance", name: "เข้าเรียนต่ำ", threshold: 80 });
  assert.equal(added.updatedBy, "admin-1");
  const changed = await thresholds.setThreshold(db, ADMIN, { ruleId: added.ruleId, threshold: 70 });
  assert.equal(changed.threshold, 70);
  const same = await thresholds.setThreshold(db, ADMIN, { ruleId: added.ruleId, threshold: 70 });
  assert.equal(same.threshold, 70);

  const audits = (await db.collection("configChangeAudits").get()).docs.map((d) => d.data());
  assert.equal(audits.length, 2);
  const set = audits.find((a) => a.action === "set");
  assert.equal(set.category, "threshold");
  assert.equal(set.targetId, added.ruleId);
  assert.deepEqual(set.before, { threshold: 80 });
  assert.deepEqual(set.after, { threshold: 70 });
  assert.equal(await code(thresholds.setThreshold(db, ADMIN, { ruleId: "nope", threshold: 1 })), "not-found");
  assert.equal(await code(thresholds.setThreshold(db, ADMIN, { ruleId: added.ruleId })), "invalid-argument");
  // a value that is valid alone but not for the rule's variable
  assert.equal(await code(thresholds.setThreshold(db, ADMIN, { ruleId: added.ruleId, threshold: 150 })), "invalid-argument");
});

// ---- assessment round (T-4-01, T-4-02, T-4-04..T-4-07) ----

async function seedAtRisk(id = "stu-1") {
  await grade(id, "p1", 3);
  await grade(id, "p2", 2.5);
  await grade(id, "p3", 1.8);
  await att(id, "p3", 60);
  await asg(id, "p3", 10, 9);
}

const assessments = async (id) =>
  (await db.collection("riskAssessments").where("learnerId", "==", id).get()).docs.map((d) => d.data());
const alerts = async (id) =>
  (await db.collection("notifications").where("recipientId", "==", id).get()).docs.map((d) => d.data());

test("no successful sync yet: nothing is assessed (FR-23)", async () => {
  await db.doc("syncState/current").delete();
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  assert.equal(await code(risk.assessAll(db)), "failed-precondition");
  assert.equal(await code(risk.runRiskAssessment(db, ADMIN)), "failed-precondition");
  assert.equal((await db.collection("riskAssessments").get()).size, 0);
  assert.equal((await db.collection("notifications").get()).size, 0);
  assert.equal(await code(risk.runRiskAssessment(db, S1)), "permission-denied");
});

test("round stores assessment, copy of threshold, advice and an alert with the reason", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await rule("r2", "assignment", "ส่งงานต่ำ", 50);
  await rule("r3", "trend", "เกรดลดต่อเนื่อง", 2);
  const sum = await risk.assessAll(db, { syncRunId: "run-1", now: t(1) });
  assert.equal(sum.assessed, 2); // stu-1 and stu-2; staff are not assessed
  assert.equal(sum.atRisk, 1);
  assert.equal(sum.notified, 1);

  const [a] = await assessments("stu-1");
  assert.equal(a.syncRunId, "run-1");
  assert.equal(a.dataAsOf.toDate().toISOString(), SYNC_AT.toISOString());
  assert.deepEqual(a.findings.map((f) => f.ruleId).sort(), ["r1", "r3"]);
  assert.equal(a.trend, "declining");
  const f = a.findings.find((x) => x.ruleId === "r1");
  assert.equal(f.threshold, 80);
  assert.equal(f.observed, 60);

  const [n] = await alerts("stu-1");
  assert.equal(n.type, "risk");
  assert.equal(n.read, false);
  assert.match(n.reason, /เข้าเรียนต่ำ/);
  assert.match(n.reason, /เกรดลดต่อเนื่อง/);

  const rec = await db.collection("recommendations").doc((await db.collection("riskAssessments").where("learnerId", "==", "stu-1").get()).docs[0].id).get();
  assert.equal(rec.data().basic, false);
  assert.ok(rec.data().text.length > 0);
  assert.equal((await alerts("stu-2")).length, 0);
});

test("changing a threshold later does not change a stored result; next round uses it", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  await thresholds.setThreshold(db, ADMIN, { ruleId: "r1", threshold: 50 });
  const [old] = await assessments("stu-1");
  assert.equal(old.findings[0].threshold, 80);
  assert.equal(old.atRisk, true);

  await risk.assessAll(db, { now: t(2) });
  const all = (await db.collection("riskAssessments").where("learnerId", "==", "stu-1").orderBy("assessedAt", "desc").get()).docs.map((d) => d.data());
  assert.equal(all.length, 2);
  assert.equal(all[0].atRisk, false); // 60% is above the new 50% threshold
  assert.equal(all[1].findings[0].threshold, 80); // earlier result untouched
});

test("same rule set is not alerted again; a different rule set is", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  await risk.assessAll(db, { now: t(2) });
  assert.equal((await alerts("stu-1")).length, 1);
  assert.equal((await assessments("stu-1")).length, 2); // history keeps every round

  await rule("r2", "assignment", "ส่งงานต่ำ", 95); // 90% submitted is now below it too
  const sum = await risk.assessAll(db, { now: t(3) });
  assert.equal(sum.notified, 1);
  assert.equal((await alerts("stu-1")).length, 2);
});

test("recovering then falling again alerts again", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  await thresholds.setThreshold(db, ADMIN, { ruleId: "r1", threshold: 50 });
  await risk.assessAll(db, { now: t(2) }); // not at risk
  await thresholds.setThreshold(db, ADMIN, { ruleId: "r1", threshold: 80 });
  await risk.assessAll(db, { now: t(3) });
  assert.equal((await alerts("stu-1")).length, 2);
});

test("new learner with little history: basic rules only, advice from basic rules", async () => {
  await grade("stu-2", "p1", 1.2);
  await rule("r1", "grade", "เกรดต่ำ", 2);
  await rule("r2", "trend", "เกรดลดต่อเนื่อง", 1);
  await risk.assessAll(db, { now: t(1) });
  const [a] = await assessments("stu-2");
  assert.equal(a.basicOnly, true);
  assert.equal(a.trend, "insufficient");
  assert.deepEqual(a.findings.map((f) => f.ruleId), ["r1"]);
  const rec = (await db.collection("recommendations").where("learnerId", "==", "stu-2").get()).docs[0].data();
  assert.equal(rec.basic, true);
});

test("inactive learners and staff are not assessed", async () => {
  await db.collection("users").doc("stu-2").update({ status: "inactive" });
  await rule("r1", "grade", "เกรดต่ำ", 2);
  await risk.assessAll(db, { now: t(1) });
  assert.equal((await assessments("stu-2")).length, 0);
  assert.equal((await assessments("adv-1")).length, 0);
  assert.equal((await assessments("stu-1")).length, 1);
});

// ---- situation view (T-4-08, T-4-09, NFR-01) ----

test("learner sees own situation with reasons; waiting state shows nothing evaluated", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  const v = await situation.getLearnerSituation(db, S1, {});
  assert.equal(v.dataStatus, "normal");
  assert.equal(v.assessment.atRisk, true);
  assert.equal(v.assessment.metrics.grade.period, "p3");
  assert.equal(v.assessment.findings[0].threshold, 80);
  assert.ok(v.recommendation.text);
  assert.equal(v.alerts.length, 1);

  await db.doc("syncState/current").set({ status: "waiting" });
  const w = await situation.getLearnerSituation(db, S1, {});
  assert.equal(w.dataStatus, "waiting");
  assert.equal(w.assessment, null);
  assert.equal(w.recommendation, null);
  assert.deepEqual(w.alerts, []);
});

test("stale data is flagged but the last result is still shown", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  await db.doc("syncState/current").set({ status: "stale", lastSuccessAt: SYNC_AT });
  const v = await situation.getLearnerSituation(db, S1, {});
  assert.equal(v.dataStatus, "stale");
  assert.equal(v.lastSyncAt, SYNC_AT.toISOString());
  assert.equal(v.assessment.atRisk, true);
});

test("a learner with no assessment yet gets an empty result, not an error", async () => {
  const v = await situation.getLearnerSituation(db, S2, {});
  assert.equal(v.assessment, null);
  assert.equal(v.recommendation, null);
});

test("access scope: other learners, other advisors, Admin and anonymous are refused", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });

  const asAdvisor = await situation.getLearnerSituation(db, ADV, { learnerId: "stu-1" });
  assert.equal(asAdvisor.assessment.atRisk, true);

  assert.equal(await code(situation.getLearnerSituation(db, S2, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(situation.getLearnerSituation(db, ADV2, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(situation.getLearnerSituation(db, ADV, { learnerId: "stu-2" })), "permission-denied");
  assert.equal(await code(situation.getLearnerSituation(db, ADMIN, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(situation.getLearnerSituation(db, null, { learnerId: "stu-1" })), "unauthenticated");
  assert.equal(await code(situation.getLearnerSituation(db, ADV, {})), "permission-denied");
});

test("an ended relationship removes the advisor's view", async () => {
  await db.collection("advisorAssignments").doc("adv-1_stu-1").update({ status: "ended" });
  assert.equal(await code(situation.getLearnerSituation(db, ADV, { learnerId: "stu-1" })), "permission-denied");
});

// ---- history (T-5-05, T-5-06, FR-09) ----

test("history keeps every round newest first, with reasons, advice and which round alerted", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  await risk.assessAll(db, { now: t(2) }); // same rule set: no second alert
  await thresholds.setThreshold(db, ADMIN, { ruleId: "r1", threshold: 50 });
  await risk.assessAll(db, { now: t(3) }); // no longer at risk

  const h = await situation.getLearnerHistory(db, S1, {});
  assert.equal(h.length, 3);
  assert.deepEqual(h.map((r) => r.atRisk), [false, true, true]);
  assert.deepEqual(h.map((r) => r.alert !== null), [false, false, true]); // alerted only in the first round
  assert.equal(h[2].findings[0].threshold, 80); // older round keeps the threshold it used
  assert.ok(h[2].recommendation.text.length > 0);
  assert.match(h[2].alert.reason, /เข้าเรียนต่ำ/);
});

test("history respects limit and validates it", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  for (const n of [1, 2, 3]) await risk.assessAll(db, { now: t(n) });
  assert.equal((await situation.getLearnerHistory(db, S1, { limit: 2 })).length, 2);
  for (const bad of [0, 101, 1.5, "5"]) {
    assert.equal(await code(situation.getLearnerHistory(db, S1, { limit: bad })), "invalid-argument");
  }
});

test("history is empty before the first successful sync and for a learner never assessed", async () => {
  assert.deepEqual(await situation.getLearnerHistory(db, S2, {}), []);
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  await db.doc("syncState/current").set({ status: "waiting" });
  assert.deepEqual(await situation.getLearnerHistory(db, S1, {}), []);
});

test("history uses the same access scope as the situation view", async () => {
  await seedAtRisk();
  await rule("r1", "attendance", "เข้าเรียนต่ำ", 80);
  await risk.assessAll(db, { now: t(1) });
  assert.equal((await situation.getLearnerHistory(db, ADV, { learnerId: "stu-1" })).length, 1);
  assert.equal(await code(situation.getLearnerHistory(db, S2, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(situation.getLearnerHistory(db, ADV2, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(situation.getLearnerHistory(db, ADMIN, { learnerId: "stu-1" })), "permission-denied");
  assert.equal(await code(situation.getLearnerHistory(db, null, { learnerId: "stu-1" })), "unauthenticated");
});
