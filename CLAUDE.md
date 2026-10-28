# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## สถานะของโปรเจกต์

โปรเจกต์นี้เริ่มมีซอร์สโค้ดแล้ว (backend ที่ `functions/`, หน้าเว็บ prototype ที่ `web/`, สคริปต์ที่ `scripts/` และ `firebase/`) ควบคู่กับพื้นที่เอกสาร requirements/design ใน `docs/` ความคืบหน้าของแต่ละส่วนไม่เท่ากัน ให้ตรวจสถานะจริงของแต่ละไฟล์ก่อนอ้างอิงหรือแก้ไข อย่าเชื่อคำอธิบายสถานะที่เขียนไว้ในเอกสารฉบับเก่า เอกสารชั้น logical (`architecture.md`, `api-spec.md`, `db-spec.md`) ยังตั้งใจเขียนแบบไม่ผูก tech stack ส่วนการตัดสินใจเรื่อง technology และ mapping ไปยัง Firestore อยู่ที่ `docs/02-design/02-technical/technology-stack.md` (ที่เดียว) **ยังไม่ได้ deploy ขึ้น Firebase จริง** ทุกอย่างทดสอบกับ emulator

## คำสั่งที่ใช้บ่อย

Backend (รันใน `functions/`, ต้องมี Java 21 ขึ้นไปสำหรับ Firestore emulator และ Node 22):

```bash
cd functions && npm install
npm test                                                    # เปิด Firestore emulator แล้วรันทุกเทสต์
firebase emulators:exec --only firestore --project demo-grade-runway "node --test --test-concurrency=1 test/chat.test.js"   # รันไฟล์เดียว (ต้องผ่าน emulators:exec เพราะเทสต์ใช้ Firestore emulator)
npm run emulators                                           # เปิด emulator functions+firestore สำหรับลองมือ
```

ไม่มี lint/build step หน้าเว็บ (`web/admin`, `web/review-queue`, `web/dashboard`) เป็น HTML + ES module ล้วน ไม่มี bundler ทดสอบมือกับ emulator ตามขั้นตอนใน `web/review-queue/README.md` (เปิด emulator รวม auth, รัน `functions/scripts/seed-emulator.js` พร้อมตั้ง `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST`, แล้ว `npx serve web` และเปิด `http://localhost:3000/login/#emulator`) การรันหน้าเว็บกับโปรเจกต์จริงต้องคัดลอก `web/review-queue/firebase-config.example.js` เป็น `firebase-config.js` (ถูก git ignore)

## สถาปัตยกรรมโค้ด

- **Client ไม่แตะ Firestore ตรง** หน้าใน `web/` เรียก callable function เท่านั้น ยกเว้น Security Rules (`firebase/firestore.rules`) ที่อนุญาตเฉพาะ `lecturer`/`admin` ที่ `active` อ่าน `chatMessages` ตรง การเขียนทุกอย่างและ collection อื่นปฏิเสธทั้งหมด (NFR-04, NFR-06 ต้องการให้ backend กรองข้อความที่ยังไม่อนุมัติและตัดชื่อผู้ส่ง)
- **รูปแบบ handler:** logic อยู่ใน `functions/lib/*.js` เป็นฟังก์ชัน `(db, auth, data)` ที่ทดสอบกับ emulator ได้โดยตรง `functions/index.js` ห่อแต่ละตัวด้วย `wrap()` เป็น callable ฟังก์ชันใหม่ที่ client เรียกต้อง export ใน `index.js` ด้วย (`test/exports.test.js` ตรวจเรื่องนี้)
- **สิทธิ์:** ตัวตนมาจาก Firebase Auth แต่บทบาทอ่านจาก `users/{uid}.roles` (`student`/`advisor`/`lecturer`/`admin`) ผ่าน `lib/access.js` (`requireActiveUser`, `requireRole`) id เอกสาร `users` ต้องเท่ากับ Auth uid การอ่านข้อมูลผู้เรียนต้องผ่าน `requireLearnerAccess` ใน `lib/learners.js`
- **Audit:** การเปลี่ยนค่าตั้งต้นและบัญชีบันทึกลง `configChangeAudits` ผ่าน `lib/audit.js` และการตัดสินข้อความลง `auditEvents` ในธุรกรรมเดียวกับการเปลี่ยนสถานะ ทั้งสอง collection เพิ่มอย่างเดียว
- **แชทที่ผ่านการตรวจ** (`lib/chat.js`): ล็อก token ของผู้ตรวจเก็บแยกที่ `reviewLocks/{messageId}` (client อ่านไม่ได้) ไม่เก็บบนเอกสารข้อความ คำตัดสินเป็นฟิลด์ `decision` ส่งใหม่หลังถูกปฏิเสธได้ครั้งละหนึ่งผ่านฟิลด์ `resubmitOfId`
- **ข้อมูลการเรียน:** `lib/sync.js` นำเข้าข้อมูลแบบไม่ผูกแหล่ง (`importLearningData`) บันทึก `syncRuns`/`syncState` และ `lib/risk.js` ประเมินความเสี่ยงด้วยกฎ threshold (`lib/thresholds.js`) ยังไม่มี scheduler ตั้งเวลาอัตโนมัติ

