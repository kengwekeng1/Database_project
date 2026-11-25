// จุดเดียวสำหรับปรับ URL หรือรูปแบบ JSON เมื่อทีม Backend ตกลงสัญญา API
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, method = 'GET', body, field = 'data') {
  let response;
  try {
    response = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json', 'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองอีกครั้ง', 0);
  }

  if (response.status === 204) return;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.message || 'เซิร์ฟเวอร์ตอบกลับผิดพลาด (' + response.status + ')', response.status, data?.code);
  }
  if (!field) return data;
  if (!data || !Object.hasOwn(data, field)) {
    throw new ApiError('รูปแบบข้อมูลจาก API ไม่ตรงกับคู่มือการเชื่อมต่อ', response.status);
  }
  return data[field];
}

export const api = {
  me: () => request('/me', 'GET', undefined, 'user'),
  authConfig: () => request('/auth/config', 'GET', undefined, null),
  firebaseLogin: idToken => request('/auth/firebase', 'POST', { idToken }, 'user'),
  register: body => request('/register', 'POST', body, 'user'),
  login: body => request('/login', 'POST', body, 'user'),
  logout: () => request('/logout', 'POST', undefined, null),
  projects: () => request('/projects', 'GET', undefined, 'projects'),
  createProject: body => request('/projects', 'POST', body, 'project'),
  joinProject: body => request('/projects/join', 'POST', body, 'project'),
  members: id => request('/projects/' + id + '/members', 'GET', undefined, 'members'),
  projectTasks: id => request('/projects/' + id + '/tasks'),
  myTasks: () => request('/tasks/mine'),
  createTask: (id, body) => request('/projects/' + id + '/tasks', 'POST', body),
  updateTask: (id, body) => request('/tasks/' + id, 'PATCH', body),
  submitTask: (id, body) => request('/tasks/' + id + '/submission', 'POST', body),
  deleteTask: id => request('/tasks/' + id, 'DELETE')
};
