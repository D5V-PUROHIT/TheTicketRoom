// Connects to PostgreSQL and provides a safe transaction helper.
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.PG_MAX_POOL ? parseInt(process.env.PG_MAX_POOL, 10) : 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

/**
 * Runs database work inside BEGIN / COMMIT, rolling back on any error.
 */
async function runTransaction(workFn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await workFn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, runTransaction };
