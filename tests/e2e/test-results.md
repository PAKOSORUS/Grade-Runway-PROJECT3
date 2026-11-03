# ผลการรันเทสต์ E2E (Playwright)

วันที่รัน: 2026-11-03 / อ้างอิง `spec.md` ที่รากโปรเจกต์
สภาพแวดล้อม: emulator (project `demo-grade-runway`: auth 9099, firestore 8080, functions 5001) + `npx serve web` ที่ port 3000, seed ด้วย `functions/scripts/seed-emulator.js`, Chromium headless, workers=1
รหัสผ่านบัญชี seed ส่งผ่าน `TEST_PASSWORD` ไม่ฝังในไฟล์

หมายเหตุ: แผนข้อ 1-5 เรียบเรียงจาก spec.md ใหม่ตามขอบเขตของแต่ละไฟล์ด้านล่าง

## สรุป

| ไฟล์ | รันที่ไหน | ผล | จำนวน |
|---|---|---|---|
| `1-auth-guard.spec.js` | emulator (seed ใหม่ รันซ้ำหลังแก้เทสต์ advisor ให้รอโหลด) | ผ่าน | 11/11 |
| `2-student-chat.spec.js` | emulator | ผ่าน | 5/5 |
| `3-review-decision.spec.js` | emulator | ผ่าน | 9/9 |
| `5-cross-student.spec.js` | emulator | ผ่าน | 6/6 |
| `4-live-login.spec.js` | เว็บจริง (อ่านอย่างเดียว ไม่ล็อกอิน ไม่ส่ง token/API key) | ผ่าน | 6/6 |
| `npm test` ใน `functions/` (emulator เปิดเอง) | backend | ผ่าน | 139/139 (chat.test.js 28/28, rules.test.js 6/6) |
| `5b-cross-student-live.spec.js` | เว็บจริง (ผู้ใช้รันเองนอก Claude Code) | ผ่าน (ผู้ใช้รายงาน) | 2 passed (2.5s) ดูหัวข้อ 5b |

ไม่มีเทสต์ล้มเหลว ไม่พบบั๊กของระบบ

## ข้อ 3: ขอบเขตของการยืนยัน (UI กับ backend)

เทสต์ `3-review-decision.spec.js` ยืนยันได้เฉพาะ **ชั้นหน้าเว็บ**: หน้า review-queue เตือน "เลือกเชิงลบหรือไม่เชิงลบก่อน" และ "การปฏิเสธต้องระบุเหตุผล" ก่อนเรียก backend, อนุมัติ/ปฏิเสธแล้วข้อความหายจากคิว, นักศึกษาเห็นผลและเหตุผลที่ถูกปฏิเสธ, ห้องรวมแสดงเฉพาะข้อความที่อนุมัติโดยไม่มีชื่อผู้ส่ง, ปุ่มส่งใหม่

กฎของ **backend** (ตรวจ `outcome` ต้องเป็น approve/reject, ต้องมี `negative`, ต้องมี `token`, reject ต้องมี `reason`, และข้อความเชิงลบยังอนุมัติได้ตามการเลือกของผู้ตรวจ) ยืนยันด้วยเทสต์ backend เดิมที่ `functions/test/chat.test.js:110` ("approve and reject need the right fields; reject needs a reason; negative can still be approved") **รันซ้ำจริงแล้วในรอบนี้ด้วย `npm test` ใน `functions/` ผลคือผ่าน** (ok 24) ทั้งชุด 139 เทสต์ ผ่าน 139 ล้มเหลว 0 ข้าม 0 และรันแยกไฟล์ได้ `chat.test.js` 28/28, `rules.test.js` 6/6 ส่วนการอนุมัติข้อความเชิงลบ (msg-b) ผ่าน UI ใน emulator เป็นหลักฐานเสริม

## รายละเอียดตามไฟล์

