// เซิร์ฟเวอร์ทดลองในเครื่อง ข้อมูลอยู่ในหน่วยความจำและใช้บัญชีสมมติเท่านั้น
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const users = ['มิน', 'ต้น'].map((username, index) => ({
  user_id: index + 1, username, email: 'team' + (index + 1) + '@example.test', password: 'demo1234'
}));
const sessions = new Map();
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date());
const deadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const projects = [{
  project_id: 1, project_name: 'Database Final', description: 'งานกลุ่มวิชาฐานข้อมูล',
  deadline, owner_id: 1, join_code: 'TASKFLOW01'
}];
const members = new Map([[1, new Set([1])]]);
let nextTaskId = 4;
const tasks = [
  { task_id: 1, project_id: 1, title: 'ออกแบบ ER Diagram', description: null, assigned_to: 1, due_date: deadline, is_completed: false },
  { task_id: 2, project_id: 1, title: 'เตรียมข้อมูลตัวอย่าง', description: 'เตรียมข้อมูลสำหรับ Demo', assigned_to: null, due_date: null, is_completed: false },
  { task_id: 3, project_id: 1, title: 'แบ่งหน้าที่สมาชิก', description: null, assigned_to: 1, due_date: null, is_completed: true }
];

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(status === 204 ? undefined : JSON.stringify(payload));
}

function reject(status, message) {
  throw Object.assign(new Error(message), { status });
}

function publicUser({ user_id, username }) {
  return { user_id, username };
}

function projectFor(id, userId) {
  const project = projects.find(item => item.project_id === id);
  if (!project) reject(404, 'ไม่พบโปรเจกต์');
  if (!members.get(id).has(userId)) reject(403, 'คุณไม่ได้เป็นสมาชิกโปรเจกต์');
  return project;
}

function dateIsValid(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function taskFields(body, project, old = {}) {
  const { title, description = null, assigned_to = null, due_date = null, is_completed = false } = { ...old, ...body };
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 150) reject(400, 'กรุณาตรวจสอบชื่องาน');
  if (assigned_to !== null && !members.get(project.project_id).has(assigned_to)) reject(400, 'ผู้รับผิดชอบต้องเป็นสมาชิกโปรเจกต์');
  if (due_date !== null && (!dateIsValid(due_date) || due_date > project.deadline)) reject(400, 'วันส่งงานย่อยต้องอยู่ภายในวันส่งโปรเจกต์');
  if (typeof is_completed !== 'boolean') reject(400, 'สถานะงานต้องเป็น true หรือ false');
  return { title: title.trim(), description, assigned_to, due_date, is_completed };
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 65536) reject(413, 'ข้อมูลยาวเกินไป');
  }
  if (!raw) return {};
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* ตอบกลับด้วยข้อความเดียวกันสำหรับ JSON ผิดรูปแบบ */ }
  reject(400, 'ข้อมูล JSON ไม่ถูกต้อง');
}

const staticFiles = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/style.css', ['style.css', 'text/css']],
  ['/js/app.js', ['js/app.js', 'text/javascript']],
  ['/js/api.js', ['js/api.js', 'text/javascript']]
]);

