# spec.md — Module: แชทแนะนำที่ผ่านการตรวจ + ระบบบัญชี/ล็อกอิน

เขียนจากโค้ดจริงเท่านั้น (`functions/`, `web/`, `firebase/`, `firestore.indexes.json`) อ้างไฟล์ต้นทางท้ายแต่ละหัวข้อ ส่วนที่โค้ดยังไม่มีแต่ spec ในเอกสารระบุไว้ แยกไว้ที่หัวข้อ 8 ไม่ปะปนกับสิ่งที่ทำงานได้จริง

## 1. ขอบเขตของ Module

**สิ่งที่ Module นี้ทำ** (ตามที่เลือก)
1. แชทแนะนำที่ผ่านการตรวจ: นักศึกษาส่งข้อความ → ข้อความอยู่สถานะ `pending` → อาจารย์/admin ล็อก ระบุเชิงลบ/ไม่เชิงลบ แล้วอนุมัติหรือปฏิเสธ (ปฏิเสธต้องมีเหตุผล) → ข้อความที่อนุมัติแล้วเท่านั้นเข้า "ห้องรวม"
2. ระบบบัญชี/ล็อกอินเท่าที่แชทต้องใช้: สมัครเอง, เข้าสู่ระบบ, ออกจากระบบ, รั้วหน้าตามบทบาท, Admin กำหนดบทบาท/เปิด-ปิดบัญชี

**สถานะการรันจริง:** ทดสอบกับ Firebase emulator เท่านั้น Cloud Functions ยังไม่ได้ deploy (deploy แล้วเฉพาะ Hosting, Firestore Rules, Indexes) ตาม `CLAUDE.md`

## 2. บทบาทผู้ใช้

บทบาทเก็บเป็น array ที่ `users/{uid}.roles` คนเดียวมีได้หลายบทบาท ค่าที่ยอมรับ: `student`, `advisor`, `lecturer`, `admin` (`functions/lib/access.js`) สิทธิ์ตัดสินที่ backend ทุกครั้ง การซ่อนปุ่ม/เมนูฝั่งเว็บเป็นแค่ความสะดวก

| บทบาท | ในแชท | ในระบบบัญชี |
|---|---|---|
| `student` | ส่งข้อความ (`sendMessage`) เฉพาะผู้ที่ `eligibilityResults/{uid}.eligible === true` · ส่งใหม่หลังถูกปฏิเสธ (`resubmitMessage`) · ดูข้อความของตัวเองทุกสถานะ + เหตุผลที่ถูกปฏิเสธ (`listMyMessages`) · อ่านห้องรวม (`listApprovedMessages`) | บทบาทเดียวที่ได้จากการสมัครเอง |
| `lecturer` | ดูคิว `pending` (`listReviewQueue`) · ล็อก (`lockMessage`) · อนุมัติ/ปฏิเสธ (`decideMessage`) · ปลดล็อกด้วยมือ (`releaseLock`) · บันทึกสรุป AI (`saveAiSummary`) · อ่าน `chatMessages` ตรงตาม Rules | — |
| `admin` | สิทธิ์ตรวจข้อความเท่ากับ `lecturer` ทุกอย่าง | สร้าง/แก้บัญชี กำหนดบทบาท เปิด-ปิดใช้งาน (`upsertUser`, `setUserStatus`) · ตั้ง `lockDurationMinutes` และ `showSenderName` (`setSystemPolicy`) · ดูประวัติการเปลี่ยนบัญชี (`listChangeAudits`) |
| `advisor` | ไม่มีสิทธิ์ใดในแชท (เข้าหน้า dashboard ได้แต่ส่วนแชทซ่อน) | ให้บทบาทได้ผ่าน Admin เท่านั้น |
| ผู้สมัครเอง | เป็น `student` แต่ส่งข้อความไม่ได้จนกว่ามี `eligibilityResults` | `registerSelf` ส่งได้แค่ `name` ได้บทบาท `student` เท่านั้น |
| ยังไม่ล็อกอิน / บัญชี `disabled` | เรียก callable ใดไม่ได้ (`unauthenticated` / `permission-denied`) | เข้าได้เฉพาะหน้า login |

