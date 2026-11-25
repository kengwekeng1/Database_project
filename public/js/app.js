import { api } from './api.js';

const $ = id => document.getElementById(id);
const state = { user: null, projects: [], projectId: null, members: [], viewRequest: 0 };
let registering = false;
let firebaseLogin;
let useLegacyLogin = false;
let submitEditor;
let noticeTimer;

function notice(message, error = false) {
  clearTimeout(noticeTimer);
  $('notice').textContent = message;
  $('notice').dataset.error = String(error);
  $('notice').hidden = false;
  noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 6000);
}

function showAuth() {
  state.user = null;
  state.projectId = null;
  state.projects = [];
  state.members = [];
  state.viewRequest++;
  $('app').hidden = true;
  $('auth').hidden = false;
}

function handleError(error) {
  if (error.status === 401 && state.user) {
    $('editor').close();
    showAuth();
    notice('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', true);
    return;
  }
  notice(error.message, true);
}

function todayInThailand() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts();
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [values.year, values.month, values.day].join('-');
}

function displayDate(value) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'UTC' })
    .format(new Date(value + 'T00:00:00Z'));
}

const submissionTime = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok'
});

function currentProject() {
  return state.projects.find(project => project.project_id === state.projectId);
}

function renderProjects() {
  $('projects').replaceChildren();
  $('my-tasks').setAttribute('aria-current', state.projectId === null ? 'page' : 'false');
  for (const project of state.projects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = project.project_name;
    button.setAttribute('aria-current', project.project_id === state.projectId ? 'page' : 'false');
    button.onclick = () => openView(project.project_id);
    $('projects').append(button);
  }
}

async function openView(projectId = state.projectId) {
  if (!state.user) return;
  const requestId = ++state.viewRequest;
  state.projectId = projectId;
  state.members = [];
  const project = currentProject();
  renderProjects();
  $('view-label').textContent = project ? 'โปรเจกต์กลุ่ม' : 'รายการส่วนตัว';
  $('view-title').textContent = project?.project_name ?? 'งานของฉัน';
  $('project-meta').hidden = !project;
  $('project-deadline').textContent = project ? displayDate(project.deadline) : '';
  $('invite').hidden = !project?.join_code;
  $('invite-code').textContent = project?.join_code ?? '';
  $('task-context-label').textContent = project ? 'ผู้รับผิดชอบ' : 'โปรเจกต์';
  $('project-description').hidden = !project?.description;
  $('project-description').textContent = project?.description ?? '';
  $('add-task').hidden = !project;
  $('add-task').disabled = true;
  $('task-list').replaceChildren();
  $('task-progress').hidden = true;
  $('view-status').textContent = 'กำลังโหลดรายการงาน…';

  try {
    const [tasks, members] = project
      ? await Promise.all([api.projectTasks(projectId), api.members(projectId)])
      : [await api.myTasks(), []];
    if (requestId !== state.viewRequest) return;
    state.members = members;
    $('add-task').disabled = false;
    const completed = tasks.filter(task => task.is_completed).length;
    $('task-progress').textContent = 'เสร็จแล้ว ' + completed + ' จาก ' + tasks.length + ' งาน';
    $('task-progress').hidden = false;
    $('view-status').textContent = tasks.length ? '' : project ? 'ยังไม่มีงานในโปรเจกต์นี้' : 'ยังไม่มีงานที่มอบหมายให้คุณ';
    const today = todayInThailand();
    $('task-list').replaceChildren(...tasks.map(task => renderTask(task, project, today)));
  } catch (error) {
    if (requestId !== state.viewRequest) return;
    $('view-status').textContent = 'โหลดรายการงานไม่ได้ ลองกดรีเฟรชอีกครั้ง';
    handleError(error);
  }
}

async function refreshProjects() {
  const user = state.user;
  const projects = await api.projects();
  if (user !== state.user) return;
  state.projects = projects;
  if (!currentProject()) state.projectId = null;
  renderProjects();
}

