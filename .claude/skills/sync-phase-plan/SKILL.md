---
name: sync-phase-plan
description: >
  วางแผนแบ่งงานเป็น phase/release ก่อนเริ่ม dev จริง เขียน
  docs/01-requirements/02-plan/release-plan.md แล้วแตกงานย่อยลง
  docs/01-requirements/03-task/{phase-slug}-tasks.md (ไม่ผูก tech stack) จาก
  docs/01-requirements/backlog.md/docs/02-design/feature-list.md ล่าสุด ใช้เมื่อผู้ใช้พิมพ์
  /sync-phase-plan หรือขอให้ "วางแผนแบ่ง phase", "ทำ release plan", "แตก task ก่อนเริ่ม dev",
  "อัปเดตแผน phase จาก backlog"
---

# Sync Phase Plan

Skill นี้เป็น workflow มาตรฐานสำหรับวางแผนแบ่ง phase/release ก่อนเริ่มพัฒนาจริง และแตกงานย่อย
ต่อ phase จาก `backlog.md`/`feature-list.md` ล่าสุด พร้อมบันทึก log ตามกฎใน `CLAUDE.md`

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: รูปแบบ `YYYYMMDD` เพื่อส่งต่อให้ subagent

2. **ส่งต่อให้ subagent `phase-planner`**: เรียกผ่าน Agent tool (`subagent_type: phase-planner`,
   `run_in_background: false` เพราะ subagent นี้ต้องเสนอแผนแบ่ง phase ให้ผู้ใช้ยืนยันแบบโต้ตอบ
   ผ่าน `AskUserQuestion` เสมอก่อนเขียนไฟล์จริง) โดย prompt ต้องมีวันที่ปัจจุบันและบริบทว่านี่คือ
   session สนทนากับผู้ใช้จริง

3. **รอผลลัพธ์**: ระหว่างที่ subagent เสนอแผนหรือถามคำถาม ให้ปล่อยให้ subagent จัดการเอง อย่า
   ยืนยัน/ตอบแทนผู้ใช้

4. **ตรวจสอบผลลัพธ์ก่อนรายงาน**: สุ่มอ่าน `release-plan.md` และไฟล์ใน `03-task/` จริงอย่างน้อย
   1-2 จุด ตรวจว่า task ที่แตกออกมาเขียนแบบไม่ผูก tech stack (ไม่มีคำอย่าง "endpoint", "database
   table", "component" เฉพาะ framework ใดๆ)

5. **สรุปให้ผู้ใช้ทราบ**: แผนที่เสนอและคำตอบยืนยัน/ปรับจากผู้ใช้, ไฟล์ที่สร้าง/แก้ไข (path เต็ม)

## ข้อควรระวัง

- ห้ามข้ามการเรียก subagent แล้วเขียนไฟล์เองตรงๆ ในเทรดหลัก
- **Subagent ต้องเสนอแผนแบ่ง phase ให้ผู้ใช้ยืนยันก่อนเขียนไฟล์จริงเสมอ** ถ้าผลลัพธ์ที่ได้กลับมา
  แสดงว่าเขียนไฟล์โดยไม่มีการขอยืนยันก่อน ให้ถือว่าผิดกฎ หยุดและแจ้งผู้ใช้ทันที
- Subagent ห้ามแตะไฟล์ใดๆ นอกจากใน `02-plan/`, `03-task/`, และไฟล์ log — หากผลลัพธ์พูดถึงการ
  แก้ไข `backlog.md`/`feature-list.md`/เอกสารเชิงเทคนิค ให้หยุดและแจ้งผู้ใช้ทันที
- **ถ้าผลลัพธ์ระบุรายละเอียดเชิงเทคนิค/tech stack ในงานย่อยที่แตกออกมา ให้ถือว่าผิดกฎ** หยุดและ
  แจ้งผู้ใช้ทันที
