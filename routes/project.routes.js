const express = require('express');
const { randomBytes } = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(requireAuth);

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function makeJoinCode() {
  return randomBytes(5).toString('hex').toUpperCase();
}

async function isMember(projectId, userId) {
  const [rows] = await db.execute(
    'SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1',
    [projectId, userId]
  );
  return rows.length > 0;
}

// GET /api/projects - projects the signed-in user belongs to
router.get('/', async (req, res, next) => {
  try {
    const [projects] = await db.execute(
      `SELECT p.project_id, p.project_name, p.description, p.deadline, p.owner_id, p.created_at,
              pm.joined_at
       FROM projects p
       INNER JOIN project_members pm ON pm.project_id = p.project_id
       WHERE pm.user_id = ?
       ORDER BY p.created_at DESC`,
      [req.session.user.user_id]
    );
    res.json({ projects });
  } catch (error) { next(error); }
});

// POST /api/projects - create a project and add its owner as a member
router.post('/', async (req, res, next) => {
  const projectName = String(req.body.project_name || '').trim();
  const description = req.body.description == null ? null : String(req.body.description).trim();
  const deadline = req.body.deadline;
  if (!projectName) return res.status(400).json({ message: 'Project name is required.' });
  if (projectName.length > 150) return res.status(400).json({ message: 'Project name must be 150 characters or fewer.' });
  if (!isValidDate(deadline)) return res.status(400).json({ message: 'A valid project deadline (YYYY-MM-DD) is required.' });
  const today = new Date().toISOString().slice(0, 10);
  if (deadline < today) return res.status(400).json({ message: 'Project deadline cannot be in the past.' });

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const joinCode = makeJoinCode();
    const [result] = await connection.execute(
      'INSERT INTO projects (project_name, description, deadline, join_code, owner_id) VALUES (?, ?, ?, ?, ?)',
      [projectName, description || null, deadline, joinCode, req.session.user.user_id]
    );
    await connection.execute(
      'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
      [result.insertId, req.session.user.user_id]
    );
    await connection.commit();
    res.status(201).json({
      message: 'Project created successfully.',
      project: {
        project_id: result.insertId,
        project_name: projectName,
        description: description || null,
        deadline,
        join_code: joinCode,
        owner_id: req.session.user.user_id,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return res.status(503).json({ message: 'Could not generate a unique invite code. Please try again.' });
    next(error);
  } finally {
    if (connection) connection.release();
  }
});

// POST /api/projects/join - join with an invite code
router.post('/join', async (req, res, next) => {
  try {
    const joinCode = String(req.body.join_code || '').trim().toUpperCase();
    if (!joinCode) return res.status(400).json({ message: 'Join code is required.' });
    const [projects] = await db.execute(
      'SELECT project_id, project_name, description, deadline, owner_id FROM projects WHERE join_code = ? LIMIT 1',
      [joinCode]
    );
    if (!projects.length) return res.status(404).json({ message: 'Invalid join code.' });
    const project = projects[0];
    try {
      await db.execute(
        'INSERT INTO project_members (project_id, user_id) VALUES (?, ?)',
        [project.project_id, req.session.user.user_id]
      );
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
    }
    res.json({ message: 'You joined the project.', project });
  } catch (error) { next(error); }
});

// GET /api/projects/:id/members - list project members
router.get('/:id/members', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId < 1) return res.status(400).json({ message: 'Invalid project ID.' });
    if (!(await isMember(projectId, req.session.user.user_id))) return res.status(404).json({ message: 'Project not found.' });
    const [members] = await db.execute(
      `SELECT u.user_id, u.username, u.email, pm.joined_at
       FROM project_members pm INNER JOIN users u ON u.user_id = pm.user_id
       WHERE pm.project_id = ? ORDER BY pm.joined_at ASC`,
      [projectId]
    );
    res.json({ members });
  } catch (error) { next(error); }
});

// GET /api/projects/:id - view one project
router.get('/:id', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId < 1) return res.status(400).json({ message: 'Invalid project ID.' });
    if (!(await isMember(projectId, req.session.user.user_id))) return res.status(404).json({ message: 'Project not found.' });
    const [rows] = await db.execute(
      'SELECT project_id, project_name, description, deadline, owner_id, created_at FROM projects WHERE project_id = ?',
      [projectId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Project not found.' });
    res.json({ project: rows[0] });
  } catch (error) { next(error); }
});

// PATCH /api/projects/:id - only the project owner can edit project details
router.patch('/:id', async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!Number.isInteger(projectId) || projectId < 1) return res.status(400).json({ message: 'Invalid project ID.' });
    const [rows] = await db.execute('SELECT owner_id FROM projects WHERE project_id = ?', [projectId]);
    if (!rows.length) return res.status(404).json({ message: 'Project not found.' });
    if (rows[0].owner_id !== req.session.user.user_id) return res.status(403).json({ message: 'Only the project owner can edit this project.' });

    const fields = [];
    const values = [];
    if (Object.prototype.hasOwnProperty.call(req.body, 'project_name')) {
      const name = String(req.body.project_name || '').trim();
      if (!name || name.length > 150) return res.status(400).json({ message: 'Project name must be between 1 and 150 characters.' });
      fields.push('project_name = ?'); values.push(name);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
      fields.push('description = ?'); values.push(req.body.description ? String(req.body.description).trim() : null);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'deadline')) {
      if (!isValidDate(req.body.deadline)) return res.status(400).json({ message: 'A valid deadline (YYYY-MM-DD) is required.' });
      const today = new Date().toISOString().slice(0, 10);
      if (req.body.deadline < today) return res.status(400).json({ message: 'Project deadline cannot be in the past.' });
      // Person 4 should also validate that this date does not precede existing task due dates.
      fields.push('deadline = ?'); values.push(req.body.deadline);
    }
    if (!fields.length) return res.status(400).json({ message: 'No editable fields were provided.' });
    values.push(projectId);
    await db.execute(`UPDATE projects SET ${fields.join(', ')} WHERE project_id = ?`, values);
    const [updated] = await db.execute(
      'SELECT project_id, project_name, description, deadline, owner_id, created_at FROM projects WHERE project_id = ?',
      [projectId]
    );
    res.json({ message: 'Project updated.', project: updated[0] });
  } catch (error) { next(error); }
});

module.exports = router;
