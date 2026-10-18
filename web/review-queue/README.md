# Review queue (prototype)

หน้ารายการข้อความรอตรวจ อ่านจาก Firestore collection `chatMessages` (โปรเจกต์ `grade-runway-project`) แบบอ่านอย่างเดียว

## ใช้งาน
1. คัดลอก `firebase-config.example.js` เป็น `firebase-config.js` แล้ววางค่า `firebaseConfig` ของเว็บแอป (ไฟล์นี้ถูก git ignore)
2. วางเนื้อหา `firebase/firestore.rules` ลงแท็บ Rules ใน Firestore Console (ต้องเปิดอ่าน `chatMessages`)
3. เปิดผ่านเว็บเซิร์ฟเวอร์ (เปิดไฟล์ตรงด้วย `file://` ไม่ได้ เพราะเบราว์เซอร์บล็อก ES module):

```bash
npx serve web/review-queue
```

4. แก้ข้อมูลใน Console แล้วกด F5 หน้าจะเปลี่ยนตาม (โหลดครั้งเดียวตอนเปิดหน้า ไม่ใช่ realtime)

## ข้อควรระวัง
- เป็น prototype: ใช้กับข้อมูลตัวอย่าง (`_seed: true`) เท่านั้น สิทธิ์อ่านเปิดให้ทุกคนชั่วคราว ดู `docs/02-design/02-technical/technology-stack.md`
- ห้ามใส่ไฟล์ service account ในโฟลเดอร์นี้
