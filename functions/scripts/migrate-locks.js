// Moves old chatMessages.lock fields to reviewLocks (see lib/migrate-locks.js).
// Dry run by default; pass --apply to write.
//
//   Emulator:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrate-locks.js [--apply]
//   Real project: needs admin credentials; run a dry run first and read the counts.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { migrateLegacyLocks } = require("../lib/migrate-locks");

initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: "demo-grade-runway" } : undefined);

migrateLegacyLocks(getFirestore(), { apply: process.argv.includes("--apply") }).then(
  (r) => {
    console.log(JSON.stringify(r));
    if (!r.applied && r.found > 0) console.log("Dry run only. Re-run with --apply to write.");
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
