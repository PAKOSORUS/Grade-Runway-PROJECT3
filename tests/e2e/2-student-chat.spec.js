const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

// Needs a freshly seeded emulator (the room starts empty, no rejected messages yet).
test.describe("2. student chat on /dashboard/ (spec 2, 3, 5.1, 7)", () => {
  test("room starts empty with the empty-state text", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    await expect(page.locator("#roomMessages")).toContainText("ยังไม่มีข้อความในห้องรวม");
  });

  test("whitespace-only message is blocked in the page", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    await page.locator("#chatApp").waitFor({ state: "visible" });
    await page.fill("#msgText", "   ");
    await page.click("#sendForm button[type=submit]");
    await expect(page.locator("#sendStatus")).toContainText("ต้องระบุข้อความ");
  });

  test("textarea limits input to 2000 characters", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    await page.locator("#chatApp").waitFor({ state: "visible" });
    await expect(page.locator("#msgText")).toHaveAttribute("maxlength", "2000");
  });

  test("eligible student sends a message: pending, rendered as text not HTML", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    await page.locator("#chatApp").waitFor({ state: "visible" });
    const text = `e2e-ข้อความ <b>bold</b> ${Date.now()}`;
    await page.fill("#msgText", text);
    await page.click("#sendForm button[type=submit]");
    await expect(page.locator("#sendStatus")).toContainText("ส่งแล้ว กำลังรอการอนุมัติ");
    const mine = page.locator("#myMessages .msg", { hasText: "e2e-ข้อความ" });
    await expect(mine).toContainText(text);
    await expect(mine.locator(".badge")).toHaveText("รออนุมัติ");
    await expect(mine.locator("b")).toHaveCount(0);
    await expect(page.locator("#roomMessages")).not.toContainText("e2e-ข้อความ");
  });

  test("my messages never shows another student's messages", async ({ page }) => {
    await login(page, "student2", "/dashboard/");
    await page.locator("#chatApp").waitFor({ state: "visible" });
    await expect(page.locator("#myMessages")).not.toContainText("e2e-ข้อความ");
  });
});
