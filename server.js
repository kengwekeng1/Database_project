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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: 'taskflow.sid',
  secret: process.env.SESSION_SECRET || 'change-this-development-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Mini TaskFlow API listening at http://localhost:${PORT}`);
});
