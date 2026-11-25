require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('node:path');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');
const taskRoutes = require('./routes/task.routes');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const onRender = process.env.RENDER === 'true';
const production = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (production && (!sessionSecret || sessionSecret.length < 32 ||
    sessionSecret === 'replace-this-with-a-long-random-secret')) {
  throw new Error('Set a random SESSION_SECRET of at least 32 characters for production.');
}
if (production && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  throw new Error('Firebase emulators must be disabled in production.');
}
if (onRender) app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: 'taskflow.sid',
  secret: sessionSecret || 'change-this-development-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    maxAge: 1000 * 60 * 60 * 24,
  },
}));

app.get('/api/health', async (req, res, next) => {
  try {
    await db.collection('_health').doc('connectivity-check').get();
    res.json({ status: 'ok', message: 'Mini TaskFlow API and Firestore are running.' });
  } catch (error) {
    next(error);
  }
});

app.use('/api', authRoutes);
app.use('/api', taskRoutes);
app.use('/api/projects', projectRoutes);
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(error);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(PORT, onRender ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Mini TaskFlow listening on port ${PORT}`);
});
