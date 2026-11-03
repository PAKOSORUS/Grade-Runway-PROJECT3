const { test, expect } = require("@playwright/test");

// Live site, READ ONLY. No sign-in, no sign-up, no form submit, no writes.
// Run with BASE_URL=https://grade-runway-project.web.app (Cloud Functions are not deployed).
test.describe("4. live site: login page loads (read only)", () => {
  test("login page loads with title, heading and both forms; not in emulator mode", async ({ page }) => {
    const calls = [];
    page.on("request", (r) => calls.push({ method: r.method(), url: r.url() }));
    const res = await page.goto("/login/");
    expect(res && res.status()).toBe(200);
    await expect(page).toHaveTitle(/เข้าสู่ระบบ/);
    await expect(page.locator("h1")).toHaveText("เข้าสู่ระบบ");
    await expect(page.locator("#loginForm")).toBeVisible();
    await expect(page.locator("#signupForm")).toBeVisible();
    await expect(page.locator("#mode")).toBeHidden();
    // nothing was sent to Cloud Functions or written to Firestore just by opening the page
    expect(calls.filter((c) => /cloudfunctions\.net/.test(c.url))).toEqual([]);
    expect(calls.filter((c) => /firestore\.googleapis\.com/.test(c.url) && c.method !== "GET")).toEqual([]);
  });

  for (const p of ["/dashboard/", "/review-queue/", "/admin/"]) {
    test(`not signed in: ${p} bounces to /login/`, async ({ page }) => {
      await page.goto(p);
      await expect(page).toHaveURL(/\/login\//);
    });
  }

  // Firestore REST, GET only, with NO token and NO API key. Expected: 403 + PERMISSION_DENIED.
  // Any other status is reported as-is (not guessed) by failing with the actual status/error status.
  const PROJECT = process.env.FIREBASE_PROJECT_ID || "grade-runway-project"; // from .firebaserc
  for (const collection of ["chatMessages", "users"]) {
    test(`unauthenticated REST GET of ${collection} is 403 PERMISSION_DENIED`, async () => {
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collection}`;
      const res = await fetch(url, { method: "GET" });
      let errStatus = null;
      try { errStatus = (await res.json()).error?.status ?? null; } catch { /* body not JSON */ }
      // only status codes are kept; no document data is read or printed
      expect({ http: res.status, errorStatus: errStatus }).toEqual({ http: 403, errorStatus: "PERMISSION_DENIED" });
    });
  }
});