## ระบบ Grade Runway (โค้ด)

ระบบติดตามความเสี่ยงการเรียนของผู้เรียน + แชทแนะนำแนวทางการเรียนระหว่างนักศึกษาที่ผ่านการตรวจของอาจารย์/Admin ก่อนเผยแพร่ ข้อมูลในหัวข้อนี้อ่านจากโค้ดใน `functions/`, `web/` และ `firebase/` (ไม่ได้มาจาก spec) ถ้าโค้ดเปลี่ยนให้แก้ที่นี่ด้วย

### โครงสร้างโฟลเดอร์
- `web/login/` หน้าเข้าสู่ระบบ/สมัครบัญชี (Firebase Auth) ทุกหน้าอื่นเด้งมาที่นี่ถ้าไม่ล็อกอิน และหลังล็อกอินไปหน้าตามบทบาท (admin → `admin/`, lecturer → `review-queue/`, นอกนั้น → `dashboard/`) เรียก `registerSelf`/`getMyProfile`
- `web/shared/nav.js` ฟังก์ชันนำทางที่หน้าต่าง ๆ ใช้ร่วมกัน (`homeFor`, `goHome`, `goToLogin` คง hash `#emulator`) ทุกหน้าต้อง serve จาก `web/` เพราะ import ข้ามโฟลเดอร์
- `web/admin/` หน้า Admin: นโยบายระบบ, กฎ threshold, นำเข้าข้อมูลการเรียน, บัญชีและบทบาท, ความสัมพันธ์ครู-ผู้เรียน (กำหนด/ยุติ/โอน + ตารางความสัมพันธ์ที่มีอยู่ทั้ง `active` และ `ended` จาก `listAssignments`), ประวัติการเปลี่ยนแปลง
- `web/dashboard/` หน้าผู้เรียน (ดูสถานการณ์การเรียนของตน) และครูที่ปรึกษา (ดูผู้เรียนในความดูแล อ่านอย่างเดียว) บัญชีที่มีบทบาท `student` เห็นฟอร์มส่งข้อความแนะนำ (`sendMessage`) และรายการข้อความของตน (`listMyMessages`: สถานะ + เหตุผลถ้าถูกปฏิเสธ ไม่มีข้อมูลผู้ตรวจ) ฟอร์มตัดสินว่าแสดงหรือไม่จาก `getMyProfile`
- `web/review-queue/` หน้าผู้ตรวจ (lecturer/admin): ล็อกข้อความ ระบุเชิงลบ/ไม่เชิงลบ อนุมัติ/ปฏิเสธ ปลดล็อก และเก็บ `firebase-config.js` ที่สามหน้าใช้ร่วมกัน
- `functions/lib/` logic ทั้งหมดของ backend แยกตามเรื่อง: `access` (สิทธิ์), `accounts`, `register` (สมัครเอง/อ่านโปรไฟล์ตน), `chat`, `sync`, `risk`, `thresholds`, `policy`, `situation`, `learners`, `history`, `audit`, `errors`, `migrate-locks`
- `firebase/firestore.rules` Security Rules (ทดสอบใน `functions/test/rules.test.js`)