กฎข้ามบทบาท
- **ผู้ตรวจห้ามตรวจข้อความที่ตัวเองส่ง** `lockMessage`, `decideMessage`, `saveAiSummary` ปฏิเสธ `permission-denied` "ตรวจข้อความที่ตัวเองส่งไม่ได้" ไม่ว่าถือบทบาทอะไร (`chat.js` `SELF_REVIEW`)
- **ผู้ตรวจ (`lecturer`/`admin`) ส่งข้อความหรืออ่านห้องรวมไม่ได้ถ้าไม่มีบทบาท `student`** (`requireRole(["student"])`)
- Admin ถอนสิทธิ์ `admin` หรือปิดบัญชีของตัวเองไม่ได้ (`accounts.js` → `failed-precondition`)

แหล่ง: `functions/lib/access.js`, `chat.js`, `accounts.js`, `register.js`, `ACL.md`

## 3. หน้าจอ

ทุกหน้าเป็น HTML + ES module ไม่มี bundler เรียก callable เท่านั้น ไม่แตะ Firestore ตรง โหมดทดสอบเปิดด้วย `#emulator` (ใช้ project `demo-grade-runway`) ทุกหน้าที่ต้องล็อกอินเรียก `getMyProfile` ใหม่ทุกครั้งที่โหลด ไม่เก็บบทบาทใน localStorage/sessionStorage

| หน้า | บทบาทที่เข้าได้ (`web/shared/roles.js`) | ส่วนที่อยู่ใน Module นี้ | callable ที่ใช้ |
|---|---|---|---|
| `/login/` | ทุกคน (ไม่ต้องล็อกอิน) | ฟอร์มเข้าสู่ระบบ · ฟอร์มสมัครบัญชีใหม่ · การ์ด "ลงทะเบียนให้เสร็จ" (มีบัญชีล็อกอินแต่ยังไม่มี `users/{uid}`) · การ์ด "ระบบหลังบ้านยังไม่เปิดใช้งาน" (backend ตอบไม่ได้/ไม่ถูก deploy) | `registerSelf`, `getMyProfile` |
| `/dashboard/` (เฉพาะส่วนแชท) | `student`, `advisor` (ส่วนแชทแสดงเฉพาะ `student`) | การ์ด "ส่งข้อความแนะนำแนวทางการเรียน" (textarea + ปุ่มส่ง) · การ์ด "ข้อความของฉัน" แสดงป้ายสถานะ เวลา เนื้อหา เหตุผลที่ถูกปฏิเสธ และป้าย "ส่งใหม่จากข้อความที่ถูกปฏิเสธ" · **(งานที่ต้องทำ ดู 8.2)** การ์ดห้องรวม และปุ่ม "ส่งใหม่" ในข้อความที่ถูกปฏิเสธ | `sendMessage`, `listMyMessages` · งาน 8.2 เพิ่ม `listApprovedMessages`, `resubmitMessage` |
| `/review-queue/` | `lecturer`, `admin` | รายการข้อความ `pending` เรียงเก่าสุดก่อน ปุ่ม "ล็อกเพื่อตรวจ" → ฟอร์มตัดสิน (เลือกเชิงลบ/ไม่เชิงลบ, ช่องเหตุผล, ปุ่มอนุมัติ/ปฏิเสธ/ปลดล็อก, ปุ่ม "ให้ AI ช่วยวิเคราะห์", ปุ่ม "ให้ AI ช่วยสรุป") ข้อความของตัวเองแสดงแต่ปุ่มล็อกถูกปิด | `listReviewQueue`, `lockMessage`, `decideMessage`, `releaseLock`, `saveAiSummary`, `getMyProfile` |
| `/admin/` (เฉพาะส่วนที่เกี่ยว) | `admin` | การ์ด "นโยบายระบบ" (ช่อง `showSenderName`, `lockDurationMinutes`) · การ์ด "บัญชีผู้ใช้" (uid, ชื่อ, อีเมล, สถานะ, เลือกบทบาท) · การ์ด "ประวัติการเปลี่ยนแปลง" (ตัวกรองหมวด `account`) | `setSystemPolicy`/`getSystemPolicy`, `upsertUser`, `listChangeAudits` |
| `/shared/*` | — | `roles.js` (ตารางหน้า↔บทบาท), `nav.js` (`goHome`, `goToLogin` คง `#emulator`), `guard.js` (`enterPage` + เมนู), `ai.js` (เรียก OpenRouter จากเบราว์เซอร์) | — |

