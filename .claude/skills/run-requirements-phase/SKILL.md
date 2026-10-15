---
name: run-requirements-phase
description: >
  รวมขั้นตอนช่วง requirement ทั้งหมดในคำสั่งเดียว: (ถ้าผู้ใช้แนบ requirement ดิบมาด้วย)
  capture-requirement → spec ↔ backlog → docs/02-design/feature-list.md/user-journey.md →
  เอกสารทดสอบ (acceptance-criteria.md/test-plan.md/test-cases/) แล้วรายงาน output แยกตาม
  sub-step ในคำตอบเดียว ใช้เมื่อผู้ใช้พิมพ์ /run-requirements-phase หรือขอให้ "ทำเอกสารช่วง
  requirement ทั้งหมด", "จาก requirement ถึง test plan ในคำสั่งเดียว", "รัน phase 1",
  "requirement ยัน test case", "เพิ่ม requirement นี้แล้วทำเอกสารที่เกี่ยวข้องให้ครบ"
---

# Run Requirements Phase

Skill นี้เป็น orchestrator สำหรับ "ช่วงที่ 1" ของ pipeline เอกสารของโปรเจกต์ ตามที่ผู้ใช้แบ่งไว้:
requirement → backlog → feature-list + user journey → test case + acceptance criteria + test
plan โดยเรียก skill/subagent ย่อยที่มีอยู่แล้วเรียงตามลำดับ ไม่เขียนไฟล์เอง ต่างจาก
`audit-pipeline` ตรงที่ scope แค่ช่วงที่ 1 เท่านั้น (ไม่ลากต่อไปช่วง prototype/technical) และ
รองรับ entry point แบบ "มี requirement ดิบใหม่มาด้วย" ไม่ใช่แค่โหมด audit เอกสารที่มีอยู่แล้ว

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: ใช้ค่าวันที่ปัจจุบันที่มีอยู่ในบริบทของคุณ (รูปแบบ `YYYYMMDD`) เพื่อส่งต่อ
   ให้ subagent/skill ทุกตัวใช้กับไฟล์ log ของวันนี้ — subagent ส่วนใหญ่ไม่มีเครื่องมือ Bash
   จึงหาวันที่เองไม่ได้ ต้องส่งมาให้ใน prompt ทุกครั้ง

2. **ชั้นที่ 1 — spec ↔ backlog**: ตรวจก่อนว่าคำขอของผู้ใช้ในเทิร์นนี้แนบ requirement ดิบมาด้วย
   หรือไม่ (ข้อความอิสระ, บันทึกการประชุม, รายการ feature ที่อยากได้ ฯลฯ)
   - **ถ้ามี**: เรียกผ่าน **Skill tool** ด้วย `skill: capture-requirement` พร้อม requirement ดิบ
     verbatim ทั้งหมดและบริบทว่านี่คือ session สนทนากับผู้ใช้จริง (skill นี้จัดการทั้งสร้าง/แก้ไข
     spec, อัปเดต backlog, และ log ให้ครบอยู่แล้ว)
   - **ถ้าไม่มี** (ผู้ใช้แค่ต้องการให้ไล่ sync เอกสารที่มีอยู่แล้วให้ตรงกันทั้งช่วง): เรียก subagent
     `backlog-auditor` ผ่าน Agent tool (`run_in_background: false` เพราะอาจต้องถามผู้ใช้แบบ
     โต้ตอบผ่าน AskUserQuestion กรณีเจอรายการกำพร้า) พร้อมบริบทว่านี่คือ session สนทนากับผู้ใช้จริง
   รอผลลัพธ์ก่อนไปขั้นตอนถัดไปเสมอ

3. **ตรวจสอบผลลัพธ์ชั้นที่ 1**: สุ่มอ่าน `docs/01-requirements/backlog.md` จริงอย่างน้อย 1-2 จุด
   ก่อนไปต่อ ห้ามเชื่อรายงานของ subagent/skill 100% โดยไม่ตรวจเอง ถ้าพบปัญหาเชิงโครงสร้างที่ทำให้
   ตรวจต่อไม่ได้ ให้หยุด pipeline ทันทีและรายงานผู้ใช้ ไม่ไปขั้นตอนถัดไป

4. **ชั้นที่ 2 — backlog ↔ feature-list/user-journey**: เรียกผ่าน **Skill tool** ด้วย
   `skill: sync-feature-journey` **ต้องรอชั้นที่ 1 เสร็จสมบูรณ์ก่อนเสมอ** เพราะชั้นนี้ต้องใช้
   `backlog.md` เวอร์ชันล่าสุดหลังชั้นที่ 1 เป็นแหล่งความจริง

