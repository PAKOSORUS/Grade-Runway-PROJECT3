---
name: sync-api-db
description: >
  ตรวจสอบและสร้าง/ปรับปรุง docs/02-design/02-technical/api-spec.md และ
  docs/02-design/02-technical/db-spec.md (เขียนคู่กันเสมอ แบบไม่ผูก tech stack) ให้สอดคล้องกับ
  docs/02-design/02-technical/architecture.md ล่าสุด ใช้เมื่อผู้ใช้พิมพ์ /sync-api-db หรือขอให้
  "ทำ API spec", "ออกแบบ database schema", "เขียน db-spec", "อัปเดต api spec จาก architecture"
---

# Sync API & DB Spec

Skill นี้เป็น workflow มาตรฐานสำหรับตรวจสอบว่า `api-spec.md` และ `db-spec.md` สอดคล้อง
("up to date") กับ `architecture.md`/`feature-list.md` หรือไม่ ถ้าไม่สอดคล้อง ให้สร้าง/
ปรับปรุงทั้งสองไฟล์พร้อมกัน (operation contract + logical ER model) แบบ**ไม่ผูกกับ tech stack**
พร้อมบันทึก log ตามกฎใน `CLAUDE.md`

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: รูปแบบ `YYYYMMDD` เพื่อส่งต่อให้ subagent

2. **ส่งต่อให้ subagent `api-db-writer`**: เรียกผ่าน Agent tool
   (`subagent_type: api-db-writer`, `run_in_background: false`) โดย prompt ต้องมีวันที่ปัจจุบัน
   และบริบทว่านี่คือ session สนทนากับผู้ใช้จริง

3. **รอผลลัพธ์**

4. **ตรวจจับสัญญาณ "ต้องการ requirement ใหม่"**: อ่านรายงานทั้งหมด
   - **ไม่มีหัวข้อ `## NEEDS_NEW_REQUIREMENT`**: ข้ามไปข้อ 6
   - **มีหัวข้อนี้**: ทำข้อ 5 ก่อน แล้วค่อยไปข้อ 6

5. **Auto-chain ไป `requirement-writer` (เฉพาะเมื่อมีสัญญาณ)**:
   a. แจ้งผู้ใช้สั้นๆ ว่ากำลังส่งต่อให้ `requirement-writer` อัตโนมัติ (ไม่ต้องถามก่อน)
   b. เรียก subagent `requirement-writer` โดย prompt มีเนื้อหาใต้หัวข้อสัญญาณแบบ verbatim +
      วันที่ + บริบท session จริง
   c. รอผลลัพธ์ สุ่มตรวจ `backlog.md` อย่างน้อย 1 จุด
   d. เรียก `sync-feature-journey` ต่อ (Skill tool) ให้ feature-list/journey สะท้อนรหัสใหม่ก่อน
      แล้วเรียก `sync-architecture` ต่อ (Skill tool) ให้ architecture ครอบคลุมรหัสใหม่ด้วย
      (เพราะ api-spec/db-spec ต้องอ้างอิง component จาก architecture เสมอ) แล้วจึงเรียก
      subagent `api-db-writer` อีกรอบ
   e. **ป้องกัน infinite loop**: ทำซ้ำได้อีกไม่เกิน 1 รอบ

6. **ตรวจสอบผลลัพธ์ก่อนรายงาน**: สุ่มอ่าน `api-spec.md`/`db-spec.md` จริงอย่างน้อย 1-2 จุด
   ตรวจว่า field ระหว่างสองไฟล์ตรงกัน และไม่มีการระบุ HTTP method/path, SQL type, หรือชื่อ
   technology ใดๆ หลุดเข้าไป

7. **สรุปให้ผู้ใช้ทราบ**: up to date หรือไม่ก่อนตรวจ, ส่วนที่แก้ไขในทั้งสองไฟล์, ความต้องการใหม่
   ที่ auto-chain ไปให้ (ถ้ามี)

## ข้อควรระวัง

- ห้ามข้ามการเรียก subagent แล้วเขียนไฟล์เองตรงๆ ในเทรดหลัก
- Subagent ห้ามแตะไฟล์ใดๆ นอกจาก `api-spec.md`, `db-spec.md`, และไฟล์ log — หากผลลัพธ์พูดถึง
  การแก้ไข `architecture.md`/`feature-list.md`/`technology-stack.md` ให้หยุดและแจ้งผู้ใช้ทันที
- **ถ้าผลลัพธ์ระบุ HTTP method/path, protocol, SQL type, หรือชื่อ database engine ใดๆ ทั้งที่
  `technology-stack.md` ยังว่างเปล่า ให้ถือว่าผิดกฎ** หยุดและแจ้งผู้ใช้ทันที
- ห้ามวน auto-chain เกิน 1 รอบเด็ดขาด
- ถ้า subagent รายงานว่า `architecture.md` ยังว่างเปล่า/ไม่ครอบคลุม ให้แจ้งผู้ใช้ให้รัน
  `sync-architecture` ก่อน อย่าฝืนทำต่อ