พฤติกรรมการนำทาง (`nav.js`, `guard.js`)
- ล็อกอินแล้วไปหน้าแรกตามลำดับ `admin` → `review-queue` → `dashboard` ผู้มีหลายบทบาทเห็นลิงก์ทุกหน้าที่เข้าได้ในเมนู
- ยังไม่ล็อกอินเข้าหน้าภายใน → `goToLogin()` เด้งไป `/login/` · ทุกหน้ามีปุ่ม "ออกจากระบบ"
- เข้าหน้าที่ไม่มีสิทธิ์ → ขึ้น "ไม่มีสิทธิ์เข้าหน้านี้ กำลังพาไปหน้า…ของคุณ…" แล้วพาไปหน้าแรกของตัวเองหลัง 1.5 วินาที
- ไม่มีบทบาทที่เข้าหน้าใดได้ → ขึ้น "บัญชีนี้ยังไม่มีบทบาทที่เข้าหน้าใดได้ กรุณาติดต่อผู้ดูแลระบบ" ไม่พาไปไหน
- `getMyProfile` ตอบ `not-found` (`reason: "no-account"`) → การ์ดลงทะเบียน; `not-found` ไม่มี reason หรือ error อื่นนอกชุดรหัสของ backend → การ์ดหลังบ้านยังไม่เปิด; `permission-denied` → ออกจากระบบ + "บัญชีถูกปิดใช้งาน"

## 4. โครงสร้างข้อมูล (Firestore)

Security Rules (`firebase/firestore.rules`): `chatMessages` อ่านได้เฉพาะผู้ใช้ `active` ที่ `roles` มี `lecturer` หรือ `admin` ทุก collection อื่นปฏิเสธทั้งอ่านและเขียน การเขียนทุกอย่างผ่าน Admin SDK ใน Cloud Functions

### 4.1 `users/{authUid}` (id ต้องเท่ากับ Firebase Auth uid)
| ช่อง | ชนิด | ที่มา / ข้อบังคับ |
|---|---|---|
| `name` | string | **บังคับ** ตอนสร้าง · `registerSelf` ตัดช่องว่าง ห้ามว่าง ไม่เกิน 100 ตัวอักษร |
| `email` | string | `registerSelf` ดึงจาก token (ถ้า token ไม่มีอีเมล → `invalid-argument` "บัญชีต้องมีอีเมล") · `upsertUser` ต้องมี `@` |
| `roles` | string[] | **บังคับ** ตอน Admin สร้างบัญชีใหม่ (อย่างน้อยหนึ่ง ต้องอยู่ใน 4 ค่าข้างบน ตัดค่าซ้ำ) · สมัครเอง = `["student"]` |
| `status` | `active` \| `disabled` | ค่าเริ่มต้น `active` |
| `source` | `self` \| `admin` | `self` = สมัครเอง · `admin` = Admin สร้าง/แก้ (และข้อมูล seed) |
| `createdAt`, `updatedAt` | timestamp | ตั้งโดยเซิร์ฟเวอร์ |

### 4.2 `chatMessages/{messageId}`
| ช่อง | ชนิด | หมายเหตุ |
|---|---|---|
| `senderId` | string | uid จาก token ของผู้เรียก ไม่รับจาก client |
| `senderName` | string | คัดลอกจาก `users.name` ตอนส่ง |
| `content` | string | **บังคับ** ตัดช่องว่างหัวท้าย ห้ามว่าง ไม่เกิน 2000 ตัวอักษร |
| `status` | `pending` → `approved` \| `rejected` | เริ่มที่ `pending` เสมอ |
| `sentAt` | timestamp | เซิร์ฟเวอร์ตั้ง |
| `resubmitOfId` | string \| null | id ข้อความเดิมที่ถูกปฏิเสธ (null ถ้าไม่ใช่ข้อความส่งใหม่) |
| `decision` | map (ตั้งครั้งเดียวโดย `decideMessage`) | `reviewerId`, `outcome` (`approve`\|`reject`), `negative` (boolean), `reason` (string \| null), `at` |
| `aiSuggestion` | map | `topic`, `cautions[]` (≤5 ข้อ ข้อละ ≤300), `addressedPreviousReason` (true/false/null) เขียนทับได้ผ่าน `saveAiSummary` เท่านั้น · ห้ามส่งให้ student |
| `aiSuggestionAt`, `aiSuggestionBy` | timestamp, uid | คู่กับ `aiSuggestion` |

