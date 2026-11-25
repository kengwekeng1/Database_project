const express = require('express');
const bcrypt = require('bcrypt');
const { getAuth } = require('firebase-admin/auth');
const db = require('../db');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const projectId = process.env.FIREBASE_PROJECT_ID;
const localAuth = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const localDb = process.env.FIRESTORE_EMULATOR_HOST;
const emulator = projectId?.startsWith('demo-') && localAuth && localDb;
const cloud = projectId && !localAuth && !localDb &&
  process.env.FIREBASE_WEB_API_KEY && process.env.FIREBASE_WEB_AUTH_DOMAIN;
const firebaseConfig = emulator || cloud ? {
  projectId,
  apiKey: emulator ? 'demo-api-key' : process.env.FIREBASE_WEB_API_KEY,
  authDomain: emulator ? projectId + '.firebaseapp.com' : process.env.FIREBASE_WEB_AUTH_DOMAIN,
} : null;

function startSession(req, res, next, user) {
  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.user = user;
    req.session.save((saveError) => {
      if (saveError) return next(saveError);
      res.json({ message: 'Login successful.', user });
    });
  });
}

router.get('/auth/config', (req, res) => {
  res.set('Cache-Control', 'no-store').json({
    config: firebaseConfig,
    emulatorUrl: emulator ? 'http://' + localAuth : null,
  });
});

router.post('/auth/firebase', async (req, res, next) => {
  if (!firebaseConfig) return res.status(503).json({ message: 'ยังไม่ได้ตั้งค่า Firebase Authentication' });
  if (!req.is('application/json') || typeof req.body?.idToken !== 'string') {
    return res.status(400).json({ message: 'กรุณาเข้าสู่ระบบผ่าน Firebase อีกครั้ง' });
  }

  let identity;
  try {
    identity = await getAuth().verifyIdToken(req.body.idToken);
  } catch (error) {
    const invalidToken = ['auth/argument-error', 'auth/invalid-id-token', 'auth/id-token-expired', 'auth/id-token-revoked'];
    if (!invalidToken.includes(error.code)) return next(error);
    return res.status(401).json({ message: 'ยืนยันการเข้าสู่ระบบไม่ได้ กรุณาลองใหม่' });
  }
  const email = identity.email?.trim().toLowerCase();
  if (!email || !['password', 'google.com'].includes(identity.firebase.sign_in_provider)) {
    return res.status(403).json({ message: 'กรุณาใช้อีเมลกับรหัสผ่านหรือบัญชี Google' });
  }

  try {
    const identities = db.collection('firebaseIdentities');
    const users = db.collection('users');
    const identityRef = identities.doc(identity.uid);
    const emailRef = db.collection('userEmails').doc(Buffer.from(email).toString('hex'));
    const profile = await db.runTransaction(async (transaction) => {
      const linked = await transaction.get(identityRef);
      if (linked.exists) {
        const user = await transaction.get(users.doc(linked.data().user_id));
        if (!user.exists) throw new Error('Firebase identity has no user profile.');
        return { user_id: user.id, username: user.data().username, email: user.data().email };
      }
      const existing = await transaction.get(emailRef);
      if (existing.exists) return { conflict: 'EMAIL_TAKEN' };
      const userRef = users.doc();
      let username = (identity.name?.trim() || email.split('@')[0]).slice(0, 50);
      let nameRef = usernameRef(username);
      if ((await transaction.get(nameRef)).exists) {
        if (identity.firebase.sign_in_provider === 'password') return { conflict: 'USERNAME_TAKEN' };
        username = username.slice(0, 29) + '-' + userRef.id;
        nameRef = usernameRef(username);
      }
      transaction.create(userRef, { username, email, created_at: new Date().toISOString() });
      transaction.create(nameRef, { user_id: userRef.id });
      transaction.create(emailRef, { user_id: userRef.id });
      transaction.create(identityRef, { user_id: userRef.id });
      return { user_id: userRef.id, username, email };
    });
    if (profile.conflict) {
      return res.status(409).json({
        code: profile.conflict,
        message: profile.conflict === 'USERNAME_TAKEN' ? 'ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น'
          : 'อีเมลนี้มีบัญชีเดิมอยู่แล้ว กรุณาใช้ปุ่มเข้าสู่ระบบด้วยบัญชีเดิม',
      });
    }
    return startSession(req, res, next, profile);
  } catch (error) {
    return next(error);
  }
});

function usernameRef(username) {
  return db.collection('profileNames').doc(Buffer.from(username.trim().toLowerCase()).toString('hex'));
}

// POST /api/register
router.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }
    if (username.length > 50) return res.status(400).json({ message: 'ชื่อผู้ใช้ต้องไม่เกิน 50 ตัวอักษร' });
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userRef = db.collection('users').doc();
    const emailRef = db.collection('userEmails').doc(Buffer.from(email).toString('hex'));
    const nameRef = usernameRef(username);
    const created = await db.runTransaction(async (transaction) => {
      const [existing, existingName] = await Promise.all([transaction.get(emailRef), transaction.get(nameRef)]);
      if (existing.exists) return 'EMAIL_TAKEN';
      if (existingName.exists) return 'USERNAME_TAKEN';
      transaction.create(userRef, {
        username,
        email,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      });
      transaction.create(emailRef, { user_id: userRef.id });
      transaction.create(nameRef, { user_id: userRef.id });
      return null;
    });
    if (created) {
      return res.status(409).json({
        code: created,
        message: created === 'EMAIL_TAKEN' ? 'อีเมลนี้ถูกใช้แล้ว กรุณาใช้อีเมลอื่น'
          : 'ชื่อผู้ใช้นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น',
      });
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
    if (!userData.password_hash || !(await bcrypt.compare(password, userData.password_hash))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    const user = { user_id: userSnapshot.id, username: userData.username, email: userData.email };
    return startSession(req, res, next, user);
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
