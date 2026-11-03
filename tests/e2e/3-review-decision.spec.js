const { test, expect } = require("@playwright/test");
const { login } = require("./helpers");

// UI layer only. The backend rules for decideMessage (outcome/negative/reason/token validation,
// negative message can still be approved) are verified by functions/test/chat.test.js:110
// ("approve and reject need the right fields; reject needs a reason; negative can still be approved").
// Needs a freshly seeded emulator and runs in order (state carries over between tests).
// The AI buttons are never clicked.
test.describe.configure({ mode: "serial" });

const card = (page, text) => page.locator("#list article.item", { hasText: text });
const MSG_A = "ลองทำโจทย์ย้อนหลังวันละ 1 ชุด"; // stu-1, to approve (not negative)
const MSG_B = "จดสรุปท้ายคาบทุกครั้ง"; // stu-2, to approve as negative (reviewer's own choice)
const MSG_C = "อย่าเสียเวลาอ่านเลย"; // stu-1, to reject

test.describe("3. review queue decision form + student result (spec 3, 5.1, 7, 8.2)", () => {
  test("reviewer sees pending messages, oldest first", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    await expect(card(page, MSG_A)).toBeVisible();
    const first = await page.locator("#list article.item .content").first().textContent();
    expect(first).toContain(MSG_A);
  });

  test("a message the reviewer sent themselves is listed but cannot be locked", async ({ page }) => {
    await login(page, "dual", "/review-queue/");
    const own = card(page, "ข้อความที่ผู้ตรวจส่งเอง");
    await expect(own).toBeVisible();
    await expect(own.getByRole("button", { name: "ล็อกเพื่อตรวจ" })).toBeDisabled();
    await expect(own).toContainText("ข้อความของคุณเอง ตรวจไม่ได้");
  });

  test("decision form validation: need negative choice; reject needs a reason", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    await card(page, MSG_C).getByRole("button", { name: "ล็อกเพื่อตรวจ" }).click();
    const c = card(page, MSG_C);
    await expect(c.getByRole("button", { name: /อนุมัติ/ })).toBeVisible();

    await c.getByRole("button", { name: /อนุมัติ/ }).click();
    await expect(c.locator(".inline-error")).toHaveText("เลือกเชิงลบหรือไม่เชิงลบก่อน");
    await c.getByRole("button", { name: /ปฏิเสธ/ }).click();
    await expect(c.locator(".inline-error")).toHaveText("เลือกเชิงลบหรือไม่เชิงลบก่อน");

    await c.locator("input[type=radio][value=true]").check();
    await c.getByRole("button", { name: /ปฏิเสธ/ }).click();
    await expect(c.locator(".inline-error")).toHaveText("การปฏิเสธต้องระบุเหตุผล");
    // still pending and still shown
    await expect(card(page, MSG_C)).toBeVisible();
  });

  test("reject without a reason (empty, whitespace only) sends no decideMessage request", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    // lock again (token is lost on reload); lock/list requests happen before the counter starts
    await card(page, MSG_C).getByRole("button", { name: /ล็อก/ }).click();
    const c = card(page, MSG_C);
    await expect(c.getByRole("button", { name: /ปฏิเสธ/ })).toBeVisible();
    await c.locator("input[type=radio][value=true]").check();

    // count only decideMessage calls, started before the reject click
    let decideCalls = 0;
    page.on("request", (req) => {
      if (req.url().includes("decideMessage")) decideCalls++;
    });

    // (a) empty reason
    await c.locator("textarea").fill("");
    await c.getByRole("button", { name: /ปฏิเสธ/ }).click();
    await expect(c.locator(".inline-error")).toHaveText("การปฏิเสธต้องระบุเหตุผล");
    await page.waitForTimeout(1000);
    expect(decideCalls).toBe(0);

    // (b) whitespace-only reason
    await c.locator("textarea").fill("   ");
    await c.getByRole("button", { name: /ปฏิเสธ/ }).click();
    await expect(c.locator(".inline-error")).toHaveText("การปฏิเสธต้องระบุเหตุผล");
    await page.waitForTimeout(1000);
    expect(decideCalls).toBe(0);
    await expect(card(page, MSG_C)).toBeVisible();
  });

  test("student side: the message rejected without a reason is still pending, no reason line, no resubmit", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    const mineMsg = page.locator("#myMessages .msg", { hasText: MSG_C });
    await expect(mineMsg.locator(".badge")).toHaveText("รออนุมัติ", { timeout: 20000 });
    await expect(mineMsg).not.toContainText("เหตุผลที่ปฏิเสธ");
    await expect(mineMsg.getByRole("button", { name: "ส่งใหม่" })).toHaveCount(0);
  });

  test("reject with a reason removes the message from the queue (control: interceptor sees 1 decideMessage)", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    // lock is kept on the server; the page lost its token on reload, so lock again
    await card(page, MSG_C).getByRole("button", { name: /ล็อก/ }).click();
    const c = card(page, MSG_C);
    await c.locator("input[type=radio][value=true]").check();
    await c.locator("textarea").fill("เนื้อหาลดกำลังใจผู้อ่าน");
    let decideCalls = 0;
    page.on("request", (req) => {
      if (req.url().includes("decideMessage")) decideCalls++;
    });
    await c.getByRole("button", { name: /ปฏิเสธ/ }).click();
    await expect(card(page, MSG_C)).toHaveCount(0);
    expect(decideCalls).toBe(1);
  });

  test("approve not-negative, and approve a negative one by the reviewer's own choice", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    await card(page, MSG_A).getByRole("button", { name: /ล็อก/ }).click();
    await card(page, MSG_A).locator("input[type=radio][value=false]").check();
    await card(page, MSG_A).getByRole("button", { name: /อนุมัติ/ }).click();
    await expect(card(page, MSG_A)).toHaveCount(0);

    await card(page, MSG_B).getByRole("button", { name: /ล็อก/ }).click();
    await card(page, MSG_B).locator("input[type=radio][value=true]").check();
    await card(page, MSG_B).getByRole("button", { name: /อนุมัติ/ }).click();
    await expect(card(page, MSG_B)).toHaveCount(0);
  });

  test("shared room shows approved messages, without sender name by default", async ({ page }) => {
    await login(page, "student2", "/dashboard/");
    const room = page.locator("#roomMessages");
    await expect(room).toContainText(MSG_A);
    await expect(room).toContainText(MSG_B);
    await expect(room).not.toContainText(MSG_C);
    await expect(room).not.toContainText("สมชาย");
    await expect(room).not.toContainText("สมหญิง");
    await expect(room).not.toContainText("stu-");
  });

  test("student sees approved and rejected status; rejected shows reason and resubmit button", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    const mine = page.locator("#myMessages .msg");
    const rejected = mine.filter({ hasText: MSG_C });
    await expect(rejected.locator(".badge")).toHaveText("ถูกปฏิเสธ");
    await expect(rejected).toContainText("เหตุผลที่ปฏิเสธ: เนื้อหาลดกำลังใจผู้อ่าน");
    await expect(rejected.getByRole("button", { name: "ส่งใหม่", exact: true })).toBeVisible();
    const approved = mine.filter({ hasText: MSG_A });
    await expect(approved.locator(".badge")).toHaveText("อนุมัติแล้ว");
    await expect(approved.getByRole("button", { name: "ส่งใหม่" })).toHaveCount(0);
    // the student view carries no reviewer or negative/not-negative info
    await expect(page.locator("#myMessages")).not.toContainText("เชิงลบ");
  });

  test("resubmit: blank blocked, then new pending message with resubmit badge, button hidden", async ({ page }) => {
    await login(page, "student1", "/dashboard/");
    const rejected = page.locator("#myMessages .msg", { hasText: MSG_C });
    await rejected.getByRole("button", { name: "ส่งใหม่", exact: true }).click();
    const form = rejected.locator("form");
    await expect(form).toBeVisible();

    await form.locator("textarea").fill("   ");
    await form.getByRole("button", { name: "ส่งข้อความใหม่" }).click();
    await expect(form.locator(".status")).toHaveText("ต้องระบุข้อความ");

    const fresh = `e2e-ส่งใหม่ ปรับถ้อยคำแล้ว ${Date.now()}`;
    await form.locator("textarea").fill(fresh);
    await form.getByRole("button", { name: "ส่งข้อความใหม่" }).click();

    const child = page.locator("#myMessages .msg", { hasText: fresh });
    await expect(child.locator(".badge")).toHaveText("รออนุมัติ");
    await expect(child).toContainText("ส่งใหม่จากข้อความที่ถูกปฏิเสธ");
    // the original is blocked now (a child that is not rejected exists): no resubmit button on it
    await expect(page.locator("#myMessages .msg", { hasText: MSG_C }).getByRole("button", { name: "ส่งใหม่", exact: true })).toHaveCount(0);
  });

  test("the resubmitted message reaches the review queue with a resubmit badge", async ({ page }) => {
    await login(page, "reviewer1", "/review-queue/");
    const c = card(page, "e2e-ส่งใหม่");
    await expect(c).toBeVisible();
    await expect(c).toContainText("ส่งใหม่จาก");
  });
});
