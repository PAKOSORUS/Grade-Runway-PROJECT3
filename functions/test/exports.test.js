// Guards against a handler being written and tested but never exported as a
// callable (this happened once: the chat handlers were missing from index.js and
// handler-level tests could not notice). Static check, needs no emulator.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const index = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");

// Exported from lib/ on purpose but not callable by clients.
const INTERNAL = new Set(["requireLearnerAccess", "releaseExpiredLocks"]);

for (const mod of ["accounts", "learners", "history", "chat"]) {
  test(`index.js exports every client-facing handler of lib/${mod}.js`, () => {
    const handlers = Object.entries(require(`../lib/${mod}`))
      .filter(([, v]) => typeof v === "function")
      .map(([name]) => name)
      .filter((name) => !INTERNAL.has(name));
    assert.ok(handlers.length > 0);
    for (const name of handlers) {
      const wired = new RegExp(`exports\\.${name}\\s*=\\s*wrap\\(\\s*\\w+\\.${name}\\s*\\)`);
      assert.match(index, wired, `${name} from lib/${mod}.js is not exported in index.js`);
    }
  });
}

test("internal handlers are not exported as callables", () => {
  for (const name of INTERNAL) assert.equal(index.includes(`exports.${name}`), false);
});
