# ผลการทดสอบ Module 2 (แชทแนะนำที่ผ่านการตรวจ + ระบบบัญชี/ล็อกอิน)

รอบรัน: **2026-11-03 ช่วง 17:02–17:06 (เขตเวลา SEAST)** ผู้รัน: ผู้ช่วย `tester` (Claude) ยกเว้น 5b ที่ผู้ใช้รันเองใน PowerShell เมื่อ 17:07:38
อ้างอิงขอบเขตจาก [spec.md](spec.md) ผลทั้งหมดในไฟล์นี้มาจากการรันจริงของรอบนี้ ไม่มีการปรับแต่งผล

## 1. ตารางสรุป

| ข้อ | เทสต์ | ทดสอบอะไร | ชนิด | รันที่ | ผล | รันเมื่อ |
|---|---|---|---|---|---|---|
| 1 | `2-student-chat.spec.js` | นักศึกษาส่งข้อความ เห็นใน "ข้อความของฉัน" ป้าย "รออนุมัติ" ไม่เข้าห้องรวม และ `<b>` แสดงเป็นข้อความธรรมดา · ช่องว่างล้วนถูกกัน · จำกัด 2000 ตัวอักษร · ข้อความของ student1 ไม่โผล่ใน "ข้อความของฉัน" ของ student2 | ฟังก์ชัน | emulator | **ผ่าน 5/5** | 17:03:34–17:03:44 |
| 2, 3 | `3-review-decision.spec.js` | ข้อ 2: ล็อก → อนุมัติ (ทั้งแบบไม่เชิงลบ และเชิงลบที่ผู้ตรวจเลือกเอง) → ขึ้นห้องรวมของ student2 โดยไม่มีชื่อผู้ส่ง · ข้อ 3: ปฏิเสธโดยไม่ใส่เหตุผล (ทั้งว่างเปล่าและช่องว่างล้วน) ขึ้น "การปฏิเสธต้องระบุเหตุผล" และ **ไม่มีการเรียก `decideMessage` เลย (0 ครั้ง)** แล้ว student1 เห็นข้อความนั้นยังเป็น "รออนุมัติ" ไม่มีเหตุผลที่ปฏิเสธ ไม่มีปุ่มส่งใหม่ · ปฏิเสธพร้อมเหตุผล (กรณีควบคุม: ตัวดักเห็น `decideMessage` 1 ครั้ง) · ปุ่มส่งใหม่ · ผู้ตรวจห้ามตรวจข้อความตัวเอง | ฟังก์ชัน | emulator | **ผ่าน 11/11** (เดิม 9 + ใหม่ 2) รันซ้ำหลังเติมเทสต์ ดูหมายเหตุใต้ตาราง | 17:14:46–17:15:25 (รอบเดิมก่อนเติมเทสต์ 9/9 เมื่อ 17:03:44–17:04:08) |
| 3 (backend) | `functions/test/chat.test.js` | กฎ backend ของการตัดสิน: `outcome`, `negative`, `token` ต้องมี, **ปฏิเสธต้องมีเหตุผล** (เทสต์ที่ 24 ในชุดรวม ชื่อ "approve and reject need the right fields; reject needs a reason; negative can still be approved" `chat.test.js:110`) | ฟังก์ชัน | emulator (Firestore) | **ผ่าน 28/28** | 17:05:26–17:05:45 |
| 4 | `1-auth-guard.spec.js` | ไม่ล็อกอินเปิด `/dashboard/` `/review-queue/` `/admin/` เด้งไป `/login/` · รั้วหน้าตามบทบาท (student, lecturer, admin, advisor, ไม่มีบทบาท) · ไม่เก็บ roles ใน storage · ออกจากระบบ | **ความปลอดภัย** | emulator | **ผ่าน 11/11** | 17:03:12–17:03:34 |
| 4 | `4-live-login.spec.js` | หน้า login บนเว็บจริงโหลดได้ · ไม่ล็อกอินเปิด `/dashboard/` `/review-queue/` `/admin/` เด้งไป `/login/` · **Firestore REST อ่าน `chatMessages` และ `users` โดยไม่ส่ง token ได้ 403 PERMISSION_DENIED** (อ่านอย่างเดียว) | **ความปลอดภัย** | **เว็บจริง** | **ผ่าน 6/6** | 17:04:16–17:04:21 |
| 5 | `5-cross-student.spec.js` | student2 ใช้ token ของตัวเองอ่าน `chatMessages` (รายการและเอกสาร `msg-a` ของ student1) ได้ 403 · อ่าน `users` ได้ 403 · เขียน `chatMessages` ได้ 403 · กรณีควบคุม reviewer1 (lecturer) อ่าน `chatMessages` ได้ 200 แต่อ่าน `users` ได้ 403 | **ความปลอดภัย** | emulator | **ผ่าน 6/6** | 17:04:08–17:04:11 |
| 5b | `5b-cross-student-live.spec.js` | บัญชีที่เพิ่งสมัครและยังไม่มีเอกสาร `users` อ่าน `chatMessages` และ `users` บนเว็บจริงได้ 403 (สร้างบัญชีชั่วคราวผ่าน Identity Toolkit แล้วลบทิ้ง) | **ความปลอดภัย** | **เว็บจริง** | **ผ่าน 2/2** (2.2 วินาที) ผู้ใช้รันเองนอก Claude Code และรายงานผล: บัญชีที่ไม่มีเอกสาร `users` อ่าน `chatMessages` ได้ 403 PERMISSION_DENIED และอ่าน `users` ได้ 403 PERMISSION_DENIED ตรวจ Firebase Console แล้วไม่มีบัญชี `e2e-…@example.test` ค้าง (เหลือ 4 บัญชีเดิม) | 17:07:38 |
| (rules) | `functions/test/rules.test.js` | Firestore Rules: เฉพาะ `lecturer`/`admin` ที่ `active` อ่าน `chatMessages` ตรงได้ ที่เหลือปฏิเสธ | **ความปลอดภัย** | emulator (Firestore) | **ผ่าน 6/6** | 17:05:45–17:05:57 |
| (รวม) | `npm test` ใน `functions/` | ชุดเทสต์ backend ทั้งหมด | ฟังก์ชัน + ความปลอดภัย | emulator (Firestore) | **ผ่าน 139/139** ข้าม 0 | 17:04:28–17:05:22 |