5. **ตรวจสอบผลลัพธ์ชั้นที่ 2**: สุ่มอ่าน `feature-list.md`/`user-journey.md` จริงอย่างน้อย 1-2 จุด
   (รวมถึงตรวจว่าทุก journey มี mermaid block กำกับ) ถ้าพบปัญหาเชิงโครงสร้าง ให้หยุด pipeline และ
   รายงานผู้ใช้เช่นกัน

6. **ชั้นที่ 3 — feature-list/user-journey ↔ เอกสารทดสอบ**: เรียกผ่าน **Skill tool** ด้วย
   `skill: sync-test-plan` (ไม่ใช่เรียก subagent `test-writer` ตรงๆ เพราะ skill นี้มี auto-chain
   guard ไป `requirement-writer`/`sync-feature-journey` ในตัวอยู่แล้วเผื่อเจอ requirement ใหม่
   ระหว่างเขียน acceptance criteria ไม่ต้องทำ guard ซ้ำในชั้นนี้) **ต้องรอชั้นที่ 2 เสร็จสมบูรณ์
   ก่อนเสมอ**

7. **ตรวจสอบผลลัพธ์ชั้นที่ 3**: สุ่มอ่าน `acceptance-criteria.md`, `test-plan.md`, และไฟล์ใน
   `test-cases/` จริงอย่างน้อย 1-2 จุด ถ้า `sync-test-plan` รายงานว่า auto-chain ไป
   `requirement-writer`/`sync-feature-journey` ระหว่างทาง ให้บันทึกไว้สำหรับสรุปในข้อ 8 ด้วย
   (เป็นเรื่องปกติ ไม่ใช่ข้อผิดพลาด)

8. **สรุปผลรวมทั้งช่วงเป็นรายงานเดียว** แยกตาม sub-step ให้ผู้ใช้เห็นชัดว่าแต่ละชั้นเกิดอะไรขึ้นบ้าง:
   - **spec ↔ backlog**: สร้าง/แก้ไขอะไรบ้าง (path เต็ม), รหัส FR-xx/NFR-xx ใหม่ (ถ้ามี)
   - **backlog ↔ feature-list/user-journey**: up to date อยู่แล้วหรือแก้ไขอะไรไปบ้าง (รวมรอบที่
     สองถ้าถูกแก้ซ้ำจากการ auto-chain ในข้อ 7)
   - **feature-list/user-journey ↔ เอกสารทดสอบ**: up to date อยู่แล้วหรือแก้ไขอะไรไปบ้าง รวมถึง
     ความต้องการใหม่ที่ถูก auto-chain ไป `requirement-writer` ให้เอง (ถ้ามี)
   - จุดที่ subagent/skill ตัวใดถามผู้ใช้ระหว่างทางและคำตอบที่ได้ (ถ้ามี)

## ข้อควรระวัง

- **ต้องรันตามลำดับชั้นเสมอ (sequential) ห้ามรันขนาน** เพราะแต่ละชั้นต้องพึ่งผลลัพธ์ที่อัปเดตแล้ว
  ของชั้นก่อนหน้าเป็นแหล่งความจริง
- ห้ามข้ามการเรียก subagent/skill แล้วแก้ไฟล์เองตรงๆ ในเทรดหลักไม่ว่าชั้นใด — แต่ละตัวคือแหล่ง
  ความจริงเดียวของกฎการเทียบในชั้นของตัวเอง
- Skill นี้ scope แค่ "ช่วงที่ 1" เท่านั้น — **ไม่ลากต่อไปช่วง prototype (`run-prototype-phase`)
  หรือช่วง technical/phase plan (`run-technical-phase`)** แม้ผลลัพธ์จะมี FR/NFR ใหม่เกิดขึ้น
  ให้จบแค่รายงานสรุปในข้อ 8 แล้วแนะนำผู้ใช้ว่าถ้าต้องการอัปเดต prototype/เอกสารเทคนิคต่อ ให้เรียก
  skill ที่เกี่ยวข้องเพิ่มเอง
- Skill `sync-test-plan` มี loop guard ของตัวเองอยู่แล้ว (auto-chain ได้ไม่เกิน 1 รอบ) ไม่ต้องทำ
  guard ซ้ำในชั้นนี้ แค่รอผลลัพธ์สุดท้ายกลับมาแล้วตรวจสอบตามข้อ 7
- ถ้า subagent/skill ตัวใดตัวหนึ่งรายงานปัญหาเชิงโครงสร้าง (โฟลเดอร์ที่คาดไว้หาไม่เจอ ฯลฯ) ให้หยุด
  pipeline ทันที ไม่ไปชั้นถัดไป แล้วรายงานปัญหานั้นให้ผู้ใช้ก่อนเสมอ
- ถ้าผู้ใช้ส่ง requirement ดิบมาหลายเรื่องไม่เกี่ยวข้องกันในคำขอเดียว ปล่อยให้ `capture-requirement`
  จัดการถามผู้ใช้เอง (มี logic นี้อยู่แล้ว) อย่าตัดสินใจแทน