### 1-auth-guard (spec 3, 7)
หน้า login แสดงสองฟอร์มและแถบ emulator · รหัสผ่านผิดได้ข้อความเดียว "เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน" · ไม่ล็อกอินเข้า dashboard/review-queue/admin เด้งไป login · student → dashboard (เห็นส่วนแชท) · lecturer → review-queue · admin → admin · advisor → dashboard ส่วนแชทซ่อน · ไม่มีบทบาท → ข้อความ "บัญชีนี้ยังไม่มีบทบาทที่เข้าหน้าใดได้…" · student เปิด review-queue → "ไม่มีสิทธิ์เข้าหน้านี้" แล้วพากลับ dashboard · ไม่เก็บ roles ใน localStorage/sessionStorage · ออกจากระบบกลับ login

### 2-student-chat (spec 2, 3, 5.1, 7)
ห้องรวมว่างแสดง "ยังไม่มีข้อความในห้องรวม" · ข้อความว่าง/ช่องว่างล้วนถูกกัน · textarea maxlength 2000 · ส่งสำเร็จขึ้นสถานะ "รออนุมัติ" และแสดง `<b>` เป็นข้อความธรรมดา (ไม่ถูกตีความเป็น HTML) · ข้อความ pending ไม่เข้าห้องรวม · "ข้อความของฉัน" ของ student2 ไม่มีข้อความของ student1

### 3-review-decision (spec 3, 5.1, 7, 8.2)
คิวเรียงเก่าสุดก่อน · ข้อความที่ผู้ตรวจส่งเอง (dual) แสดงแต่ปุ่มล็อกถูกปิด · ตรวจ validation ฟอร์ม · ปฏิเสธพร้อมเหตุผลแล้วหายจากคิว · อนุมัติแบบไม่เชิงลบและแบบเชิงลบ · ห้องรวมของ student2 เห็นข้อความที่อนุมัติ ไม่เห็นข้อความที่ถูกปฏิเสธ ไม่มีชื่อผู้ส่ง/uid · student1 เห็นป้ายอนุมัติ/ถูกปฏิเสธ + เหตุผล + ปุ่ม "ส่งใหม่" เฉพาะข้อความที่ถูกปฏิเสธ และไม่เห็นข้อมูลเชิงลบ · ส่งใหม่ (ว่างถูกกัน) ได้ข้อความ pending พร้อมป้ายส่งใหม่ และปุ่มของต้นฉบับหายไป · ข้อความส่งใหม่เข้าคิวผู้ตรวจพร้อมป้าย "ส่งใหม่จาก…" ไม่ได้กดปุ่ม AI

### 5-cross-student (emulator, Firestore REST + Bearer idToken จาก Auth emulator)
student2: list chatMessages 403, อ่านเอกสาร msg-a ของ student1 403, อ่าน users 403, เขียน chatMessages 403 · กรณีควบคุม reviewer1 (lecturer): list chatMessages 200, แต่อ่าน users ยัง 403 (ตรงกับ Rules)

### 4-live-login (เว็บจริง อ่านอย่างเดียว)
`/login/` ตอบ 200 มีชื่อหน้า/หัวข้อ/ฟอร์มสองชุด ไม่อยู่ในโหมด emulator เปิดหน้าแล้วไม่มี request ไป cloudfunctions.net และไม่มีการเขียน Firestore · `/dashboard/`, `/review-queue/`, `/admin/` เมื่อไม่ล็อกอินเด้งไป `/login/` (3 เทสต์) · GET Firestore REST ของ `chatMessages` และ `users` โดยไม่ส่ง token และไม่ส่ง API key ได้ HTTP 403 + `error.status = PERMISSION_DENIED` ทั้งสอง (อ่านเฉพาะ status) ไม่ได้ล็อกอิน สมัคร หรือส่งฟอร์มใด ๆ

### 5b-cross-student-live: ผ่าน 2/2 (ผู้ใช้รันเอง)
ผล: 2 passed (2.5s) บนเว็บจริง `https://grade-runway-project.web.app`
- new account without a users document cannot read chatMessages → 403 PERMISSION_DENIED
- new account without a users document cannot read users → 403 PERMISSION_DENIED

