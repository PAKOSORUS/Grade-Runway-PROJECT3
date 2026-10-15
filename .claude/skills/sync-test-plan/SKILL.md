---
name: sync-test-plan
description: >
  ตรวจสอบและสร้าง/ปรับปรุงเอกสารทดสอบ 3 ส่วนใน docs/03-testing/01-test-plan/
  (acceptance-criteria.md, test-plan.md, test-cases/{feature-slug}.md) ให้สอดคล้องกับ
  docs/02-design/feature-list.md/user-journey.md ล่าสุด ใช้เมื่อผู้ใช้พิมพ์ /sync-test-plan
  หรือขอให้ "สร้าง test plan", "ทำ test case", "เขียน acceptance criteria",
  "อัปเดต test plan จาก feature list", "เช็ค test case กับ feature list"
---

# Sync Test Plan

Skill นี้เป็น workflow มาตรฐานสำหรับตรวจสอบว่าเอกสารทดสอบใน `docs/03-testing/01-test-plan/`
(`acceptance-criteria.md`, `test-plan.md`, `test-cases/{feature-slug}.md`) สอดคล้อง
("up to date") กับ `docs/02-design/feature-list.md`/`docs/02-design/user-journey.md` หรือไม่
ถ้าไม่สอดคล้อง ให้สร้าง/ปรับปรุงทั้งสามส่วน พร้อมบันทึก log ตามกฎใน `CLAUDE.md`

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: ใช้ค่าวันที่ปัจจุบันที่มีอยู่ในบริบทของคุณ (รูปแบบ `YYYYMMDD`)
   เพื่อส่งต่อให้ subagent ใช้กับไฟล์ log ของวันนี้ — subagent ไม่มีเครื่องมือ Bash
   จึงหาวันที่เองไม่ได้ ต้องส่งมาให้ใน prompt เสมอ

2. **ส่งต่อให้ subagent `test-writer`**: เรียกผ่าน Agent tool
   (`subagent_type: test-writer`, รันแบบ foreground คือ `run_in_background: false`
   เพราะอาจต้องถามผู้ใช้แบบโต้ตอบผ่าน AskUserQuestion กรณีเจอไฟล์ test case ล้าสมัย)
   โดย prompt ที่ส่งต้องมี:
   - วันที่ปัจจุบัน (YYYYMMDD) สำหรับใช้กับไฟล์ log
   - บริบทว่านี่คือ session สนทนากับผู้ใช้จริง คำถามที่ subagent ถามจะไปถึงผู้ใช้ทันที
     ไม่ใช่ mock/สมมติคำตอบเอง

3. **รอผลลัพธ์**: เพราะรันแบบ foreground เทิร์นนี้จะได้รับผลลัพธ์ก่อนตอบผู้ใช้ต่อ
   ระหว่างที่ subagent ถามคำถามผู้ใช้ ให้ปล่อยให้ subagent จัดการเอง อย่าตอบแทนผู้ใช้

4. **ตรวจจับสัญญาณ "ต้องการ requirement ใหม่"**: อ่านรายงานที่ได้กลับมาจากข้อ 3 ทั้งหมด
   - **ถ้าไม่มีหัวข้อ `## NEEDS_NEW_REQUIREMENT` ในรายงาน**: ข้ามไปข้อ 6 (ตรวจสอบผลลัพธ์) ตามปกติ
   - **ถ้ามีหัวข้อนี้**: ทำตามข้อ 5 ก่อน (auto-chain ไป `requirement-writer`) แล้วค่อยไปข้อ 6

5. **Auto-chain ไป `requirement-writer` (เฉพาะเมื่อมีสัญญาณในข้อ 4)**:
   a. แจ้งผู้ใช้สั้นๆ ก่อนว่าเจอความต้องการใหม่ระหว่างเขียน acceptance criteria กำลังส่งต่อให้
      `requirement-writer` เขียนเป็น FR/NFR ให้อัตโนมัติ (ไม่ต้องถามผู้ใช้ก่อนว่าจะส่งต่อหรือไม่
      — เป็นพฤติกรรมมาตรฐานของ skill นี้ที่ผู้ใช้ตกลงไว้แล้ว เหมือนกับ `sync-feature-journey`)
   b. เรียก subagent `requirement-writer` ผ่าน Agent tool (`run_in_background: false`) โดย prompt
      ต้องมี: เนื้อหาทั้งหมดใต้หัวข้อ `## NEEDS_NEW_REQUIREMENT` แบบ verbatim (ไม่สรุปย่อเอง),
      วันที่ปัจจุบัน (YYYYMMDD), บริบทว่าเนื้อหานี้ค้นพบระหว่างเขียน acceptance criteria/test case
      ไม่ใช่ผู้ใช้พิมพ์มาตรงๆ, และบริบทว่านี่คือ session สนทนากับผู้ใช้จริง
   c. รอผลลัพธ์ แล้วสุ่มตรวจสอบเองอย่างน้อย 1 จุด (เปิดอ่าน `backlog.md` ว่ามีรหัส FR/NFR ใหม่
      ปรากฏจริงตามที่รายงาน) ก่อนไปขั้นตอนถัดไป
   d. **เรียก `sync-feature-journey` ต่อก่อน** (ไม่ใช่เรียก `test-writer` ตรงๆ) เพราะ FR/NFR ใหม่
      ที่เพิ่งเกิดยังไม่ถูกสะท้อนใน `feature-list.md`/`user-journey.md` — ให้ชั้นนั้นซิงก์ก่อน
      แล้วค่อยเรียก `test-writer` อีกรอบ (prompt เดิมจากข้อ 2) เพื่อให้เอกสารทดสอบครอบคลุมรหัส
      ใหม่ที่เพิ่งเกิดด้วย
   e. **ป้องกัน infinite loop**: ทำข้อ 4-5 ซ้ำได้อีกไม่เกิน 1 รอบเท่านั้น ถ้ารอบที่สองยังพบ
      `## NEEDS_NEW_REQUIREMENT` อีก ให้หยุด auto-chain แล้วรายงานผู้ใช้ตรงๆ ว่ายังมีความต้องการ
      ใหม่ค้างอยู่ ให้ผู้ใช้ตรวจสอบเองก่อนสั่งต่อ อย่าวนไม่รู้จบ