สรุปตัวเลข: Playwright ที่ `tester` รัน 33 จาก 33 ผ่านในการรันครั้งสุดท้ายของแต่ละไฟล์ (emulator 27, เว็บจริง 6) · 5b ที่ผู้ใช้รันเอง 2 จาก 2 ผ่าน (เว็บจริง) · backend 139 จาก 139 ผ่าน

หมายเหตุประวัติการรันของ `3-review-decision.spec.js` (รายงานตามจริง): หลังเติมเทสต์ใหม่ 2 ตัว รันบน emulator 3 รอบ รอบที่ 1 (17:12:23–17:13:12) ล้มเหลว 1 ตัว ผ่าน 4 ไม่ได้รัน 6 สาเหตุ: เทสต์ใหม่ฝั่งนักศึกษารอ 5 วินาทีไม่พอขณะหน้ายังโหลด วินิจฉัยว่า **เทสต์ผิด** (แก้เป็น timeout 20 วินาที) รอบที่ 2 (17:13:27–17:14:01) ล้มเหลว 1 ตัว ผ่าน 2 ไม่ได้รัน 8 สาเหตุ: รันซ้ำบน emulator ตัวเดิม การ seed ซ้ำไม่ล้าง `reviewLocks` ที่ล็อกค้างจากรอบก่อน ปุ่มล็อกจึงไม่ขึ้น วินิจฉัยว่า **สภาพแวดล้อม** (ผู้ช่วยอนุมานจากการวิเคราะห์ ไม่ได้เปิดดูข้อมูล `reviewLocks` ตรง ๆ) แก้โดยรีสตาร์ต emulator ให้สะอาดแล้ว seed ใหม่ ไม่ได้แก้โค้ดระบบ รอบที่ 3 (17:14:46–17:15:25) ผ่าน 11/11 ตัวเลขข้างต้นใช้ผลรอบที่ 3 (ไฟล์อื่นไม่ได้รันซ้ำ ใช้ผลรอบ 17:02–17:06)
ผล 5b มาจากรายงานของผู้ใช้ ผู้ช่วย (Claude) ไม่ได้รันและไม่ได้เห็นผลรันนี้เอง

