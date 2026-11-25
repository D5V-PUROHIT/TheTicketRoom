// Super-admin endpoints for viewing security audit trails and suspending/unsuspending customer accounts.
const express = require('express');
const { pool } = require('../../database/connection');
const { requireLogin, requireRole } = require('../../middleware/authMiddleware');
const { AppError, catchAsync } = require('../../middleware/errorMiddleware');
const { logAdminAction } = require('../../utils/auditLogger');

const router = express.Router();

// View latest 100 entries in the append-only security audit log.
router.get('/audit-logs', requireLogin, requireRole('super_admin'), catchAsync(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT a.*, u.email AS admin_email, u.name AS admin_name
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.admin_id
    ORDER BY a.created_at DESC LIMIT 100
  `);
  res.json({ logs: rows });
}));

// List customer accounts with their booking count and total spend.
router.get('/users', requireLogin, requireRole('support'), catchAsync(async (req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT u.id, u.name, u.email, u.role, u.is_suspended, u.created_at,
           count(b.id)::int AS bookings_count,
           coalesce(sum(b.total_price), 0)::int AS total_spent
    FROM users u
    LEFT JOIN bookings b ON b.user_id = u.id AND b.status = 'confirmed'
  `;
  const params = [];
  if (q && q.trim()) {
    sql += ' WHERE u.email ILIKE $1 OR u.name ILIKE $1 ';
    params.push(`%${q.trim()}%`);
  }
  sql += ' GROUP BY u.id ORDER BY u.id ASC LIMIT 50';
  const { rows } = await pool.query(sql, params);
  res.json({ users: rows });
}));

// Suspend or reactivate a user account.
router.put('/users/:id/suspend', requireLogin, requireRole('super_admin'), catchAsync(async (req, res) => {
  const userId = Number(req.params.id);
  const { suspended = true, reason } = req.body || {};

  const { rows: [user] } = await pool.query(
    'UPDATE users SET is_suspended = $1 WHERE id = $2 RETURNING id, name, email, is_suspended',
    [suspended, userId]
  );
  if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

  await logAdminAction(pool, {
    adminId: req.user.id,
    action: suspended ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
    targetType: 'user',
    targetId: userId,
    details: { email: user.email, suspended },
    reason: reason || 'Administrative action',
  });

  res.json({ user });
}));

module.exports = router;
