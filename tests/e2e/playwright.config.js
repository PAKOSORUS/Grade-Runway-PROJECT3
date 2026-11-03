// @ts-check
const { defineConfig } = require("@playwright/test");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL);

// Live site (BASE_URL not localhost): only the two allowed checks run
// (4-live-login, 5b-cross-student-live). Everything else needs the emulator.
// Locally (emulator): the two live-only files are not run.
const LIVE_ONLY = ["**/4-live-login.spec.js", "**/5b-cross-student-live.spec.js"];

module.exports = defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.js",
  testIgnore: isLocal ? LIVE_ONLY : ["**/[1235]-*.spec.js"],
  outputDir: "./.pw-output",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
  },
});
