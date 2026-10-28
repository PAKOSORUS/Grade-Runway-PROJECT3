// Learner dashboard / advisor view (prototype): shows the learner's study
// situation (four variables), why they are flagged, advice, and alert history.
// Goes through the Backend callables getLearnerSituation and listMyLearners
// (functions/lib/situation.js, learners.js); the page never touches Firestore.
// A learner sees only themself, an advisor only learners assigned to them, and
// the view is read only. Values from the Backend are only set with textContent.
//
// Modes (same as the Admin page):
//   default    real project: needs deployed functions and ../review-queue/firebase-config.js
//   #emulator  local Auth + Functions emulators (http://localhost:3000/dashboard/#emulator)

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

const $ = (id) => document.getElementById(id);
const useEmulator =
  new URLSearchParams(location.search).get("emulator") === "1" || location.hash === "#emulator";
const call = {};

const TREND = { improving: "ดีขึ้น", steady: "ทรงตัว", declining: "ลดลง" };

function showMessage(text, kind) {
  $("message").textContent = text;
  $("message").className = kind;
  $("message").hidden = !text;
}

const errorText = (err) => (err && err.message) || String(err);

function formatTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" });
}

function el(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function tile(label, value, sub, flagged) {
  const t = el("div", undefined, flagged ? "tile flag" : "tile");
  t.append(el("div", label, "label"), el("div", value, "value"), el("div", sub, "sub"));
  return t;
}

function setBanner(text, kind) {
  $("banner").textContent = text;
  $("banner").className = `banner ${kind}`;
  $("banner").hidden = !text;
}

function render(s) {
  $("view").hidden = true;
  setBanner("", "ok");

  if (s.dataStatus === "waiting") {
    // FR-23: no result of any kind until the first successful sync
    setBanner("รอข้อมูลจากระบบเดิม ยังไม่มีผลประเมินความเสี่ยง จะแสดงเมื่อซิงก์ข้อมูลสำเร็จครั้งแรก", "warn");
    return;
  }
  if (s.dataStatus === "stale") {
    setBanner(`ข้อมูลไม่ทันสมัย: ซิงก์ล่าสุดล้มเหลว ระบบใช้ข้อมูลที่ซิงก์สำเร็จเมื่อ ${formatTime(s.lastSyncAt)}`, "warn");
  }
  $("view").hidden = false;

  const a = s.assessment;
  const tiles = $("tiles");
  tiles.replaceChildren();
  if (!a) {
    $("overall").textContent = "ยังไม่มีผลประเมิน (รอการประเมินรอบแรกหลังซิงก์)";
    $("asOf").textContent = "";
    $("whyCard").hidden = true;
  } else {
    const flagged = new Set(a.findings.map((f) => f.variable));
    const m = a.metrics;
    $("overall").textContent = a.atRisk ? "เข้าเงื่อนไขเสี่ยง" : "ยังไม่พบความเสี่ยง";
    $("overall").style.color = a.atRisk ? "var(--status-danger-text)" : "var(--status-ok-text)";
    tiles.append(
      tile("ผลการเรียนเฉลี่ย", m.grade ? String(m.grade.value) : "-", m.grade ? `ช่วง ${m.grade.period}` : "ไม่มีข้อมูล", flagged.has("grade")),
      tile("การเข้าเรียน", m.attendance ? `${m.attendance.value}%` : "-", m.attendance ? `ช่วง ${m.attendance.period}` : "ไม่มีข้อมูล", flagged.has("attendance")),
      tile("การส่งงาน", m.assignment ? `${m.assignment.value}%` : "-", m.assignment ? `ช่วง ${m.assignment.period}` : "ไม่มีข้อมูล", flagged.has("assignment")),
      tile(
        "แนวโน้มผลการเรียน",
        m.trend ? TREND[m.trend.label] : "ข้อมูลไม่พอ",
        m.trend ? `ลดลงต่อเนื่อง ${m.trend.consecutiveDeclines} ช่วง` : "ใช้กฎพื้นฐานเท่านั้น",
        flagged.has("trend")
      )
    );
    $("asOf").textContent = `ประเมินเมื่อ ${formatTime(a.assessedAt)} · ใช้ข้อมูลซิงก์ ณ ${formatTime(a.dataAsOf)}`;

    const list = $("findings");
    list.replaceChildren();
    for (const f of a.findings) list.append(el("li", f.explanation));
    $("whyCard").hidden = a.findings.length === 0;
  }

  const r = s.recommendation;
  $("advice").textContent = r ? r.text : "ยังไม่มีคำแนะนำ";
  $("adviceNote").textContent = r && r.basic ? "คำแนะนำจากกฎพื้นฐาน (ข้อมูลย้อนหลังยังไม่พอ)" : "";

  const alerts = $("alerts");
  alerts.replaceChildren();
  for (const n of s.alerts) {
    const row = el("div", undefined, "alert");
    row.append(el("time", formatTime(n.at)), document.createTextNode(n.reason));
    alerts.append(row);
  }
  if (s.alerts.length === 0) alerts.append(el("p", "ยังไม่มีการแจ้งเตือน", "muted"));
}

function renderHistory(rounds) {
  const box = $("history");
  box.replaceChildren();
  if (rounds.length === 0) {
    box.append(el("p", "ยังไม่มีประวัติการประเมิน", "muted"));
    return;
  }
  for (const r of rounds) {
    const d = el("details", undefined, "round");
    const s = el("summary");
    s.append(
      document.createTextNode(`${formatTime(r.assessedAt)} · `),
      el("span", r.atRisk ? "เข้าเงื่อนไขเสี่ยง" : "ไม่พบความเสี่ยง", r.atRisk ? "risk" : "ok"),
      document.createTextNode(r.alert ? " · แจ้งเตือนแล้ว" : "")
    );
    d.append(s);
    const body = el("div", undefined, "body");
    const m = r.metrics;
    body.append(
      el(
        "p",
        `เกรด ${m.grade ? m.grade.value : "-"} · เข้าเรียน ${m.attendance ? m.attendance.value + "%" : "-"} · ส่งงาน ${m.assignment ? m.assignment.value + "%" : "-"} · แนวโน้ม ${m.trend ? TREND[m.trend.label] : "ข้อมูลไม่พอ"}`
      ),
      el("p", `ใช้ข้อมูลซิงก์ ณ ${formatTime(r.dataAsOf)}`, "note")
    );
    if (r.findings.length) {
      const ul = el("ul");
      for (const f of r.findings) ul.append(el("li", f.explanation));
      body.append(ul);
    }
    if (r.recommendation) body.append(el("p", r.recommendation.text, "advice"));
    d.append(body);
    box.append(d);
  }
}

async function loadLearner(learnerId) {
  showMessage("กำลังโหลด…", "info");
  try {
    const arg = learnerId ? { learnerId } : {};
    const [situation, history] = await Promise.all([call.getLearnerSituation(arg), call.getLearnerHistory(arg)]);
    render(situation.data);
    renderHistory(history.data);
    showMessage("", "info");
  } catch (err) {
    console.error(err);
    $("view").hidden = true;
    setBanner("", "ok");
    showMessage(
      err && err.code === "functions/permission-denied" ? "ไม่มีสิทธิ์ดูข้อมูลของผู้เรียนคนนี้" : `โหลดข้อมูลไม่สำเร็จ: ${errorText(err)}`,
      "error"
    );
  }
}

// A user can be a learner, an advisor, or both: offer every learner they may see,
// decided by the roles read from the Backend on this load (ACL.md).
async function loadAll(roles) {
  showMessage("กำลังโหลด…", "info");
  const options = [];
  if (roles.includes("student")) options.push({ value: "", label: "ตัวฉันเอง" });
  if (roles.includes("advisor")) {
    try {
      for (const l of (await call.listMyLearners({})).data) options.push({ value: l.learnerId, label: l.name });
    } catch (err) {
      console.error(err);
      showMessage(`โหลดรายชื่อผู้เรียนที่ดูแลไม่สำเร็จ: ${errorText(err)}`, "error");
    }
  }
  if (options.length === 0) {
    $("app").hidden = true;
    showMessage("บัญชีนี้ไม่มีสิทธิ์ดูสถานการณ์การเรียน (ต้องเป็นผู้เรียน หรือครูที่ปรึกษาที่มีผู้เรียนในความดูแล)", "error");
    return;
  }
  const pick = $("pick");
  pick.replaceChildren();
  for (const o of options) {
    const opt = el("option", o.label);
    opt.value = o.value;
    pick.append(opt);
  }
  $("pickCard").hidden = options.length === 1;
  $("app").hidden = false;
  await loadLearner(options[0].value);
}

// ---- advice messages (students only; FR-10, FR-11, FR-15) ----
const STATUS_TEXT = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ถูกปฏิเสธ" };
const NOT_ELIGIBLE = "ไม่ผ่านเกณฑ์ผู้ส่งข้อความ";

function setSendStatus(text, kind) {
  $("sendStatus").textContent = text;
  $("sendStatus").className = `status ${kind ?? ""}`;
}

function renderMyMessages(list) {
  const box = $("myMessages");
  box.replaceChildren();
  if (list.length === 0) {
    box.append(el("p", "ยังไม่มีข้อความที่ส่ง", "muted"));
    return;
  }
  for (const m of list) {
    const item = el("div", "", "msg");
    const head = el("div");
    head.append(el("span", STATUS_TEXT[m.status] ?? m.status, `badge ${m.status}`), el("time", formatTime(m.sentAt)));
    item.append(head, el("div", m.content, "content"));
    if (m.status === "rejected") item.append(el("div", `เหตุผลที่ปฏิเสธ: ${m.reason ?? "-"}`, "muted"));
    if (m.resubmitOfId) item.append(el("div", "ส่งใหม่จากข้อความที่ถูกปฏิเสธ", "muted"));
    box.append(item);
  }
}

async function loadMyMessages() {
  try {
    renderMyMessages((await call.listMyMessages({})).data);
  } catch (err) {
    console.error(err);
    $("myMessages").replaceChildren(el("p", `โหลดข้อความไม่สำเร็จ: ${errorText(err)}`, "status error"));
  }
}

// The form is shown to student accounts only (the Backend refuses everyone else too).
async function loadChat(roles) {
  $("chatApp").hidden = true;
  if (!roles.includes("student")) return;
  $("chatApp").hidden = false;
  setSendStatus("", "");
  await loadMyMessages();
}

async function sendAdvice(e) {
  e.preventDefault();
  const content = $("msgText").value.trim();
  if (!content) {
    setSendStatus("ต้องระบุข้อความ", "error");
    return;
  }
  setSendStatus("กำลังส่ง…", "");
  try {
    await call.sendMessage({ content });
    $("msgText").value = "";
    setSendStatus("ส่งแล้ว กำลังรอการอนุมัติ", "ok");
    await loadMyMessages();
  } catch (err) {
    console.error(err);
    setSendStatus(
      err && err.message === NOT_ELIGIBLE
        ? "ส่งไม่ได้: บัญชีนี้ยังไม่ผ่านเกณฑ์ผู้ส่งข้อความ (นักศึกษาที่เพิ่งสมัครต้องรอผลประเมินเกณฑ์ก่อน)"
        : errorText(err),
      "error"
    );
  }
}

async function main() {
  let config;
  if (useEmulator) {
    config = { apiKey: "demo-key", projectId: "demo-grade-runway", appId: "demo" };
  } else {
    try {
      ({ firebaseConfig: config } = await import("../review-queue/firebase-config.js"));
    } catch {
      showMessage(
        "ไม่พบ web/review-queue/firebase-config.js — ทำตาม README ของ review-queue (หรือเปิดด้วย #emulator เพื่อใช้ emulator)",
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
    $("mode").hidden = false;
  }
  for (const name of ["getLearnerSituation", "getLearnerHistory", "listMyLearners", "getMyProfile", "sendMessage", "listMyMessages"]) {
    call[name] = httpsCallable(functions, name);
  }
  $("sendForm").addEventListener("submit", sendAdvice);

  $("logout").addEventListener("click", () => signOut(auth));
  $("pick").addEventListener("change", () => loadLearner($("pick").value));

  onAuthStateChanged(auth, async (user) => {
    $("app").hidden = true;
    $("chatApp").hidden = true;
    if (!user) {
      goToLogin();
      return;
    }
    $("who").hidden = false;
    $("whoText").textContent = user.email ?? user.uid;
    // roles are read from the Backend on every load (never cached): student or advisor
    const roles = await enterPage({ page: "dashboard", getProfile: async () => (await call.getMyProfile({})).data, showMessage });
    if (!roles) return;
    loadAll(roles);
    loadChat(roles);
  });
}

main();