`decideMessage` แก้ได้เฉพาะ `status` กับ `decision` เท่านั้น ข้อความ `rejected` ปิดถาวร

### 4.3 `chatMessages/{id}/aiLog/{logId}` (เพิ่มอย่างเดียวต่อการเรียก AI หนึ่งครั้ง)
`input` (มีได้แค่ `content` และ `previous {content, reason}` ห้ามมีชื่อ/id), `output` (≤5000 ตัวอักษร), `model` (≤100), `savedBy`, `createdAt` ไม่มี rule ใดตรง client อ่านเขียนไม่ได้

### 4.4 `reviewLocks/{messageId}` (มีเฉพาะตอนถูกล็อก)
`holderId`, `token` (UUID), `expiresAt` แยกจาก `chatMessages` เพราะผู้ตรวจอ่าน `chatMessages` ตรงได้ แต่ token ต้องไม่รั่ว client อ่านไม่ได้ ระยะล็อก = `systemPolicy/current.lockDurationMinutes` ถ้ายังไม่ตั้งใช้ 15 นาที

### 4.5 `eligibilityResults/{learnerId}`
`eligible` (boolean) ใช้ตัดสินสิทธิ์ส่งข้อความ ไม่มีเอกสาร = ไม่ผ่านเกณฑ์ **ไม่มีโค้ดที่เขียน collection นี้** ข้อมูลมาจาก seed (`functions/scripts/seed-emulator.js`) เท่านั้น

### 4.6 `auditEvents` (เพิ่มอย่างเดียว เขียนใน transaction เดียวกับการเปลี่ยนสถานะ)
`type` ที่โค้ดเขียนใน Module นี้: `lock`, `resubmit` (มี `relatedMessageId`), `review_decision` (มี `outcome`, `negative`, `reason`), `decision_rejected`, `unlock_manual`, `unlock_expired` (`actorId: "system"`), `ai_summary` (มี `saved`) ทุกรายการมี `messageId`, `actorId`, `at` (ข้อยกเว้น: ไม่มีแอปให้อ่าน collection นี้)

### 4.7 `notifications`
เขียนโดย `decideMessage`: `message_rejected` (ถึงผู้ส่ง พร้อม `reason`) และ `decision_rejected` (ถึงผู้ตรวจที่ตัดสินโดยไม่ถือล็อกที่ใช้ได้) ช่อง: `recipientId`, `type`, `messageId`, `reason`, `read`, `at` **ยังไม่มีโค้ดที่อ่าน** ประเภทสองนี้ (callable ที่อ่าน `notifications` กรองเฉพาะ `type == "risk"`) ผู้ส่งเห็นเหตุผลที่ถูกปฏิเสธผ่าน `listMyMessages` แทน

### 4.8 `configChangeAudits` (หมวด `account`, `systemPolicy` ที่เกี่ยวกับ Module นี้)
`category`, `action`, `targetId`, `actorId`, `before`, `after`, `at` · `account`: action `selfRegister` (actor = uid ผู้สมัคร), `create`, `update` · `systemPolicy`: action `set` ใน transaction เดียวกับการเปลี่ยนข้อมูล

### 4.9 `systemPolicy/current` (ช่องที่แชทใช้)
`lockDurationMinutes` (ตัวเลข > 0), `showSenderName` (boolean ค่าเริ่มต้นซ่อนชื่อ) ช่องอื่น (`syncIntervalMinutes`, `maxMissingImportPercent`) อยู่นอก Module

### 4.10 ดัชนี (`firestore.indexes.json`) ที่แชทใช้
`chatMessages`: (`status` ↑, `sentAt` ↑) สำหรับคิว, (`status` ↑, `sentAt` ↓) สำหรับห้องรวม, (`senderId` ↑, `sentAt` ↓) สำหรับ "ข้อความของฉัน" · `configChangeAudits`: (`category`, `at` ↓), (`targetId`, `at` ↓), (`category`, `targetId`, `at` ↓)

## 5. Operation (callable) และช่องบังคับ

รหัส error ใช้ HttpsError: `unauthenticated`, `permission-denied`, `invalid-argument`, `not-found`, `failed-precondition` ข้อความตอบเป็นภาษาไทย

