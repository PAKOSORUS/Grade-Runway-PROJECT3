// Self-registration and own-profile lookup (FR-28, FR-29; course work part C).
// The Firebase Auth account is created by the page; this callable only creates
// the matching users/{uid} document. The page never writes users directly and
// the caller cannot choose a role: a self-registered account is always a
// student, and an existing users/{uid} is never overwritten.
const { FieldValue } = require("firebase-admin/firestore");
const { recordChange } = require("./audit");
const { unauthenticated, denied, invalid, missing } = require("./errors");

const MAX_NAME = 100;

function cleanName(name) {
  const value = typeof name === "string" ? name.trim() : "";
  if (!value) throw invalid("ต้องระบุชื่อ");
  if (value.length > MAX_NAME) throw invalid(`ชื่อยาวเกิน ${MAX_NAME} ตัวอักษร`);
  return value;
}

// uid and email come from the verified token, never from the request body;
// only `name` is taken from the caller (roles/status/uid in data are ignored).
// OP-44: an existing account is not an error and is never touched: the result
// is { result: "exists" } and nothing is written (no audit either).
async function registerSelf(db, auth, data) {
  if (!auth || !auth.uid) throw unauthenticated();
  const email = typeof auth.token?.email === "string" ? auth.token.email : "";
  if (!email) throw invalid("บัญชีต้องมีอีเมล");
  const name = cleanName(data?.name);

  const ref = db.collection("users").doc(auth.uid);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return { result: "exists" };
    const doc = { name, email, roles: ["student"], status: "active", source: "self" };
    tx.create(ref, { ...doc, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    recordChange(db, tx, {
      category: "account",
      action: "selfRegister",
      targetId: auth.uid,
      actorId: auth.uid,
      before: null,
      after: doc,
    });
    return { result: "created", name, roles: ["student"], status: "active" };
  });
}

// OP-45, read-only: the caller's own profile, so a page can pick the right home
// page after login (clients cannot read users directly, see firestore.rules).
// No account yet = not-found with details { reason: "no-account" } (the page then
// offers sign-up completion; a not-found WITHOUT that reason means the function
// itself is missing, i.e. the backend is not deployed); a disabled account =
// permission-denied.
async function getMyProfile(db, auth) {
  if (!auth || !auth.uid) throw unauthenticated();
  const snap = await db.collection("users").doc(auth.uid).get();
  if (!snap.exists) throw missing("ยังไม่มีบัญชีผู้ใช้ในระบบ", { reason: "no-account" });
  const user = snap.data();
  if (user.status !== "active") throw denied("บัญชีถูกปิดใช้งาน");
  return { name: user.name ?? null, roles: Array.isArray(user.roles) ? user.roles : [], status: user.status };
}

module.exports = { registerSelf, getMyProfile };
