const { HttpsError } = require("firebase-functions/v2/https");

// Thin wrappers so handlers read as intent and callers get stable error codes.
const unauthenticated = (msg = "ต้องเข้าสู่ระบบก่อน") => new HttpsError("unauthenticated", msg);
const denied = (msg = "ไม่มีสิทธิ์ทำรายการนี้") => new HttpsError("permission-denied", msg);
const invalid = (msg) => new HttpsError("invalid-argument", msg);
const missing = (msg, details) => new HttpsError("not-found", msg, details);
const conflict = (msg) => new HttpsError("failed-precondition", msg);

module.exports = { unauthenticated, denied, invalid, missing, conflict };
