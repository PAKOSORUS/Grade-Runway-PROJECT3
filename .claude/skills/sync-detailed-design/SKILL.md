---
name: sync-detailed-design
description: >
  ตรวจสอบและสร้าง/ปรับปรุงไฟล์ใน docs/02-design/02-technical/detailed-design/{feature-slug}.md
  (sequence flow, state transition, edge case ต่อฟีเจอร์ แบบไม่ผูก tech stack) ให้สอดคล้องกับ
  docs/02-design/02-technical/api-spec.md/db-spec.md ล่าสุด ใช้เมื่อผู้ใช้พิมพ์
  /sync-detailed-design หรือขอให้ "ทำ detailed design", "ออกแบบ component ของฟีเจอร์นี้",
  "อัปเดต detailed design จาก api spec"
---

# Sync Detailed Design

Skill นี้เป็น workflow มาตรฐานสำหรับตรวจสอบว่าไฟล์ใน `detailed-design/` สอดคล้อง ("up to
date") กับ `api-spec.md`/`db-spec.md`/`feature-list.md` หรือไม่ ถ้าไม่สอดคล้อง ให้สร้าง/
ปรับปรุงการออกแบบระดับ component ต่อฟีเจอร์ พร้อมบันทึก log ตามกฎใน `CLAUDE.md`

## เมื่อถูกเรียกใช้

1. **หาวันที่ปัจจุบัน**: รูปแบบ `YYYYMMDD` เพื่อส่งต่อให้ subagent

2. **ส่งต่อให้ subagent `detailed-design-writer`**: เรียกผ่าน Agent tool
   (`subagent_type: detailed-design-writer`, `run_in_background: false` เพราะอาจต้องถามผู้ใช้
   แบบโต้ตอบผ่าน AskUserQuestion กรณีเจอไฟล์ล้าสมัย) โดย prompt ต้องมีวันที่ปัจจุบันและบริบท
   session สนทนาจริง

3. **รอผลลัพธ์**: ปล่อยให้ subagent จัดการคำถามผู้ใช้เอง อย่าตอบแทน

4. **ตรวจสอบผลลัพธ์ก่อนรายงาน**: สุ่มอ่านไฟล์ใน `detailed-design/` จริงอย่างน้อย 1-2 จุด ตรวจว่า
   operation/entity ที่อ้างถึงมีอยู่จริงใน `api-spec.md`/`db-spec.md` และไม่มีการระบุ
   framework/library เฉพาะภาษาใดๆ หลุดเข้าไป

5. **สรุปให้ผู้ใช้ทราบ**: up to date หรือไม่ก่อนตรวจ, ไฟล์ที่สร้าง/แก้ไข, จุดที่ถามผู้ใช้ (ถ้ามี),
   ช่องว่างของ api-spec/db-spec ที่ subagent รายงาน (ถ้ามี)

## ข้อควรระวัง

- ห้ามข้ามการเรียก subagent แล้วเขียนไฟล์เองตรงๆ ในเทรดหลัก
- Subagent ห้ามแตะไฟล์ใดๆ นอกจากไฟล์ใน `detailed-design/` กับไฟล์ log — หากผลลัพธ์พูดถึงการ
  แก้ไข `api-spec.md`/`db-spec.md`/`architecture.md`/`feature-list.md` ให้หยุดและแจ้งผู้ใช้ทันที
- **ถ้าผลลัพธ์ระบุ framework/library/pattern เฉพาะภาษาใดๆ ทั้งที่ `technology-stack.md` ยังว่าง
  เปล่า ให้ถือว่าผิดกฎ** หยุดและแจ้งผู้ใช้ทันที
- ถ้า subagent รายงานว่า `api-spec.md`/`db-spec.md` ยังไม่ครอบคลุมฟีเจอร์ที่ต้องออกแบบ ให้แจ้ง
  ผู้ใช้ให้รัน `sync-api-db` ก่อน อย่าฝืนทำต่อ
- ไม่มี auto-chain ไป `requirement-writer` ในชั้นนี้ (agent นี้ถูกจำกัดให้ใช้ operation/entity ที่
  มีอยู่แล้วเท่านั้น ถ้าขาดให้แนะนำ `sync-api-db` แทนเสมอ ไม่ใช่ requirement ใหม่โดยตรง)