### 5.1 แชท (`functions/lib/chat.js`)
| Operation | ผู้เรียก | อินพุต (บังคับ) | ผล / เงื่อนไข |
|---|---|---|---|
| `sendMessage` | `student` | `content` | ตรวจ `eligible` ไม่ผ่าน → `permission-denied` "ไม่ผ่านเกณฑ์ผู้ส่งข้อความ" สำเร็จ → `{messageId}` สถานะ `pending` |
| `resubmitMessage` | `student` | `originalId`, `content` | ต้องเป็นข้อความของตัวเอง (ไม่ใช่ → `permission-denied`) และ `status = rejected` (ไม่ใช่ → `failed-precondition`) ห้ามมีข้อความลูก (`resubmitOfId == originalId`) ที่ไม่ใช่ `rejected` ตรวจ `eligible` ซ้ำ สร้างข้อความใหม่ + audit `resubmit` |
| `listMyMessages` | `student` | — (`limit` 1–200 ค่าเริ่มต้น 50) | ข้อความของตน ใหม่สุดก่อน คืน `id, content, status, sentAt, resubmitOfId, reason` (`reason` เฉพาะ `rejected`) **ไม่คืน** ผู้ตรวจ, เชิงลบ/ไม่เชิงลบ, `aiSuggestion` |
| `listApprovedMessages` | `student` | — (`limit` 1–200 ค่าเริ่มต้น 50) | เฉพาะ `approved` ใหม่สุดก่อน คืน `id, content, sentAt` และ `senderName` เมื่อนโยบาย `showSenderName = true` เท่านั้น |
| `listReviewQueue` | `lecturer`, `admin` | — | `pending` เรียงเก่าสุดก่อน ซ่อนข้อความที่ผู้ตรวจอื่นล็อกอยู่ (ที่ล็อกเองยังแสดง) คืน `id, senderName, content, sentAt, resubmitOfId, previous {content, reason}, aiSuggestion, aiSuggestionAt, ownMessage, lockedByMe, lockExpiresAt` **ไม่คืน token** |
| `lockMessage` | `lecturer`, `admin` | `messageId` | ไม่พบ → `not-found` · ข้อความตัวเอง → `permission-denied` · ไม่ใช่ `pending` → `failed-precondition` · ผู้อื่นล็อกอยู่และยังไม่หมดอายุ → `failed-precondition` สำเร็จ → `{messageId, token, expiresAt}` + audit `lock` |
| `decideMessage` | `lecturer`, `admin` | `messageId`, `outcome` (`approve`\|`reject`), `negative` (boolean), `token`; **`reason` บังคับเมื่อ `reject`** | ไม่ถือล็อกที่ใช้ได้ที่ token ตรง (หมดอายุ/ถูกปลด/ผู้อื่นล็อก/ไม่ใช่ `pending`) → บันทึก audit `decision_rejected` + notification ให้ผู้ตรวจ ข้อความคง `pending` แล้วตอบ `failed-precondition` · สำเร็จ → ตั้ง `status` + `decision` ลบ lock เขียน audit `review_decision` และถ้าปฏิเสธส่ง notification `message_rejected` ให้ผู้ส่ง ทั้งหมดใน transaction เดียว |
| `releaseLock` | `lecturer`, `admin` | `messageId` | ปลดล็อกของใครก็ได้ ข้อความคง `pending` ไม่ได้ถูกล็อก → `failed-precondition` · audit `unlock_manual` |
| `saveAiSummary` | `lecturer`, `admin` (ผู้ถือล็อกที่ใช้ได้) | `messageId`, `token`, `input`, `output`, `model`; `summary` (object หรือ `null`) | ตรวจรูปแบบ/ขนาดเท่านั้น (แยกไม่ได้ว่ามาจาก AI จริง) เขียน `aiSuggestion*` + `aiLog` + audit `ai_summary` ไม่แตะ `status`/`decision` |
| `releaseExpiredLocks` | ภายใน (ไม่ export เป็น callable) | `now` | กวาดล็อกหมดอายุ + audit `unlock_expired` **ยังไม่มี scheduler เรียก** คิว/การล็อก/การตัดสินถือว่าล็อกหมดอายุคือว่างอยู่แล้ว |

