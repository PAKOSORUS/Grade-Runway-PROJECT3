// Page guard and menu (ACL.md). Every page calls enterPage() once the user is
// signed in. It asks the Backend for the caller's roles (getMyProfile) on EVERY
// load, never from localStorage/sessionStorage, so a role changed in the
// database shows up after a refresh. A page the roles do not open shows a
// message and sends the user to their own page. Hiding things here is only a
// convenience: the Backend still decides every permission.
import { PAGES, canEnter, homePage, pagesFor } from "./roles.js";
import { goToLogin, emulatorHash } from "./nav.js";

const REDIRECT_DELAY_MS = 1500;

const STYLE = `
  #nav { display: flex; flex-wrap: wrap; gap: 4px 16px; padding: 8px 16px; background: var(--color-bg-surface, #fff); border-bottom: 1px solid var(--color-border, #E3E3E8); font-size: 0.875rem; }
  #nav a { color: var(--color-brand, #9B4033); text-decoration: none; font-weight: 600; padding: 2px 0; }
  #nav a:hover { text-decoration: underline; }
  #nav a:focus-visible { outline: 3px solid var(--status-info, #1F5FA8); outline-offset: 2px; }
  #nav span[aria-current] { font-weight: 600; border-bottom: 2px solid var(--color-brand, #9B4033); padding: 2px 0; }
`;

// Menu with one link per page the roles may open; the current page is not a link.
export function renderNav(roles, currentKey) {
  const nav = document.getElementById("nav");
  if (!nav) return;
  if (!document.getElementById("navStyle")) {
    const style = document.createElement("style");
    style.id = "navStyle";
    style.textContent = STYLE;
    document.head.appendChild(style);
  }
  nav.replaceChildren();
  nav.setAttribute("aria-label", "เมนูหลัก");
  for (const p of pagesFor(roles)) {
    if (p.key === currentKey) {
      const here = document.createElement("span");
      here.setAttribute("aria-current", "page");
      here.textContent = p.label;
      nav.appendChild(here);
    } else {
      const a = document.createElement("a");
      a.href = p.href + emulatorHash();
      a.textContent = p.label;
      nav.appendChild(a);
    }
  }
  nav.hidden = nav.children.length === 0;
}

function hideNav() {
  const nav = document.getElementById("nav");
  if (nav) nav.hidden = true;
}

// Returns the caller's roles when this page is open to them, otherwise null
// (and the page must not load any data). `showMessage(text, kind)` is the
// page's own status line.
export async function enterPage({ page, getProfile, showMessage }) {
  hideNav();
  let roles;
  try {
    roles = (await getProfile()).roles;
  } catch (err) {
    const code = err && err.code;
    // no account yet, or a disabled one: the login page explains and offers the next step
    if (code === "functions/not-found" || code === "functions/permission-denied") {
      goToLogin();
      return null;
    }
    console.error(err);
    showMessage(`ตรวจสิทธิ์ไม่สำเร็จ: ${(err && err.message) || err}`, "error");
    return null;
  }

  if (canEnter(page, roles)) {
    renderNav(roles, page);
    return roles;
  }

  const home = homePage(roles);
  if (!home) {
    showMessage("บัญชีนี้ยังไม่มีบทบาทที่เข้าหน้าใดได้ กรุณาติดต่อผู้ดูแลระบบ", "error");
    return null;
  }
  showMessage(`ไม่มีสิทธิ์เข้าหน้านี้ กำลังพาไปหน้า${home.label}ของคุณ…`, "error");
  setTimeout(() => location.replace(home.href + emulatorHash()), REDIRECT_DELAY_MS);
  return null;
}

export { PAGES };
