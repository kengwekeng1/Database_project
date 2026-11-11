const express = require('express');
const { randomBytes } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
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
  const membership = await db.collection('projects').doc(projectId)
    .collection('members').doc(userId).get();
  return membership.exists;
}

function serializeProject(projectId, data) {
  return {
    project_id: projectId,
    project_name: data.project_name,
    description: data.description ?? null,
    deadline: data.deadline,
    owner_id: data.owner_id,
    created_at: data.created_at,
  };
}

// GET /api/projects - projects the signed-in user belongs to
router.get('/', async (req, res, next) => {
  try {
    const snapshot = await db.collection('projects')
      .where('member_ids', 'array-contains', req.session.user.user_id)
      .get();
    const projects = await Promise.all(snapshot.docs.map(async (projectDoc) => {
      const membership = await projectDoc.ref.collection('members')
        .doc(req.session.user.user_id).get();
      return {
        ...serializeProject(projectDoc.id, projectDoc.data()),
        joined_at: membership.data()?.joined_at ?? null,
      };
    }));
    projects.sort((left, right) => right.created_at.localeCompare(left.created_at));
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

  try {
    const userId = req.session.user.user_id;
    const createdAt = new Date().toISOString();
    let projectRef;
    let joinCode;
    let created = false;

    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      joinCode = makeJoinCode();
      projectRef = db.collection('projects').doc();
      const joinCodeRef = db.collection('joinCodes').doc(joinCode);
      try {
        await db.runTransaction(async (transaction) => {
          const existingCode = await transaction.get(joinCodeRef);
          if (existingCode.exists) {
            const error = new Error('Join code collision.');
            error.code = 'JOIN_CODE_EXISTS';
            throw error;
          }
          transaction.create(projectRef, {
            project_name: projectName,
            description: description || null,
            deadline,
            join_code: joinCode,
            owner_id: userId,
            member_ids: [userId],
            created_at: createdAt,
          });
          transaction.create(joinCodeRef, { project_id: projectRef.id });
          transaction.create(projectRef.collection('members').doc(userId), {
            user_id: userId,
            joined_at: createdAt,
          });
        });
        created = true;
      } catch (error) {
        if (error.code !== 'JOIN_CODE_EXISTS') throw error;
      }
    }

    if (!created) {
      return res.status(503).json({ message: 'Could not generate a unique invite code. Please try again.' });
    }
    res.status(201).json({
      message: 'Project created successfully.',
      project: {
        project_id: projectRef.id,
        project_name: projectName,
        description: description || null,
        deadline,
        join_code: joinCode,
        owner_id: userId,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/projects/join - join with an invite code
router.post('/join', async (req, res, next) => {
  try {
    const joinCode = String(req.body.join_code || '').trim().toUpperCase();
    if (!joinCode) return res.status(400).json({ message: 'Join code is required.' });
    const joinCodeSnapshot = await db.collection('joinCodes').doc(joinCode).get();
    if (!joinCodeSnapshot.exists) return res.status(404).json({ message: 'Invalid join code.' });
    const projectRef = db.collection('projects').doc(joinCodeSnapshot.data().project_id);
    const memberRef = projectRef.collection('members').doc(req.session.user.user_id);
    const projectData = await db.runTransaction(async (transaction) => {
      const [projectSnapshot, memberSnapshot] = await Promise.all([
        transaction.get(projectRef),
        transaction.get(memberRef),
      ]);
      if (!projectSnapshot.exists) return null;
      if (!memberSnapshot.exists) {
        transaction.update(projectRef, {
          member_ids: FieldValue.arrayUnion(req.session.user.user_id),
        });
        transaction.create(memberRef, {
          user_id: req.session.user.user_id,
          joined_at: new Date().toISOString(),
        });
      }
      return projectSnapshot.data();
    });
    if (!projectData) return res.status(404).json({ message: 'Invalid join code.' });
    res.json({ message: 'You joined the project.', project: serializeProject(projectRef.id, projectData) });
  } catch (error) { next(error); }
});

// GET /api/projects/:id/members - list project members
router.get('/:id/members', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!projectId || projectId.includes('/')) return res.status(400).json({ message: 'Invalid project ID.' });
    if (!(await isMember(projectId, req.session.user.user_id))) return res.status(404).json({ message: 'Project not found.' });
    const memberships = await db.collection('projects').doc(projectId)
      .collection('members').orderBy('joined_at', 'asc').get();
    const members = await Promise.all(memberships.docs.map(async (membership) => {
      const userSnapshot = await db.collection('users').doc(membership.id).get();
      if (!userSnapshot.exists) return null;
      const user = userSnapshot.data();
      return {
        user_id: userSnapshot.id,
        username: user.username,
        email: user.email,
        joined_at: membership.data().joined_at,
      };
    }));
    res.json({ members: members.filter(Boolean) });
  } catch (error) { next(error); }
});

// GET /api/projects/:id - view one project
router.get('/:id', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!projectId || projectId.includes('/')) return res.status(400).json({ message: 'Invalid project ID.' });
    if (!(await isMember(projectId, req.session.user.user_id))) return res.status(404).json({ message: 'Project not found.' });
    const projectSnapshot = await db.collection('projects').doc(projectId).get();
    if (!projectSnapshot.exists) return res.status(404).json({ message: 'Project not found.' });
    res.json({ project: serializeProject(projectId, projectSnapshot.data()) });
  } catch (error) { next(error); }
});

// PATCH /api/projects/:id - only the project owner can edit project details
router.patch('/:id', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    if (!projectId || projectId.includes('/')) return res.status(400).json({ message: 'Invalid project ID.' });
    const projectRef = db.collection('projects').doc(projectId);
    const projectSnapshot = await projectRef.get();
    if (!projectSnapshot.exists) return res.status(404).json({ message: 'Project not found.' });
    if (projectSnapshot.data().owner_id !== req.session.user.user_id) return res.status(403).json({ message: 'Only the project owner can edit this project.' });

    const fields = {};
    if (Object.prototype.hasOwnProperty.call(req.body, 'project_name')) {
      const name = String(req.body.project_name || '').trim();
      if (!name || name.length > 150) return res.status(400).json({ message: 'Project name must be between 1 and 150 characters.' });
      fields.project_name = name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
      fields.description = req.body.description ? String(req.body.description).trim() : null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'deadline')) {
      if (!isValidDate(req.body.deadline)) return res.status(400).json({ message: 'A valid deadline (YYYY-MM-DD) is required.' });
      const today = new Date().toISOString().slice(0, 10);
      if (req.body.deadline < today) return res.status(400).json({ message: 'Project deadline cannot be in the past.' });
      // Person 4 should also validate that this date does not precede existing task due dates.
      fields.deadline = req.body.deadline;
    }
    if (!Object.keys(fields).length) return res.status(400).json({ message: 'No editable fields were provided.' });
    await projectRef.update(fields);
    const updated = await projectRef.get();
    res.json({ message: 'Project updated.', project: serializeProject(projectId, updated.data()) });
  } catch (error) { next(error); }
});

module.exports = router;
