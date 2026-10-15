---
name: run-technical-phase
description: >
  รวมขั้นตอนช่วงเอกสารเชิงเทคนิคทั้งหมดในคำสั่งเดียว: docs/02-design/02-technical/architecture.md
  → api-spec.md/db-spec.md → detailed-design/{feature-slug}.md → nfr-review.md แล้วรายงาน
  output แยกตาม sub-step ในคำตอบเดียว ใช้เมื่อผู้ใช้พิมพ์ /run-technical-phase หรือขอให้ "ทำ
  phase เทคนิคทั้งหมด", "จาก architecture ถึง nfr review ในคำสั่งเดียว", "รัน phase 3",
  "architecture ยัน nfr review"
---

# Run Technical Phase

Skill นี้เป็น orchestrator สำหรับ "ช่วงที่ 3" ของ pipeline เอกสารของโปรเจกต์ ตามที่ผู้ใช้แบ่งไว้:
architecture → api + db → detailed design → nfr review โดยเรียก skill ย่อยที่มีอยู่แล้วเรียงตาม
ลำดับ **เอกสารทั้งหมดในช่วงนี้ตั้งใจเขียนแบบไม่ผูก tech stack** จนกว่า `technology-stack.md`
จะถูกตัดสินใจแล้วจริง Skill นี้**ไม่รวมการวางแผนแบ่ง phase/release** (`sync-phase-plan`/
`phase-planner`) ไว้ในตัว เพราะเป็นงานวางแผนที่ต้องยืนยัน scope กับผู้ใช้แบบโต้ตอบและควรอ้างอิง
ผลลัพธ์ล่าสุดของ**ทุกสาขา**ที่พึ่ง `feature-list.md`/`user-journey.md` (เอกสารทดสอบ, prototype,
เอกสารเชิงเทคนิค) ไม่ใช่แค่สาขาเทคนิคสาขาเดียว — ถ้าผู้ใช้ต้องการวางแผน phase ต่อ ให้เรียก
`sync-phase-plan` แยกต่างหากหลังจบ skill นี้

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: ใช้ค่าวันที่ปัจจุบันที่มีอยู่ในบริบทของคุณ (รูปแบบ `YYYYMMDD`) เพื่อส่งต่อ
   ให้ skill/subagent ทุกตัวใช้กับไฟล์ log ของวันนี้

2. **sub-step 1-4 — เอกสารเชิงเทคนิค**: เรียกผ่าน **Skill tool** ด้วย `skill: sync-technical-spec`
   (ไม่เรียก subagent แต่ละตัวในสายเทคนิคตรงๆ เพราะ skill นี้จัดลำดับชั้นย่อยทั้ง 4 ชั้น —
   architecture → api-spec/db-spec → detailed-design → nfr-review — และมี auto-chain/loop guard
   ของตัวเองอยู่แล้ว) รอผลลัพธ์ก่อนไปขั้นตอนถัดไปเสมอ

3. **ตรวจสอบผลลัพธ์ sub-step 1-4**: สุ่มอ่าน `architecture.md`, `api-spec.md`/`db-spec.md`,
   ไฟล์ใน `detailed-design/`, และ `nfr-review.md` จริงอย่างน้อย 1 จุดต่อไฟล์ ตรวจว่าไม่มีการ
   ระบุชื่อ technology/framework/database engine ใดๆ หลุดเข้าไป (ต้องยังว่างอยู่ที่
   `technology-stack.md`) — **ถ้า `sync-technical-spec` รายงานปัญหาเชิงโครงสร้างที่ทำให้หยุด
   กลางทาง (ไม่ครบทั้ง 4 ชั้น) ให้หยุด pipeline ทันที แจ้งผู้ใช้แทน** ส่วนกรณี `nfr-review.md`
   รายงานว่ามี NFR บางตัวยังไม่รองรับ ถือเป็น content gap ไม่ใช่ปัญหาโครงสร้าง ให้บันทึกไว้รายงาน
   ในข้อ 4 ตามปกติ ไม่ต้องหยุด

4. **สรุปผลรวมทั้งช่วงเป็นรายงานเดียว** แยกตาม sub-step:
   - **architecture**: up to date อยู่แล้วหรือแก้ไขอะไรไปบ้าง
   - **api-spec/db-spec**: up to date อยู่แล้วหรือแก้ไขอะไรไปบ้าง
   - **detailed design**: up to date อยู่แล้วหรือแก้ไขอะไรไปบ้าง (ต่อฟีเจอร์)
   - **nfr review**: จำนวน NFR ที่รองรับแล้ว/บางส่วน/ยังไม่รองรับ พร้อมคำแนะนำว่าควรรันชั้นไหนซ้ำ
     ถ้ามีช่องว่าง
   - จุดที่ skill ตัวใดถามผู้ใช้ระหว่างทางและคำตอบที่ได้ (ถ้ามี)
   - ปิดท้ายด้วยการแนะนำผู้ใช้ว่าถ้าต้องการวางแผนแบ่ง phase/release ต่อจากเอกสารช่วงนี้
     ให้เรียก `sync-phase-plan` เพิ่มเอง (ไม่ได้รวมอยู่ใน skill นี้โดยเจตนา)

## ข้อควรระวัง

- ห้ามข้ามการเรียก skill/subagent แล้วแก้ไฟล์เองตรงๆ ในเทรดหลักไม่ว่าชั้นใด
- Subagent `nfr-reviewer` ไม่มีเครื่องมือที่แก้ไขเอกสารต้นทาง (architecture/api-db/detailed-design)
  ได้ — เป็น report-only เท่านั้น ถ้าผลลัพธ์พูดถึงการแก้ไขไฟล์เหล่านั้น ให้ถือว่าผิดปกติ หยุดและแจ้ง
  ผู้ใช้ทันที
- **เอกสารทั้งช่วงนี้ต้องไม่ระบุชื่อ technology/framework/database engine ใดๆ** จนกว่า
  `technology-stack.md` จะถูกตัดสินใจแล้วจริง ถ้าพบหลุดเข้าไปในรายงานของ skill/subagent ใด
  ให้ถือว่าผิดกฎ หยุดและแจ้งผู้ใช้ทันที
- ถ้า skill/subagent ตัวใดตัวหนึ่งรายงานปัญหาเชิงโครงสร้าง (โฟลเดอร์ที่คาดไว้หาไม่เจอ ฯลฯ) ให้หยุด
  pipeline ทันที ไม่ไปขั้นตอนถัดไป แล้วรายงานปัญหานั้นให้ผู้ใช้ก่อนเสมอ
- **`sync-phase-plan`/`phase-planner` ไม่ได้เป็นส่วนหนึ่งของ skill นี้โดยเจตนา** (ดูเหตุผลด้านบน)
  ห้ามเรียกต่อท้ายเองอัตโนมัติ แม้ sub-step 1-4 จะจบสมบูรณ์ก็ตาม ให้รอผู้ใช้ขอเพิ่มเสมอ