function renderTask(task, project, today) {
  const row = document.createElement('li');
  row.className = task.is_completed ? 'task task-grid done' : 'task task-grid';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = task.is_completed;
  checkbox.setAttribute('aria-label', 'สถานะเสร็จของ ' + task.title);
  checkbox.onchange = async () => {
    const checked = checkbox.checked;
    const activeView = state.viewRequest;
    checkbox.disabled = true;
    try {
      await api.updateTask(task.task_id, { is_completed: checked });
      if (activeView === state.viewRequest) await openView();
    } catch (error) {
      checkbox.checked = !checked;
      handleError(error);
    } finally {
      checkbox.disabled = false;
    }
  };

  const details = document.createElement('div');
  details.className = 'task-details';
  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;
  details.append(title);
  const assignee = state.members.find(member => member.user_id === task.assigned_to);
  const context = document.createElement('div');
  context.className = 'task-context';
  const contextLabel = document.createElement('span');
  contextLabel.className = 'cell-label';
  contextLabel.textContent = project ? 'ผู้รับผิดชอบ' : 'โปรเจกต์';
  context.append(contextLabel, project ? (assignee?.username ?? 'ยังไม่มอบหมาย') : (task.project_name ?? '—'));
  const due = document.createElement('div');
  due.className = 'task-due';
  const dueLabel = document.createElement('span');
  dueLabel.className = 'cell-label';
  dueLabel.textContent = 'วันส่งงาน';
  due.append(dueLabel, task.due_date ? displayDate(task.due_date) : '—');
  const status = document.createElement('span');
  status.className = 'task-status';
  if (task.is_completed) {
    status.textContent = 'เสร็จแล้ว';
  } else if (task.due_date && task.due_date < today) {
    status.textContent = 'เลยกำหนด';
    due.classList.add('overdue');
  } else if (task.due_date === today) {
    status.textContent = 'ส่งวันนี้';
    due.classList.add('due-today');
  }
  if (status.textContent) due.append(status);
  if (task.description) {
    const description = document.createElement('p');
    description.className = 'muted';
    description.textContent = task.description;
    details.append(description);
  }
  const submission = task.submission;
  if (submission) {
    const evidence = document.createElement('div');
    evidence.className = 'submission-evidence';
    const badge = document.createElement('span');
    badge.className = 'submission-badge';
    badge.textContent = 'ส่งแล้ว';
    evidence.append(badge);
    const url = submission.url ? URL.parse(submission.url) : null;
    if (url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) {
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'เปิดผลงาน';
      evidence.append(link);
    }
    const receipt = document.createElement('p');
    receipt.className = 'muted';
    receipt.textContent = submission.submitted_by.username + ' · ' + submissionTime.format(new Date(submission.submitted_at));
    details.append(evidence, receipt);
    if (submission.text) {
      const message = document.createElement('p');
      message.className = 'submission-message';
      message.textContent = submission.text;
      details.append(message);
    }
  }
  if (task.assigned_to === state.user.user_id) {
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'link submit-task';
    submit.textContent = submission ? 'แก้ไขการส่งงาน' : 'ส่งงาน';
    submit.setAttribute('aria-label', submit.textContent + ' ' + task.title);
    submit.onclick = () => openSubmissionEditor(task);
    details.append(submit);
  }

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  if (project) {
    const edit = document.createElement('button');
    edit.textContent = 'แก้ไข';
    edit.setAttribute('aria-label', 'แก้ไข ' + task.title);
    edit.onclick = () => openTaskEditor(project, task);
    const remove = document.createElement('button');
    remove.textContent = 'ลบ';
    remove.className = 'danger';
    remove.setAttribute('aria-label', 'ลบ ' + task.title);
    remove.onclick = () => openEditor('ลบงาน', null, async () => {
      await api.deleteTask(task.task_id);
      await openView();
      notice('ลบงานแล้ว');
    }, 'ลบงาน', 'ยืนยันการลบงาน “' + task.title + '”');
    actions.append(edit, remove);
  }
  row.append(checkbox, details, context, due, actions);
  return row;
}

