// Health check route used by Render and monitoring tools to confirm server & PostgreSQL are online.
const express = require('express');
const { pool } = require('../database/connection');
const { catchAsync } = require('../middleware/errorMiddleware');

const router = express.Router();

router.get('/healthz', catchAsync(async (req, res) => {
  const { rows } = await pool.query('SELECT 1 AS ok');
  res.json({
    status: 'ok',
    service: 'TheTicketRoom',
    database: rows[0]?.ok === 1 ? 'healthy' : 'degraded',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}));

module.exports = router;
