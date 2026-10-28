// Runs against the Firestore emulator: npm test (uses firebase emulators:exec).
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const register = require("../lib/register");

initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();

const code = (p) => p.then(() => null, (e) => e.code);
const reason = (p) => p.then(() => null, (e) => e.details?.reason ?? null);
const authOf = (uid, email = `${uid}@example.test`) => ({ uid, token: { email } });
const userDoc = async (uid) => (await db.collection("users").doc(uid).get()).data();
const audits = async () => (await db.collection("configChangeAudits").get()).docs.map((d) => d.data());

test.beforeEach(async () => {
  for (const name of ["users", "configChangeAudits"]) {
    const snap = await db.collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

test("registerSelf requires a signed-in caller", async () => {
  assert.equal(await code(register.registerSelf(db, null, { name: "X" })), "unauthenticated");
  assert.equal(await code(register.registerSelf(db, {}, { name: "X" })), "unauthenticated");
  assert.equal((await db.collection("users").get()).size, 0);
});

test("registerSelf creates an active student with uid and email from the token", async () => {
  const r = await register.registerSelf(db, authOf("new-1", "new1@example.test"), { name: "  สมชาย  " });
  assert.deepEqual(r, { result: "created", name: "สมชาย", roles: ["student"], status: "active" });
  const u = await userDoc("new-1");
  assert.equal(u.name, "สมชาย");
  assert.equal(u.email, "new1@example.test");
  assert.deepEqual(u.roles, ["student"]);
  assert.equal(u.status, "active");
  assert.equal(u.source, "self");
});

test("registerSelf ignores roles, status, uid and email sent by the caller", async () => {
  await register.registerSelf(db, authOf("new-2", "real@example.test"), {
    name: "Mallory",
    roles: ["admin"],
    status: "disabled",
    uid: "someone-else",
    email: "fake@example.test",
  });
  const u = await userDoc("new-2");
  assert.deepEqual(u.roles, ["student"]);
  assert.equal(u.status, "active");
  assert.equal(u.email, "real@example.test");
  assert.equal((await db.collection("users").doc("someone-else").get()).exists, false);
});

test("registerSelf on an existing account answers exists, never overwrites and writes no audit", async () => {
  await db.collection("users").doc("admin-1").set({ name: "Admin", email: "a@example.test", roles: ["admin"], status: "active", source: "admin" });
  assert.deepEqual(await register.registerSelf(db, authOf("admin-1"), { name: "Hijack" }), { result: "exists" });
  const u = await userDoc("admin-1");
  assert.deepEqual(u.roles, ["admin"]);
  assert.equal(u.name, "Admin");
  assert.equal(u.source, "admin");
  assert.equal((await audits()).length, 0);

  // a disabled account is also left untouched
  await db.collection("users").doc("off-2").set({ name: "Off", email: "o@example.test", roles: ["lecturer"], status: "disabled", source: "admin" });
  assert.deepEqual(await register.registerSelf(db, authOf("off-2"), { name: "Back" }), { result: "exists" });
  assert.equal((await userDoc("off-2")).status, "disabled");

  assert.equal((await register.registerSelf(db, authOf("new-3"), { name: "Once" })).result, "created");
  assert.deepEqual(await register.registerSelf(db, authOf("new-3"), { name: "Twice" }), { result: "exists" });
  assert.equal((await userDoc("new-3")).name, "Once");
  assert.equal((await audits()).length, 1);
});

test("two simultaneous sign-ups of one uid create the account once", async () => {
  const results = await Promise.all([
    register.registerSelf(db, authOf("race-1"), { name: "A" }),
    register.registerSelf(db, authOf("race-1"), { name: "B" }),
  ]);
  assert.equal(results.filter((r) => r.result === "created").length, 1);
  assert.equal(results.filter((r) => r.result === "exists").length, 1);
  assert.equal((await audits()).length, 1);
});

test("registerSelf validates name and email", async () => {
  assert.equal(await code(register.registerSelf(db, authOf("v-1"), { name: "   " })), "invalid-argument");
  assert.equal(await code(register.registerSelf(db, authOf("v-1"), {})), "invalid-argument");
  assert.equal(await code(register.registerSelf(db, authOf("v-1"), { name: "x".repeat(101) })), "invalid-argument");
  assert.equal(await code(register.registerSelf(db, { uid: "v-1", token: {} }, { name: "X" })), "invalid-argument");
  assert.equal((await db.collection("users").get()).size, 0);
});

test("registerSelf writes one audit record with the new user as actor", async () => {
  await register.registerSelf(db, authOf("new-4"), { name: "Audit Me" });
  const a = await audits();
  assert.equal(a.length, 1);
  assert.equal(a[0].category, "account");
  assert.equal(a[0].action, "selfRegister");
  assert.equal(a[0].targetId, "new-4");
  assert.equal(a[0].actorId, "new-4");
  assert.equal(a[0].before, null);
  assert.deepEqual(a[0].after.roles, ["student"]);
});

test("getMyProfile returns only the caller's own name, roles and status", async () => {
  await db.collection("users").doc("lec-1").set({ name: "Lecturer", email: "l@example.test", roles: ["lecturer", "advisor"], status: "active" });
  assert.deepEqual(await register.getMyProfile(db, { uid: "lec-1" }), {
    name: "Lecturer",
    roles: ["lecturer", "advisor"],
    status: "active",
  });
});

test("getMyProfile: unauthenticated, no account (not-found) and disabled (permission-denied)", async () => {
  await db.collection("users").doc("off-1").set({ name: "Off", roles: ["student"], status: "disabled" });
  assert.equal(await code(register.getMyProfile(db, null)), "unauthenticated");
  assert.equal(await code(register.getMyProfile(db, { uid: "ghost" })), "not-found");
  assert.equal(await reason(register.getMyProfile(db, { uid: "ghost" })), "no-account");
  // only the no-account case carries a reason: a disabled account does not
  assert.equal(await reason(register.getMyProfile(db, { uid: "off-1" })), null);
  assert.equal(await code(register.getMyProfile(db, { uid: "off-1" })), "permission-denied");
});

test("after sign-up completes, getMyProfile succeeds for the new student", async () => {
  assert.equal(await code(register.getMyProfile(db, authOf("late-1"))), "not-found");
  assert.equal(await reason(register.getMyProfile(db, authOf("late-1"))), "no-account");
  await register.registerSelf(db, authOf("late-1"), { name: "Late" });
  assert.deepEqual(await register.getMyProfile(db, authOf("late-1")), { name: "Late", roles: ["student"], status: "active" });
});