### 5.2 บัญชี/ล็อกอิน
| Operation | ผู้เรียก | อินพุต (บังคับ) | ผล |
|---|---|---|---|
| `registerSelf` (`register.js`) | ผู้ที่ล็อกอิน Firebase Auth แล้ว | `name` เท่านั้น (role/status/uid ที่ส่งมาเมินทั้งหมด) | สร้าง `users/{uid}` = `student`/`active`/`source: self` + audit `selfRegister` มีบัญชีแล้ว → `{result: "exists"}` ไม่เขียนทับ ไม่ audit ไม่ใช่ error |
| `getMyProfile` | ผู้ที่ล็อกอินแล้ว | — | คืน `name, roles, status` ของตน · ไม่มีบัญชี → `not-found` + `details.reason = "no-account"` · `disabled` → `permission-denied` |
| `upsertUser` (`accounts.js`) | `admin` | `uid` · บัญชีใหม่ต้องมี `name` และ `roles` | แก้เฉพาะช่องที่ส่งมา ตั้ง `source: admin` + audit `create`/`update` |
| `setUserStatus` | `admin` | `uid`, `status` (`active`\|`disabled`) | เรียก `upsertUser` (หน้า Admin ใช้ `upsertUser` ตรง ไม่เรียก `setUserStatus`) |
| `listChangeAudits` (`history.js`) | `admin` | — (`limit` 1–200, `category`, `targetId` ไม่บังคับ) | อ่านอย่างเดียว ใหม่สุดก่อน |
| `getSystemPolicy` / `setSystemPolicy` (`policy.js`) | `admin` | `setSystemPolicy` ต้องส่งอย่างน้อยหนึ่งช่อง | ไม่เขียนถ้าค่าไม่เปลี่ยน |

## 6. ค่าสถานะ
- `chatMessages.status`: `pending` → `approved` | `rejected` (ครั้งเดียว ไม่ย้อน)
- `decision.outcome`: `approve` | `reject`
- `users.status`: `active` | `disabled`
- `users.source`: `self` | `admin`
- การส่งใหม่: ข้อความลูกเชื่อมด้วย `resubmitOfId` ส่งใหม่ได้ครั้งละหนึ่ง (ลูกที่ `pending`/`approved` ขวางไว้ ลูกที่ `rejected` ปล่อยให้ส่งใหม่ได้อีก)

## 7. ช่องบังคับกรอกในหน้าจอ

| ฟอร์ม | ช่อง | ข้อบังคับ (จาก HTML และ backend) |
|---|---|---|
| เข้าสู่ระบบ | อีเมล, รหัสผ่าน | บังคับทั้งคู่ · ล้มเหลวแสดงข้อความเดียวกันทุกกรณี ("เข้าสู่ระบบไม่สำเร็จ ตรวจอีเมลและรหัสผ่าน") |
| สมัครบัญชี | ชื่อ | บังคับ ≤100 ตัวอักษร |
| | อีเมล | บังคับ รูปแบบอีเมล (`auth/email-already-in-use`, `auth/invalid-email` มีข้อความเฉพาะ) |
| | รหัสผ่าน | บังคับ ≥6 ตัวอักษร |
| ลงทะเบียนให้เสร็จ | ชื่อ | บังคับ ≤100 ตัวอักษร |
| ส่งข้อความ (dashboard) | ข้อความ | บังคับ ≤2000 ตัวอักษร ตัดช่องว่าง ว่างไม่ได้ |
| ตัดสินข้อความ (review-queue) | เชิงลบ/ไม่เชิงลบ | **บังคับเสมอ** ทั้งอนุมัติและปฏิเสธ (หน้าเว็บเตือน "เลือกเชิงลบหรือไม่เชิงลบก่อน") |
| | เหตุผล | บังคับเมื่อปฏิเสธเท่านั้น ("การปฏิเสธต้องระบุเหตุผล") |
| บัญชีผู้ใช้ (admin) | uid | บังคับ |
| | ชื่อ, บทบาท | บังคับเมื่อสร้างบัญชีใหม่ (≥1 บทบาท) |
| | อีเมล | ถ้ากรอกต้องมี `@` |
| | สถานะ | ไม่บังคับ ("ไม่เปลี่ยน" ได้) |
| นโยบาย (admin) | `lockDurationMinutes`, `showSenderName` | ส่งอย่างน้อยหนึ่งช่อง · `lockDurationMinutes` > 0 · `showSenderName` เป็น boolean |

## 8. ขอบเขตงาน: ไม่ทำ / ต้องทำเพิ่ม / ส่งต่อ BACKLOG

