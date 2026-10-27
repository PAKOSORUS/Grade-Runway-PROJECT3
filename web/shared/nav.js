// Navigation shared by every page under web/ (served as sibling folders:
// /login/, /admin/, /review-queue/, /dashboard/, /shared/). Keeps the #emulator
// hash across redirects so the emulator mode survives login/logout.

const emulatorHash = () =>
  location.hash === "#emulator" || new URLSearchParams(location.search).get("emulator") === "1"
    ? "#emulator"
    : "";

// FR-29 order: admin, then lecturer, everything else (student, advisor) goes to the dashboard.
export function homeFor(roles) {
  const list = Array.isArray(roles) ? roles : [];
  if (list.includes("admin")) return "../admin/";
  if (list.includes("lecturer")) return "../review-queue/";
  return "../dashboard/";
}

export const goHome = (roles) => location.replace(homeFor(roles) + emulatorHash());

// FR-30: a page that needs a signed-in user sends everyone else to the login page.
export const goToLogin = () => location.replace("../login/" + emulatorHash());
