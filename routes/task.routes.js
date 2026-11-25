const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
const tasks = db.collection('tasks');
const projects = db.collection('projects');
const documentId = /^[A-Za-z0-9]{20}$/;

function reject(status, message) {
  throw Object.assign(new Error(message), { status });
}

function id(value) {
  if (typeof value !== 'string' || !documentId.test(value)) {
    reject(400, 'รหัสอ้างอิงไม่ถูกต้อง');
  }
  return value;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

async function memberProject(projectId, userId, read = ref => ref.get()) {
  const ref = projects.doc(projectId);
  const [project, member] = await Promise.all([read(ref), read(ref.collection('members').doc(userId))]);
  if (!project.exists || !member.exists) reject(404, 'ไม่พบโปรเจกต์หรือคุณไม่ได้เป็นสมาชิก');
  return project;
}

async function taskFields(body, project, transaction, old = {}) {
  const {
    title, description = null, assigned_to = null, due_date = null, is_completed = false,
  } = { ...old, ...body };
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 150) {
    reject(400, 'กรุณากรอกชื่องานไม่เกิน 150 ตัวอักษร');
  }
  if (description !== null && (typeof description !== 'string' || description.length > 2000)) {
    reject(400, 'รายละเอียดต้องไม่เกิน 2,000 ตัวอักษร');
  }
  if (due_date !== null && (!validDate(due_date) || due_date > project.data().deadline)) {
    reject(400, 'วันส่งงานย่อยต้องอยู่ภายในวันส่งโปรเจกต์');
  }
  if (typeof is_completed !== 'boolean') reject(400, 'สถานะงานต้องเป็น true หรือ false');
  if (assigned_to !== null) {
    const member = await transaction.get(project.ref.collection('members').doc(id(assigned_to)));
    if (!member.exists) reject(400, 'ผู้รับผิดชอบต้องเป็นสมาชิกโปรเจกต์');
  }
  return { title: title.trim(), description: description?.trim() || null, assigned_to, due_date, is_completed };
}

function submissionFields({ url = '', text = '' }) {
  if (typeof url !== 'string' || typeof text !== 'string') {
    reject(400, 'กรุณาตรวจสอบลิงก์และข้อความส่งงาน');
  }
  const link = url.trim();
  const message = text.trim();
  if (!link && !message) reject(400, 'กรุณาใส่ลิงก์หรือข้อความอย่างน้อยหนึ่งอย่าง');
  if (message.length > 2000) reject(400, 'ข้อความส่งงานต้องไม่เกิน 2,000 ตัวอักษร');
  if (!link) return { url: null, text: message };
  const parsed = link.length <= 2048 && /^https?:\/\//i.test(link) ? URL.parse(link) : null;
  if (!parsed || parsed.username || parsed.password) reject(400, 'กรุณาใช้ลิงก์ http:// หรือ https://');
  return { url: parsed.href, text: message || null };
}

function taskData(doc) {
  return { ...doc.data(), task_id: doc.id };
}

function sortedTasks(items) {
  return items.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.task_id.localeCompare(b.task_id));
}

router.get('/projects/:projectId/tasks', requireAuth, async (req, res) => {
  const projectId = id(req.params.projectId);
  await memberProject(projectId, req.session.user.user_id);
  const snapshot = await tasks.where('project_id', '==', projectId).get();
  res.json({ data: sortedTasks(snapshot.docs.map(taskData)) });
});

router.get('/tasks/mine', requireAuth, async (req, res) => {
  const userId = req.session.user.user_id;
  const [projectList, assigned] = await Promise.all([
    projects.where('member_ids', 'array-contains', userId).get(),
    tasks.where('assigned_to', '==', userId).get(),
  ]);
  const projectNames = new Map(projectList.docs.map(doc => [doc.id, doc.data().project_name]));
  const visible = assigned.docs.map(taskData)
    .filter(task => projectNames.has(task.project_id))
    .map(task => ({ ...task, project_name: projectNames.get(task.project_id) }));
  res.json({ data: sortedTasks(visible) });
});

router.post('/projects/:projectId/tasks', requireAuth, async (req, res) => {
  const projectId = id(req.params.projectId);
  const ref = tasks.doc();
  const data = await db.runTransaction(async transaction => {
    const project = await memberProject(projectId, req.session.user.user_id, ref => transaction.get(ref));
    const fields = await taskFields({ ...req.body, is_completed: false }, project, transaction);
    const task = { ...fields, project_id: projectId, created_at: new Date().toISOString(), submission: null };
    transaction.create(ref, task);
    return { ...task, task_id: ref.id };
  });
  res.status(201).json({ data });
});

async function changeTask(taskId, user, change) {
  const ref = tasks.doc(id(taskId));
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) reject(404, 'ไม่พบงาน');
    const task = taskData(snapshot);
    const project = await memberProject(task.project_id, user.user_id, ref => transaction.get(ref));
    return change(transaction, ref, task, project);
  });
}

router.patch('/tasks/:taskId', requireAuth, async (req, res) => {
  const data = await changeTask(req.params.taskId, req.session.user, async (transaction, ref, task, project) => {
    const fields = await taskFields(req.body, project, transaction, task);
    transaction.update(ref, fields);
    return { ...task, ...fields };
  });
  res.json({ data });
});

router.post('/tasks/:taskId/submission', requireAuth, async (req, res) => {
  const user = req.session.user;
  const data = await changeTask(req.params.taskId, user, (transaction, ref, task) => {
    if (task.assigned_to !== user.user_id) reject(403, 'เฉพาะผู้รับผิดชอบงานที่ส่งผลงานได้');
    const submission = {
      ...submissionFields(req.body ?? {}),
      submitted_by: { user_id: user.user_id, username: user.username },
      submitted_at: new Date().toISOString(),
    };
    transaction.update(ref, { submission });
    return { ...task, submission };
  });
  res.json({ data });
});

router.delete('/tasks/:taskId', requireAuth, async (req, res) => {
  await changeTask(req.params.taskId, req.session.user, (transaction, ref) => transaction.delete(ref));
  res.sendStatus(204);
});

module.exports = router;
