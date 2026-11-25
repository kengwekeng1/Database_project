# Mini TaskFlow

เว็บแบ่งงานกลุ่มนักศึกษา ใช้ HTML/CSS/JavaScript, Node.js, Express Session Cookie, Firebase Authentication และ Cloud Firestore

## รันด้วย Emulator บน Windows

เปิด PowerShell สองแท็บที่โฟลเดอร์นี้ ต้องมี Node.js และ Java 21 ขึ้นไป

แท็บแรก

```powershell
npx.cmd --yes firebase-tools emulators:start --only auth,firestore --project demo-mini-taskflow
```

แท็บที่สอง หลังแท็บแรกแสดง `All emulators ready!`

```powershell
npm.cmd ci
$env:PORT = '3190'
$env:NODE_ENV = 'development'
$env:FIREBASE_PROJECT_ID = 'demo-mini-taskflow'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
Remove-Item Env:FIRESTORE_DATABASE_ID -ErrorAction SilentlyContinue
npm.cmd start
```

เปิด [หน้าเว็บ](http://127.0.0.1:3190/) หรือ [ตรวจ Firestore](http://127.0.0.1:3190/api/health) ปุ่ม Google ในโหมดนี้ใช้หน้าจำลองของ Firebase Auth ข้อมูลใน Firestore Emulator จะอยู่เมื่อรีสตาร์ต Express หากจะเก็บข้อมูลข้ามรอบที่ปิด Emulator ให้ใช้ `--export-on-exit` และ `--import`

## เช็กลำดับเดโม

1. ให้ A สมัครด้วยอีเมลและสร้างโปรเจกต์ ลองเว้นวันส่งก่อน แล้วใช้วันที่ในอนาคตสร้างและจดรหัส
2. ให้ B เปิด Incognito แล้วสมัครด้วยอีกอีเมลหรือใช้ Google จำลอง จากนั้นเข้าร่วมด้วยรหัส
3. A เพิ่มงานและมอบหมายให้ B จากนั้น B เปิดรายการและส่งข้อความอย่างเดียว ลองแก้เป็นข้อความพร้อมลิงก์ แล้วติ๊กเสร็จ
4. A รีเฟรชและตรวจว่าหลักฐาน ชื่อผู้ส่ง สถานะ และตัวนับตรงกัน หากต้องการตรวจความคงอยู่ ให้รีสตาร์ตเฉพาะ Express แล้วเข้าสู่ระบบใหม่
5. A ลบงานทดสอบ แล้วให้ B รีเฟรชยืนยันว่าหายจากรายการทั้งสองบัญชี

สำหรับหลักฐานส่งงาน สามารถเตรียมผู้ใช้ 2 คน โปรเจกต์ 1 รายการ สมาชิก 2 รายการ และงาน 5 รายการ รวมข้อมูลตัวอย่าง 10 รายการ เก็บภาพผลก่อนและหลังทำ CRUD และผลกรณีเว้นข้อมูล

## เมื่อใช้ Firebase บนคลาวด์

สร้าง Firebase โปรเจกต์และ Cloud Firestore แล้วเปิด Email/Password กับ Google ใน Authentication เพิ่ม Web App และอนุญาตโดเมนที่ใช้เปิดเว็บ นำ `projectId`, `apiKey` และ `authDomain` ของ Web App ไปตั้งเป็น `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY` และ `FIREBASE_WEB_AUTH_DOMAIN` ตาม `.env.example` ตั้ง ADC ให้ Backend มีสิทธิ์เข้าถึงฐานข้อมูล ตั้ง `SESSION_SECRET` เป็นค่าสุ่ม แล้วล้างตัวแปร `FIRESTORE_EMULATOR_HOST` และ `FIREBASE_AUTH_EMULATOR_HOST` ก่อนเริ่ม Express

หน้าเว็บเรียกข้อมูลผ่าน Express และ Firebase Admin SDK ให้จำกัดการเข้าฐานข้อมูลฝั่ง Client ตามการตั้งค่าของโปรเจกต์จริง ไฟล์ `firestore.rules` ที่มากับ Emulator เป็นไฟล์อ้างอิงจาก branch ฐานข้อมูลของทีม อย่า deploy ไฟล์นี้กับโปรเจกต์จริง เพราะรูปแบบข้อมูลของไฟล์นั้นต่างจากที่ Express ใช้ เวอร์ชันนี้ยังไม่ได้เปิดการยืนยันอีเมลและยังไม่มีการผูกบัญชี Express เดิมเข้ากับบัญชี Google

## เปิดเว็บไซต์บน Render

สร้าง **Web Service** จาก GitHub โดยเลือก branch ที่มีการตั้งค่าสำหรับ Render ใช้ Node.js, Build Command `npm ci --omit=dev` และ Start Command `npm start` ใช้ `/` เป็น Health Check Path ของโฮสต์ และเปิด `/api/health` เองเมื่อต้องการตรวจ Firestore

ตั้งค่าที่ **Environment** ใน Render

| ชื่อตัวแปร | ค่า |
| --- | --- |
| `NODE_ENV` | `production` |
| `FIREBASE_PROJECT_ID` | `projectId` ของ Firebase Web App |
| `FIREBASE_WEB_API_KEY` | `apiKey` ของ Firebase Web App |
| `FIREBASE_WEB_AUTH_DOMAIN` | `authDomain` ของ Firebase Web App |
| `SESSION_SECRET` | ค่าสุ่มอย่างน้อย 32 ตัวอักษร |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/firebase-admin.json` |

ใน **Secret Files** ให้ตั้งไฟล์ชื่อ `firebase-admin.json` โดยใช้ JSON ของ Service Account สำหรับโปรเจกต์นั้น เก็บคีย์และ `.env` นอก GitHub สำหรับฐานข้อมูลชื่อ `(default)` เว้น `FIRESTORE_DATABASE_ID` ได้ และให้ Render กำหนด `PORT` เอง

เมื่อได้ URL `https://...onrender.com` ให้เพิ่มเฉพาะชื่อโฮสต์ใน Firebase **Authentication → Settings → Authorized domains** จากนั้นเปิด `/api/health` ให้ได้ `status: ok` แล้วลอง Google Login และสร้างงานจาก URL จริง

เวอร์ชันเดโมเก็บเซสชันในหน่วยความจำของ Express เมื่อ Render รีสตาร์ตหรือพักบริการ ผู้ใช้ต้องล็อกอินใหม่ ข้อมูลงานและโปรเจกต์ยังอยู่ใน Firestore

## โครงสร้างข้อมูลที่บันทึก

| ชุดข้อมูลหลัก | ตำแหน่ง | ความสัมพันธ์ |
| --- | --- | --- |
| ผู้ใช้ | `users/{userId}` | Firebase UID ชี้ไปยัง user ID เดิมผ่าน `firebaseIdentities` |
| โปรเจกต์ | `projects/{projectId}` | มี `owner_id`, `member_ids`, `deadline` และรหัสเข้าร่วม |
| สมาชิก | `projects/{projectId}/members/{userId}` | เอกสารเชื่อมผู้ใช้กับโปรเจกต์ |
| งาน | `tasks/{taskId}` | มี `project_id`, `assigned_to`, `due_date`, `is_completed` และ `submission` |

Task API ใช้ `GET /api/projects/:projectId/tasks` อ่านงาน, `POST /api/projects/:projectId/tasks` สร้างงาน, `PATCH /api/tasks/:taskId` แก้ไขหรือติ๊กเสร็จ และ `DELETE /api/tasks/:taskId` ลบงาน ผู้รับผิดชอบส่งผลงานผ่าน `POST /api/tasks/:taskId/submission` ด้วย `text` หรือ `url` อย่างน้อยหนึ่งอย่าง Express บันทึกชื่อผู้ส่งและเวลาที่เซิร์ฟเวอร์รับคำขอ สถานะส่งงานแยกจากสถานะติ๊กเสร็จ