### Collection ใน Firestore (ที่โค้ดใช้จริง)
| Collection | ช่องสำคัญ |
|---|---|
| `users/{authUid}` | `name`, `email`, `roles[]`, `status`, `source` (`admin` | `self`) |
| `advisorAssignments` | `advisorId`, `learnerId`, `advisorName`, `learnerName`, `status`, `source` |
| `chatMessages` | `senderId`, `senderName`, `content`, `status`, `sentAt`, `resubmitOfId`, `decision {reviewerId, outcome, negative, reason, at}` |
| `reviewLocks/{messageId}` | `holderId`, `token`, `expiresAt` (มีเฉพาะตอนถูกล็อก) |
| `auditEvents` | `type` (`lock`, `resubmit`, `review_decision`, `decision_rejected`, `unlock_manual`, `unlock_expired`), `at` |
| `configChangeAudits` | `category` (`account`, `advisorAssignment`, `systemPolicy`, `threshold`), `action`, `targetId`, `actorId`, `before`, `after`, `at` |
| `notifications` | `recipientId`, `type` (`message_rejected`, `decision_rejected`, `risk`, `syncFailed`), `reason`, `read`, `at` |
| `eligibilityResults/{learnerId}` | `eligible` (โค้ดอ่านอย่างเดียว ยังไม่มีโค้ดที่เขียน ข้อมูลมาจาก seed) |
| `systemPolicy/current` | `syncIntervalMinutes`, `lockDurationMinutes`, `showSenderName`, `maxMissingImportPercent` |
| `riskThresholdRules` | `variable` (`grade`, `attendance`, `assignment`, `trend`), `name`, `threshold` |
| `gradeRecords`, `attendanceRecords`, `assignmentRecords` | `learnerId`, `course`, `period` + `grade` / `rate` / `required`+`submitted`, `syncRunId` |
| `syncRuns` | `outcome`, `startedAt`, `finishedAt`, `counts`, `errors`, `source`, `actorId` |
| `syncState/current` | `status`, `lastSuccessAt`, `lastRunId` |
| `riskAssessments` | `learnerId`, `assessedAt`, `trend`, `atRisk`, `basicOnly`, `findings`, `notified` |
| `recommendations/{assessmentId}` | `learnerId`, `assessmentId`, `text`, `basic` |

### ค่าสถานะ
- `chatMessages.status`: `pending` → `approved` | `rejected` (ตั้งโดย `decideMessage` ครั้งเดียว `decision.outcome` เป็น `approve` | `reject`)
- `users.status`: `active` | `disabled` (ปิดแล้วทำ operation ใดไม่ได้)
- `advisorAssignments.status`: `active` | `ended` (ยุติ/โอนตั้งเป็น `ended` ไม่ลบเอกสาร)
- `syncState.status`: `normal` | `stale` (ซิงก์ล้มเหลวแต่เคยสำเร็จ) | `waiting` (ล้มเหลวและไม่เคยสำเร็จ)
- `syncRuns.outcome`: `success` | `failedWithPrevious` | `failedFirst`
- `riskAssessments.trend`: `insufficient` | `declining` | `improving` | `steady`

