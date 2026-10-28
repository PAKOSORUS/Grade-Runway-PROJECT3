# Grade Runway

ระบบติดตามความเสี่ยงการเรียนของผู้เรียน และแชทแนะนำแนวทางการเรียนระหว่างนักศึกษาที่ต้องผ่านการตรวจของอาจารย์/ผู้ดูแลระบบก่อนเผยแพร่ (งานรายวิชา)

- ตารางสิทธิ์ของทั้ง 4 บทบาท: [ACL.md](ACL.md)
- วิธีรันและโครงสร้างโค้ด: [CLAUDE.md](CLAUDE.md)
- เว็บ rules และ indexes deploy แล้ว (hosting) ส่วน Cloud Functions ยังไม่ได้ deploy ดูหัวข้อ "URL ออนไลน์" ด้านล่าง

## Security Rules

ไฟล์กฎอยู่ที่ [firebase/firestore.rules](firebase/firestore.rules)

### กฎขั้นต่ำของรายวิชา

ต้องล็อกอินก่อนจึงอ่านหรือเขียนข้อมูลได้ (คนที่ไม่ได้ล็อกอินห้ามแตะข้อมูลเลย)

### กฎของโปรเจกต์นี้เข้มกว่านั้น

แค่ "ล็อกอินแล้ว" ไม่พอที่จะแตะข้อมูล:

1. **ทุก collection ปิดเป็นค่าเริ่มต้น** กฎสุดท้ายของไฟล์ (`match /{document=**}`) ปฏิเสธทั้งอ่านและเขียนสำหรับทุกคน แม้ล็อกอินแล้ว แม้เป็น `admin`
2. **หน้าเว็บเขียน Firestore ตรงไม่ได้เลย** การเขียนทุกอย่างต้องผ่าน callable function (Cloud Functions + Admin SDK) ซึ่งตรวจบทบาทและบันทึก audit ในธุรกรรมเดียวกัน แม้แต่ `chatMessages` ก็ห้ามเขียนจาก client (`allow write: if false`) ดังนั้นผู้ใช้เขียน `users` เพื่อให้สิทธิ์ตัวเองไม่ได้
3. **อ่านตรงได้ที่เดียวคือ `chatMessages`** และเฉพาะบัญชีที่ `status` เป็น `active` และมีบทบาท `lecturer` หรือ `admin` ใน `users/{uid}.roles` (เพื่อให้หน้าตรวจข้อความอ่านคิวได้) นักศึกษาอ่านตรงไม่ได้ ต้องอ่านผ่าน callable ที่กรองให้ (ข้อความที่อนุมัติแล้ว หรือของตัวเอง) ส่วนครูที่ปรึกษาไม่มีสิทธิ์อ่านข้อความเลย
4. ข้อมูลอื่นทั้งหมด (ผลการเรียน ความเสี่ยง บัญชี audit ล็อกการตรวจ ฯลฯ) ผู้ใช้เข้าถึงได้เฉพาะผ่าน callable ตามสิทธิ์ใน [ACL.md](ACL.md)

> กฎอ่านบทบาทจาก `users/{uid}` จึงต้องตั้งรหัสเอกสารให้เท่ากับ Firebase Auth uid

### ผลที่คาดหวังเมื่อเปิดแบบ Incognito โดยไม่ล็อกอิน

| สิ่งที่ลอง | ผลที่คาดหวัง |
|---|---|
| อ่านหรือเขียน Firestore ตรง (ทุก collection รวม `chatMessages`) | `permission-denied` |
| เรียก callable function | `unauthenticated` ("ต้องเข้าสู่ระบบก่อน") |
| เปิดหน้า `/admin/`, `/review-queue/`, `/dashboard/` | ถูกพาไปหน้า `/login/` ก่อนโหลดข้อมูลใด ๆ |

ตรวจแล้ว: แถวแรก (Firestore ตรง) ทดสอบด้วยเทสต์บน emulator และบนโปรเจกต์จริงหลัง deploy ด้วยการเรียก REST ของ Firestore โดยไม่แนบ token ได้ `403 PERMISSION_DENIED` ทั้ง `chatMessages` และ `users` ส่วนแถวที่สอง (callable) ตรวจกับของจริงไม่ได้ เพราะ Functions ยังไม่ได้ deploy ตอนนี้ดูผลได้จากเทสต์เท่านั้น

### เทสต์

[functions/test/rules.test.js](functions/test/rules.test.js) ทดสอบกฎกับ Firestore emulator (`@firebase/rules-unit-testing`) ครอบคลุม:

- `lecturer` / `admin` ที่ active อ่าน `chatMessages` ได้
- นักศึกษา ครูที่ปรึกษา ผู้ตรวจที่ถูกปิดบัญชี บัญชีที่ไม่มีเอกสาร `users` และผู้ที่ไม่ได้ล็อกอิน อ่านไม่ได้
- ไม่มีใครเขียน `chatMessages` จาก client ได้ แม้เป็นผู้ตรวจ
- collection อื่นทั้งหมดปิดสำหรับ client แม้เป็น `admin`
- ผู้ใช้ให้บทบาทตัวเองด้วยการเขียน `users` ไม่ได้

รันด้วย `cd functions && npm test` (ต้องมี Java 21 ขึ้นไป)

> เปลี่ยน `firestore.rules` ให้หลวมลงไม่ได้โดยไม่ผ่านเทสต์ข้างบนและไม่บอกผู้รับผิดชอบโปรเจกต์ก่อน

## URL ออนไลน์

https://grade-runway-project.web.app

(Firebase Hosting โปรเจกต์ `grade-runway-project` เปิด `/` จะพาไป `/login/` เอง)

### สถานะการ deploy

| ส่วน | สถานะ |
|---|---|
| Hosting (`web/`) | deploy แล้ว |
| Firestore Rules (`firebase/firestore.rules`) | deploy แล้ว |
| Firestore Indexes (`firestore.indexes.json`) | deploy แล้ว |
| Cloud Functions (`functions/`) | **ยังไม่ได้ deploy** |

**หมายเหตุ:** Cloud Functions ยังไม่ได้ deploy เพราะโปรเจกต์อยู่แผน Spark (Functions ต้องใช้แผน Blaze) ปุ่มและหน้าที่ต้องเรียก backend จึงยังใช้ไม่ได้บนเว็บจริง: เข้าหน้า login ได้ แต่หลังล็อกอินหรือสมัคร คาดว่าหน้าจะขึ้น "ระบบหลังบ้านยังไม่เปิดใช้งาน ลองใหม่ภายหลัง" (ทดสอบกรณีนี้แล้วบน emulator ที่ปิด Functions แต่ยังไม่ได้ลองล็อกอินบนเว็บจริง) ทดสอบการทำงานเต็มรูปแบบได้เฉพาะบน emulator (ดูขั้นตอนใน [CLAUDE.md](CLAUDE.md)) จนกว่าจะอัปเกรดเป็น Blaze แล้วรัน `firebase deploy --only functions`
