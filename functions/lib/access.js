// Access Control (T-1-01, NFR-01): resolve the caller identity and role from
// users/{auth uid} in this system, never from the login provider.
const { unauthenticated, denied } = require("./errors");

const ROLES = ["student", "advisor", "lecturer", "admin"];

// Returns { uid, user } for an active account, or throws.
async function requireActiveUser(db, auth) {
  if (!auth || !auth.uid) throw unauthenticated();
  const snap = await db.collection("users").doc(auth.uid).get();
  if (!snap.exists || snap.data().status !== "active") throw denied();
  return { uid: auth.uid, user: snap.data() };
}

async function requireRole(db, auth, allowed) {
  const ctx = await requireActiveUser(db, auth);
  const roles = Array.isArray(ctx.user.roles) ? ctx.user.roles : [];
  if (!roles.some((r) => allowed.includes(r))) throw denied();
  return ctx;
}

const requireAdmin = (db, auth) => requireRole(db, auth, ["admin"]);

module.exports = { ROLES, requireActiveUser, requireRole, requireAdmin };