### บทบาทใน `users.roles` (array เลือกได้หลายบทบาท)
- `student` ผู้เรียน (บัญชีที่สมัครเองได้บทบาทนี้บทบาทเดียว ผ่าน `registerSelf`): ส่ง/ส่งใหม่ข้อความ (ต้อง `eligibilityResults.eligible` เป็นจริง) ดูสถานการณ์ของตน
- `advisor` ครู/อาจารย์ที่ปรึกษา: ดูเฉพาะผู้เรียนที่มี `advisorAssignments` เป็น `active`
- `lecturer` อาจารย์ผู้ตรวจ: ล็อก/ตัดสิน/ปลดล็อกข้อความ และอ่าน `chatMessages` ตรงได้ตาม Rules
- `admin` ผู้ดูแลระบบ: สิทธิ์ผู้ตรวจเท่ากับ `lecturer` และจัดการบัญชี ความสัมพันธ์ นโยบาย threshold นำเข้าข้อมูล

### ข้อห้าม
- หน้าเว็บห้ามเขียน Firestore ตรง ต้องผ่าน callable function เท่านั้น (Rules ปฏิเสธการเขียนทุกอย่างอยู่แล้ว) และหน้าเว็บอ่าน `users` ตรงไม่ได้ ใช้ `getMyProfile` อ่านโปรไฟล์ตนเอง
- `registerSelf` รับแค่ `name` ห้ามรับ role/status/uid จาก client และห้ามเขียนทับ `users/{uid}` ที่มีอยู่ (สมัครเองได้เฉพาะ `student`) สมัครซ้ำตอบ `{result: "exists"}` ไม่ใช่ error และไม่บันทึก audit; `getMyProfile` ตอบ `not-found` เมื่อยังไม่มีบัญชี และ `permission-denied` เมื่อบัญชีถูกปิด
- `decideMessage` แก้ได้แค่ `status` กับ `decision` ของข้อความ ห้ามแตะ `content`, `senderId`, `senderName`, `sentAt`, `resubmitOfId` (มีเทสต์ใน `chat.test.js` คุมไว้)
- ห้าม commit `web/review-queue/firebase-config.js`, ไฟล์ `.env`/`.env.*` และ service account key (`.gitignore` ครอบคลุม `firebase-config.js`, `serviceAccount*.json`, `*.json.key` แต่**ยังไม่ครอบคลุม `.env`**)
- ห้ามแก้ `firebase/firestore.rules` ให้หลวมลง (เช่น ให้ client เขียนได้ หรือให้ `student` อ่าน `chatMessages` ตรง) ต้องผ่าน `functions/test/rules.test.js` และบอกผู้ใช้ก่อนเสมอ
- ข้อความที่ `rejected` ห้ามแก้ ปิดถาวร ผู้ส่งต้องสร้างข้อความใหม่ผ่าน `resubmitMessage` (ครั้งละหนึ่ง)
- `auditEvents` และ `configChangeAudits` เพิ่มอย่างเดียว ห้ามลบหรือแก้ (เขียนใน transaction เดียวกับการเปลี่ยนข้อมูลเสมอ)

## ภาพรวมระบบที่กำลังวางแผน

เอกสารข้อกำหนด (ไฟล์ Markdown ใน `docs/01-requirements/01-spec/` — อาจมีมากกว่า 1 ไฟล์ตามความต้องการที่ทยอยเพิ่มเข้ามา ให้ดูรายการไฟล์จริงในโฟลเดอร์นี้แทนการอ้างชื่อไฟล์เจาะจง) คือแหล่งอ้างอิงเดียวที่บอกว่าระบบที่กำลังวางแผนคือระบบอะไร มีขอบเขตแค่ไหน และมีบทบาทผู้ใช้แบบใด **ห้ามสมมติโดเมนหรือฟีเจอร์ของระบบจากความจำหรือจากตัวอย่างโปรเจกต์อื่น** ให้เปิดอ่านไฟล์ spec จริงก่อนตอบคำถามเกี่ยวกับภาพรวมระบบเสมอ (ส่วนที่พัฒนาเป็นโค้ดแล้วสรุปไว้ที่หัวข้อ "ระบบ Grade Runway (โค้ด)" ด้านบน แต่ขอบเขตและความต้องการยังต้องยึด spec จริงเสมอ)

