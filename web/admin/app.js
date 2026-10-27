// Admin screen (prototype): system policy, accounts, advisor-learner links and
// the change history. Everything goes through the Backend callables
// (functions/lib/policy.js, accounts.js, history.js); the page never touches
// Firestore. Values from the Backend are only ever set with textContent.
//
// Modes:
//   default    real project: needs deployed functions and ../review-queue/firebase-config.js
//   #emulator  local Auth + Functions emulators (http://localhost:3000/admin/#emulator
//              when served with `npx serve web`)

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

const $ = (id) => document.getElementById(id);
const useEmulator =
  new URLSearchParams(location.search).get("emulator") === "1" || location.hash === "#emulator";
const call = {};

function showMessage(text, kind) {
  $("message").textContent = text;
  $("message").className = kind;
  $("message").hidden = !text;
}

function setStatus(id, text, kind) {
  const e = $(id);
  e.textContent = text;
  e.className = `status ${kind ?? ""}`;
}

const errorText = (err) => (err && err.message) || String(err);

function formatTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium" });
}

async function attempt(statusId, action, okText) {
  setStatus(statusId, "กำลังบันทึก…", "");
  try {
    await action();
    setStatus(statusId, okText, "ok");
    return true;
  } catch (err) {
    console.error(err);
    setStatus(statusId, errorText(err), "error");
    return false;
  }
}

// ---- policy ----
const numOrNull = (v) => (v.trim() === "" ? null : Number(v));

function fillPolicy(p) {
  $("showSenderName").value = String(p.showSenderName);
  $("lockDurationMinutes").value = p.lockDurationMinutes ?? "";
  $("syncIntervalMinutes").value = p.syncIntervalMinutes ?? "";
  $("maxMissingImportPercent").value = p.maxMissingImportPercent ?? "";
  $("policyMeta").textContent = p.updatedAt
    ? `แก้ไขล่าสุดโดย ${p.updatedBy} เมื่อ ${formatTime(p.updatedAt)}`
    : "ยังไม่เคยตั้งค่า (ซ่อนชื่อผู้ส่งเป็นค่าเริ่มต้นชั่วคราว)";
}

async function loadPolicy() {
  fillPolicy((await call.getSystemPolicy({})).data);
}

function policyPatch() {
  // Only values the Admin filled in are sent; an empty box means "leave as is".
  const patch = { showSenderName: $("showSenderName").value === "true" };
  for (const id of ["lockDurationMinutes", "syncIntervalMinutes", "maxMissingImportPercent"]) {
    const v = numOrNull($(id).value);
    if (v !== null) patch[id] = v;
  }
  return patch;
}

