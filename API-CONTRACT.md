# สัญญา API สำหรับคนที่ 2–5

Frontend เรียก `/api` แบบ same-origin ใช้ Session Cookie และรับส่ง JSON ชื่อฟิลด์แบบ `snake_case` ทุก ID เป็นตัวเลข วันที่เป็นสตริง `YYYY-MM-DD` โดยไม่มีเวลา และ `is_completed` เป็น JSON boolean

เมื่อสำเร็จให้ส่ง `{"data": ...}` หรือ HTTP 204 แบบไม่มี body สำหรับลบงานและออกจากระบบ เมื่อผิดพลาดให้ส่ง `{"message":"ข้อความที่แสดงกับผู้ใช้ได้"}` เช่น 400 สำหรับข้อมูลผิด, 401 สำหรับยังไม่ล็อกอิน, 403 สำหรับไม่มีสิทธิ์, 404 สำหรับไม่พบ, 409 สำหรับข้อมูลซ้ำ

| Method | Path | JSON Request | ค่าใน `data` |
|---|---|---|---|
| POST | `/api/register` | `username, email, password` | `null` (201) |
| POST | `/api/login` | `email, password` | User พร้อมตั้ง Session Cookie |
| GET | `/api/me` | — | User ปัจจุบัน |
| POST | `/api/logout` | — | 204 พร้อมล้าง session |
| GET | `/api/projects` | — | Project[] เฉพาะกลุ่มที่เป็นสมาชิก |
| POST | `/api/projects` | `project_name, description, deadline` | Project ที่สร้าง (201) |
| POST | `/api/projects/join` | `join_code` | Project ที่เข้าร่วม |
| GET | `/api/projects/:projectId/members` | — | User[] ของกลุ่ม |
| GET | `/api/projects/:projectId/tasks` | — | Task[] |
| POST | `/api/projects/:projectId/tasks` | `title, description, assigned_to, due_date` | Task ที่สร้าง (201) |
| GET | `/api/tasks/mine` | — | Task[] ที่มอบหมายให้ผู้ใช้ปัจจุบัน แต่ละรายการมี `project_name` เพิ่ม |
| PATCH | `/api/tasks/:taskId` | เฉพาะฟิลด์ที่จะเปลี่ยน ได้แก่ `title, description, assigned_to, due_date, is_completed` | Task หลังแก้ไข |
| DELETE | `/api/tasks/:taskId` | — | 204 |

## ตัวอย่างค่าที่อยู่ใน data

```json
{"user_id":1,"username":"มิน"}
```

```json
{"project_id":12,"project_name":"Database Final","description":null,"deadline":"2026-11-20","owner_id":1,"join_code":"A4B7H9Z2"}
```

```json
{"task_id":5,"project_id":12,"title":"ออกแบบ ER Diagram","description":null,"assigned_to":1,"due_date":"2026-11-18","is_completed":false}
```

## ข้อตกลงฝั่งเซิร์ฟเวอร์

- ทุก endpoint นอกจากสมัครและล็อกอินต้องตรวจ Session ส่วน API ที่เข้าถึงโปรเจกต์หรืองานต้องตรวจสมาชิกใน `project_members` ทุกครั้ง
- สร้างโปรเจกต์และเพิ่มเจ้าของเข้า `project_members` ใน transaction เดียวกัน คืน `join_code` ให้เฉพาะสมาชิกตามนโยบายทีม การเข้าร่วมซ้ำให้คืน Project เดิมโดยใช้คู่คีย์ `(project_id, user_id)` ป้องกันแถวซ้ำ
- บังคับ `deadline` ตอนสร้างโปรเจกต์และเทียบกับวันนี้ตามเวลา Asia/Bangkok ฝั่ง API ด้วย ส่วน `due_date` เป็น nullable และต้องไม่เกิน `deadline` เมื่อมีค่า
- `assigned_to` เป็น nullable เมื่อยังไม่มอบหมาย ถ้ามีค่าต้องเป็นสมาชิกโปรเจกต์เดียวกัน ใช้ FK คู่ `(project_id, assigned_to)` อ้างถึง `project_members(project_id, user_id)` ได้
- `description` เป็น nullable ในทั้ง Project และ Task ใช้ `is_completed = false` ตอนเพิ่มงาน และรองรับ PATCH ที่ส่งเฉพาะสถานะจาก Checkbox
- เวอร์ชันนี้ใช้กติกาว่าสมาชิกของกลุ่มจัดการงานในกลุ่มได้ งานของฉันใช้ดูและติ๊กงานที่ได้รับมอบหมาย
- วันที่จาก MySQL ให้แปลงเป็น `YYYY-MM-DD` ก่อนส่ง และแปลงค่า `0/1` เป็น JSON boolean
