// Seed sample data into Firestore.
//
//   node seed.js                 dry-run (default): print what would be written
//   node seed.js --write         write documents that do not exist yet
//   node seed.js --write --force overwrite documents that already exist
//
// Credentials: set GOOGLE_APPLICATION_CREDENTIALS to your service account file
// (or FIRESTORE_EMULATOR_HOST to use the emulator). This script never reads keys itself.

const admin = require("firebase-admin");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "grade-runway-project";
const args = new Set(process.argv.slice(2));
const WRITE = args.has("--write");
const FORCE = args.has("--force");

const ts = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

// Every seeded document carries _seed: true so it can be found and deleted later.
const seedData = {
  users: {
    "user-001": {
      name: "สมชาย ใจดี",
      email: "somchai.j@example.com",
      status: "active",
      roles: ["student"],
      legacyId: "LMS-10001",
      source: "imported",
    },
    "user-002": {
      name: "สมหญิง รักเรียน",
      email: "somying.r@example.com",
      status: "active",
      roles: ["student"],
      legacyId: "LMS-10002",
      source: "imported",
    },
    "user-003": {
      name: "อ.วิภา ที่ปรึกษา",
      email: "wipa.a@example.com",
      status: "active",
      roles: ["advisor"],
      legacyId: "LMS-T001",
      source: "imported",
    },
    "user-004": {
      name: "อ.ประสิทธิ์ ตรวจดี",
      email: "prasit.l@example.com",
      status: "active",
      roles: ["lecturer"],
      legacyId: null,
      source: "admin",
    },
    "user-005": {
      name: "ผู้ดูแล ระบบ",
      email: "admin@example.com",
      status: "active",
      roles: ["admin"],
      legacyId: null,
      source: "admin",
    },
  },

  eligibilityCriteria: {
    "criteria-v1": {
      version: 1,
      isCurrent: true,
      setById: "user-005",
      setByName: "ผู้ดูแล ระบบ",
      setAt: ts("2026-10-10T09:00:00+07:00"),
    },
  },

  chatMessages: {
    // rejected, later re-submitted as msg-003
    "msg-001": {
      senderId: "user-001",
      senderName: "สมชาย ใจดี",
      content: "ลองทำโจทย์ย้อนหลังวันละ 1 ชุด จะช่วยให้จับทางข้อสอบได้เร็วขึ้น",
      status: "rejected",
      sentAt: ts("2026-10-14T10:00:00+07:00"),
      resubmitOfId: null,
      criteriaId: "criteria-v1",
    },
    // approved
    "msg-002": {
      senderId: "user-002",
      senderName: "สมหญิง รักเรียน",
      content: "จดสรุปท้ายคาบทุกครั้ง แล้วทบทวนก่อนเข้าเรียนครั้งถัดไป",
      status: "approved",
      sentAt: ts("2026-10-15T14:30:00+07:00"),
      resubmitOfId: null,
      criteriaId: "criteria-v1",
    },
    // pending, re-submission of the rejected msg-001
    "msg-003": {
      senderId: "user-001",
      senderName: "สมชาย ใจดี",
      content: "แนะนำให้ทำโจทย์ย้อนหลังวันละ 1 ชุด และจดข้อที่พลาดไว้ทบทวน",
      status: "pending",
      sentAt: ts("2026-10-16T09:15:00+07:00"),
      resubmitOfId: "msg-001",
      criteriaId: "criteria-v1",
    },
  },
};

async function main() {
  console.log(
    `Project: ${PROJECT_ID} | mode: ${WRITE ? (FORCE ? "WRITE (force overwrite)" : "WRITE (skip existing)") : "DRY-RUN"}`
  );
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`Using emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }

  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const batch = db.batch();
  let toWrite = 0;
  let skipped = 0;

  for (const [collection, docs] of Object.entries(seedData)) {
    for (const [id, fields] of Object.entries(docs)) {
      const ref = db.collection(collection).doc(id);
      const data = { ...fields, _seed: true };

      // Dry-run never touches the network; existence is only checked when writing.
      if (WRITE && !FORCE) {
        const snap = await ref.get();
        if (snap.exists) {
          console.log(`SKIP   ${collection}/${id} (already exists, use --force to overwrite)`);
          skipped++;
          continue;
        }
      }

      console.log(`${WRITE ? "WRITE " : "WOULD "} ${collection}/${id}`);
      if (!WRITE) console.log("       " + JSON.stringify(data, replacer));
      batch.set(ref, data);
      toWrite++;
    }
  }

  if (WRITE && toWrite > 0) {
    await batch.commit();
  }

  console.log(
    `\nDone. ${WRITE ? "Written" : "Would write"}: ${toWrite}, skipped: ${skipped}.` +
      (WRITE ? "" : " Re-run with --write to apply.")
  );
}

// Print Firestore Timestamps as ISO strings in dry-run output.
function replacer(_key, value) {
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return value;
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