### 8.1 ไม่ทำ (อยู่นอก Module ตามที่เลือก แต่มีอยู่ในโปรเจกต์)
- ระบบติดตามความเสี่ยงของผู้เรียน: แดชบอร์ดสถานการณ์/ความเสี่ยง/คำแนะนำ/ประวัติแจ้งเตือน (`situation.js`, `risk.js`, ส่วนบนของ `/dashboard/`), มุมมองครูที่ปรึกษา (`listMyLearners`, `getLearnerProfile`, `learners.js`)
- การนำเข้าข้อมูลการเรียนและซิงก์ (`sync.js`), กฎ threshold (`thresholds.js`)
- การกำหนด/ยุติ/โอนความสัมพันธ์ครู-ผู้เรียน (`assignLearner`, `unassignLearner`, `transferLearner`, `listAssignments`)
- ส่วนของ `/admin/` ที่ไม่เกี่ยวกับบัญชี/ล็อก: threshold, นำเข้าข้อมูล, รอบซิงก์, ความสัมพันธ์ครู-ผู้เรียน, ช่อง `syncIntervalMinutes`/`maxMissingImportPercent`

### 8.2 งานที่ต้องทำใน Module นี้ (หน้าจออย่างเดียว — **ห้ามแก้ backend**)
ทั้งสองงานแก้เฉพาะ `web/dashboard/` (`index.html`, `app.js`) ส่วนแชท ห้ามแก้ `functions/`, `firebase/firestore.rules` หรือ `firestore.indexes.json` เพราะ backend และเทสต์ของทั้งสอง operation มีอยู่แล้ว (`chat.js`, `chat.test.js`) ต้องเพิ่มชื่อ callable ลงรายการ `httpsCallable` ในหน้านี้ (ตอนนี้มีแค่ `sendMessage`, `listMyMessages`) และแสดงเฉพาะส่วนแชทให้บัญชีที่มีบทบาท `student` เหมือนเดิม

**งาน A — หน้าห้องรวม** (ส่วนแชทของ `/dashboard/`)
- เรียก `listApprovedMessages` แล้วแสดงรายการข้อความในห้องรวม ใหม่สุดก่อน (backend เรียงให้แล้ว ค่าเริ่มต้น 50 รายการ)
- แสดงเฉพาะ `approved` (backend คืนเฉพาะสถานะนี้อยู่แล้ว หน้าจอห้ามกรองหรือดึงข้อความสถานะอื่นมาเอง และห้ามอ่าน Firestore ตรง)
- ไม่แสดงชื่อผู้ส่งตามนโยบาย: แสดง `senderName` เฉพาะเมื่อ backend ส่งช่องนี้มา (เมื่อ `showSenderName = true`) ถ้าไม่มีช่องนี้ไม่แสดงชื่อและไม่แสดงตัวแทนอื่นที่ระบุตัวตนได้ (เช่น id)
- แสดงข้อความด้วย `textContent` เท่านั้น (ข้อความเป็นข้อมูลที่ผู้ใช้เขียน) มีสถานะว่าง ("ยังไม่มีข้อความในห้องรวม") และแสดงข้อความ error ของ backend เมื่อโหลดไม่สำเร็จ

### 8.3 ข้อสังเกตที่ผู้อ่านควรรู้
- **AI ช่วยวิเคราะห์/สรุป** (FR-17 ระดับต่ำ) อยู่ในหน้า review-queue และถือเป็นส่วนเสริมของ Module แต่คีย์ OpenRouter อยู่ฝั่งเบราว์เซอร์ (`web/shared/openrouter-config.js`, git ignore, ไม่ deploy) ผู้ใช้เปิด DevTools เห็นได้ — backlog ระบุเป็นงาน Sprint 2 ที่ยังไม่มีรหัส FR ใช้เพื่อทดลองในเครื่องเท่านั้น
- ข้อมูลทั้งหมดทดสอบกับ emulator ห้ามใส่ข้อมูลจริงของคนอื่นจนกว่าจะจบสัปดาห์ที่ 8 ตาม `ACL.md`
- `chat.js` มีคอมเมนต์ที่หัวไฟล์ระบุช่อง `criteriaId` บน `chatMessages` แต่ไม่มีโค้ดส่วนใดเขียนช่องนี้ (เป็นคอมเมนต์ค้าง ไม่รวมไว้ในตารางข้อมูล)