กติกาที่คงที่ไม่ว่าโดเมนของระบบจะเป็นอะไร (มาจากรูปแบบของเอกสารทั้งวอลต์ ไม่ใช่จากตัวระบบที่วางแผนอยู่):
- ทุกความต้องการเชิงฟังก์ชัน/ไม่ใช่เชิงฟังก์ชันมีรหัสกำกับ (`FR-xx` / `NFR-xx`) และระดับความสำคัญ (สูง/กลาง/ต่ำ โดย "สูง" คือสิ่งที่ต้องมีใน MVP) — ดูสรุปล่าสุดที่ `docs/01-requirements/backlog.md`
- เอกสารทุกชั้นอ้างอิงกันด้วย `[[wikilink]]` แบบ Obsidian และควรอ้างอิงกลับไปยัง spec ต้นทางเสมอ
- ให้ตรวจสถานะจริงของ spec ก่อนอ้างอิงหรือแก้ไข อย่าเชื่อคำอธิบายภาพรวมระบบที่เคยเขียนไว้ในเอกสารฉบับเก่า (รวมถึงหัวข้อนี้เอง หากมีใครเติมรายละเอียดเจาะจงไว้ในอนาคตแล้วโดเมนถูกเปลี่ยนภายหลัง)

## โครงสร้างพื้นที่เอกสาร (`docs/`)

โปรเจกต์นี้ใช้รูปแบบโฟลเดอร์แบ่งตามขั้นตอน SDLC โดยมีลำดับเลขนำหน้า เมื่อสร้างเอกสารใหม่ ให้ใส่ในโฟลเดอร์ขั้นตอนที่ตรงกัน อย่าสร้างตำแหน่งใหม่เอง:

```
docs/
  00-archived/                    เอกสารที่เลิกใช้/ถูกแทนที่แล้ว
  01-requirements/
    01-spec/                      เอกสารความต้องการทุกฉบับ (1 ไฟล์ต่อ 1 requirement/หัวข้อ ตั้งชื่อแบบ `YYYYMMDD-NN-<slug>.md`) — ดูรายการไฟล์จริงในโฟลเดอร์นี้เสมอ อาจมีมากกว่า 1 ไฟล์
    02-plan/
      release-plan.md              แผนแบ่ง phase/release ก่อนเริ่ม dev จริง (จัดกลุ่ม FR/NFR ตามลำดับที่ควรทำก่อน-หลัง พร้อมเหตุผล)
    03-task/
      {phase-slug}-tasks.md         การแตกงานย่อยระดับ implementation ต่อ phase (อ้างอิง release-plan.md) เขียนแบบไม่ผูก tech stack จนกว่าจะมีการตัดสินใจจริง
    backlog.md                    Backlog รวม FR/NFR ทั้งหมดจากทุกไฟล์ใน 01-spec/ (ตรวจสถานะ/เนื้อหาจริงในไฟล์ก่อนอ้างอิง)
  02-design/
    01-prototypes/<date>-<n>-<version>/   โฟลเดอร์ Prototype แบบมีวันที่และเวอร์ชัน (HTML mockup, prototype.md)
    02-technical/
      architecture.md              สถาปัตยกรรมระดับ logical/conceptual (component, data flow) — ไม่ผูก tech stack จนกว่า technology-stack.md จะถูกตัดสินใจ
      api-spec.md                  สัญญา API เชิง logical (resource/operation/request-response) ไม่ผูก framework
      db-spec.md                   โมเดลข้อมูลเชิง logical (entity/attribute/ความสัมพันธ์) ไม่ผูก database engine
      detailed-design/{feature-slug}.md   การออกแบบระดับ component ต่อฟีเจอร์ อ้างอิง api-spec.md/db-spec.md
      nfr-review.md                ตรวจสอบว่าการออกแบบ (architecture/api-spec/db-spec/detailed-design) รองรับทุก NFR ใน backlog หรือไม่
      technology-stack.md          ยังไม่ตัดสินใจ — รอจนกว่าจะเริ่มพัฒนาจริง
    feature-list.md
    user-journey.md
    DESIGN.md                     Design System หลัก (สี, ตัวอักษร, ระยะห่าง, องค์ประกอบ UI) — อ้างอิงก่อนทำ Prototype ใน 01-prototypes/
  03-testing/
    01-test-plan/
      acceptance-criteria.md      เกณฑ์ยอมรับ (Given-When-Then) ต่อ FR/NFR จัดกลุ่มตาม feature-list
      test-plan.md                 ภาพรวมกลยุทธ์ทดสอบ 1 ไฟล์ต่อโปรเจกต์ (scope, ประเภทการทดสอบ, environment, entry/exit criteria)
      test-cases/{feature-slug}.md Test case แบบ step-by-step ต่อฟีเจอร์ อ้างอิง acceptance-criteria.md
    02-test-result/                ผลการรันทดสอบจริง — ยังไม่มีเอกสาร/agent ดูแล เพราะโปรเจกต์ยังไม่มีซอร์สโค้ดให้ทดสอบจริง
  04-retrospectives/
  05-log/
  .obsidian/                      Vault นี้เปิด/แก้ไขด้วย Obsidian — Markdown + wikilink คือรูปแบบหลักของพื้นที่นี้เช่นกัน
```

