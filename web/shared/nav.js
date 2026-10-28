// Navigation shared by every page under web/ (served as sibling folders:
// /login/, /admin/, /review-queue/, /dashboard/, /shared/). Keeps the #emulator
// hash across redirects so the emulator mode survives login/logout.
import { homePage } from "./roles.js";

export const emulatorHash = () =>
  location.hash === "#emulator" || new URLSearchParams(location.search).get("emulator") === "1"
    ? "#emulator"
    : "";

// FR-29 order: admin, then lecturer, everything else (student, advisor) goes to the
// dashboard. Returns null when the roles open no page at all.
export function homeFor(roles) {
  const page = homePage(roles);
  return page ? page.href : null;
}

// Returns false (and does not navigate) when the account has no page to go to.
export function goHome(roles) {
  const href = homeFor(roles);
  if (!href) return false;
  location.replace(href + emulatorHash());
  return true;
}

// FR-30: a page that needs a signed-in user sends everyone else to the login page.
export const goToLogin = () => location.replace("../login/" + emulatorHash());