async function handle(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;
  const method = req.method;
  const route = method + ' ' + path;
  const ok = (data, status = 200) => send(res, status, { data });

  if (method === 'GET' && staticFiles.has(path)) {
    const [file, type] = staticFiles.get(path);
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    return res.end(await readFile(new URL('../frontend/' + file, import.meta.url)));
  }

  const body = ['POST', 'PATCH'].includes(method) ? await readBody(req) : {};
  if (route === 'POST /api/register') {
    const { username, email, password } = body;
    if (!username || !email || typeof password !== 'string' || password.length < 8) reject(400, 'กรุณากรอกข้อมูลให้ครบ');
    if (users.some(user => user.email === email || user.username === username)) reject(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้แล้ว');
    users.push({ user_id: users.length + 1, username, email, password });
    return ok(null, 201);
  }
  if (route === 'POST /api/login') {
    const user = users.find(item => item.email === body.email && item.password === body.password);
    if (!user) reject(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    const session = randomUUID();
    sessions.set(session, user);
    res.setHeader('Set-Cookie', 'demo_session=' + session + '; Path=/; HttpOnly; SameSite=Lax');
    return ok(publicUser(user));
  }

  const token = req.headers.cookie?.match(/(?:^|;\s*)demo_session=([^;]+)/)?.[1];
  const user = sessions.get(token);
  if (!user) reject(401, 'กรุณาเข้าสู่ระบบ');
  const userId = user.user_id;
  if (route === 'GET /api/me') return ok(publicUser(user));
  if (route === 'POST /api/logout') {
    sessions.delete(token);
    res.setHeader('Set-Cookie', 'demo_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    return send(res, 204);
  }
  if (route === 'GET /api/projects') return ok(projects.filter(project => members.get(project.project_id).has(userId)));
  if (route === 'POST /api/projects') {
    const { project_name, description = null, deadline } = body;
    if (typeof project_name !== 'string' || !project_name.trim() || project_name.trim().length > 150) reject(400, 'กรุณาตรวจสอบชื่อโปรเจกต์');
    if (!dateIsValid(deadline) || deadline < today()) reject(400, 'เลือกวันส่งตั้งแต่วันนี้เป็นต้นไป');
    const project = {
      project_id: projects.length + 1, project_name: project_name.trim(), description, deadline,
      owner_id: userId, join_code: randomBytes(6).toString('hex').toUpperCase()
    };
    projects.push(project);
    members.set(project.project_id, new Set([userId]));
    return ok(project, 201);
  }
  if (route === 'POST /api/projects/join') {
    const project = projects.find(item => item.join_code === body.join_code);
    if (!project) reject(404, 'รหัสเข้าร่วมไม่ถูกต้อง');
    members.get(project.project_id).add(userId);
    return ok(project);
  }
  if (route === 'GET /api/tasks/mine') {
    return ok(tasks.filter(task => task.assigned_to === userId && members.get(task.project_id).has(userId))
      .map(task => ({ ...task, project_name: projects.find(project => project.project_id === task.project_id).project_name })));
  }

  const projectPath = path.match(/^\/api\/projects\/(\d+)\/(members|tasks)$/);
  if (projectPath) {
    const project = projectFor(Number(projectPath[1]), userId);
    const id = project.project_id;
    if (method === 'GET' && projectPath[2] === 'members') {
      return ok(users.filter(member => members.get(id).has(member.user_id)).map(publicUser));
    }
    if (method === 'GET' && projectPath[2] === 'tasks') return ok(tasks.filter(task => task.project_id === id));
    if (method === 'POST' && projectPath[2] === 'tasks') {
      const task = { task_id: nextTaskId++, project_id: id, ...taskFields(body, project) };
      tasks.push(task);
      return ok(task, 201);
    }
  }

  const taskPath = path.match(/^\/api\/tasks\/(\d+)$/);
  if (taskPath && ['PATCH', 'DELETE'].includes(method)) {
    const index = tasks.findIndex(task => task.task_id === Number(taskPath[1]));
    if (index === -1) reject(404, 'ไม่พบงาน');
    const task = tasks[index];
    const project = projectFor(task.project_id, userId);
    if (method === 'PATCH') {
      Object.assign(task, taskFields(body, project, task));
      return ok(task);
    }
    tasks.splice(index, 1);
    return send(res, 204);
  }
  reject(404, 'ไม่พบเส้นทางนี้');
}

const port = Number(process.env.PORT ?? 3000);
createServer((req, res) => handle(req, res).catch(error => {
  if (!error.status) console.error(error);
  if (!res.headersSent) send(res, error.status ?? 500, { message: error.status ? error.message : 'เซิร์ฟเวอร์ผิดพลาด' });
  else res.destroy();
})).listen(port, '127.0.0.1', () => console.log('เปิด http://127.0.0.1:' + port + '/?demo=1'));
