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

    const passwordHash = await bcrypt.hash(password, 12);
    const userRef = db.collection('users').doc();
    const emailRef = db.collection('userEmails').doc(Buffer.from(email).toString('hex'));
    const created = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(emailRef);
      if (existing.exists) return false;
      transaction.create(userRef, {
        username,
        email,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      });
      transaction.create(emailRef, { user_id: userRef.id });
      return true;
    });
    if (!created) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    req.session.user = { user_id: userRef.id, username, email };
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

    const emailRef = db.collection('userEmails').doc(Buffer.from(email).toString('hex'));
    const emailSnapshot = await emailRef.get();
    if (!emailSnapshot.exists) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    const userSnapshot = await db.collection('users').doc(emailSnapshot.data().user_id).get();
    if (!userSnapshot.exists) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }
    const userData = userSnapshot.data();
    if (!(await bcrypt.compare(password, userData.password_hash))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    const user = { user_id: userSnapshot.id, username: userData.username, email: userData.email };
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
