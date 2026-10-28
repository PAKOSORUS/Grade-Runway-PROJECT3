// Login / sign-up page (FR-28, FR-29). Creates the Firebase Auth account, then
// asks the Backend (registerSelf) to create users/{uid} as a student; the page
// never writes Firestore and cannot pick a role. After login it asks
// getMyProfile for the roles and goes to the matching page (../shared/nav.js).
//
// Modes:
//   default    real project: needs ../review-queue/firebase-config.js
//   #emulator  local Auth + Functions emulators (http://localhost:3000/login/#emulator
//              when served with `npx serve web`)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { goHome } from "../shared/nav.js";

const $ = (id) => document.getElementById(id);
const useEmulator =
  new URLSearchParams(location.search).get("emulator") === "1" || location.hash === "#emulator";
const call = {};

function showMessage(text, kind) {
  $("message").textContent = text;
  $("message").className = kind;
  $("message").hidden = !text;
}

function setSignupStatus(text, kind) {
  $("signupStatus").textContent = text;
  $("signupStatus").className = `status ${kind ?? ""}`;
}

const SIGNUP_ERRORS = {
  "auth/email-already-in-use": "อีเมลนี้มีบัญชีอยู่แล้ว ให้เข้าสู่ระบบแทน",
  "auth/weak-password": "รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)",
  "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
};
const errorText = (err) => SIGNUP_ERRORS[err && err.code] || (err && err.message) || String(err);

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
  for (const name of ["registerSelf", "getMyProfile"]) call[name] = httpsCallable(functions, name);

  // While the sign-up flow runs, the auth listener must not redirect yet.
  let signingUp = false;

  function showFinish(text) {
    $("forms").hidden = true;
    $("finishCard").hidden = false;
    $("finishStatus").textContent = text ?? "";
    $("finishStatus").className = "status error";
    showMessage("", "info");
  }

  // OP-45: no account yet (not-found) offers sign-up completion; a disabled
  // account (permission-denied) or any other failure signs out with a message.
  async function enter() {
    showMessage("กำลังตรวจสอบบัญชี…", "info");
    try {
      const profile = (await call.getMyProfile({})).data;
      goHome(profile.roles);
    } catch (err) {
      console.error(err && err.code);
      if (err && err.code === "functions/not-found") {
        showFinish("");
        return;
      }
      await signOut(auth);
      showMessage(
        err && err.code === "functions/permission-denied"
          ? "บัญชีถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ"
          : `เข้าสู่ระบบไม่สำเร็จ: ${errorText(err)}`,
        "error"
      );
      $("forms").hidden = false;
    }
  }

  // OP-44: "exists" is a normal answer (nothing was changed), not an error.
  async function registerProfile(name, setStatus) {
    setStatus("กำลังลงทะเบียน…", "");
    try {
      await call.registerSelf({ name });
      return true;
    } catch (err) {
      console.error(err);
      setStatus(errorText(err), "error");
      return false;
    }
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, $("email").value, $("password").value);
    } catch (err) {
      // Same wording for every failure so the page does not reveal which accounts exist.
      showMessage("เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน", "error");
      console.error(err && err.code);
    }
  });

  $("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("sName").value.trim();
    setSignupStatus("กำลังสมัคร…", "");
    signingUp = true;
    try {
      await createUserWithEmailAndPassword(auth, $("sEmail").value, $("sPassword").value);
    } catch (err) {
      signingUp = false;
      setSignupStatus(errorText(err), "error");
      return;
    }
    const registered = await registerProfile(name, setSignupStatus);
    signingUp = false;
    if (registered) await enter();
    else showFinish("สร้างบัญชีล็อกอินแล้ว แต่ลงทะเบียนในระบบไม่สำเร็จ กรอกชื่อแล้วลองอีกครั้ง");
  });

  $("finishForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const setStatus = (text, kind) => {
      $("finishStatus").textContent = text;
      $("finishStatus").className = `status ${kind ?? ""}`;
    };
    if (await registerProfile($("fName").value.trim(), setStatus)) await enter();
  });
  $("finishCancel").addEventListener("click", async () => {
    await signOut(auth);
    $("finishCard").hidden = true;
    $("forms").hidden = false;
  });

  onAuthStateChanged(auth, (user) => {
    $("password").value = "";
    $("sPassword").value = "";
    if (signingUp) return;
    if (!user) {
      showMessage("", "info");
      $("forms").hidden = false;
      return;
    }
    $("forms").hidden = true;
    enter();
  });
}

main();
