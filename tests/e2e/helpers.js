// Shared helpers. Credentials come from the environment only.
//   TEST_PASSWORD  password of the emulator seed accounts (required for emulator tests)
//   E2E_*_EMAIL    optional overrides of the seed account emails
const EMU = {
  auth: process.env.AUTH_EMULATOR || "http://127.0.0.1:9099",
  firestore: process.env.FIRESTORE_EMULATOR || "http://127.0.0.1:8080",
  project: "demo-grade-runway",
};

const ACCOUNTS = {
  reviewer1: process.env.E2E_REVIEWER1_EMAIL || "reviewer1@example.test", // lecturer
  reviewer2: process.env.E2E_REVIEWER2_EMAIL || "reviewer2@example.test", // admin
  student1: process.env.E2E_STUDENT1_EMAIL || "student1@example.test",
  student2: process.env.E2E_STUDENT2_EMAIL || "student2@example.test",
  advisor1: process.env.E2E_ADVISOR1_EMAIL || "advisor1@example.test",
  dual: process.env.E2E_DUAL_EMAIL || "dual@example.test", // student + lecturer
  norole: process.env.E2E_NOROLE_EMAIL || "norole@example.test",
};

function password() {
  const p = process.env.TEST_PASSWORD;
  if (!p) throw new Error("TEST_PASSWORD is not set (emulator seed password)");
  return p;
}

// Sign in through the login page (emulator mode) and wait for the role page.
async function login(page, who, expectPath) {
  await page.goto("/login/#emulator");
  await page.locator("#forms").waitFor({ state: "visible" });
  await page.fill("#email", ACCOUNTS[who]);
  await page.fill("#password", password());
  await page.click("#loginForm button[type=submit]");
  if (expectPath) await page.waitForURL(new RegExp(expectPath));
}

// idToken from the Auth emulator (REST), for direct Firestore REST calls.
async function emulatorIdToken(who) {
  const res = await fetch(`${EMU.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ACCOUNTS[who], password: password(), returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`emulator sign-in failed for ${who}: ${res.status}`);
  return (await res.json()).idToken;
}

module.exports = { EMU, ACCOUNTS, login, emulatorIdToken };
