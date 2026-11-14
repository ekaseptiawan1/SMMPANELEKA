require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diatur');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Database schema siap.');
  } finally { await pool.end(); }
})().catch(e => { console.error(e); process.exit(1); });
