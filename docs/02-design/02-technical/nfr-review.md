# NFR Review

ผลตรวจว่าการออกแบบเชิงเทคนิครองรับ NFR ทุกตัวใน [[../../01-requirements/backlog|Backlog]] หรือไม่ เทียบกับ [[architecture]], [[api-spec]] (OP-01..OP-43), [[db-spec]] และ 26 ไฟล์ใน `detailed-design/` (ตรวจซ้ำรอบ 2 เมื่อ 2026-10-17 หลัง architecture เพิ่มโมดูล System Settings และปรับ detailed-design) เอกสารนี้ตรวจและรายงานอย่างเดียว ไม่ได้แก้เอกสารเชิงเทคนิคใดๆ และไม่ระบุ technology

## 1. ตารางสรุป

| รหัส NFR | คำอธิบายสั้น | สถานะ | เอกสาร/ส่วนที่พบ | สิ่งที่ยังขาด | แนะนำให้รันต่อ |
|----------|--------------|-------|--------------------|----------------|-----------------|
| NFR-01 | ความเป็นส่วนตัว (PDPA, จำกัดการมองเห็นตามบทบาท) | รองรับบางส่วน | [[architecture#5. NFR Mapping\|architecture NFR Mapping]], [[architecture#2. Logical Component\|โมดูล Access Control]], [[api-spec#1. กติกากลางของทุก Operation\|api-spec กติกากลาง]] (ERR-FORBIDDEN, ERR-ACCOUNT-DISABLED), OP-09..OP-12, OP-28..OP-43 (Admin เท่านั้น), [[db-spec#3.3 AdvisorAssignment (ความสัมพันธ์ครู-ผู้เรียนในความดูแล)\|AdvisorAssignment]], UserRole, [[detailed-design/data-privacy]] | การจำกัดการมองเห็นตามบทบาทออกแบบครบทุกชั้น ส่วนที่ขาดคือนโยบาย PDPA ที่ต้องยืนยันและระยะเวลาเก็บข้อมูล (ไม่มี attribute วันหมดอายุ) ซึ่ง spec ยังเป็นคำถามเปิด ไม่ใช่ช่องว่างของเอกสารเทคนิค | `capture-requirement` ให้ผู้ใช้ตอบนโยบาย PDPA/ระยะเวลาเก็บ แล้วค่อย `sync-architecture` และ `sync-api-db` (ยังไม่ควรเดาเอง) |
| NFR-02 | อธิบายได้ว่าเข้าเงื่อนไขใด | รองรับแล้ว | [[architecture#5. NFR Mapping\|NFR Mapping]], [[api-spec#OP-07 ประเมินความเสี่ยงผู้เรียน\|OP-07]] ข้อ 3, OP-08, OP-09, OP-12, [[db-spec#3.11 RiskFinding (เงื่อนไขที่เข้า — เหตุผลของผลประเมิน)\|RiskFinding]] (สำเนา threshold ค่าที่ตรวจพบ คำอธิบายเหตุผล), [[detailed-design/risk-assessment]], [[detailed-design/threshold-config]] | ไม่มี | ไม่ต้อง |
| NFR-03 | ความทันสมัยของข้อมูล (ความถี่ซิงก์ยังไม่กำหนด) | รองรับแล้ว | [[architecture#5. NFR Mapping\|NFR Mapping]] (Scheduler, Sync Manager, System Settings), [[architecture#2. Logical Component\|System Settings]] เจ้าของความถี่ (Scheduler อ่าน), [[db-spec#3.5 SystemPolicy (นโยบายระบบที่ตั้งค่าได้)\|SystemPolicy.ความถี่รอบซิงก์]] (ว่างได้ ไม่ฝังตายตัว), [[api-spec#OP-02 ตั้งค่านโยบายระบบ\|OP-02]], OP-43, OP-06, [[db-spec#3.8 SyncState (สถานะข้อมูลปัจจุบัน)\|SyncState]], [[detailed-design/data-sync]] (Scheduler อ่านจาก System Settings ยังไม่ตั้งไม่กระตุ้นรอบ) | ไม่มี (ค่าความถี่จริงเป็นคำถามเปิดของ spec ออกแบบให้ตั้งได้และ audit แล้ว) | ไม่ต้อง |
| NFR-04 | ผู้รับไม่เห็นข้อความที่ยังไม่อนุมัติ/ถูกปฏิเสธ | รองรับแล้ว | [[architecture#5. NFR Mapping\|NFR Mapping]], architecture 4.5-4.7 และหัวข้อ 6 ประเด็น 1-2 (lock token, จุดอ่านเดียว), [[api-spec#OP-18 อ่านห้องรวม\|OP-18]] (กรองที่ Backend ไม่ส่ง field ผู้ส่งเมื่อซ่อนชื่อ), [[api-spec#OP-20 ล็อกข้อความเพื่อตรวจ\|OP-20]], [[api-spec#OP-22 ส่งคำตัดสินข้อความ\|OP-22]] (หน่วยการทำงานเดียว ข้อ 1-5), [[db-spec#3.15 ChatMessage (ข้อความในห้องรวม)\|ChatMessage]] กฎเปลี่ยนสถานะ, [[db-spec#3.16 ReviewLock (ล็อกข้อความระหว่างตรวจ พร้อม lock token)\|ReviewLock]], [[detailed-design/shared-room-visibility]], [[detailed-design/duplicate-review-lock]], [[detailed-design/reject-decision-without-valid-lock]] | ไม่มี | ไม่ต้อง |
| NFR-05 | audit trail ของการตรวจข้อความ | รองรับแล้ว | [[architecture#5. NFR Mapping\|NFR Mapping]], architecture 4.5-4.6, OP-20 ข้อ 3-4 (audit ล็อกเดิมที่เลยเวลา), OP-22 ข้อ 3 และ 5, OP-24, OP-25, OP-26, [[db-spec#3.19 AuditEvent (ประวัติการตรวจ แบบเพิ่มอย่างเดียว)\|AuditEvent]] (เพิ่มอย่างเดียว), [[detailed-design/review-audit-trail]], [[detailed-design/reject-decision-without-valid-lock]] | ไม่มี (สังเกต: กรณี OP-22 ข้อ 5 บันทึก AuditEvent+Notification ล้มเหลว ผลปฏิเสธยังมีผล เป็นการตัดสินใจโดยตั้งใจ ไม่ใช่ช่องว่าง) | ไม่ต้อง |
| NFR-06 | การแสดงชื่อผู้ส่ง (ยังไม่กำหนด) | รองรับแล้ว | [[architecture#5. NFR Mapping\|NFR Mapping]] (Peer Chat Manager, System Settings), 4.7 และหัวข้อ 6 ประเด็น 4, 7, [[db-spec#3.15 ChatMessage (ข้อความในห้องรวม)\|ChatMessage.ผู้ส่ง]] จำเป็นเสมอ, SystemPolicy.นโยบายแสดงชื่อผู้ส่ง (ค่าเริ่มต้นชั่วคราว ซ่อนชื่อ), OP-02, OP-18, OP-43, [[detailed-design/sender-identity-display]] (AC → System Settings, Peer Chat Manager อ่านนโยบาย), [[detailed-design/shared-room-visibility]] | ไม่มี (ผู้กำหนดนโยบายยังเป็น Admin ชั่วคราว ตามข้อสมมติฐานใน api-spec หัวข้อ 11) | ไม่ต้อง |
| NFR-07 | audit trail การเปลี่ยนบัญชี/บทบาท/ความสัมพันธ์/เกณฑ์ผ่านเกณฑ์/ค่าตั้งการเชื่อมต่อ/นโยบายระบบ/threshold | รองรับแล้ว | architecture: [[architecture#2. Logical Component\|โมดูล System Settings และ Audit Recorder]], 4.1, [[architecture#5. NFR Mapping\|แถว NFR-07]], [[architecture#6. บันทึกการตัดสินใจเชิงสถาปัตยกรรม\|หัวข้อ 6 ประเด็น 7]] / api-spec: กติกากลางข้อ 16, [[api-spec#OP-01 ตั้งค่าการเชื่อมต่อระบบเดิม\|OP-01]], [[api-spec#OP-02 ตั้งค่านโยบายระบบ\|OP-02]], [[api-spec#OP-03 ตั้งค่า threshold ความเสี่ยง\|OP-03]], OP-27, OP-29..OP-31, OP-33..OP-37, [[api-spec#OP-41 ดูประวัติการเปลี่ยนบัญชี บทบาท ความสัมพันธ์ เกณฑ์ ค่าตั้งการเชื่อมต่อ นโยบายระบบ และ threshold\|OP-41]] / db-spec: [[db-spec#3.22 ConfigChangeAudit (ประวัติการเปลี่ยนบัญชี บทบาท ความสัมพันธ์ และเกณฑ์ แบบเพิ่มอย่างเดียว)\|ConfigChangeAudit]] 7 หมวด / [[detailed-design/config-change-audit]] | ไม่มีช่องว่างที่ต้องแก้ ข้อสังเกตเล็กน้อยดูหัวข้อ 2.1 (ไม่กระทบสถานะ) | ไม่ต้อง |

สรุปจำนวน: NFR ที่ตรวจ 7 ตัว รองรับแล้ว 6 ตัว (NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07) รองรับบางส่วน 1 ตัว (NFR-01 ต้นเหตุอยู่ที่ spec ไม่ใช่เอกสารเทคนิค) ยังไม่รองรับ 0 ตัว

## 2. ประเด็นที่ตรวจเป็นพิเศษ

### 2.1 NFR-07 ช่องว่างข้อ 1-5 จากรอบก่อน ปิดแล้วจริงหรือไม่ (ตรวจจากไฟล์จริง)

| ข้อ | ช่องว่างรอบก่อน | ผลตรวจรอบนี้ |
|-----|------------------|---------------|
| 1 | ไม่มีโมดูลเจ้าของ SystemPolicy/OP-02 | ปิดแล้ว: architecture มีโมดูล System Settings (ตารางโมดูล, Component Diagram, หัวข้อ 6 ประเด็น 7 ทางที่ผู้ใช้เลือก A) เป็นเจ้าของ 4 ค่าและส่ง audit ให้ Audit Recorder ในหน่วยการทำงานเดียวกับการเก็บค่า Sync Manager/Scheduler, Review Manager, Peer Chat Manager อ่านค่า |
| 2 | แถว NFR-07 ไม่มี Review Manager | ปิดแล้ว: แถวนี้ระบุ Audit Recorder เป็นผู้บันทึก เจ้าของค่าแต่ละหมวดเป็นผู้ส่ง (IR, EV, Sync Manager OP-01, Threshold Config OP-03, System Settings OP-02) และระบุผู้อ่านค่าตั้ง รวม Review Manager (ระยะเวลาล็อก) และ Peer Chat Manager (นโยบายแสดงชื่อ) |
| 3 | ไม่มีเส้น AC → SM | ปิดแล้ว: Component Diagram มี AC → SM และ AC → SS พร้อมเส้นอ่านนโยบายจาก SM/RM/PC/Scheduler → SS |
| 4 | 4.1 ให้ RE บันทึก audit threshold | ปิดแล้ว: 4.1 เป็น AD → TC → DS และ TC → AR (ไม่มี RE → AR เหลือ) และ OP-02 เป็น AD → SS → DS/AR ตรงกับตารางโมดูลและ [[detailed-design/threshold-config]] |
| 5 | ตาราง NFR Mapping หลุดรูปและประโยคซ้ำ | ปิดแล้ว: แถว NFR-01..NFR-07 ต่อเนื่องเป็นตารางเดียว และหมายเหตุท้ายหัวข้อ 5 เหลือประโยคเดียว |

ความสอดคล้องของเส้นทาง audit ข้าม architecture กับ detailed-design (ตรวจแล้วตรงกัน):
- OP-01: Sync Manager → Audit Recorder ([[architecture#4.1 ซิงก์ข้อมูล ประเมินความเสี่ยง และตั้งค่า threshold|4.1]], [[detailed-design/config-change-audit]], [[detailed-design/data-sync]])
- OP-02: Access Control → System Settings → Audit Recorder (4.1, config-change-audit, data-sync, sender-identity-display, stuck-review-unlock) ไม่พบเส้นเดิม AC → DS หรือ SM → AR สำหรับ OP-02 เหลืออยู่
- OP-03: Threshold Config → Audit Recorder (4.1, config-change-audit, threshold-config)
- บัญชี/บทบาท/ความสัมพันธ์: Identity & Role Manager → Audit Recorder, เกณฑ์ผู้ผ่านเกณฑ์: Eligibility Evaluator → Audit Recorder (4.8 และ config-change-audit)
- 4.6 (Review Manager อ่านระยะเวลาล็อกจาก System Settings), 4.7 (Peer Chat Manager อ่านนโยบายแสดงชื่อจาก System Settings), stuck-review-unlock, duplicate-review-lock, shared-room-visibility, user-account-role-management (Sync Manager อ่านเกณฑ์สัดส่วนจาก System Settings) สอดคล้องกัน และ config-change-audit ข้อ 5 เปลี่ยนเป็นไม่มีช่องว่างแล้ว
- api-spec/db-spec ยังสอดคล้อง: OP-01/02/03 บันทึก ConfigChangeAudit ในหน่วยการทำงานเดียว OP-02 ครอบคลุม 4 field ConfigChangeAudit 7 หมวด เพิ่มอย่างเดียว ผู้อ่านเฉพาะ Admin (OP-41) ความลับไม่ถูกคัดลอก

ข้อสังเกตเล็กน้อยที่เหลือ (ไม่กระทบสถานะ ไม่ใช่ช่องว่างของ NFR): แถว Review Manager และ Peer Chat Manager ในตารางโมดูล ไม่ได้เขียนว่าอ่านค่าตั้งจาก System Settings ตรงๆ (ระบุแล้วในแถว System Settings, Component Diagram, 4.6, 4.7 และ NFR Mapping) และ sequence 4.6/4.7/4.8 ไม่ประกาศ System Settings เป็น participant ใช้ข้อความในขั้นตอนแทน ถ้าต้องการให้เหมือนกันทุกจุดค่อยรัน `sync-architecture` เป็นงานปรับถ้อยคำ ไม่เร่ง

### 2.2 NFR-04 และ NFR-05 กับ lock token และหน่วยการทำงานเดียว
- ตรงกันทุกชั้น: architecture หัวข้อ 6 ประเด็น 1 (lock token) → [[db-spec#3.16 ReviewLock (ล็อกข้อความระหว่างตรวจ พร้อม lock token)|ReviewLock.lock token]] ไม่ซ้ำและมีล็อก "ใช้งานอยู่" ได้ไม่เกิน 1 ต่อข้อความ → OP-20 (ออก token ใหม่ทุกครั้ง ปลดล็อกเดิมที่เลยเวลาพร้อม audit) → OP-22 (เทียบ token ผู้ถือล็อก และเวลาหมดอายุในหน่วยเดียวกับการสร้าง ReviewDecision เปลี่ยนสถานะ สิ้นสุดล็อก บันทึก AuditEvent และ Notification ถึงผู้ส่งเมื่อปฏิเสธ)
- กรณีไม่ถือล็อกที่ใช้ได้ทุกสาเหตุ: ไม่สร้าง ReviewDecision ไม่เปลี่ยนสถานะ บันทึก AuditEvent ชนิดคำตัดสินถูกปฏิเสธ พร้อมสาเหตุและ token (OP-22 ข้อ 5 ตรงกับ architecture 4.5/4.6)
- OP-16 (ส่งใหม่ครั้งละหนึ่ง) ตรวจเงื่อนไข สร้างข้อความ และบันทึก audit ในหน่วยเดียว วิธีทำให้หน่วยการทำงานสำเร็จจริงถูกส่งต่อไป technology-stack อย่างชอบธรรม (api-spec หัวข้อ 11, db-spec หัวข้อ 8)

### 2.3 NFR-03 ความถี่ซิงก์ที่ตั้งค่าได้
- รองรับครบ: ไม่ฝังตายตัว เก็บใน SystemPolicy.ความถี่รอบซิงก์ (ว่างได้) โดย System Settings เป็นเจ้าของ ตั้งผ่าน OP-02 และ audit (NFR-07) ดูผ่าน OP-43 Scheduler อ่านค่าใน OP-06 ยังไม่ตั้งค่าไม่กระตุ้นรอบ สถานะไม่ทันสมัย/รอข้อมูลมาจาก SyncState ผลการประเมินเริ่มหลังทุกรอบซิงก์ (architecture หัวข้อ 6 ประเด็น 3)

## 3. คำแนะนำสรุป (แยกตามชั้น)

| ชั้นที่มีช่องว่าง | NFR | คำแนะนำ |
|--------------------|-----|---------|
| architecture.md | ไม่มี | ไม่ต้องรัน `sync-architecture` (ปรับถ้อยคำเล็กน้อยตามข้อสังเกตท้ายข้อ 2.1 ได้ภายหลัง) |
| api-spec.md / db-spec.md | ไม่มี | ไม่ต้องรัน `sync-api-db` |
| detailed-design/ | ไม่มี | ไม่ต้องรัน `sync-detailed-design` |
| spec ต้นทาง (ไม่ใช่เอกสารเทคนิค) | NFR-01 | `capture-requirement` เพื่อกำหนดนโยบาย PDPA และระยะเวลาเก็บข้อมูล แล้วจึง sync-architecture และ sync-api-db |

## 4. เอกสารที่เกี่ยวข้อง
- [[architecture]]
- [[api-spec]]
- [[db-spec]]
- [[../../01-requirements/backlog|Backlog]]
