// Which pages each role may open (ACL.md). Pure data and functions with no DOM
// and no imports, so functions/test/roles.test.js can check the table in Node.
//
// This is a convenience for the UI only: the Backend decides every real
// permission. Roles are never cached: every page asks getMyProfile when it loads.
//
// Order matters: it is the FR-29 home-page order (admin, then lecturer, then
// everyone else), and the order of the menu links.
export const PAGES = [
  { key: "admin", href: "../admin/", label: "ผู้ดูแลระบบ", roles: ["admin"] },
  { key: "review-queue", href: "../review-queue/", label: "ตรวจข้อความ", roles: ["lecturer", "admin"] },
  { key: "dashboard", href: "../dashboard/", label: "แดชบอร์ด", roles: ["student", "advisor"] },
];

const list = (roles) => (Array.isArray(roles) ? roles : []);

export const pagesFor = (roles) => PAGES.filter((p) => p.roles.some((r) => list(roles).includes(r)));

export const canEnter = (key, roles) => pagesFor(roles).some((p) => p.key === key);

// null when the account holds no role that opens any page.
export const homePage = (roles) => pagesFor(roles)[0] ?? null;
