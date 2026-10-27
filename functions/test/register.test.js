// Runs against the Firestore emulator: npm test (uses firebase emulators:exec).
const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const register = require("../lib/register");

initializeApp({ projectId: "demo-grade-runway" });
const db = getFirestore();

const code = (p) => p.then(() => null, (e) => e.code);
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
  assert.deepEqual(r, { uid: "new-1", roles: ["student"], status: "active" });
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

test("registerSelf never overwrites an existing users document", async () => {
  await db.collection("users").doc("admin-1").set({ name: "Admin", email: "a@example.test", roles: ["admin"], status: "active", source: "admin" });
  assert.equal(await code(register.registerSelf(db, authOf("admin-1"), { name: "Hijack" })), "failed-precondition");
  const u = await userDoc("admin-1");
  assert.deepEqual(u.roles, ["admin"]);
  assert.equal(u.name, "Admin");
  assert.equal((await audits()).length, 0);

  await register.registerSelf(db, authOf("new-3"), { name: "Once" });
  assert.equal(await code(register.registerSelf(db, authOf("new-3"), { name: "Twice" })), "failed-precondition");
  assert.equal((await userDoc("new-3")).name, "Once");
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

test("getMyProfile rejects unauthenticated, unknown and disabled accounts", async () => {
  await db.collection("users").doc("off-1").set({ name: "Off", roles: ["student"], status: "disabled" });
  assert.equal(await code(register.getMyProfile(db, null)), "unauthenticated");
  assert.equal(await code(register.getMyProfile(db, { uid: "ghost" })), "permission-denied");
  assert.equal(await code(register.getMyProfile(db, { uid: "off-1" })), "permission-denied");
});
