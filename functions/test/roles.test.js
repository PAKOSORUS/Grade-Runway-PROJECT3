// The page/role table the UI uses (web/shared/roles.js) must match ACL.md.
// roles.js is a browser ES module with no imports, so load it through a data: URL.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "..", "..", "web", "shared", "roles.js"), "utf8");
const load = () => import("data:text/javascript;charset=utf-8," + encodeURIComponent(src));
const keys = (pages) => pages.map((p) => p.key);

test("each role opens exactly the pages ACL.md gives it", async () => {
  const { pagesFor } = await load();
  assert.deepEqual(keys(pagesFor(["student"])), ["dashboard"]);
  assert.deepEqual(keys(pagesFor(["advisor"])), ["dashboard"]);
  assert.deepEqual(keys(pagesFor(["lecturer"])), ["review-queue"]);
  assert.deepEqual(keys(pagesFor(["admin"])), ["admin", "review-queue"]);
});

test("an admin without student/advisor has no dashboard (ACL.md: admin cannot read learner data)", async () => {
  const { canEnter } = await load();
  assert.equal(canEnter("dashboard", ["admin"]), false);
  assert.equal(canEnter("dashboard", ["admin", "student"]), true);
  assert.equal(canEnter("dashboard", ["admin", "advisor"]), true);
});

test("a student or advisor never opens the admin or review pages; a lecturer never opens admin", async () => {
  const { canEnter } = await load();
  for (const roles of [["student"], ["advisor"], ["student", "advisor"]]) {
    assert.equal(canEnter("admin", roles), false);
    assert.equal(canEnter("review-queue", roles), false);
  }
  assert.equal(canEnter("admin", ["lecturer"]), false);
  assert.equal(canEnter("admin", ["lecturer", "student"]), false);
});

test("several roles add up: student+lecturer sees both pages, review first (home order)", async () => {
  const { pagesFor, homePage } = await load();
  assert.deepEqual(keys(pagesFor(["student", "lecturer"])), ["review-queue", "dashboard"]);
  assert.equal(homePage(["student", "lecturer"]).key, "review-queue");
  assert.equal(homePage(["admin", "lecturer", "student"]).key, "admin");
  assert.equal(homePage(["advisor"]).key, "dashboard");
});

test("no role, unknown roles and bad input open nothing (no redirect target)", async () => {
  const { pagesFor, homePage, canEnter } = await load();
  for (const roles of [[], ["guest"], undefined, null, "admin", {}]) {
    assert.deepEqual(pagesFor(roles), []);
    assert.equal(homePage(roles), null);
    assert.equal(canEnter("admin", roles), false);
  }
});

test("page links are siblings of the page folders and every page is listed once", async () => {
  const { PAGES } = await load();
  assert.deepEqual(keys(PAGES), ["admin", "review-queue", "dashboard"]);
  for (const p of PAGES) assert.match(p.href, /^\.\.\/[a-z-]+\/$/);
});
