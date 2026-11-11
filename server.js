require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MySQLStore = MySQLStoreFactory(session);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: true,
});

app.use(session({
  name: 'taskflow.sid',
  secret: process.env.SESSION_SECRET || 'change-this-development-secret',
  store: sessionStore,
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
    await db.query('SELECT 1');
    res.json({ status: 'ok', message: 'Mini TaskFlow API and database are running.' });
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
