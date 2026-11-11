require('dotenv').config();

const express = require('express');
const session = require('express-session');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');

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
app.use('/api/projects', projectRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ message: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Mini TaskFlow API listening at http://localhost:${PORT}`);
});
