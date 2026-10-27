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
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

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

async function loadLearner(learnerId) {
  showMessage("กำลังโหลด…", "info");
  try {
    render((await call.getLearnerSituation(learnerId ? { learnerId } : {})).data);
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

// A user can be a learner, an advisor, or both: offer every learner they may see.
async function loadAll(user) {
  showMessage("กำลังโหลด…", "info");
  const options = [];
  try {
    await call.getLearnerSituation({});
    options.push({ value: "", label: "ตัวฉันเอง" });
  } catch {
    // not a learner: fine
  }
  try {
    for (const l of (await call.listMyLearners({})).data) options.push({ value: l.learnerId, label: l.name });
  } catch {
    // not an advisor: fine
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
  for (const name of ["getLearnerSituation", "listMyLearners"]) call[name] = httpsCallable(functions, name);

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, $("email").value, $("password").value);
    } catch (err) {
      showMessage("เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน", "error");
      console.error(err && err.code);
    }
  });
  $("logout").addEventListener("click", () => signOut(auth));
  $("pick").addEventListener("change", () => loadLearner($("pick").value));

  onAuthStateChanged(auth, (user) => {
    $("password").value = "";
    $("app").hidden = true;
    if (!user) {
      $("loginCard").hidden = false;
      $("who").hidden = true;
      showMessage("กรุณาเข้าสู่ระบบ", "info");
      return;
    }
    $("loginCard").hidden = true;
    $("who").hidden = false;
    $("whoText").textContent = user.email ?? user.uid;
    loadAll(user);
  });
}

main();