// ---- thresholds ----
async function loadThresholds() {
  const rules = (await call.listThresholds({})).data;
  const body = $("thresholdBody");
  body.replaceChildren();
  for (const r of rules) {
    const tr = document.createElement("tr");
    for (const [label, text] of [["ชื่อกฎ", r.name], ["ตัวแปร", r.variable]]) {
      const td = document.createElement("td");
      td.dataset.label = label;
      td.textContent = text;
      tr.appendChild(td);
    }
    const valueTd = document.createElement("td");
    valueTd.dataset.label = "ค่า threshold";
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = r.threshold;
    input.setAttribute("aria-label", `ค่า threshold ของ ${r.name}`);
    valueTd.appendChild(input);
    tr.appendChild(valueTd);
    const metaTd = document.createElement("td");
    metaTd.dataset.label = "แก้ล่าสุด";
    metaTd.textContent = r.updatedAt ? `${r.updatedBy} ${formatTime(r.updatedAt)}` : "-";
    tr.appendChild(metaTd);
    const actionTd = document.createElement("td");
    const save = document.createElement("button");
    save.type = "button";
    save.className = "secondary";
    save.textContent = "บันทึก";
    save.addEventListener("click", async () => {
      const ok = await attempt(
        "thresholdStatus",
        () => call.setThreshold({ ruleId: r.ruleId, threshold: input.value.trim() === "" ? undefined : Number(input.value) }),
        `บันทึกกฎ "${r.name}" แล้ว มีผลกับรอบประเมินถัดไป`
      );
      await loadThresholds();
      if (ok) await loadHistory();
    });
    actionTd.appendChild(save);
    tr.appendChild(actionTd);
    body.appendChild(tr);
  }
  if (rules.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "muted";
    td.textContent = "ยังไม่มีกฎ (ไม่มีกฎ = ไม่มีผู้เรียนถูกประเมินว่าเสี่ยง)";
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

// ---- learning data import ----
const OUTCOME = { success: "สำเร็จ", failedWithPrevious: "ล้มเหลว (ใช้ข้อมูลเดิม)", failedFirst: "ล้มเหลว (ครั้งแรก ยังไม่มีข้อมูล)" };

async function loadRuns() {
  const runs = (await call.listSyncRuns({ limit: 10 })).data;
  const body = $("runBody");
  body.replaceChildren();
  for (const r of runs) {
    const tr = document.createElement("tr");
    const detail =
      r.outcome === "success"
        ? `เกรด ${r.counts.grades} · เข้าเรียน ${r.counts.attendance} · ส่งงาน ${r.counts.assignments}` +
          (r.skippedLearnerCount ? ` · ข้ามผู้เรียนที่ไม่พบ ${r.skippedLearnerCount}` : "")
        : `${r.reason}: ${r.errors.join(" | ")}${r.errorCount > r.errors.length ? ` (รวม ${r.errorCount} รายการ)` : ""}`;
    for (const text of [formatTime(r.startedAt), OUTCOME[r.outcome] ?? r.outcome, detail]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  if (runs.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "muted";
    td.textContent = "ยังไม่เคยนำเข้าข้อมูล";
    tr.appendChild(td);
    body.appendChild(tr);
  }
}

async function runImport() {
  const text = $("importText").value.trim();
  if (!text) throw new Error("ต้องเลือกไฟล์หรือวาง JSON ก่อน");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("อ่าน JSON ไม่ได้ ตรวจรูปแบบอีกครั้ง");
  }
  const r = (await call.importLearningData(payload)).data;
  await loadRuns();
  if (!r.ok) {
    const more = r.errorCount > r.errors.length ? ` (รวม ${r.errorCount} รายการ)` : "";
    throw new Error(`ซิงก์ล้มเหลว (${r.reason}): ${r.errors.join(" | ")}${more} — ข้อมูลเดิมไม่ถูกแตะ`);
  }
  const a = r.assessment;
  return `นำเข้าแล้ว เกรด ${r.counts.grades} เข้าเรียน ${r.counts.attendance} ส่งงาน ${r.counts.assignments}` +
    (r.skippedLearnerCount ? ` ข้ามผู้เรียนที่ไม่พบ ${r.skippedLearnerCount}` : "") +
    (a ? ` · ประเมิน ${a.assessed} คน เสี่ยง ${a.atRisk} คน แจ้งเตือนใหม่ ${a.notified} คน` : "");
}

// ---- accounts ----
function userPatch() {
  const patch = { uid: $("uUid").value.trim() };
  if ($("uName").value.trim()) patch.name = $("uName").value.trim();
  if ($("uEmail").value.trim()) patch.email = $("uEmail").value.trim();
  if ($("uStatus").value) patch.status = $("uStatus").value;
  const roles = [...document.querySelectorAll('input[name="uRole"]:checked')].map((c) => c.value);
  if (roles.length) patch.roles = roles;
  return patch;
}

// ---- assignments ----
function assignAction(op) {
  const learnerId = $("aLearner").value.trim();
  const advisorId = $("aAdvisor").value.trim();
  const to = $("aTo").value.trim();
  if (!learnerId || !advisorId) throw new Error("ต้องระบุ uid ผู้เรียนและ uid ครู");
  if (op === "assign") return call.assignLearner({ learnerId, advisorId });
  if (op === "unassign") return call.unassignLearner({ learnerId, advisorId });
  if (!to) throw new Error("การโอนต้องระบุ uid ครูปลายทาง");
  return call.transferLearner({ learnerId, fromAdvisorId: advisorId, toAdvisorId: to });
}

// ---- history ----
const compact = (v) => (v === null || v === undefined ? "-" : JSON.stringify(v));

async function loadHistory() {
  setStatus("historyStatus", "", "");
  const data = { limit: 50 };
  if ($("hCategory").value) data.category = $("hCategory").value;
  try {
    const rows = (await call.listChangeAudits(data)).data;
    const body = $("historyBody");
    body.replaceChildren();
    for (const r of rows) {
      const tr = document.createElement("tr");
      for (const text of [formatTime(r.at), r.category, r.action, r.targetId, r.actorId]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }
      const td = document.createElement("td");
      const pre = document.createElement("pre");
      pre.textContent = `${compact(r.before)}\n→ ${compact(r.after)}`;
      td.appendChild(pre);
      tr.appendChild(td);
      body.appendChild(tr);
    }
    if (rows.length === 0) setStatus("historyStatus", "ยังไม่มีประวัติ", "");
  } catch (err) {
    console.error(err);
    setStatus("historyStatus", errorText(err), "error");
  }
}

async function loadAll() {
  showMessage("กำลังโหลด…", "info");
  try {
    await loadPolicy();
  } catch (err) {
    console.error(err);
    $("app").hidden = true;
    showMessage(
      err && err.code === "functions/permission-denied"
        ? "ไม่มีสิทธิ์: บัญชีนี้ต้องมีเอกสาร users/{uid} ที่ status เป็น active และมีบทบาท admin"
        : `โหลดข้อมูลไม่สำเร็จ: ${errorText(err)}`,
      "error"
    );
    return;
  }
  showMessage("", "info");
  $("app").hidden = false;
  try {
    await loadThresholds();
  } catch (err) {
    console.error(err);
    setStatus("thresholdStatus", errorText(err), "error");
  }
  try {
    await loadRuns();
  } catch (err) {
    console.error(err);
    setStatus("importStatus", errorText(err), "error");
  }
  await loadHistory();
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
  for (const name of [
    "getSystemPolicy", "setSystemPolicy", "upsertUser", "assignLearner",
    "unassignLearner", "transferLearner", "listChangeAudits",
    "listThresholds", "setThreshold", "runRiskAssessment", "importLearningData", "listSyncRuns",
  ]) call[name] = httpsCallable(functions, name);

  $("importFile").addEventListener("change", async () => {
    const f = $("importFile").files[0];
    if (f) $("importText").value = await f.text();
  });
  $("importForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("importStatus", "กำลังนำเข้า…", "");
    try {
      setStatus("importStatus", await runImport(), "ok");
    } catch (err) {
      console.error(err);
      setStatus("importStatus", errorText(err), "error");
    }
  });

  $("thresholdForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await attempt(
      "thresholdStatus",
      () => call.setThreshold({ name: $("tName").value, variable: $("tVariable").value, threshold: Number($("tValue").value) }),
      "เพิ่มกฎแล้ว มีผลกับรอบประเมินถัดไป"
    );
    if (ok) {
      $("tName").value = "";
      $("tValue").value = "";
      await loadThresholds();
      await loadHistory();
    }
  });
  $("runAssess").addEventListener("click", async () => {
    setStatus("thresholdStatus", "กำลังประเมิน…", "");
    try {
      const s = (await call.runRiskAssessment({})).data;
      const failed = s.failed.length ? ` ล้มเหลว ${s.failed.length}` : "";
      setStatus("thresholdStatus", `ประเมินแล้ว ${s.assessed} คน เสี่ยง ${s.atRisk} คน แจ้งเตือนใหม่ ${s.notified} คน${failed}`, s.failed.length ? "error" : "ok");
    } catch (err) {
      console.error(err);
      setStatus("thresholdStatus", errorText(err), "error");
    }
  });

  $("logout").addEventListener("click", () => signOut(auth));

  $("policyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await attempt("policyStatus", async () => fillPolicy((await call.setSystemPolicy(policyPatch())).data), "บันทึกนโยบายแล้ว");
    if (ok) await loadHistory();
  });
  $("userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await attempt("userStatus", () => call.upsertUser(userPatch()), "บันทึกบัญชีแล้ว");
    if (ok) await loadHistory();
  });
  for (const b of document.querySelectorAll("#assignForm button[data-op]")) {
    b.addEventListener("click", async () => {
      if (b.dataset.op === "unassign" && !window.confirm("ยืนยันยุติความสัมพันธ์ครู-ผู้เรียนนี้หรือไม่?")) return;
      const ok = await attempt("assignStatus", async () => assignAction(b.dataset.op), "ดำเนินการแล้ว");
      if (ok) await loadHistory();
    });
  }
  $("hReload").addEventListener("click", loadHistory);
  $("hCategory").addEventListener("change", loadHistory);

  onAuthStateChanged(auth, (user) => {
    $("app").hidden = true;
    if (!user) {
      goToLogin();
      return;
    }
    $("who").hidden = false;
    $("whoText").textContent = user.email ?? user.uid;
    loadAll();
  });
}

main();
