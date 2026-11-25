require('dotenv').config();
const { Pool } = require('pg');
module.exports = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