หมายเหตุการบันทึก:
- **รันเองนอก Claude Code** (ผู้ใช้รันใน PowerShell) เพราะตัวแปรแวดล้อม `FIREBASE_API_KEY` ไม่ส่งถึงเซสชันของ Claude Code ทั้งเซสชันหลักและเซสชันของผู้ทดสอบ (ผู้ทดสอบจึง skip ทั้งสองเทสต์ในรอบก่อนหน้า)
- ผลนี้มาจากรายงานของผู้ใช้ ผู้ทดสอบ (Claude) ไม่ได้รันและไม่ได้เห็นผลรันนี้เอง
- บันทึกเมื่อ 2026-11-03 17:01 (เวลาที่บันทึกผล ไม่ใช่เวลาที่รันจริง ผู้ใช้ไม่ได้ระบุเวลารัน)
- ผู้ใช้ไม่ได้รายงานผลของขั้น `accounts:delete` ใน `afterAll` จึงยังไม่ยืนยันว่าบัญชีชั่วคราวถูกลบแล้ว (ถ้า `afterAll` ลบไม่สำเร็จ โค้ดจะ log คำเตือนให้ลบมือ ดูอีเมลรูปแบบ `e2e-<timestamp>@example.test` ในหน้า Authentication ของ Firebase Console)

ตรวจจากการอ่านโค้ด:
- guard: `test.skip(!API_KEY, …)` ระดับ describe และ `beforeAll` มี `if (!API_KEY) return` สองชั้น จึงไม่มีการเรียก `accounts:signUp` เมื่อไม่มีคีย์
- สร้างบัญชี: `accounts:signUp` ด้วยอีเมล `e2e-<timestamp>@example.test` รหัสผ่านสุ่ม `crypto.randomBytes` ไม่พิมพ์ลง log/รายงาน
- เทสต์: อ่าน `chatMessages` และ `users` ผ่าน Firestore REST ด้วย idToken ของบัญชีนี้ คาด 403 + `error.status = PERMISSION_DENIED` ไม่เรียก registerSelf ไม่เขียน Firestore ไม่สร้าง users doc
- ลบ: `afterAll` เรียก `accounts:delete` ด้วย idToken ที่เก็บไว้ทำงานไม่ว่าเทสต์ผ่านหรือไม่ (ถ้าลบไม่สำเร็จจะ log คำเตือนให้ลบมือ ไม่มีรหัสผ่านใน log)
- ข้อจำกัดที่เห็นจากโค้ด: ถ้า `signUp` ล้มเหลวใน `beforeAll` จะไม่มีบัญชีให้ลบ (ไม่มี idToken); ถ้าโปรเจกต์ปิดการสมัครด้วยอีเมล เทสต์จะ error ที่ beforeAll

วิธีรัน (ต้องตั้งคีย์ในเทอร์มินัลเดียวกับที่รัน): `FIREBASE_API_KEY=<คีย์> BASE_URL=https://grade-runway-project.web.app npx playwright test 5b-cross-student-live.spec.js` (project id อ่านจาก `.firebaserc` = `grade-runway-project` override ได้ด้วย `FIREBASE_PROJECT_ID`)

## วิธีรันซ้ำ

```bash
# รากโปรเจกต์ (3 เทอร์มินัล)
npx firebase emulators:start --only functions,firestore,auth --project demo-grade-runway
npx serve web -l 3000
cd functions && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/seed-emulator.js

# ใน tests/e2e (ต้อง seed ใหม่ทุกครั้งก่อนรันชุด 1,2,3 เพราะเทสต์เปลี่ยนข้อมูล)
TEST_PASSWORD=<รหัสผ่าน seed> npx playwright test 1-auth-guard.spec.js
TEST_PASSWORD=<รหัสผ่าน seed> npx playwright test 2-student-chat.spec.js
TEST_PASSWORD=<รหัสผ่าน seed> npx playwright test 3-review-decision.spec.js
TEST_PASSWORD=<รหัสผ่าน seed> npx playwright test 5-cross-student.spec.js
BASE_URL=https://grade-runway-project.web.app npx playwright test 4-live-login.spec.js
```

ข้อจำกัด: ไฟล์ 2 และ 3 ต้องรันบน emulator ที่ seed ใหม่ตามลำดับ (ห้องรวมต้องว่าง และข้อความ seed ต้องยัง pending)