## 2. เทสต์ความปลอดภัย (ข้อ 4, 5, 5b)

| ข้อ | สิ่งที่พิสูจน์ | ที่รัน | หลักฐานรอบนี้ |
|---|---|---|---|
| 4 | ผู้ที่ไม่ล็อกอินเข้าหน้าภายในไม่ได้ (เด้งไป login) และอ่าน Firestore ตรงไม่ได้ | เว็บจริง (`4-live-login`) + emulator (`1-auth-guard`) | ผ่านทั้งคู่ เว็บจริงได้ 403 PERMISSION_DENIED ทั้ง `chatMessages` และ `users` |
| 5 | นักศึกษาคนที่สองอ่าน `chatMessages` ตรงไม่ได้ และไม่เห็นข้อความของนักศึกษาคนแรก | emulator (`5-cross-student`, `2-student-chat`, `3-review-decision`) | ผ่าน student2 ได้ 403 reviewer1 ได้ 200 เป็นกรณีควบคุมว่า 403 มาจากบทบาท ไม่ได้ยิงผิดที่ |
| 5b | บัญชีที่ล็อกอินแล้วแต่ไม่มีเอกสาร `users` อ่าน Firestore ตรงบน **เว็บจริง** ไม่ได้ | เว็บจริง | ผ่าน 2/2 ได้ 403 PERMISSION_DENIED ทั้ง `chatMessages` และ `users` ผู้ใช้รันเอง 17:07:38 และยืนยันว่าบัญชีชั่วคราวถูกลบ (`accounts:delete` ทำงาน) |

## 3. ข้อที่ไม่ผ่าน / skip / ยังไม่มีผล

- **ไม่มีข้อที่ไม่ผ่านและไม่มีข้อที่ skip ในสิ่งที่รันรอบนี้** จึงไม่มีรายการ "โค้ดผิด / เทสต์ผิด"
- **5b:** `tester` รันไม่ได้เพราะตัวแปรแวดล้อม `FIREBASE_API_KEY` ไม่ส่งถึงเซสชันของ Claude Code (ประเภท: **สภาพแวดล้อม** ไม่ใช่โค้ดหรือเทสต์ผิด) ผู้ใช้จึงรันเองนอก Claude Code เมื่อ 17:07:38 ได้ผ่าน 2/2 ตามตาราง ผลที่เคยแจ้งไว้ก่อนหน้านั้น (2 passed ไม่ระบุเวลา) ไม่นับรวมในรายงานนี้
- **การลบบัญชีชั่วคราวของ 5b: ยืนยันแล้ว** ผู้ใช้ตรวจ Firebase Console หน้า Authentication หลังรัน ไม่พบบัญชี `e2e-…@example.test` ค้าง มีเฉพาะ 4 บัญชีเดิม แปลว่า `accounts:delete` ใน `afterAll` ทำงานสำเร็จ (ผลนี้มาจากการตรวจของผู้ใช้)
- **ข้อ 3 (ปฏิเสธโดยไม่ใส่เหตุผล) ยืนยันสองชั้น:** ชั้นหน้าเว็บด้วย `3-review-decision` (ไม่มีการเรียก `decideMessage` และข้อความยังเป็น "รออนุมัติ" ฝั่งนักศึกษา ดูตาราง) และชั้น backend ด้วย `chat.test.js:110` (ผ่าน) ว่าปฏิเสธต้องมีเหตุผล

## 4. ข้อจำกัด

