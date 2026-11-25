require('dotenv').config();
const { Pool } = require('pg');
module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.PG_MAX_POOL ? parseInt(process.env.PG_MAX_POOL, 10) : 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