6. **ตรวจสอบผลลัพธ์ก่อนรายงาน**: หลัง subagent รายงานว่าแก้ไขอะไรไปบ้าง (รอบสุดท้าย) ให้สุ่ม
   ตรวจสอบเองอย่างน้อย 1-2 จุด (เปิดอ่าน `acceptance-criteria.md`, `test-plan.md`, และไฟล์ใน
   `test-cases/` จริงว่ามีการแก้ไขตรงตามที่รายงานหรือไม่ และ AC/test case แต่ละข้ออ้างอิงรหัส
   FR/NFR จริงครบ) ก่อนสรุปให้ผู้ใช้ฟัง ห้ามเชื่อรายงานของ subagent 100% โดยไม่ตรวจเอง
   - รวมถึงเปิด `docs/01-requirements/backlog.md` เทียบระดับความสำคัญ (สูง/กลาง/ต่ำ) ของรหัสที่
     สุ่มตรวจ กับค่าที่กำกับไว้ที่ heading ใน `acceptance-criteria.md` และคอลัมน์ระดับความสำคัญ
     ใน `test-cases/{feature-slug}.md` ว่าตรงกันทั้งสามจุดหรือไม่ (ดูกฎในข้อ "กฎสำคัญ" ของ
     `test-writer`) ถ้าไม่ตรง ให้แจ้งผู้ใช้แทนการปล่อยผ่าน

7. **สรุปให้ผู้ใช้ทราบ**: หลัง subagent ทำงานเสร็จและตรวจสอบแล้ว ให้สรุปสั้นๆ ว่า
   - เอกสารทดสอบทั้ง 3 ส่วน up to date อยู่แล้วหรือไม่ก่อนตรวจ
   - ไฟล์ใดถูกสร้าง/แก้ไขบ้าง (path เต็ม)
   - **ความต้องการใหม่ที่เจอระหว่างทำงานและถูก auto-chain ไป `requirement-writer`/
     `sync-feature-journey` ให้เอง (ถ้ามี)** พร้อมรหัส FR/NFR ใหม่ที่ได้
   - จุดที่ถาม/รอผู้ใช้ตัดสินใจ (ถ้ามี)
   - ปัญหาเชิงโครงสร้างอื่นที่ subagent รายงาน

## ข้อควรระวัง

- ห้ามข้ามการเรียก subagent แล้วเขียนเอกสารทดสอบเองตรงๆ ในเทรดหลัก — `test-writer` คือแหล่ง
  ความจริงเดียวของกฎการแปลง feature/AC เป็น test case
- Subagent `test-writer` ตั้งใจไม่มีเครื่องมือ Bash และห้ามแตะไฟล์ใดๆ นอกจากในโฟลเดอร์
  `01-test-plan/` กับไฟล์ log ของวันนั้น หากผลลัพธ์พูดถึงการแก้ไขไฟล์อื่นนอกเหนือจากนี้
  (โดยเฉพาะ `backlog.md`, `feature-list.md`, `user-journey.md`, หรือไฟล์ใน `01-spec/`,
  หรือไฟล์ใน `02-test-result/`) ให้หยุดและแจ้งผู้ใช้ทันที
- การ auto-chain ไป `requirement-writer`/`sync-feature-journey` (ข้อ 5) เป็นข้อยกเว้นเดียวที่
  skill นี้เรียก subagent/skill อื่นนอกเหนือจาก `test-writer` — ต้องเรียกก็ต่อเมื่อพบหัวข้อ
  `## NEEDS_NEW_REQUIREMENT` ตรงตัวในรายงานเท่านั้น
- ห้ามวน auto-chain เกิน 1 รอบเด็ดขาด (ดูข้อ 5e) เพื่อป้องกัน infinite loop
- ถ้า subagent รายงานว่า `feature-list.md`/`user-journey.md` ไม่ตรงกับ `backlog.md` หรือ
  `backlog.md` ไม่ตรงกับ spec — ให้แจ้งผู้ใช้ตามที่ subagent แนะนำ (รัน `sync-feature-journey`/
  `audit-backlog` ก่อน) อย่าฝืนเขียนเอกสารทดสอบต่อในสถานะที่ไม่พร้อม
- ถ้า subagent รายงานว่าหาโฟลเดอร์ `docs/03-testing/` หรือโครงสร้างที่คาดไว้ไม่เจอ อย่าให้
  subagent ลองสร้าง/ย้าย/เดาชื่อโฟลเดอร์เอง ให้ผู้ใช้เข้ามาตรวจสอบโครงสร้างจริงก่อน
