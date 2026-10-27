// Local test data for the emulators ONLY (Auth + Firestore). Refuses to run
// unless both emulator hosts are set, so it can never touch the real project.
//
//   cd functions
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/seed-emulator.js
//
// The passwords below are throw-away values that exist only inside the emulator.
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Refusing to run: set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST.");
  process.exit(1);
}

initializeApp({ projectId: "demo-grade-runway" });
const auth = getAuth();
const db = getFirestore();

const PASSWORD = "emulator-pass-1";
const users = [
  { uid: "rev-1", email: "reviewer1@example.test", name: "อาจารย์ ตรวจหนึ่ง", roles: ["lecturer"] },
  { uid: "rev-2", email: "reviewer2@example.test", name: "อาจารย์ ตรวจสอง", roles: ["admin"] },
  { uid: "stu-1", email: "student1@example.test", name: "สมชาย ใจดี", roles: ["student"] },
  { uid: "stu-2", email: "student2@example.test", name: "สมหญิง รักเรียน", roles: ["student"] },
  { uid: "adv-1", email: "advisor1@example.test", name: "อาจารย์ ที่ปรึกษา", roles: ["advisor"] },
];

const ts = (iso) => Timestamp.fromDate(new Date(iso));

async function main() {
  for (const u of users) {
    try {
      await auth.createUser({ uid: u.uid, email: u.email, password: PASSWORD });
    } catch (e) {
      if (e.code !== "auth/uid-already-exists") throw e;
    }
    await db.collection("users").doc(u.uid).set({
      name: u.name, email: u.email, status: "active", roles: u.roles, source: "admin", _seed: true,
    });
  }
  await db.collection("eligibilityResults").doc("stu-1").set({ eligible: true, _seed: true });
  await db.collection("eligibilityResults").doc("stu-2").set({ eligible: true, _seed: true });

  const msgs = {
    "msg-a": ["stu-1", "สมชาย ใจดี", "ลองทำโจทย์ย้อนหลังวันละ 1 ชุด จะช่วยให้จับทางข้อสอบได้เร็วขึ้น", "2026-10-14T10:00:00+07:00"],
    "msg-b": ["stu-2", "สมหญิง รักเรียน", "จดสรุปท้ายคาบทุกครั้ง แล้วทบทวนก่อนเข้าเรียนครั้งถัดไป", "2026-10-15T14:30:00+07:00"],
    "msg-c": ["stu-1", "สมชาย ใจดี", "อย่าเสียเวลาอ่านเลย วิชานี้ไม่มีทางผ่านอยู่แล้ว", "2026-10-16T09:15:00+07:00"],
  };
  for (const [id, [senderId, senderName, content, at]] of Object.entries(msgs)) {
    await db.collection("chatMessages").doc(id).set({
      senderId, senderName, content, status: "pending", sentAt: ts(at), resubmitOfId: null, _seed: true,
    });
  }
  // Phase 4: assignment, sync state, study records, threshold rules. stu-1 is
  // declining with low attendance (at risk); stu-2 has one period only (new learner).
  await db.collection("advisorAssignments").doc("adv-1_stu-1").set({
    advisorId: "adv-1", learnerId: "stu-1", learnerName: "สมชาย ใจดี", status: "active", _seed: true,
  });
  await db.doc("syncState/current").set({ status: "normal", lastSuccessAt: ts("2026-10-26T08:00:00+07:00"), _seed: true });
  const rec = (name, doc) => db.collection(name).add({ ...doc, _seed: true });
  for (const [period, g] of [["2568-1", 3.2], ["2568-2", 2.6], ["2568-3", 2.1]]) {
    await rec("gradeRecords", { learnerId: "stu-1", course: "MATH101", period, grade: g });
  }
  await rec("attendanceRecords", { learnerId: "stu-1", course: "MATH101", period: "2568-3", rate: 62 });
  await rec("assignmentRecords", { learnerId: "stu-1", course: "MATH101", period: "2568-3", required: 10, submitted: 9 });
  await rec("gradeRecords", { learnerId: "stu-2", course: "MATH101", period: "2568-3", grade: 3.4 });
  await rec("attendanceRecords", { learnerId: "stu-2", course: "MATH101", period: "2568-3", rate: 95 });
  await rec("assignmentRecords", { learnerId: "stu-2", course: "MATH101", period: "2568-3", required: 10, submitted: 10 });
  const rule = (id, variable, name, threshold) =>
    db.collection("riskThresholdRules").doc(id).set({ variable, name, threshold, updatedBy: "rev-2", updatedAt: ts("2026-10-27T09:00:00+07:00"), _seed: true });
  await rule("rule-att", "attendance", "เข้าเรียนต่ำกว่าเกณฑ์", 80);
  await rule("rule-trend", "trend", "เกรดลดลงต่อเนื่อง", 2);
  console.log("Seeded emulator: reviewer1@example.test / reviewer2@example.test / student1@example.test / student2@example.test / advisor1@example.test");
  console.log(`Password for all: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
