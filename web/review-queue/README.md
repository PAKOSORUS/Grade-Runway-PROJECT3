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

3. เปิดหน้าเว็บจากโฟลเดอร์ `web` (ไม่ใช้ `file://` เพราะ ES module และทุกหน้าใช้โฟลเดอร์ `login/`, `shared/` ร่วมกัน จึงต้อง serve ทั้ง `web`):

```bash
npx serve web
```

4. เปิด `http://localhost:3000/login/#emulator` (ต้องมี `#emulator` จึงจะใช้ emulator `serve` ตัดค่า `?emulator=1` ทิ้งเมื่อ redirect) จะเห็นแถบ "โหมด emulator" แล้ว login ด้วยบัญชีที่สคริปต์ seed พิมพ์ไว้ หรือสมัครบัญชีใหม่ (ได้บทบาท student) ระบบพาไปหน้าตามบทบาท: admin → `/admin/`, lecturer → `/review-queue/`, นอกนั้น → `/dashboard/` ถ้าเปิดหน้าอื่นโดยไม่ได้ล็อกอินจะเด้งกลับมาหน้า login (reviewer1@example.test ฯลฯ รหัสผ่านใช้ได้เฉพาะใน emulator)

ข้อมูลใน emulator หายเมื่อปิด ต้อง seed ใหม่

## โหมดโปรเจกต์จริง
ต้อง deploy Cloud Functions ก่อน (ใช้แผน Blaze ยังไม่ได้ทำ) และมี `firebase-config.js`: คัดลอก `firebase-config.example.js` เป็น `firebase-config.js` แล้ววางค่า `firebaseConfig` ของเว็บแอป (ไฟล์นี้ถูก git ignore) บัญชีต้องมีเอกสาร `users/{uid}` ที่ `status: "active"` และ `roles` มี `lecturer` หรือ `admin`

## ข้อควรระวัง
- เป็น prototype ใช้กับข้อมูลตัวอย่างเท่านั้น
- token ของล็อกอยู่ในหน่วยความจำของหน้าเท่านั้น รีโหลดแล้วต้องกด "ล็อกใหม่เพื่อตรวจต่อ"
- ห้ามใส่ไฟล์ service account ในโฟลเดอร์นี้

## ปุ่ม "ให้ AI ช่วยวิเคราะห์" (ทดลอง)

ในฟอร์มตัดสิน (หลังล็อกข้อความ) ปุ่มนี้ส่ง `content` ของข้อความ (ไม่ส่งชื่อผู้ส่ง) ไป OpenRouter แล้วติ๊กตัวเลือกเชิงลบ/ไม่เชิงลบให้เป็นข้อเสนอ ผู้ตรวจต้องกดอนุมัติ/ปฏิเสธเอง รอได้ไม่เกิน 15 วินาที ถ้าไม่สำเร็จหรือ AI ตอบไม่เป็น true/false จะแจ้งในการ์ดและไม่แตะตัวเลือก

ต้องมี `web/shared/openrouter-config.js`: คัดลอก `web/shared/openrouter-config.example.js` แล้วใส่คีย์ (git ignore และไม่ถูก deploy) คีย์อยู่ฝั่งเบราว์เซอร์ จึงใช้เฉพาะบนเครื่องตัวเองช่วง prototype ถ้าไม่มีไฟล์ หน้านี้ใช้งานปกติ มีแค่ปุ่ม AI ที่แจ้งว่าไม่พบ config

### ปุ่ม "ให้ AI ช่วยสรุป"

ข้อความที่ส่งใหม่จะได้ข้อความเดิมและเหตุผลที่ถูกปฏิเสธมากับคิว (`previous`) ปุ่มนี้ส่ง `content` (และ `previous` ถ้ามี) ไป AI ไม่ส่งชื่อ/รหัสผู้ส่ง แล้วแสดงหัวข้อ สิ่งที่ผู้ตรวจควรระวังก่อนเผยแพร่ และ (ข้อความส่งใหม่) ว่าแก้ตามเหตุผลเดิมแล้วหรือยัง จากนั้นเรียก `saveAiSummary` อัตโนมัติ (ต้องถือล็อกอยู่) เพื่อเก็บ `aiSuggestion` บนข้อความ (เขียนทับ) และเพิ่ม `aiLog` หนึ่งรายการ (ไม่เขียนทับ) `status`/`decision` ไม่ถูกแตะ นักศึกษาไม่เห็นสรุปนี้
