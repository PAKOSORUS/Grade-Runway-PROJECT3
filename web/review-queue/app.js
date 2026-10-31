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
import { enterPage } from "../shared/guard.js";
import { analyzeNegative, summarizeMessage, AiError } from "../shared/ai.js";

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

  // AI suggestion: only ticks a radio. It never approves/rejects, and its errors stay
  // in this box (not run()), so no refresh happens and the reviewer's radio/reason survive.
  const aiBox = el("div", "ai-box");
  const aiNote = el("p", "ai-note");
  aiNote.setAttribute("role", "status");
  const aiButton = el("button", "secondary", "ให้ AI ช่วยวิเคราะห์");
  aiButton.type = "button";
  aiButton.addEventListener("click", async () => {
    if (aiButton.disabled) return;
    aiButton.disabled = true;
    aiButton.textContent = "กำลังวิเคราะห์…";
    aiNote.className = "ai-note";
    aiNote.replaceChildren();
    try {
      // item.content only — never the sender name.
      const result = await analyzeNegative(item.content ?? "");
      if (result === null) {
        aiNote.className = "ai-note ai-error";
        aiNote.textContent = "AI จัดให้ไม่ได้ — โปรดเลือกเอง";
      } else {
        radios[String(result)].checked = true;
        const answer = el("strong", "", result ? "เชิงลบ" : "ไม่เชิงลบ");
        aiNote.append(document.createTextNode("ข้อเสนอจาก AI — โปรดตรวจสอบก่อนยืนยัน "), answer);
      }
    } catch (err) {
      aiNote.className = "ai-note ai-error";
      aiNote.textContent = err instanceof AiError ? err.message : "เรียก AI ไม่สำเร็จ — โปรดเลือกเอง";
      if (!(err instanceof AiError)) console.error(err);
    } finally {
      aiButton.disabled = false;
      aiButton.textContent = "ให้ AI ช่วยวิเคราะห์";
    }
  });
  aiBox.append(aiButton, aiNote);
  form.appendChild(aiBox);

  // AI summary for the reviewer to read before deciding. It never touches the radios or
  // the decision buttons, and errors stay in its own box (not run()), so nothing is
  // refreshed and what the reviewer typed or picked is kept. After a successful call the
  // summary and exactly what was sent are saved through saveAiSummary (needs this lock).
  const sumBox = el("div", "ai-box");
  const sumOut = el("div", "ai-summary");
  sumOut.setAttribute("role", "status");
  const sumButton = el("button", "secondary", "ให้ AI ช่วยสรุป");
  sumButton.type = "button";

  const showSummary = (s, heading) => {
    sumOut.className = "ai-summary";
    sumOut.replaceChildren(el("p", "ai-note", heading), el("p", "ai-note", `เกี่ยวกับ: ${s.topic}`));
    if (s.cautions.length > 0) {
      const ul = el("ul", "ai-cautions");
      for (const c of s.cautions) ul.appendChild(el("li", "", c));
      sumOut.append(el("p", "ai-note", "ควรระวังก่อนเผยแพร่:"), ul);
    } else {
      sumOut.appendChild(el("p", "ai-note", "ควรระวังก่อนเผยแพร่: ไม่พบ"));
    }
    if (item.previous) {
      const a = s.addressedPreviousReason;
      const text = a === true ? "แก้ตามเหตุผลเดิมแล้ว" : a === false ? "ยังไม่ได้แก้ตามเหตุผลเดิม" : "AI ตัดสินไม่ได้ว่าแก้ตามเหตุผลเดิมแล้วหรือยัง";
      sumOut.appendChild(el("p", "ai-note", `ข้อความส่งใหม่: ${text}`));
    }
  };
  // a summary saved earlier (e.g. before a reload) is shown again
  if (item.aiSuggestion) showSummary(item.aiSuggestion, `สรุปจาก AI ที่บันทึกไว้ (${formatTime(item.aiSuggestionAt)}) — โปรดตรวจสอบก่อนยืนยัน`);

  sumButton.addEventListener("click", async () => {
    if (sumButton.disabled) return;
    sumButton.disabled = true;
    sumButton.textContent = "กำลังวิเคราะห์…";
    sumOut.className = "ai-summary";
    sumOut.replaceChildren();
    try {
      // item.content and item.previous (content + reason) only — never the sender name.
      const result = await summarizeMessage(item.content ?? "", item.previous);
      if (result.summary) showSummary(result.summary, "สรุปจาก AI — โปรดตรวจสอบก่อนยืนยัน");
      else {
        sumOut.className = "ai-summary ai-error";
        sumOut.textContent = "AI สรุปให้ไม่ได้ — โปรดอ่านข้อความเอง";
      }
      let saveError = null;
      try {
        await call.saveAiSummary({
          messageId: item.id,
          token: lock.token,
          summary: result.summary,
          input: result.input,
          output: result.output,
          model: result.model,
        });
      } catch (err) {
        console.error(err);
        saveError = errorText(err);
      }
      sumOut.appendChild(
        saveError
          ? el("p", "ai-note ai-error", `บันทึกสรุปไม่สำเร็จ: ${saveError}`)
          : el("p", "ai-note muted", "บันทึกสรุปแล้ว")
      );
    } catch (err) {
      sumOut.className = "ai-summary ai-error";
      sumOut.textContent = err instanceof AiError ? err.message : "เรียก AI ไม่สำเร็จ — โปรดอ่านข้อความเอง";
      if (!(err instanceof AiError)) console.error(err);
    } finally {
      sumButton.disabled = false;
      sumButton.textContent = "ให้ AI ช่วยสรุป";
    }
  });
  sumBox.append(sumButton, sumOut);
  form.appendChild(sumBox);

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
  for (const name of ["listReviewQueue", "lockMessage", "decideMessage", "releaseLock", "saveAiSummary", "getMyProfile"]) {
    call[name] = httpsCallable(functions, name);
  }

  document.getElementById("logout").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    locks.clear();
    listEl.replaceChildren();
    if (!user) {
      goToLogin();
      return;
    }
    whoEl.hidden = false;
    document.getElementById("whoText").textContent = user.email ?? user.uid;
    // roles are read from the Backend on every load (never cached): lecturer or admin
    const roles = await enterPage({ page: "review-queue", getProfile: async () => (await call.getMyProfile({})).data, showMessage });
    if (roles) loadQueue();
  });
}

main();
