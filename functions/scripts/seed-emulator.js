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
  console.log("Seeded emulator: reviewer1@example.test / reviewer2@example.test / student1@example.test / student2@example.test");
  console.log(`Password for all: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