ไฟล์ในโฟลเดอร์ที่มีวันที่ (เช่น prototypes) ใช้รูปแบบชื่อ `YYYYMMDD-NN-<slug>` ให้คงรูปแบบนี้ต่อไปเมื่อสร้างไฟล์ใหม่ที่มีวันที่กำกับ เพื่อให้เรียงตามลำดับเวลาได้ถูกต้อง

เนื่องจาก `docs/` เป็น Obsidian vault เมื่อเพิ่มเนื้อหาใหม่ ควรใช้การอ้างอิงข้ามเอกสารแบบ `[[wikilink]]` (ไม่มีไฟล์ `index.md` ต่อโฟลเดอร์ ให้ลิงก์ไปไฟล์จริง เช่น `[[../backlog|Backlog]]`)

### ข้อตกลงที่ใช้จริงในเอกสารที่มีอยู่แล้ว (ตรวจจากไฟล์ใน `docs/` ล่าสุด)
- รหัส `FR-xx`/`NFR-xx` เป็นเลขสองหลักและ**ต่อเนื่องข้ามทุกไฟล์ spec** (ไม่เริ่มนับใหม่ต่อไฟล์) เมื่อนำเข้า spec ที่มีรหัสของตัวเอง ให้แปลงรหัสต่อจากเลขสูงสุดใน `backlog.md` แล้วระบุ mapping ใน log
- ระดับความสำคัญใน spec/backlog ใช้ สูง/กลาง/ต่ำ (แปลงจาก Must/Should/Could ของต้นฉบับ) ถ้าต้นฉบับไม่ระบุระดับของ NFR ให้เสนอเองและหมายเหตุว่า "รอผู้ใช้ยืนยัน"
- `backlog.md` จัดตารางตามระดับ (สูง/กลาง/ต่ำ) คอลัมน์ รหัส / หัวข้อ / เอกสารอ้างอิง (wikilink พร้อมหัวข้อ) / สถานะ
- Log รายวันอยู่ที่ `docs/05-log/YYYYMMDD-log.md` ตามวันที่ทำงานจริง

## เครื่องมืออัตโนมัติดูแลความสอดคล้องของเอกสาร (agents & skills)

