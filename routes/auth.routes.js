const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/register
router.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const [existing] = await db.execute('SELECT user_id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );

    req.session.user = { user_id: result.insertId, username, email };
    res.status(201).json({ message: 'Registration successful.', user: req.session.user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That email is already registered.' });
    }
    next(error);
  }
});

// POST /api/login
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const [users] = await db.execute(
      'SELECT user_id, username, email, password_hash FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (!users.length || !(await bcrypt.compare(password, users[0].password_hash))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    const user = { user_id: users[0].user_id, username: users[0].username, email: users[0].email };
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = user;
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.json({ message: 'Login successful.', user });
      });
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/logout
router.post('/logout', (req, res, next) => {
  if (!req.session) return res.json({ message: 'Logged out.' });
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('taskflow.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// GET /api/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

module.exports = router;