### 8.4 ไม่ทำใน Module นี้ (ส่งต่อ BACKLOG)

**งาน B — ปุ่ม "ส่งใหม่"** ในรายการ "ข้อความของฉัน"
- แสดงปุ่มเฉพาะข้อความที่ `status = rejected` เปิดช่องกรอกข้อความใหม่ (บังคับ ≤2000 ตัวอักษร ตัดช่องว่าง เหมือนฟอร์มส่งข้อความ) แล้วเรียก `resubmitMessage({ originalId: <id ข้อความที่ถูกปฏิเสธ>, content })`
- สำเร็จ → โหลด "ข้อความของฉัน" ใหม่ ข้อความใหม่ขึ้นสถานะ "รออนุมัติ" พร้อมป้ายส่งใหม่
- แสดงข้อความ error ของ backend ตามเดิม โดยเฉพาะ `failed-precondition` (มีข้อความลูกที่รออนุมัติหรืออนุมัติแล้ว) และ `permission-denied` "ไม่ผ่านเกณฑ์ผู้ส่งข้อความ" (ข้อความเดียวกับที่ฟอร์มส่งข้อความจัดการอยู่แล้ว)
- ซ่อน/ปิดปุ่มกรณีที่หน้าจอรู้อยู่แล้วว่าส่งไม่ได้ (มีข้อความลูกของข้อความนี้ที่ไม่ใช่ `rejected` ในรายการ) เป็นแค่ความสะดวก การตัดสินจริงอยู่ที่ backend
- ไม่แก้เนื้อหาข้อความที่ถูกปฏิเสธ (ปิดถาวร) การส่งใหม่สร้างข้อความใหม่เท่านั้น
- **[ส่งต่อ BACKLOG] โค้ดประเมิน "ผู้ผ่านเกณฑ์" (`eligibilityResults`):** ไม่มีใครเขียน collection นี้ ผู้สมัครเองจึงส่งข้อความไม่ได้ ("ไม่ผ่านเกณฑ์ผู้ส่งข้อความ") จนกว่าจะมีข้อมูล seed หรือโค้ดคำนวณ (FR-27) งานนี้ต้องแก้ backend จึงไม่ทำใน Module นี้
- **[ส่งต่อ BACKLOG] การอ่าน `notifications` ของแชท:** `message_rejected`/`decision_rejected` ถูกเขียนลง `notifications` แต่ไม่มี callable อ่าน ผู้ตรวจที่ตัดสินแล้วถูกปฏิเสธเห็นแค่ error ตอนกด
- **[ส่งต่อ BACKLOG] scheduler ปลดล็อกอัตโนมัติ:** `releaseExpiredLocks` ยังไม่มีตัวตั้งเวลาเรียก (ผลต่อผู้ใช้ไม่เห็นต่างเพราะล็อกหมดอายุถือว่าว่างอยู่แล้ว แค่ audit `unlock_expired` ยังไม่เกิด)
- **ไม่มี operation อ่าน `auditEvents`** ผ่านแอป (บันทึกอย่างเดียว) และหน้า "ประวัติการเปลี่ยนแปลง" ของ Admin อ่านเฉพาะ `configChangeAudits`
- ไม่มียืนยันอีเมล, รีเซ็ต/เปลี่ยนรหัสผ่าน, ล็อกอินผ่านผู้ให้บริการภายนอก (ตาม spec ระบุ out of scope)
- ไม่มีการแก้ไข/ลบข้อความหลังส่ง และไม่มีแชทแบบ real-time/ไฟล์แนบ/รายงานข้อความ
- เกณฑ์ SLA การตรวจและการแจ้งผู้ส่งเมื่ออนุมัติ: spec ยังไม่กำหนด โค้ดไม่ทำ
- **Cloud Functions ยังไม่ได้ deploy** (โปรเจกต์อยู่แผน Spark) deploy แล้วเฉพาะ Hosting, Firestore Rules และ Indexes ฟีเจอร์ของ Module นี้ที่เรียก backend จึงทดสอบกับ emulator เท่านั้น หน้าเว็บบน Hosting จริงจะขึ้น "ระบบหลังบ้านยังไม่เปิดใช้งาน" ที่หน้า login
- **คีย์ AI ยังอยู่ฝั่งเบราว์เซอร์** ไม่ย้ายไปให้ Cloud Function เรียก OpenRouter ใน Module นี้ (ดู 8.3)
