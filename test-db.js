require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

pool.query('SELECT 1 + 1 AS result')
  .then(([rows]) => { console.log('DB connected:', rows[0].result); process.exit(); })
  .catch(err => { console.error('DB error:', err.message); process.exit(); });