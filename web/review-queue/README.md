# Review queue (prototype)

หน้าตรวจข้อความรออนุมัติ: ล็อกข้อความ ระบุเชิงลบ/ไม่เชิงลบ แล้วอนุมัติหรือปฏิเสธ (ปฏิเสธต้องมีเหตุผล) หรือปลดล็อก
ทุกการกระทำเรียก Backend (Cloud Functions: `listReviewQueue`, `lockMessage`, `decideMessage`, `releaseLock`) หน้านี้ไม่แตะ Firestore ตรง

## ทดสอบกับ emulator ในเครื่อง (ไม่ต้องใช้โปรเจกต์จริงหรือแผน Blaze)
ต้องมี Java 21 ขึ้นไป (ตั้ง `JAVA_HOME` ถ้า PATH ยังเป็นรุ่นเก่า)

1. เปิด emulator ที่ราก repo (Auth, Firestore, Functions):

```bash
npx firebase emulators:start --only functions,firestore,auth --project demo-grade-runway
```

2. ใส่ข้อมูลและบัญชีทดสอบ (สคริปต์ปฏิเสธการรันถ้าไม่ได้ชี้ emulator):

```bash
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/seed-emulator.js
```

3. เปิดหน้าเว็บ (ไม่ใช้ `file://` เพราะ ES module):

```bash
npx serve web/review-queue
```

4. เปิด `http://localhost:3000/#emulator` (ต้องมี `#emulator` จึงจะใช้ emulator `serve` ตัดค่า `?emulator=1` ทิ้งเมื่อ redirect) จะเห็นแถบ "โหมด emulator" แล้ว login ด้วยบัญชีที่สคริปต์ seed พิมพ์ไว้ (reviewer1@example.test ฯลฯ รหัสผ่านใช้ได้เฉพาะใน emulator)

ข้อมูลใน emulator หายเมื่อปิด ต้อง seed ใหม่

## โหมดโปรเจกต์จริง
ต้อง deploy Cloud Functions ก่อน (ใช้แผน Blaze ยังไม่ได้ทำ) และมี `firebase-config.js`: คัดลอก `firebase-config.example.js` เป็น `firebase-config.js` แล้ววางค่า `firebaseConfig` ของเว็บแอป (ไฟล์นี้ถูก git ignore) บัญชีต้องมีเอกสาร `users/{uid}` ที่ `status: "active"` และ `roles` มี `lecturer` หรือ `admin`

## ข้อควรระวัง
- เป็น prototype ใช้กับข้อมูลตัวอย่างเท่านั้น
- token ของล็อกอยู่ในหน่วยความจำของหน้าเท่านั้น รีโหลดแล้วต้องกด "ล็อกใหม่เพื่อตรวจต่อ"
- ห้ามใส่ไฟล์ service account ในโฟลเดอร์นี้
