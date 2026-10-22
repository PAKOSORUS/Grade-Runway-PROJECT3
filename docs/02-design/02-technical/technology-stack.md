# Technology Stack

บันทึกการตัดสินใจเรื่อง technology ของระบบ เอกสารชั้น logical ([[architecture]], [[api-spec]], [[db-spec]], [[detailed-design/data-sync|detailed-design]]) ยังคงเขียนแบบไม่ผูก technology ตามเดิม เอกสารนี้เป็นที่เดียวที่ระบุ technology และ mapping จากโมเดล logical ไปยัง technology ที่เลือก

## 1. สถานะการตัดสินใจ

| หัวข้อ | สถานะ | ค่า | หลักฐาน |
|--------|-------|-----|---------|
| ที่เก็บข้อมูลหลัก (Primary Data Store) | ตัดสินใจแล้ว (ผู้ใช้ยืนยัน 2026-10-18) | Cloud Firestore โปรเจกต์ `grade-runway-project` (database `(default)`) | มีข้อมูลตัวอย่างอยู่ในฐานข้อมูลจริงแล้ว ผ่าน `scripts/seed-firestore/` (PR #10) |
| ภาษา/รันไทม์ของสคริปต์ seed | ใช้งานแล้ว (เฉพาะสคริปต์) | Node.js พร้อม `firebase-admin` | `scripts/seed-firestore/package.json` |
| Backend Service | ตัดสินใจแล้ว (ผู้ใช้ยืนยัน 2026-10-19) | Cloud Functions for Firebase + Firebase Admin SDK (Node.js) | Admin SDK ทำ transaction/batch ได้ (FR-18, FR-21, FR-22, FR-24) ข้าม Security Rules และตัดชื่อผู้ส่งก่อนถึง Client (NFR-06) ภาษาเดียวกับสคริปต์ seed |
| Client (หน้าจอผู้ใช้) | ตัดสินใจแล้ว (ผู้ใช้ยืนยัน 2026-10-19) | React + Vite | แยกหน้าตามบทบาทได้ดี หน้าทดลอง `web/review-queue/` (HTML + JavaScript ล้วน, อ่านอย่างเดียว) เป็น prototype ยังไม่ย้ายมา React |
| การยืนยันตัวตน/เข้าสู่ระบบ | ตัดสินใจแล้ว (ผู้ใช้ยืนยัน 2026-10-19) | Firebase Authentication | บทบาทที่ใช้ตัดสินสิทธิ์ยังอ่านจากข้อมูลบทบาทในระบบนี้ (`users.roles`) ตามหลักใน [[architecture]] ไม่ใช่จากผู้ให้บริการ login; วิธี login (อีเมล/รหัสผ่าน, Google, SSO) ยังไม่กำหนด การยืนยันตัวตนเดิมอยู่นอกขอบเขตของ [[../../01-requirements/01-spec/20261017-01-user-role-advisor-eligibility-management|REQ-06]] การเลือกนี้เป็นเรื่อง technology เท่านั้น |
| Scheduler | ยังไม่ตัดสินใจ | - | |
| บริการส่งอีเมล | ยังไม่ตัดสินใจ | - | FR-04 |
| บริการ AI วิเคราะห์ข้อความ | ยังไม่ตัดสินใจ | - | FR-17 ระดับต่ำ ไม่บังคับ |
| การ deploy/โฮสต์ | ยังไม่ตัดสินใจ | - | |

หมายเหตุ: ผู้ใช้ยืนยัน Firestore เมื่อ 2026-10-18 และ Backend/Client/Auth เมื่อ 2026-10-19 ส่วน Scheduler, อีเมล, AI, deploy ยังไม่ตัดสินใจ (ผู้ใช้เลือกเลื่อนเมื่อ 2026-10-19) เอกสาร logical ยังคงไม่ผูก technology
ข้อเสนอเดิมที่ยังไม่ได้ยืนยัน (ไม่ใช่การตัดสินใจ): Cloud Scheduler เรียก Functions ตามเวลา และ SendGrid หรือ SMTP ของมหาวิทยาลัยสำหรับอีเมล

## 2. Mapping จาก entity (db-spec) ไปยัง collection ใน Firestore

ออกแบบตามรูปแบบ collection → ฟิลด์ ที่จดชื่อซ้ำไว้ในเอกสารเพื่อไม่ต้องอ่านข้าม collection ตอนแสดงผล ชื่อฟิลด์เป็นอังกฤษ camelCase ค่าตัวเลือกใน seed เป็นอังกฤษ (เช่น `pending`, `approved`, `rejected`) ตรงกับค่าภาษาไทยใน [[db-spec]] ตามนี้

| Collection (subcollection) | Entity ใน [[db-spec]] | ใน seed | หมายเหตุ |
|----------------------------|-----------------------|---------|----------|
| `users` | 3.1 User, 3.2 UserRole | มี 5 เอกสาร | บทบาทรวมเป็น array `roles` (`student`, `advisor`, `lecturer`, `admin`) ถ้าต้องเก็บสถานะ/แหล่งที่มารายบทบาทต้องแยกเป็น collection |
| `advisorAssignments` | 3.3 AdvisorAssignment | ไม่มี | จดชื่อซ้ำ `advisorName`, `learnerName` |
| `eligibilityCriteria` (`items`) | 3.20 | มี 1 เอกสาร (`criteria-v1`) | เวอร์ชันเก่าไม่แก้/ไม่ลบ |
| `eligibilityResults` | 3.21 | ไม่มี | จดชื่อซ้ำ `learnerName` |
| `riskThresholdRules` | 3.6 | ไม่มี | |
| `syncRuns`, `syncState`, `systemPolicy`, `legacyConnection` | 3.7, 3.8, 3.5, 3.4 | ไม่มี | สามตัวหลังมีเอกสารเดียว |
| `gradeRecords`, `attendanceRecords`, `assignmentRecords` | 3.9 | ไม่มี | จดชื่อซ้ำ `learnerName` |
| `riskAssessments` (`findings`) | 3.10, 3.11 | ไม่มี | `findings` เก็บสำเนา threshold ที่ใช้จริง (NFR-02) |
| `recommendations` | 3.12 | ไม่มี | |
| `notifications` (`deliveries`) | 3.13, 3.14 | ไม่มี | จดชื่อซ้ำ `recipientName` |
| `chatMessages` (`reviewLocks`, `reviewDecision`, `aiSuggestions`) | 3.15-3.18 | มี 3 เอกสาร | ข้อความ `msg-001` rejected, `msg-002` approved, `msg-003` pending (ส่งใหม่จาก `msg-001`) |
| `auditEvents` | 3.19 | ไม่มี | เพิ่มอย่างเดียว |
| `configChangeAudits` | 3.22 | ไม่มี | เพิ่มอย่างเดียว |

เอกสารตัวอย่างทุกรายการมี `_seed: true` เพื่อกรองและลบทิ้งทีหลัง

## 3. ข้อควรระวังเมื่อใช้ Firestore (ผูกกับข้อกำหนดที่มีอยู่)

ข้อสังเกตจากข้อกำหนดเดิม ยังไม่ใช่การตัดสินใจออกแบบ ต้องตัดสินตอนเขียน detailed design จริง

| ข้อกำหนด | ข้อควรระวัง |
|----------|-------------|
| NFR-06 นโยบายแสดงชื่อผู้ส่ง | `chatMessages.senderName` จดซ้ำไว้ได้ แต่ต้องตัดออกที่ Backend ก่อนส่งถึง Client เมื่อนโยบายเป็น "ซ่อนชื่อ" ห้ามให้ Client อ่านเอกสารจาก Firestore ตรง |
| FR-18, FR-21, FR-24, NFR-04, NFR-05 | การตรวจล็อก บันทึกคำตัดสิน เปลี่ยนสถานะข้อความ และ audit ต้องสำเร็จพร้อมกันหรือไม่สำเร็จเลย ต้องทำผ่านการเขียนแบบ transaction/batch ใน Backend |
| FR-22 ส่งใหม่ครั้งละหนึ่ง | การตรวจว่าข้อความเดิมมีข้อความใหม่ที่ยังรออนุมัติ/อนุมัติแล้วหรือไม่ ต้องอยู่ใน transaction เดียวกับการสร้างข้อความใหม่ |
| NFR-05, NFR-07 เพิ่มอย่างเดียว | `auditEvents` และ `configChangeAudits` ห้ามแก้/ลบ ต้องบังคับด้วยสิทธิ์ของ Firestore (Security Rules) และให้เขียนผ่าน Backend เท่านั้น |
| LegacyConnectionConfig | ข้อมูลยืนยันตัวตนกับระบบเดิมห้ามส่งกลับใน operation ใด และห้ามคัดลอกลง audit ควรพิจารณาไม่เก็บค่านี้ใน Firestore |
| ชื่อที่จดซ้ำ | เมื่อ `users.name` เปลี่ยน ต้องกำหนดกติกาว่าชื่อที่จดซ้ำจะอัปเดตตามหรือคงค่า ณ เวลานั้น (audit ต้องการ ณ เวลานั้น, หน้าจอต้องการค่าปัจจุบัน) |
| Security Rules | ร่างไว้ที่ `firebase/firestore.rules` (ฉบับตามบทบาท 2026-10-19): Client อ่าน `chatMessages` ได้เฉพาะบัญชี `active` ที่มีบทบาท `lecturer` หรือ `admin` (ต้อง login ด้วย Firebase Auth) อย่างเดียว การเขียนทุกอย่างและ collection อื่นทั้งหมดปฏิเสธ (Backend และสคริปต์ seed ใช้ Admin SDK ซึ่งข้าม rules) **ข้อสมมติ:** rules อ่านบทบาทจาก `users/{auth uid}` จึงต้องตั้ง id เอกสาร `users` ให้เท่ากับ Firebase Auth uid; ผู้ใช้ตัวอย่าง `user-001`... ไม่ตรง uid จึงยังอ่านผ่าน rules ไม่ได้จนกว่าจะสร้างบัญชีจริง หน้า `web/review-queue/` มีฟอร์ม login (Firebase Auth อีเมล/รหัสผ่าน ใช้ทดสอบเท่านั้น วิธี login จริงยังไม่กำหนด) ก่อนอ่านข้อมูล สถานะ deploy: ยังไม่ deploy ผู้ใช้วางใน Console เอง (ไม่ได้ตรวจ rules ที่ใช้อยู่จริง) |

## 4. สคริปต์ข้อมูลตัวอย่าง

- ที่ตั้ง: `scripts/seed-firestore/` (`seed.js`, `package.json`)
- โหมดเริ่มต้นเป็น dry-run ใส่ `--write` เพื่อเขียนเฉพาะเอกสารที่ยังไม่มี และ `--force` เพื่อทับ
- credentials ผู้ใช้ตั้งเองผ่าน `GOOGLE_APPLICATION_CREDENTIALS` สคริปต์ไม่อ่านหรือเก็บ key และห้ามนำไฟล์ key เข้า repo

## 5. Backend (Cloud Functions) ที่เริ่มทำแล้ว

- ที่ตั้ง: `functions/` (Node.js, `firebase-functions` v2, `firebase-admin`) และ `firebase.json` ที่ราก repo โครงเป็น handler ธรรมดาใน `functions/lib/` ที่ทดสอบกับ Firestore emulator ได้ และ `functions/index.js` ที่ห่อเป็น callable
- Phase 1 (เฉพาะส่วนที่ทำแล้ว): ตรวจตัวตนและบทบาทจาก `users/{auth uid}` (`lib/access.js`), Admin เพิ่ม/แก้/ปิดบัญชีและบทบาท, เพิ่ม/ถอน/โอนผู้เรียนในความดูแล (`lib/accounts.js`) และบันทึก audit ในธุรกรรมเดียวกันที่ collection `configChangeAudits` (`lib/audit.js` ใช้ซ้ำกับหมวดอื่นได้)
- การจำกัดการอ่านตามผู้เรียน/ครู (T-1-07, `lib/learners.js`): ผู้เรียนอ่านเฉพาะของตน ครูอ่านเฉพาะผู้เรียนที่มีความสัมพันธ์ `active` บทบาทอื่นรวมถึง Admin ถูกปฏิเสธ (ตั้งใจเข้มไว้ก่อน ขยายได้ถ้าข้อกำหนดเปลี่ยน) ฟีเจอร์ที่อ่านข้อมูลผู้เรียนใน phase ถัดไปต้องเรียก `requireLearnerAccess`
- ประวัติการเปลี่ยนแปลงสำหรับ Admin (T-1-09, `lib/history.js`): อ่านอย่างเดียว กรองตาม category/targetId ได้ ต้องมี composite index ตาม `firestore.indexes.json` เมื่อ deploy จริง
- ยังไม่ทำ: นำเข้าบัญชีจากระบบเดิม (T-1-02, T-1-04, T-1-05), หน้าจอ Admin
- ทดสอบ: `cd functions && npm test` (Firestore emulator ต้องใช้ Java 21 ขึ้นไป) ผ่าน 41 ข้อ ยังไม่ได้ deploy และไม่ได้ทดสอบกับ Firebase จริง (ต้องใช้แผน Blaze ผู้ใช้เลือกเลื่อนไว้)

### แชทที่ผ่านการตรวจ (Phase 3, `functions/lib/chat.js`)

- ครอบคลุมในโค้ด: ส่งข้อความ (ตรวจผลผ่านเกณฑ์ที่เก็บไว้ที่ `eligibilityResults/{uid}.eligible`), ส่งใหม่หลังถูกปฏิเสธครั้งละหนึ่ง, ห้องรวมคืนเฉพาะข้อความอนุมัติแล้ว, คิวผู้ตรวจ, ล็อก (token), ตัดสินพร้อม audit ใน transaction เดียว, คำตัดสินที่ไม่ถือล็อกที่ใช้ได้ถูกปฏิเสธ (บันทึก audit และแจ้งผู้ตรวจ ข้อความคงรออนุมัติ), ปลดล็อกด้วยมือ, ฟังก์ชันกวาดล็อกที่หมดเวลา (`releaseExpiredLocks` ยังไม่ผูกกับตัวตั้งเวลา)
- เก็บคำตัดสินเป็นฟิลด์ `decision` บนเอกสารข้อความ ส่วนล็อก (holderId, token, expiresAt) เก็บใน collection `reviewLocks/{messageId}` แยกออกมา เพราะ rules ให้ผู้ตรวจอ่าน `chatMessages` ตรงได้ token จึงต้องไม่อยู่ในเอกสารนั้น (`reviewLocks` ปฏิเสธ client ทุกคน) audit ลง `auditEvents` และแจ้งเตือนลง `notifications`
- สมมติฐานชั่วคราว: ระยะเวลาล็อกใช้ `systemPolicy/current.lockDurationMinutes` ถ้าไม่ตั้งค่าใช้ 15 นาที และนโยบายแสดงชื่อผู้ส่งใช้ `systemPolicy/current.showSenderName` ถ้าไม่ตั้งค่าซ่อนชื่อ (ผู้ใช้ยังไม่ตัดสิน NFR-06, T-3-15 ยังไม่ทำ รวมถึง audit การเปลี่ยนนโยบาย)
- ปุ่มอนุมัติ/ปฏิเสธ/ล็อก/ปลดล็อกในหน้า `web/review-queue/` เรียก callable ผ่าน emulator ได้แล้ว (ดู README ในโฟลเดอร์นั้น) ทดสอบด้วยมือแล้วกับ Auth + Functions + Firestore emulator ยังไม่ได้ deploy จริง
- ยังไม่ได้ทำ: นโยบายแสดงชื่อ (T-3-15), index ของ `chatMessages` เพิ่มใน `firestore.indexes.json` แล้วแต่ยังไม่ทดสอบกับ Firestore จริง
- Functions emulator ต้องการ `engines.node` เป็น 20, 22 หรือ 24 (ตั้ง 22) ค่า `>=20` ใช้ไม่ได้
- ข้อผิดพลาดที่พบและแก้: `functions/index.js` ใน PR #19 ยังไม่ export callable ของ chat (test เรียก handler ตรง จึงไม่เจอ) พบตอนเปิด Functions emulator แก้แล้ว
- `functions/test/exports.test.js` ตรวจว่า handler ของ lib/ ที่ client เรียกได้ถูก export ใน `index.js` ครบ (กันบั๊กแบบที่เกิดใน PR #19) ผ่านรวม 41 ข้อ
