const { test, expect } = require("@playwright/test");
const { login, ACCOUNTS } = require("./helpers");

test.describe("1. login, role redirect, page guard (spec 3, 7)", () => {
  test("login page shows both forms in emulator mode", async ({ page }) => {
    await page.goto("/login/#emulator");
    await expect(page.locator("#mode")).toBeVisible();
    await expect(page.locator("#loginForm")).toBeVisible();
    await expect(page.locator("#signupForm")).toBeVisible();
  });

  test("wrong password shows the single generic failure message", async ({ page }) => {
    await page.goto("/login/#emulator");
    await page.locator("#forms").waitFor({ state: "visible" });
    await page.fill("#email", ACCOUNTS.student1);
    await page.fill("#password", "definitely-wrong-" + Date.now());
    await page.click("#loginForm button[type=submit]");
    await expect(page.locator("#message")).toContainText("เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน");
    await expect(page).toHaveURL(/\/login\//);
  });

  test("not signed in: internal pages bounce to /login/", async ({ page }) => {
    for (const p of ["/dashboard/", "/review-queue/", "/admin/"]) {
      await page.goto(p + "#emulator");
      await expect(page).toHaveURL(/\/login\/#emulator/);
    }
  });

  test("student lands on /dashboard/ and sees the chat section", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    await expect(page.locator("#chatApp")).toBeVisible();
    await expect(page.locator("#whoText")).toContainText(ACCOUNTS.student1);
  });

  test("lecturer lands on /review-queue/", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    await expect(page.locator("h1")).toContainText("ตรวจข้อความรออนุมัติ");
  });

  test("admin lands on /admin/", async ({ page }) => {
    await login(page, "reviewer2", "/admin/");
  });

  test("advisor lands on /dashboard/ but the chat section stays hidden", async ({ page }) => {
    await login(page, "advisor1", "/dashboard/");
    await expect(page.locator("#who")).toBeVisible();
    // wait until the page has loaded the advisor's data (#app is shown after listMyLearners succeeds),
    // so the hidden check below cannot pass just because loading has not finished yet
    await expect(page.locator("#app")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#view")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#chatApp")).toBeHidden();
  });

  test("account with no roles gets the no-role message and stays", async ({ page }) => {
    await login(page, "norole");
    await expect(page.locator("#message")).toContainText("บัญชีนี้ยังไม่มีบทบาทที่เข้าหน้าใดได้ กรุณาติดต่อผู้ดูแลระบบ");
    await expect(page).toHaveURL(/\/login\//);
  });

  test("student opening /review-queue/ is told no permission and redirected to dashboard", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    await page.goto("/review-queue/#emulator");
    await expect(page.locator("#message")).toContainText("ไม่มีสิทธิ์เข้าหน้านี้ กำลังพาไปหน้า");
    await page.waitForURL(/\/dashboard\//, { timeout: 6000 });
  });

  test("roles are never stored in localStorage/sessionStorage", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    await expect(page.locator("#whoText")).toBeVisible();
    const dump = await page.evaluate(() =>
      JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } })
    );
    // Firebase Auth keeps its own session keys; the app must not store roles
    expect(dump).not.toMatch(/"roles"|lecturer/);
  });

  test("logout from a page returns to /login/", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    await page.click("#logout");
    await expect(page).toHaveURL(/\/login\//);
  });
});
