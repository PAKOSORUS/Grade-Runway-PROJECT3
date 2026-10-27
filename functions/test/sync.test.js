// Runs against the Firestore emulator: npm test.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const sync = require("../lib/sync");
const situation = require("../lib/situation");

if (getApps().length === 0) initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();
const code = (p) => p.then(() => null, (e) => e.code);

const ADMIN = { uid: "admin-1" };
const S1 = { uid: "stu-1" };

const COLLECTIONS = [
  "users", "syncState", "syncRuns", "gradeRecords", "attendanceRecords", "assignmentRecords",
  "riskThresholdRules", "riskAssessments", "recommendations", "notifications",
];

async function clear(name) {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

test.beforeEach(async () => {
  for (const c of COLLECTIONS) await clear(c);
  const users = {
    "admin-1": { name: "Admin 1", status: "active", roles: ["admin"] },
    "admin-2": { name: "Admin 2", status: "active", roles: ["admin"] },
    "admin-off": { name: "Admin off", status: "disabled", roles: ["admin"] },
    "stu-1": { name: "Student 1", status: "active", roles: ["student"] },
    "stu-2": { name: "Student 2", status: "active", roles: ["student"] },
    "adv-1": { name: "Advisor", status: "active", roles: ["advisor"] },
  };
  for (const [id, u] of Object.entries(users)) await db.collection("users").doc(id).set(u);
});

const good = (extra = {}) => ({
  source: "test",
  assess: false,
  grades: [
    { learnerId: "stu-1", course: "M1", period: "2568-1", grade: 3 },
    { learnerId: "stu-1", course: "M1", period: "2568-2", grade: 2.5 },
    { learnerId: "stu-2", course: "M1", period: "2568-2", grade: 3.5 },
  ],
  attendance: [{ learnerId: "stu-1", course: "M1", period: "2568-2", rate: 70 }],
  assignments: [{ learnerId: "stu-1", course: "M1", period: "2568-2", required: 10, submitted: 8 }],
  ...extra,
});

const state = async () => (await db.doc("syncState/current").get()).data();
const size = async (c) => (await db.collection(c).get()).size;
const adminNotices = async () =>
  (await db.collection("notifications").where("type", "==", "syncFailed").get()).docs.map((d) => d.data());

test("only Admin imports or lists rounds; nothing is written otherwise", async () => {
  assert.equal(await code(sync.importLearningData(db, null, good())), "unauthenticated");
  assert.equal(await code(sync.importLearningData(db, S1, good())), "permission-denied");
  assert.equal(await code(sync.importLearningData(db, { uid: "adv-1" }, good())), "permission-denied");
  assert.equal(await code(sync.listSyncRuns(db, S1, {})), "permission-denied");
  assert.equal(await size("gradeRecords"), 0);
  assert.equal(await size("syncRuns"), 0);
  assert.equal((await db.doc("syncState/current").get()).exists, false);
});

test("a good round stores the records, marks the state normal and logs the round", async () => {
  const r = await sync.importLearningData(db, ADMIN, good());
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { grades: 3, attendance: 1, assignments: 1 });
  assert.equal(await size("gradeRecords"), 3);
  assert.equal(await size("attendanceRecords"), 1);
  assert.equal(await size("assignmentRecords"), 1);
  const s = await state();
  assert.equal(s.status, "normal");
  assert.ok(s.lastSuccessAt);
  assert.equal(s.lastRunId, r.runId);
  const runs = await sync.listSyncRuns(db, ADMIN, {});
  assert.equal(runs.length, 1);
  assert.equal(runs[0].outcome, "success");
  assert.equal(runs[0].source, "test");
  assert.equal((await adminNotices()).length, 0);
});

test("importing the same data again does not duplicate records", async () => {
  await sync.importLearningData(db, ADMIN, good());
  await sync.importLearningData(db, ADMIN, good());
  assert.equal(await size("gradeRecords"), 3);
  assert.equal((await sync.listSyncRuns(db, ADMIN, {})).length, 2);
});

test("a new round replaces the old set, including records that are no longer sent", async () => {
  await db.collection("gradeRecords").add({ learnerId: "stu-1", course: "OLD", period: "2567-1", grade: 1 }); // e.g. seeded, no syncRunId
  await sync.importLearningData(db, ADMIN, good());
  const second = good();
  second.grades = [{ learnerId: "stu-1", course: "M1", period: "2568-3", grade: 4 }];
  await sync.importLearningData(db, ADMIN, second);
  const left = (await db.collection("gradeRecords").get()).docs.map((d) => d.data());
  assert.equal(left.length, 1);
  assert.equal(left[0].period, "2568-3");
});

test("records of unknown or non-student learners are skipped and reported, not a failure", async () => {
  const p = good();
  p.grades.push({ learnerId: "ghost", course: "M1", period: "2568-1", grade: 2 });
  p.attendance.push({ learnerId: "adv-1", course: "M1", period: "2568-1", rate: 90 });
  const r = await sync.importLearningData(db, ADMIN, p);
  assert.equal(r.ok, true);
  assert.deepEqual(r.skippedLearners.sort(), ["adv-1", "ghost"]);
  assert.equal(r.counts.grades, 3);
  assert.equal(await size("gradeRecords"), 3);
  assert.equal((await sync.listSyncRuns(db, ADMIN, {}))[0].skippedLearnerCount, 2);
});

