# Backlog

รวม FR/NFR ทั้งหมดจากเอกสารใน `01-spec/` (สูง = ต้องมีใน MVP)

## ระดับความสำคัญ: สูง

| รหัส | หัวข้อ | เอกสารอ้างอิง | สถานะ |
|------|--------|---------------|-------|
| FR-01 | ดึงข้อมูลจากระบบเดิม (LMS/ทะเบียน) ผ่าน API | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| FR-02 | คำนวณแนวโน้มผลการเรียน | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| FR-03 | ประเมินความเสี่ยงหลายตัวแปรด้วยกฎ threshold | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| FR-04 | แจ้งเตือนความเสี่ยง (in-app + อีเมล) | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| FR-05 | คำแนะนำการเรียนเฉพาะบุคคล | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| FR-08 | ผู้ดูแลระบบตั้งค่า threshold | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| NFR-01 | ความเป็นส่วนตัว (PDPA, จำกัดการมองเห็นตามบทบาท) | [[20261014-01-student-risk-alert#5. Non-functional Requirements]] | Backlog |
| NFR-02 | ความสามารถอธิบายได้ของการแจ้งเตือน | [[20261014-01-student-risk-alert#5. Non-functional Requirements]] | Backlog |
| FR-10 | ส่งข้อความแนะนำแนวทางการเรียน (เฉพาะผู้ผ่านเกณฑ์) | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-11 | ข้อความเข้าสถานะรออนุมัติ ผู้รับไม่เห็นจนกว่าอนุมัติ | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-12 | ผู้ตรวจระบุเชิงลบ/ไม่เชิงลบก่อนอนุมัติ | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-13 | อาจารย์/admin อนุมัติหรือปฏิเสธข้อความ (สิทธิ์เท่ากัน) | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-14 | ผู้ตรวจตัดสินข้อความเชิงลบ (ไม่ปฏิเสธอัตโนมัติ) | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-15 | ปฏิเสธพร้อมเหตุผลและแจ้งผู้ส่ง | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-16 | ตรวจสิทธิ์ผู้ส่งตามเกณฑ์ผู้ผ่านเกณฑ์ | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-20 | ส่งข้อความเข้าห้องรวม ทุกคนเห็นเมื่ออนุมัติ | [[20261016-02-peer-chat-recipients-lock-resubmit#4. Functional Requirements]] | Backlog |
| FR-24 | ปฏิเสธคำตัดสินเมื่อผู้ตัดสินไม่ได้ถือล็อกที่ยังใช้ได้ (ล็อกหมดอายุ/ปลดด้วยมือ/ผู้อื่นล็อกต่อ) แจ้งผู้ตรวจ ข้อความกลับเข้าคิว (ระดับรอผู้ใช้ยืนยัน; ขยายขอบเขต 2026-10-16) | [[20261016-03-first-sync-failure-and-expired-lock-decision#4. Functional Requirements]] | Backlog |
| FR-25 | จัดการบัญชีผู้ใช้และบทบาท (นำเข้าจากระบบเดิม + Admin จัดการ + สมัครเองเฉพาะบทบาท student; แก้ 2026-10-27) (ผู้ใช้ยืนยันระดับแล้ว 2026-10-17) | [[20261017-01-user-role-advisor-eligibility-management#4. Functional Requirements]] | Backlog |
| FR-27 | นิยามและประเมินเกณฑ์ "ผู้ผ่านเกณฑ์" (Admin ตั้งเกณฑ์ ใช้ตัดสิทธิ์ FR-16) (ผู้ใช้ยืนยันระดับแล้ว 2026-10-17) | [[20261017-01-user-role-advisor-eligibility-management#4. Functional Requirements]] | Backlog |
| NFR-04 | ความปลอดภัยของเนื้อหา (ผู้รับไม่เห็นข้อความที่ยังไม่อนุมัติ/ถูกปฏิเสธ) | [[20261014-02-peer-advice-chat#5. Non-functional Requirements]] | Backlog |
| NFR-05 | ความรับผิดชอบ/audit trail ของการตรวจข้อความ | [[20261014-02-peer-advice-chat#5. Non-functional Requirements]] | Backlog |

## ระดับความสำคัญ: กลาง

| รหัส | หัวข้อ | เอกสารอ้างอิง | สถานะ |
|------|--------|---------------|-------|
| FR-06 | แดชบอร์ดสถานการณ์การเรียนสำหรับผู้เรียน | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| FR-07 | มุมมองครู/อาจารย์ที่ปรึกษา | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| NFR-03 | ความทันสมัยของข้อมูล (ความถี่ซิงก์ยังไม่กำหนด) | [[20261014-01-student-risk-alert#5. Non-functional Requirements]] | Backlog |
| FR-18 | กันตรวจซ้ำระหว่างผู้ตรวจ | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
| FR-19 | จัดการซิงก์ล้มเหลว (ใช้ข้อมูลล่าสุด + แจ้ง admin + ป้ายข้อมูลไม่ทันสมัย) | [[20261016-01-sync-failure-handling#4. Functional Requirements]] | Backlog |
| FR-23 | ซิงก์ครั้งแรกล้มเหลวโดยไม่มีข้อมูลเดิม (ไม่ประเมินความเสี่ยง แจ้ง admin ป้ายรอข้อมูล) (ระดับรอผู้ใช้ยืนยัน) | [[20261016-03-first-sync-failure-and-expired-lock-decision#4. Functional Requirements]] | Backlog |
| FR-21 | ปลดล็อกข้อความที่ผู้ตรวจค้าง (อัตโนมัติ + อาจารย์/admin ด้วยมือ) | [[20261016-02-peer-chat-recipients-lock-resubmit#4. Functional Requirements]] | Backlog |
| FR-22 | ส่งข้อความใหม่หลังถูกปฏิเสธ (ข้อความเดิมปิดถาวร เก็บความสัมพันธ์ใน audit trail; ส่งใหม่ได้ครั้งละหนึ่ง) | [[20261016-02-peer-chat-recipients-lock-resubmit#4. Functional Requirements]] | Backlog |
| NFR-06 | ความเป็นส่วนตัว (การแสดงชื่อผู้ส่ง ยังไม่กำหนด) | [[20261014-02-peer-advice-chat#5. Non-functional Requirements]] | Backlog |
| FR-26 | จัดการความสัมพันธ์ครู/อาจารย์ที่ปรึกษากับผู้เรียนในความดูแล (ผู้ใช้ยืนยันระดับแล้ว 2026-10-17) | [[20261017-01-user-role-advisor-eligibility-management#4. Functional Requirements]] | Backlog |
| FR-28 | สมัครบัญชีด้วยตนเอง (อีเมล/รหัสผ่าน; ได้บทบาท student เท่านั้น; ห้ามเขียนทับบัญชีเดิม) (งานรายวิชา ส่วน C; ผู้ใช้ยืนยันระดับแล้ว 2026-10-28) | [[20261027-01-self-registration-and-login#4. Functional Requirements]] | Backlog |
| FR-29 | เข้าสู่ระบบและพาไปหน้าตามบทบาท (admin → lecturer → อื่นๆ) (ผู้ใช้ยืนยันระดับแล้ว 2026-10-28) | [[20261027-01-self-registration-and-login#4. Functional Requirements]] | Backlog |
| FR-30 | ออกจากระบบทุกหน้า และไม่ล็อกอินให้เด้งไปหน้า login (ผู้ใช้ยืนยันระดับแล้ว 2026-10-28) | [[20261027-01-self-registration-and-login#4. Functional Requirements]] | Backlog |
| FR-31 | รายการที่สร้างใหม่บันทึก uid ของผู้สร้าง (ผู้ใช้ยืนยันระดับแล้ว 2026-10-28) | [[20261027-01-self-registration-and-login#4. Functional Requirements]] | Backlog |
| NFR-07 | audit trail การเปลี่ยนบัญชี/บทบาท/การสมัครเอง (เพิ่ม 2026-10-27)/ความสัมพันธ์/เกณฑ์ผ่านเกณฑ์/ค่าตั้งการเชื่อมต่อ/นโยบายระบบ/threshold ความเสี่ยง (FR-08) (ผู้ใช้ยืนยันระดับแล้ว 2026-10-17) | [[20261017-01-user-role-advisor-eligibility-management#5. Non-functional Requirements]] | Backlog |

## ระดับความสำคัญ: ต่ำ

| รหัส | หัวข้อ | เอกสารอ้างอิง | สถานะ |
|------|--------|---------------|-------|
| FR-09 | เก็บประวัติการแจ้งเตือนและคำแนะนำ | [[20261014-01-student-risk-alert#4. Functional Requirements]] | Backlog |
| FR-17 | AI ช่วยวิเคราะห์เชิงลบ/ไม่เชิงลบ (ผู้ตรวจยืนยัน) | [[20261014-02-peer-advice-chat#4. Functional Requirements]] | Backlog |