function openEditor(title, template, submit, buttonLabel = 'บันทึก', message = '') {
  $('dialog-title').textContent = title;
  $('editor-submit').textContent = buttonLabel;
  $('editor-error').hidden = true;
  $('fields').replaceChildren(template ? $(template).content.cloneNode(true) : document.createTextNode(message));
  submitEditor = submit;
  $('editor').showModal();
  $('fields').querySelector('input')?.focus();
  return $('editor-form').elements;
}

function openTaskEditor(project, task) {
  const fields = openEditor(task ? 'แก้ไขงาน' : 'เพิ่มงาน', 'task-fields', async values => {
    const title = values.title.trim();
    if (!title) throw new Error('กรุณากรอกชื่องาน');
    const body = {
      title,
      description: values.description.trim() || null,
      assigned_to: values.assigned_to || null,
      due_date: values.due_date || null
    };
    if (body.due_date && body.due_date > project.deadline) {
      throw new Error('วันส่งงานย่อยต้องอยู่ภายในวันส่งโปรเจกต์');
    }
    if (task) await api.updateTask(task.task_id, body);
    else await api.createTask(project.project_id, body);
    await openView();
    notice(task ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มงานแล้ว');
  });

  for (const member of state.members) {
    fields.assigned_to.add(new Option(member.username, String(member.user_id)));
  }
  fields.due_date.max = project.deadline;
  if (task) {
    fields.title.value = task.title;
    fields.description.value = task.description ?? '';
    fields.assigned_to.value = task.assigned_to ?? '';
    fields.due_date.value = task.due_date ?? '';
  }
}

function openSubmissionEditor(task) {
  const fields = openEditor('ส่งงาน ' + task.title, 'submission-fields', async values => {
    const url = values.url.trim();
    const text = values.text.trim();
    if (!url && !text) throw new Error('กรุณาใส่ลิงก์หรือข้อความอย่างน้อยหนึ่งอย่าง');
    await api.submitTask(task.task_id, { url, text });
    await openView();
    notice('ส่งผลงานแล้ว');
  }, 'ส่งงาน');
  fields.url.value = task.submission?.url ?? '';
  fields.text.value = task.submission?.text ?? '';
}

$('editor-form').onsubmit = async event => {
  event.preventDefault();
  const button = $('editor-submit');
  button.disabled = true;
  $('cancel').disabled = true;
  $('editor-error').hidden = true;
  try {
    await submitEditor(Object.fromEntries(new FormData(event.currentTarget)));
    $('editor').close();
  } catch (error) {
    if (error.status === 401) handleError(error);
    else {
      $('editor-error').textContent = error.message;
      $('editor-error').hidden = false;
    }
  } finally {
    button.disabled = false;
    $('cancel').disabled = false;
  }
};

$('editor').addEventListener('cancel', event => {
  if ($('editor-submit').disabled) event.preventDefault();
});
$('cancel').onclick = () => $('editor').close();
$('my-tasks').onclick = () => openView(null);
$('refresh').onclick = () => refreshProjects().then(() => openView()).catch(handleError);
$('add-task').onclick = () => openTaskEditor(currentProject());
async function enterProject(project) {
  const index = state.projects.findIndex(item => item.project_id === project.project_id);
  if (index === -1) state.projects.push(project);
  else state.projects[index] = project;
  await openView(project.project_id);
}

$('create-project').onclick = () => {
  const fields = openEditor('สร้างโปรเจกต์', 'project-fields', async values => {
    const projectName = values.project_name.trim();
    if (!projectName) throw new Error('กรุณากรอกชื่อโปรเจกต์');
    if (!values.deadline || values.deadline < todayInThailand()) {
      throw new Error('เลือกวันส่งตั้งแต่วันนี้เป็นต้นไป');
    }
    const project = await api.createProject({
      project_name: projectName, description: values.description.trim() || null, deadline: values.deadline
    });
    await enterProject(project);
    notice('สร้างโปรเจกต์แล้ว');
  }, 'สร้างโปรเจกต์');
  fields.deadline.min = todayInThailand();
};
$('join-project').onclick = () => openEditor('เข้าร่วมโปรเจกต์', 'join-fields', async values => {
  const code = values.join_code.trim();
  if (!code) throw new Error('กรุณากรอกรหัสเข้าร่วม');
  const project = await api.joinProject({ join_code: code });
  await enterProject(project);
  notice('เข้าร่วมโปรเจกต์แล้ว');
}, 'เข้าร่วม');

function setAuthMode(register) {
  registering = register;
  $('auth-error').hidden = true;
  const fields = $('auth-form').elements;
  $('auth-title').textContent = register ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  $('auth-submit').textContent = $('auth-title').textContent;
  $('auth-switch').textContent = register ? 'กลับไปเข้าสู่ระบบ' : 'สมัครสมาชิก';
  $('auth-switch').hidden = useLegacyLogin;
  $('legacy-login').textContent = useLegacyLogin ? 'กลับไปใช้ Firebase' : 'เข้าสู่ระบบด้วยบัญชีเดิม';
  $('google-login').hidden = useLegacyLogin;
  $('username-field').hidden = !register;
  fields.username.disabled = !register;
  fields.username.required = register;
  fields.password.autocomplete = register ? 'new-password' : 'current-password';
  fields.password.minLength = register ? 8 : 0;
}

async function startSession(user) {
  state.user = user;
  $('username').textContent = user.username;
  $('auth').hidden = true;
  $('app').hidden = false;
  const tasks = openView(null);
  try {
    await refreshProjects();
  } catch (error) {
    handleError(error);
  }
  await tasks;
}

$('auth-switch').onclick = () => setAuthMode(!registering);
$('legacy-login').onclick = () => {
  useLegacyLogin = !useLegacyLogin;
  $('auth-form').reset();
  setAuthMode(false);
};
$('auth-form').addEventListener('input', () => { $('auth-error').hidden = true; });
async function authenticate(getUser) {
  const buttons = ['auth-submit', 'auth-switch', 'google-login', 'legacy-login'].map($);
  $('auth-error').hidden = true;
  buttons.forEach(button => { button.disabled = true; });
  try {
    const user = await getUser();
    $('auth-form').reset();
    setAuthMode(false);
    await startSession(user);
  } catch (error) {
    $('auth-error').textContent = firebaseLogin?.messageFor(error) ?? error.message;
    $('auth-error').hidden = false;
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}
$('auth-form').onsubmit = event => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.currentTarget));
  authenticate(() => {
    if (firebaseLogin && !useLegacyLogin) return firebaseLogin.email(body, registering);
    return registering ? api.register(body) : api.login(body);
  });
};
$('google-login').onclick = () => authenticate(firebaseLogin.google);

$('logout').onclick = async () => {
  $('logout').disabled = true;
  try {
    await api.logout();
    showAuth();
  } catch (error) {
    handleError(error);
  } finally {
    $('logout').disabled = false;
  }
};

try {
  const { config, emulatorUrl } = await api.authConfig();
  if (config) {
    const { createFirebaseLogin } = await import('./firebase-login.js');
    firebaseLogin = await createFirebaseLogin(config, emulatorUrl, api.firebaseLogin);
    $('firebase-options').hidden = false;
  }
} catch {
  useLegacyLogin = true;
  setAuthMode(false);
  notice('เปิด Firebase Authentication ไม่ได้ กรุณารีเฟรชหน้า', true);
}
try {
  await startSession(await api.me());
} catch (error) {
  showAuth();
  if (error.status !== 401) handleError(error);
}
