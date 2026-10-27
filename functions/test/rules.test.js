// Firestore security rules (firebase/firestore.rules). Runs against the emulator
// with npm test. Clients get exactly one thing: reviewers (active lecturer or
// admin) may read chatMessages. Everything else is denied.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

const rules = fs.readFileSync(path.join(__dirname, "..", "..", "firebase", "firestore.rules"), "utf8");
let env;

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-grade-rules", firestore: { rules } });
});
test.after(async () => env.cleanup());

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const users = {
      lec: { roles: ["lecturer"], status: "active" },
      adm: { roles: ["admin"], status: "active" },
      stu: { roles: ["student"], status: "active" },
      adv: { roles: ["advisor"], status: "active" },
      off: { roles: ["lecturer"], status: "disabled" },
    };
    for (const [id, u] of Object.entries(users)) await db.doc(`users/${id}`).set({ name: id, ...u });
    await db.doc("chatMessages/m1").set({ senderName: "S", content: "x", status: "pending" });
    for (const p of ["reviewLocks/m1", "auditEvents/e1", "configChangeAudits/c1", "systemPolicy/current", "notifications/n1", "advisorAssignments/a1", "eligibilityResults/stu"]) {
      await db.doc(p).set({ v: 1 });
    }
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test("reviewers (lecturer, admin) can read chatMessages", async () => {
  await assertSucceeds(as("lec").doc("chatMessages/m1").get());
  await assertSucceeds(as("adm").doc("chatMessages/m1").get());
  await assertSucceeds(as("lec").collection("chatMessages").where("status", "==", "pending").get());
});

test("students, advisors, disabled reviewers, unknown and anonymous cannot read chatMessages", async () => {
  await assertFails(as("stu").doc("chatMessages/m1").get());
  await assertFails(as("adv").doc("chatMessages/m1").get());
  await assertFails(as("off").doc("chatMessages/m1").get());
  await assertFails(as("ghost").doc("chatMessages/m1").get());
  await assertFails(anon().doc("chatMessages/m1").get());
});

test("nobody writes chatMessages from a client, not even a reviewer", async () => {
  await assertFails(as("lec").doc("chatMessages/m1").update({ status: "approved" }));
  await assertFails(as("adm").doc("chatMessages/m2").set({ content: "x" }));
  await assertFails(as("lec").doc("chatMessages/m1").delete());
  await assertFails(as("stu").doc("chatMessages/m3").set({ senderName: "S", content: "x", status: "approved" }));
});

test("every other collection is closed to clients, including admin", async () => {
  for (const p of ["users/lec", "reviewLocks/m1", "auditEvents/e1", "configChangeAudits/c1", "systemPolicy/current", "notifications/n1", "advisorAssignments/a1", "eligibilityResults/stu"]) {
    for (const uid of ["lec", "adm", "stu"]) {
      await assertFails(as(uid).doc(p).get());
      await assertFails(as(uid).doc(p).set({ v: 2 }));
    }
    await assertFails(anon().doc(p).get());
  }
});

test("a user cannot grant themselves a role by writing users", async () => {
  await assertFails(as("stu").doc("users/stu").update({ roles: ["admin"] }));
  await assertFails(as("stu").doc("users/stu2").set({ roles: ["admin"], status: "active" }));
});
