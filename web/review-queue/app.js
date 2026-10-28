// Review queue (prototype): reviewers sign in, lock a pending message, decide
// (approve / reject with reason) or release the lock. All reads and writes go
// through the Backend callables (functions/lib/chat.js); the page never touches
// Firestore. Message text is user-written, so it is only ever set with textContent.
//
// Modes:
//   default          real project (needs deployed functions and firebase-config.js)
//   #emulator        local Auth + Functions emulators, no firebase-config.js needed
//                    (open http://localhost:3000/#emulator; ?emulator=1 also works when not redirected)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import { goToLogin } from "../shared/nav.js";

const messageEl = document.getElementById("message");
const listEl = document.getElementById("list");
const whoEl = document.getElementById("who");

// `npx serve` redirects "/?emulator=1" to "/" and drops the query, so the hash form
// (#emulator) is the one that survives; both are accepted.
const useEmulator =
  new URLSearchParams(location.search).get("emulator") === "1" || location.hash === "#emulator";

// Lock tokens live only in this page's memory (never stored), keyed by message id.
const locks = new Map();
const call = {};

function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = kind;
  messageEl.hidden = false;
}

function formatTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label, onClick, className) {
  const b = el("button", className, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function errorText(err) {
  // Callable errors carry the Backend's Thai message; fall back to the code.
  return (err && err.message) || String(err);
}

// Input mistakes found in the page itself: shown in place, nothing is re-rendered
// so what the reviewer already typed or picked is kept.
class InputError extends Error {}

async function run(action, errorBox) {
  errorBox.textContent = "";
  try {
    await action();
  } catch (err) {
    if (err instanceof InputError) {
      errorBox.textContent = err.message;
      return;
    }
    console.error(err);
    // The queue may have changed under us (expired lock, taken by someone else).
    // Refresh first, then show the error in the freshly rendered card.
    const id = errorBox.dataset.id;
    const text = errorText(err);
    try {
      await refresh({ keepMessage: true });
    } catch (refreshErr) {
      console.error(refreshErr);
    }
    const fresh = listEl.querySelector(`[data-error-for="${CSS.escape(id)}"]`);
    if (fresh) fresh.textContent = text;
    else showMessage(text, "error");
  }
}

function decisionForm(item, lock, errorBox) {
  const form = el("div", "panel");
  form.appendChild(el("p", "muted", `ล็อกถึง ${formatTime(lock.expiresAt)} — ตัดสินก่อนหมดเวลา`));

  const group = el("fieldset", "negative");
  group.appendChild(el("legend", "", "ผลการวิเคราะห์ (ผู้ตรวจยืนยันเอง ไม่ปฏิเสธอัตโนมัติ)"));
  const radios = {};
  for (const [value, label] of [["false", "ไม่เชิงลบ"], ["true", "เชิงลบ"]]) {
    const wrap = el("label", "radio");
    const r = document.createElement("input");
    r.type = "radio";
    r.name = `neg-${item.id}`;
    r.value = value;
    radios[value] = r;
    wrap.append(r, document.createTextNode(" " + label));
    group.appendChild(wrap);
  }
  form.appendChild(group);

  const reasonLabel = el("label", "field", "เหตุผล (จำเป็นเมื่อปฏิเสธ)");
  const reason = document.createElement("textarea");
  reason.rows = 2;
  reasonLabel.appendChild(reason);
  form.appendChild(reasonLabel);

  const decide = (outcome) => () =>
    run(async () => {
      const chosen = radios.true.checked ? true : radios.false.checked ? false : null;
      if (chosen === null) throw new InputError("เลือกเชิงลบหรือไม่เชิงลบก่อน");
      if (outcome === "reject" && !reason.value.trim()) throw new InputError("การปฏิเสธต้องระบุเหตุผล");
      await call.decideMessage({
        messageId: item.id,
        token: lock.token,
        outcome,
        negative: chosen,
        reason: reason.value.trim(),
      });
      locks.delete(item.id);
      await refresh();
    }, errorBox);

  const actions = el("div", "actions");
  actions.append(
    button("✔ อนุมัติ", decide("approve"), "ok"),
    button("✖ ปฏิเสธ", decide("reject"), "danger"),
    button(
      "ปลดล็อก",
      () =>
        run(async () => {
          await call.releaseLock({ messageId: item.id });
          locks.delete(item.id);
          await refresh();
        }, errorBox),
      "secondary"
    )
  );
  form.appendChild(actions);
  return form;
}

function render(items) {
  listEl.replaceChildren();
  for (const item of items) {
    const card = el("article", "item");

    const head = el("div", "head");
    head.append(el("strong", "", item.senderName ?? "-"), el("span", "muted", formatTime(item.sentAt)));
    if (item.resubmitOfId) head.appendChild(el("span", "badge pending", `↻ ส่งใหม่จาก ${item.resubmitOfId}`));
    card.appendChild(head);

    card.appendChild(el("p", "content", item.content ?? ""));
    card.appendChild(el("div", "id", item.id));

    const errorBox = el("div", "inline-error");
    errorBox.setAttribute("role", "alert");
    errorBox.dataset.id = item.id;
    errorBox.dataset.errorFor = item.id;

    const lock = locks.get(item.id);
    if (item.ownMessage) {
      // the caller sent this message: it is listed but cannot be locked or decided
      const own = button("ล็อกเพื่อตรวจ", () => {}, "primary");
      own.disabled = true;
      card.append(own, el("p", "muted", "ข้อความของคุณเอง ตรวจไม่ได้"));
    } else if (lock && item.lockedByMe) {
      card.appendChild(decisionForm(item, lock, errorBox));
    } else {
      if (item.lockedByMe) {
        card.appendChild(
          el(
            "p",
            "muted",
            `คุณล็อกข้อความนี้ไว้ (ถึง ${formatTime(item.lockExpiresAt)}) แต่หน้านี้ไม่มี token แล้ว ล็อกใหม่เพื่อตรวจต่อ`
          )
        );
      }
      card.appendChild(
        button(
          item.lockedByMe ? "ล็อกใหม่เพื่อตรวจต่อ" : "ล็อกเพื่อตรวจ",
          () =>
            run(async () => {
              const res = await call.lockMessage({ messageId: item.id });
              locks.set(item.id, { token: res.data.token, expiresAt: res.data.expiresAt });
              await refresh();
            }, errorBox),
          "primary"
        )
      );
    }
    card.appendChild(errorBox);
    listEl.appendChild(card);
  }
}

async function refresh({ keepMessage = false } = {}) {
  const res = await call.listReviewQueue({});
  const items = res.data;
  // Drop tokens for messages that are no longer ours (expired or decided elsewhere).
  const mine = new Set(items.filter((i) => i.lockedByMe).map((i) => i.id));
  for (const id of [...locks.keys()]) if (!mine.has(id)) locks.delete(id);

  if (items.length === 0) {
    listEl.replaceChildren();
    showMessage("ไม่มีข้อความรออนุมัติ", "info");
    return;
  }
  render(items);
  if (!keepMessage) messageEl.hidden = true;
}

async function loadQueue() {
  showMessage("กำลังโหลด…", "info");
  try {
    await refresh();
  } catch (err) {
    listEl.replaceChildren();
    const denied = err && err.code === "functions/permission-denied";
    showMessage(
      denied
        ? "ไม่มีสิทธิ์ตรวจข้อความ — บัญชีนี้ต้องมีเอกสาร users/{uid} ที่ status เป็น active และมีบทบาท lecturer หรือ admin"
        : `โหลดข้อมูลไม่สำเร็จ: ${errorText(err)}`,
      "error"
    );
    console.error(err);
  }
}

async function main() {
  let config;
  if (useEmulator) {
    // Demo project id: nothing here can reach the real project.
    config = { apiKey: "demo-key", projectId: "demo-grade-runway", appId: "demo" };
  } else {
    try {
      ({ firebaseConfig: config } = await import("./firebase-config.js"));
    } catch {
      showMessage(
        "ไม่พบ firebase-config.js — คัดลอก firebase-config.example.js เป็น firebase-config.js แล้ววางค่า firebaseConfig ของเว็บแอป (หรือเปิดด้วย #emulator เพื่อใช้ emulator)",
        "error"
      );
      return;
    }
  }

  const app = initializeApp(config);
  const auth = getAuth(app);
  const functions = getFunctions(app);
  if (useEmulator) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    document.getElementById("mode").hidden = false;
  }
  for (const name of ["listReviewQueue", "lockMessage", "decideMessage", "releaseLock"]) {
    call[name] = httpsCallable(functions, name);
  }

  document.getElementById("logout").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    locks.clear();
    listEl.replaceChildren();
    if (!user) {
      goToLogin();
      return;
    }
    whoEl.hidden = false;
    document.getElementById("whoText").textContent = user.email ?? user.uid;
    loadQueue();
  });
}

main();
