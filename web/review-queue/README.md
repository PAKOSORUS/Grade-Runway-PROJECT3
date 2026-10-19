# Review queue (prototype)

หน้ารายการข้อความรอตรวจ อ่านจาก Firestore collection `chatMessages` (โปรเจกต์ `grade-runway-project`) แบบอ่านอย่างเดียว

## ใช้งาน
1. คัดลอก `firebase-config.example.js` เป็น `firebase-config.js` แล้ววางค่า `firebaseConfig` ของเว็บแอป (ไฟล์นี้ถูก git ignore)
2. ใน Firebase Console: เปิด Authentication > Sign-in method > Email/Password, สร้างบัญชีทดสอบ แล้วสร้างเอกสาร `users/{uid}` (id ต้องเท่ากับ uid ของบัญชีนั้น) ที่มี `status: "active"` และ `roles: ["lecturer"]` (หรือ `"admin"`)
3. วางเนื้อหา `firebase/firestore.rules` ลงแท็บ Rules ใน Firestore Console
4. เปิดผ่านเว็บเซิร์ฟเวอร์ (เปิดไฟล์ตรงด้วย `file://` ไม่ได้ เพราะเบราว์เซอร์บล็อก ES module):

```bash
npx serve web/review-queue
```

5. เข้าสู่ระบบด้วยบัญชีทดสอบ แล้วแก้ข้อมูลใน Console แล้วกด F5 หน้าจะเปลี่ยนตาม (โหลดครั้งเดียวตอนเปิดหน้า ไม่ใช่ realtime)

## ข้อควรระวัง
- เป็น prototype: ใช้กับข้อมูลตัวอย่าง (`_seed: true`) เท่านั้น อ่านได้เฉพาะ lecturer/admin ที่ login แล้ว ดู `docs/02-design/02-technical/technology-stack.md`
- ห้ามใส่ไฟล์ service account ในโฟลเดอร์นี้