test("a good round assesses learners afterwards unless told not to", async () => {
  await db.collection("riskThresholdRules").doc("r1").set({ variable: "attendance", name: "เข้าเรียนต่ำ", threshold: 80 });
  const off = await sync.importLearningData(db, ADMIN, good());
  assert.equal(off.assessment, undefined);
  assert.equal(await size("riskAssessments"), 0);

  const on = await sync.importLearningData(db, ADMIN, good({ assess: true }));
  assert.equal(on.assessment.assessed, 2);
  assert.equal(on.assessment.atRisk, 1);
  const a = (await db.collection("riskAssessments").where("learnerId", "==", "stu-1").get()).docs[0].data();
  assert.equal(a.syncRunId, on.runId);
  assert.equal(a.atRisk, true);
});

// ---- failures (T-2-03, T-2-05, T-2-07) ----

const bad = {
  "a list is missing": () => ({ grades: good().grades, attendance: good().attendance }),
  "no records at all": () => ({ grades: [], attendance: [], assignments: [] }),
  "not an object": () => "nope",
  "grade is not a number": () => good({ grades: [{ learnerId: "stu-1", course: "M1", period: "p", grade: "3" }] }),
  "attendance above 100": () => good({ attendance: [{ learnerId: "stu-1", course: "M1", period: "p", rate: 120 }] }),
  "submitted more than required": () =>
    good({ assignments: [{ learnerId: "stu-1", course: "M1", period: "p", required: 2, submitted: 3 }] }),
  "missing period": () => good({ grades: [{ learnerId: "stu-1", course: "M1", grade: 3 }] }),
  "duplicate key": () =>
    good({ grades: [good().grades[0], { ...good().grades[0], grade: 1 }] }),
};

for (const [name, make] of Object.entries(bad)) {
  test(`first round fails when ${name}: nothing stored, waiting, Admins told`, async () => {
    const r = await sync.importLearningData(db, ADMIN, make());
    assert.equal(r.ok, false);
    assert.equal(r.outcome, "failedFirst");
    assert.ok(r.errors.length > 0);
    assert.equal(await size("gradeRecords"), 0);
    assert.equal((await state()).status, "waiting");
    assert.equal((await state()).lastSuccessAt, undefined);
    const notices = await adminNotices();
    assert.deepEqual(notices.map((n) => n.recipientId).sort(), ["admin-1", "admin-2"]); // not the disabled Admin
    assert.equal(notices[0].syncRunId, r.runId);
    assert.equal((await sync.listSyncRuns(db, ADMIN, {}))[0].outcome, "failedFirst");
  });
}

test("a failure after a success keeps the last good data and marks it stale", async () => {
  await sync.importLearningData(db, ADMIN, good());
  const before = await state();
  const r = await sync.importLearningData(db, ADMIN, { grades: [], attendance: [] });
  assert.equal(r.outcome, "failedWithPrevious");
  assert.equal(await size("gradeRecords"), 3); // untouched
  const after = await state();
  assert.equal(after.status, "stale");
  assert.equal(after.lastSuccessAt.toMillis(), before.lastSuccessAt.toMillis());
  assert.match((await adminNotices())[0].reason, /ครั้งล่าสุด/);
  assert.equal((await sync.listSyncRuns(db, ADMIN, {}))[0].reason, "incomplete");
});

test("the next good round after a failure returns the state to normal", async () => {
  await sync.importLearningData(db, ADMIN, good());
  await sync.importLearningData(db, ADMIN, "bad");
  assert.equal((await state()).status, "stale");
  await sync.importLearningData(db, ADMIN, good());
  assert.equal((await state()).status, "normal");
});

test("while waiting, the learner sees no result; after the first good round they do", async () => {
  await db.collection("riskThresholdRules").doc("r1").set({ variable: "attendance", name: "เข้าเรียนต่ำ", threshold: 80 });
  await sync.importLearningData(db, ADMIN, "bad");
  assert.equal((await situation.getLearnerSituation(db, S1, {})).dataStatus, "waiting");
  await sync.importLearningData(db, ADMIN, good({ assess: true }));
  const v = await situation.getLearnerSituation(db, S1, {});
  assert.equal(v.dataStatus, "normal");
  assert.equal(v.assessment.atRisk, true);
});

test("a stale state is shown to the learner with the last good time", async () => {
  await sync.importLearningData(db, ADMIN, good({ assess: true }));
  await sync.importLearningData(db, ADMIN, "bad");
  const v = await situation.getLearnerSituation(db, S1, {});
  assert.equal(v.dataStatus, "stale");
  assert.ok(v.lastSyncAt);
});

test("round list is newest first, validates limit, and reports at most 10 errors", async () => {
  const many = good({ grades: Array.from({ length: 25 }, () => ({ learnerId: "stu-1" })) });
  const r = await sync.importLearningData(db, ADMIN, many);
  assert.equal(r.errorCount, 25);
  assert.equal(r.errors.length, 10);
  await sync.importLearningData(db, ADMIN, good());
  const runs = await sync.listSyncRuns(db, ADMIN, { limit: 5 });
  assert.deepEqual(runs.map((x) => x.outcome), ["success", "failedFirst"]);
  assert.equal(await code(sync.listSyncRuns(db, ADMIN, { limit: 0 })), "invalid-argument");
  assert.equal(await code(sync.listSyncRuns(db, ADMIN, { limit: 101 })), "invalid-argument");
});
