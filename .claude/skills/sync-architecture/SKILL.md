---
name: sync-architecture
description: >
  ตรวจสอบและสร้าง/ปรับปรุง docs/02-design/02-technical/architecture.md (hi-level design แบบ
  ไม่ผูก tech stack) ให้สอดคล้องกับ docs/02-design/feature-list.md/user-journey.md ล่าสุด
  ใช้เมื่อผู้ใช้พิมพ์ /sync-architecture หรือขอให้ "ทำ architecture", "ออกแบบ hi-level design",
  "เขียน system architecture", "อัปเดต architecture จาก feature list"
---

# Sync Architecture

Skill นี้เป็น workflow มาตรฐานสำหรับตรวจสอบว่า `docs/02-design/02-technical/architecture.md`
สอดคล้อง ("up to date") กับ `docs/02-design/feature-list.md`/`docs/02-design/user-journey.md`
หรือไม่ ถ้าไม่สอดคล้อง ให้สร้าง/ปรับปรุงสถาปัตยกรรมระดับ hi-level (component, data flow, NFR
mapping) แบบ**ไม่ผูกกับ tech stack ใดๆ** พร้อมบันทึก log ตามกฎใน `CLAUDE.md`

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: ใช้ค่าวันที่ปัจจุบันที่มีอยู่ในบริบทของคุณ (รูปแบบ `YYYYMMDD`)
   เพื่อส่งต่อให้ subagent ใช้กับไฟล์ log ของวันนี้

2. **ส่งต่อให้ subagent `architecture-writer`**: เรียกผ่าน Agent tool
   (`subagent_type: architecture-writer`, รันแบบ foreground คือ `run_in_background: false`)
   โดย prompt ที่ส่งต้องมี:
   - วันที่ปัจจุบัน (YYYYMMDD)
   - บริบทว่านี่คือ session สนทนากับผู้ใช้จริง คำถามที่ subagent ถามจะไปถึงผู้ใช้ทันที

3. **รอผลลัพธ์**: เพราะรันแบบ foreground เทิร์นนี้จะได้รับผลลัพธ์ก่อนตอบผู้ใช้ต่อ

4. **ตรวจจับสัญญาณ "ต้องการ requirement ใหม่"**: อ่านรายงานที่ได้กลับมาจากข้อ 3 ทั้งหมด
   - **ถ้าไม่มีหัวข้อ `## NEEDS_NEW_REQUIREMENT` ในรายงาน**: ข้ามไปข้อ 6 ตามปกติ
   - **ถ้ามีหัวข้อนี้**: ทำตามข้อ 5 ก่อน (auto-chain ไป `requirement-writer`) แล้วค่อยไปข้อ 6

5. **Auto-chain ไป `requirement-writer` (เฉพาะเมื่อมีสัญญาณในข้อ 4)**:
   a. แจ้งผู้ใช้สั้นๆ ว่าเจอความต้องการใหม่ระหว่างออกแบบ architecture กำลังส่งต่อให้
      `requirement-writer` เขียนเป็น FR/NFR ให้อัตโนมัติ (ไม่ต้องถามผู้ใช้ก่อน)
   b. เรียก subagent `requirement-writer` ผ่าน Agent tool (`run_in_background: false`) โดย prompt
      มีเนื้อหาใต้หัวข้อ `## NEEDS_NEW_REQUIREMENT` แบบ verbatim + วันที่ปัจจุบัน + บริบท session จริง
   c. รอผลลัพธ์ สุ่มตรวจสอบเองอย่างน้อย 1 จุด (`backlog.md`)
   d. เรียก `sync-feature-journey` ต่อ (ผ่าน Skill tool) เพื่อให้ feature-list/user-journey
      สะท้อนรหัสใหม่ก่อน แล้วเรียก subagent `architecture-writer` อีกรอบ (prompt เดิม)
   e. **ป้องกัน infinite loop**: ทำซ้ำได้อีกไม่เกิน 1 รอบ ถ้ายังพบสัญญาณอีก ให้หยุดและรายงาน
      ผู้ใช้ตรงๆ

6. **ตรวจสอบผลลัพธ์ก่อนรายงาน**: สุ่มอ่าน `architecture.md` จริงอย่างน้อย 1-2 จุด (ตรวจว่ามี
   Mermaid diagram จริง และไม่มีการระบุชื่อ technology/framework ใดๆ หลุดเข้าไปในเอกสาร) ก่อน
   สรุปให้ผู้ใช้ฟัง

7. **สรุปให้ผู้ใช้ทราบ**: up to date อยู่แล้วหรือไม่ก่อนตรวจ, ส่วนที่แก้ไข, ความต้องการใหม่ที่
   auto-chain ไปให้ (ถ้ามี), จุดที่ถามผู้ใช้ (ถ้ามี)

## ข้อควรระวัง

- ห้ามข้ามการเรียก subagent แล้วเขียน architecture.md เองตรงๆ ในเทรดหลัก
- Subagent นี้ไม่มีเครื่องมือ Bash และห้ามแตะไฟล์ใดๆ นอกจาก `architecture.md` กับไฟล์ log ของ
  วันนั้น หากผลลัพธ์พูดถึงการแก้ไขไฟล์อื่น (โดยเฉพาะ `backlog.md`, `feature-list.md`,
  `technology-stack.md`) ให้หยุดและแจ้งผู้ใช้ทันที
- **ถ้าผลลัพธ์ที่ได้กลับมาระบุชื่อ technology/framework/database engine ใดๆ ทั้งที่
  `technology-stack.md` ยังว่างเปล่าอยู่ ให้ถือว่าผิดกฎ** หยุดและแจ้งผู้ใช้ทันที
- ห้ามวน auto-chain เกิน 1 รอบเด็ดขาด
- ถ้า subagent รายงานว่า `feature-list.md`/`user-journey.md` ไม่สอดคล้องกับ `backlog.md` ให้แจ้ง
  ผู้ใช้ให้รัน `sync-feature-journey` ก่อน อย่าฝืนทำต่อ
