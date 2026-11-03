const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");

// Live site. Creates ONE throw-away Firebase Auth account (Identity Toolkit REST), uses its idToken to
// try reading chatMessages and users directly (must be 403 PERMISSION_DENIED), then deletes the account
// in afterAll whether the tests passed or not. Never calls registerSelf, never writes Firestore,
// never creates a users document. The API key comes from FIREBASE_API_KEY only; the generated
// password and tokens are never printed.
const API_KEY = process.env.FIREBASE_API_KEY;
const PROJECT = process.env.FIREBASE_PROJECT_ID || "grade-runway-project"; // from .firebaserc
const AUTH = "https://identitytoolkit.googleapis.com/v1";
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

test.describe("5b. direct Firestore REST access with a throw-away account (live)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!API_KEY, "สภาพแวดล้อม: ไม่ได้ตั้ง FIREBASE_API_KEY จึงข้ามเทสต์นี้ (ไม่สร้างบัญชีใด ๆ บนเว็บจริง)");

  let idToken = null;

  test.beforeAll(async () => {
    if (!API_KEY) return;
    const email = `e2e-${Date.now()}@example.test`;
    const pw = crypto.randomBytes(18).toString("base64url"); // generated here, never logged
    const res = await fetch(`${AUTH}/accounts:signUp?key=${encodeURIComponent(API_KEY)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: pw, returnSecureToken: true }),
    });
    if (!res.ok) throw new Error(`accounts:signUp failed with HTTP ${res.status}`);
    idToken = (await res.json()).idToken;
  });

  test.afterAll(async () => {
    // runs even when a test failed; only deletes the account this file created
    if (!API_KEY || !idToken) return;
    const res = await fetch(`${AUTH}/accounts:delete?key=${encodeURIComponent(API_KEY)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) console.error(`WARNING: accounts:delete failed with HTTP ${res.status}; delete the e2e-*@example.test account by hand`);
    idToken = null;
  });

  for (const collection of ["chatMessages", "users"]) {
    test(`new account without a users document cannot read ${collection} (403 PERMISSION_DENIED)`, async () => {
      const res = await fetch(`${DOCS}/${collection}`, { headers: { authorization: `Bearer ${idToken}` } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.status).toBe("PERMISSION_DENIED");
    });
  }
});