โปรเจกต์นี้มี custom agents ใน `.claude/agents/` และ skills ใน `.claude/skills/` สำหรับสร้าง/ตรวจสอบความสอดคล้องของเอกสารแต่ละชั้นให้ตรงกับชั้นก่อนหน้าเสมอ ตามลำดับ: spec → `backlog.md` → `feature-list.md`/`user-journey.md` → แตกแขนงขนานกัน 3 สาย (technical spec ใน `02-technical/`, test plan ใน `03-testing/`, prototype ใน `01-prototypes/`) → phase plan ใน `01-requirements/02-plan/`+`03-task/` เมื่อผู้ใช้ขอให้ทำงานที่ตรงกับหน้าที่ของ skill ใดอยู่แล้ว **ให้เรียกใช้ skill/agent นั้นแทนการแก้ไฟล์เอกสารตรงๆ เอง** เพื่อให้การตรวจสอบ cross-file consistency และการบันทึกสรุปงานลง `docs/05-log/{YYYYMMDD}-log.md` เป็นไปตามรูปแบบเดิมของโปรเจกต์

จุดเริ่มต้นที่ใช้บ่อย:
- `/capture-requirement` — แปลง requirement ดิบจากผู้ใช้เป็นเอกสาร spec ใหม่/แก้ไขของเดิม พร้อมอัปเดต backlog
- `/audit-backlog`, `/sync-feature-journey`, `/sync-technical-spec` (รวม architecture → api-spec/db-spec → detailed-design → nfr-review), `/sync-test-plan`, `/sync-phase-plan`, `/build-prototype` — ตรวจสอบและ sync เอกสารแต่ละชั้นให้ตรงกับชั้นก่อนหน้า
- `/run-requirements-phase`, `/run-technical-phase`, `/run-prototype-phase` — รวมหลายขั้นตอนที่เกี่ยวข้องกันไว้ในคำสั่งเดียว
- `/audit-pipeline` — ตรวจสอบความสอดคล้องทั้งสายงานตั้งแต่ spec ถึงปลายทางในคำสั่งเดียว

## แนวทางการทำงานในโปรเจกต์นี้ตอนนี้

- ให้ยึดเอกสารทั้งหมดใน `docs/01-requirements/01-spec/` (ไม่ใช่ไฟล์ใดไฟล์หนึ่งโดยเฉพาะ) เป็นแหล่งอ้างอิงหลักของความต้องการเชิงฟังก์ชัน/ไม่ใช่เชิงฟังก์ชัน (รหัส FR-xx / NFR-xx) — ใช้รหัสเหล่านี้อ้างอิงเมื่อพูดคุยหรือวางแผนฟีเจอร์ และให้ตรวจ `docs/01-requirements/backlog.md` เพื่อดูสรุป FR/NFR ล่าสุดทั้งหมดก่อนเสมอ
- เอกสารออกแบบเชิงเทคนิคใน `docs/02-design/02-technical/` (`architecture.md`, `api-spec.md`, `db-spec.md`, `technology-stack.md` และไฟล์ใน `detailed-design/`) หากยังไม่มีไฟล์หรือยังว่างเปล่า หากถูกขอให้ช่วยออกแบบระบบ ให้สร้าง/เติมเนื้อหาลงในไฟล์เหล่านี้ตามตำแหน่งที่ระบุไว้ในโครงสร้างด้านบน ไม่ควรสร้างเอกสารคู่ขนานแยกที่อื่น
- `docs/02-design/DESIGN.md` คือแหล่งอ้างอิงหลัก (single source of truth) ของ Design System เชิงภาพ (สี, ตัวอักษร, ระยะห่าง, องค์ประกอบ UI, accessibility) — เมื่อสร้างหรือแก้ไข Prototype ใดๆ ใน `01-prototypes/` ให้ยึด token และกติกาใน `DESIGN.md` เสมอ ห้ามกำหนดสี/สไตล์ใหม่นอกเอกสารนี้โดยไม่จำเป็น หากพบว่า Design System ต้องเปลี่ยน ให้แก้ที่ `DESIGN.md` ก่อน แล้วค่อยสะท้อนไปยัง Prototype
- เมื่อเพิ่มคำสั่ง build/lint หรือเปลี่ยนโครงสร้างโค้ด ให้อัปเดตหัวข้อ "คำสั่งที่ใช้บ่อย" และ "สถาปัตยกรรมโค้ด" ด้านบน
