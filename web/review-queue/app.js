// Review queue: sign in (Firebase Auth), then read chatMessages once and render them.
// Read-only. Uses the web app's firebaseConfig (public by design); never a service account.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const messageEl = document.getElementById("message");
const tableEl = document.getElementById("table");
const rowsEl = document.getElementById("rows");
const loginEl = document.getElementById("login");
const whoEl = document.getElementById("who");

const STATUS = {
  pending: { label: "รออนุมัติ", icon: "⏳" },
  approved: { label: "อนุมัติแล้ว", icon: "✔" },
  rejected: { label: "ถูกปฏิเสธ", icon: "✖" },
};

function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = kind;
  messageEl.hidden = false;
}

function formatTime(ts) {
  if (!ts || typeof ts.toDate !== "function") return "-";
  return ts.toDate().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function cell(text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function statusCell(status) {
  const td = document.createElement("td");
  const badge = document.createElement("span");
  const known = STATUS[status];
  badge.className = "badge " + (known ? status : "unknown");
  // textContent only: message data is user-written and must never be parsed as HTML.
  badge.textContent = known ? `${known.icon} ${known.label} (${status})` : `? ${status ?? "-"}`;
  td.appendChild(badge);
  return td;
}

function render(docs) {
  rowsEl.replaceChildren();
  for (const d of docs) {
    const m = d.data();
    const tr = document.createElement("tr");

    const sender = document.createElement("td");
    sender.appendChild(document.createTextNode(m.senderName ?? "-"));
    const senderId = document.createElement("div");
    senderId.className = "id";
    senderId.textContent = m.senderId ?? "";
    sender.appendChild(senderId);

    const content = cell(m.content ?? "");
    const id = document.createElement("div");
    id.className = "id";
    id.textContent = d.id;
    content.appendChild(id);

    tr.append(
      sender,
      content,
      statusCell(m.status),
      cell(formatTime(m.sentAt)),
      cell(m.resubmitOfId ?? "-", m.resubmitOfId ? "" : "muted")
    );
    rowsEl.appendChild(tr);
  }
}

async function loadQueue(db) {
  try {
    const snap = await getDocs(query(collection(db, "chatMessages"), orderBy("sentAt", "desc")));

    if (snap.empty) {
      tableEl.hidden = true;
      showMessage("ยังไม่มีข้อความใน chatMessages", "info");
      return;
    }
    render(snap.docs);
    messageEl.hidden = true;
    tableEl.hidden = false;
  } catch (err) {
    tableEl.hidden = true;
    const denied = err && err.code === "permission-denied";
    showMessage(
      denied
        ? "อ่านข้อมูลไม่ได้ (permission-denied) — บัญชีนี้ต้องมีเอกสาร users/{uid} ที่ status เป็น active และมีบทบาท lecturer หรือ admin และต้องวาง firestore.rules ล่าสุดใน Console แล้ว"
        : `โหลดข้อมูลไม่สำเร็จ: ${err && err.message ? err.message : err}`,
      "error"
    );
    console.error(err);
  }
}

async function main() {
  let config;
  try {
    ({ firebaseConfig: config } = await import("./firebase-config.js"));
  } catch {
    showMessage(
      "ไม่พบ firebase-config.js — คัดลอก firebase-config.example.js เป็น firebase-config.js แล้ววางค่า firebaseConfig ของเว็บแอป",
      "error"
    );
    return;
  }

  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);

  loginEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(
        auth,
        document.getElementById("email").value,
        document.getElementById("password").value
      );
    } catch (err) {
      // Same wording for every failure so the page does not reveal which accounts exist.
      showMessage("เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน", "error");
      console.error(err && err.code);
    }
  });
  document.getElementById("logout").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    document.getElementById("password").value = "";
    if (!user) {
      loginEl.hidden = false;
      whoEl.hidden = true;
      tableEl.hidden = true;
      showMessage("กรุณาเข้าสู่ระบบ", "info");
      return;
    }
    loginEl.hidden = true;
    whoEl.hidden = false;
    document.getElementById("whoText").textContent = user.email ?? user.uid;
    showMessage("กำลังโหลด…", "info");
    loadQueue(db);
  });
}

main();