- **Cloud Functions ยังไม่ได้ deploy** (โปรเจกต์อยู่แผน Spark) ข้อ 1–3 ต้องเรียก backend จึง **รันได้เฉพาะบน emulator** บนเว็บจริงล็อกอินแล้วจะขึ้น "ระบบหลังบ้านยังไม่เปิดใช้งาน"
- ข้อ 4 และ 5b บนเว็บจริงเป็นเทสต์ที่ไม่เรียก Cloud Functions (ตรวจรั้วหน้า และยิง Firestore REST ตรง) จึงทำได้
- ข้อ 5 บน emulator ใช้ไฟล์ Rules ชุดเดียวกับที่ deploy แต่ไม่ได้พิสูจน์ Rules ที่ deploy จริง ส่วนนั้นพิสูจน์ได้เฉพาะกรณีไม่มี token (ข้อ 4 บนเว็บจริง) และกรณีบัญชีที่ล็อกอินแล้วแต่ไม่มี `users` (5b ผ่านเมื่อ 17:07:38) ยังไม่ได้ตรวจกรณีบัญชีนักศึกษาที่มีเอกสาร `users` ครบบนเว็บจริง
- ข้อมูลทดสอบ emulator เป็นข้อมูล seed ล้วน ไม่มีข้อมูลจริง
- ไม่ได้ทดสอบ: ปุ่ม AI (เรียก OpenRouter ภายนอกด้วยคีย์ฝั่งเบราว์เซอร์) การแสดงผลด้วยสายตา (layout) และเบราว์เซอร์อื่นนอก Chromium
- เทสต์ 2 และ 3 เปลี่ยนข้อมูลใน emulator จึงต้อง seed ใหม่ก่อนรันทุกครั้ง และสำหรับ `3-review-decision` **การ seed ซ้ำบน emulator ที่เปิดค้างอยู่ไม่พอ** ต้องรีสตาร์ต emulator ทุกครั้ง เพราะ `reviewLocks` ที่ล็อกค้างจากรอบก่อนทำให้ปุ่มล็อกไม่ขึ้น (พบในรอบที่ 2 ของ 3-review-decision ข้างต้น)

## 5. วิธีรันซ้ำ (PowerShell)

ต้องมี Java 21 และ Node ทำที่รากโปรเจกต์ `C:\Users\User\OneDrive\Desktop\blackup\Grade-Runway-PROJECT3` รหัสผ่านบัญชี seed อ่านได้จาก `functions/scripts/seed-emulator.js` (ใช้เฉพาะใน emulator) ไม่ฝังในไฟล์เทสต์

**A. emulator (ข้อ 1–3, 4 ส่วน emulator, 5)** เปิดสามเทอร์มินัล

```powershell
# เทอร์มินัล 1: emulator
npx firebase emulators:start --only functions,firestore,auth --project demo-grade-runway

# เทอร์มินัล 2: เว็บ
npx serve web -l 3000

# เทอร์มินัล 3: seed ใหม่ แล้วรันเทสต์ทีละไฟล์ (ก่อนรันชุดนี้ทุกครั้ง ให้รีสตาร์ต emulator ในเทอร์มินัล 1 แล้ว seed ใหม่
# การ seed ซ้ำบน emulator ที่เปิดค้างอยู่ไม่พอ เพราะ reviewLocks ค้างจากรอบก่อน)
cd functions
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
node scripts/seed-emulator.js
Remove-Item Env:FIRESTORE_EMULATOR_HOST, Env:FIREBASE_AUTH_EMULATOR_HOST
cd ..\tests\e2e
$env:TEST_PASSWORD = "<รหัสผ่านบัญชี seed>"
npx playwright test 1-auth-guard.spec.js
npx playwright test 2-student-chat.spec.js
npx playwright test 3-review-decision.spec.js
npx playwright test 5-cross-student.spec.js
Remove-Item Env:TEST_PASSWORD
```

**B. เว็บจริง (ข้อ 4, อ่านอย่างเดียว)**

```powershell
cd tests\e2e
$env:BASE_URL = "https://grade-runway-project.web.app"
npx playwright test 4-live-login.spec.js
Remove-Item Env:BASE_URL
```

**C. 5b (เว็บจริง สร้างและลบบัญชี Auth ชั่วคราว ต้องมี API key ของโปรเจกต์)**

```powershell
cd tests\e2e
$env:BASE_URL = "https://grade-runway-project.web.app"
$env:FIREBASE_API_KEY = "<API key ของเว็บแอป>"
npx playwright test 5b-cross-student-live.spec.js
Remove-Item Env:BASE_URL, Env:FIREBASE_API_KEY
```

ถ้าเทสต์ล้มกลางคัน ให้ตรวจ Firebase Console หน้า Authentication หาบัญชีรูปแบบ `e2e-<timestamp>@example.test` ที่ค้างอยู่และลบมือ

**D. backend**

```powershell
cd functions
npm test
```

(เปิด Firestore emulator เองและต้องมี Java 21 ปิดชุด A ก่อนรัน เพราะใช้พอร์ตเดียวกัน)
