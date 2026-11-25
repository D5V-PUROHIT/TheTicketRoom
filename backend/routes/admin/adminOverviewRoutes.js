// Admin KPI statistics and live recent bookings feed (/api/admin/stats).
const express = require('express');
const { pool } = require('../../database/connection');
const { requireLogin, requireAnyAdmin } = require('../../middleware/authMiddleware');
const { catchAsync } = require('../../middleware/errorMiddleware');

const router = express.Router();

// Returns live seat counts (available, held, booked, blocked), total revenue, and recent confirmed bookings.
router.get('/stats', requireLogin, requireAnyAdmin, catchAsync(async (req, res) => {
  const showId = Number(req.query.showId) || 1;
  const { rows: [counts] } = await pool.query(
    `SELECT count(*) FILTER (WHERE s='available')::int AS available,
            count(*) FILTER (WHERE s='held')::int AS held,
            count(*) FILTER (WHERE s='booked')::int AS booked,
            count(*) FILTER (WHERE s='blocked')::int AS blocked
     FROM (
       SELECT CASE WHEN status='held' AND hold_expires_at <= now() THEN 'available' ELSE status END AS s
       FROM show_seats WHERE show_id = $1
     ) t`,
    [showId]
  );

  const { rows: [rev] } = await pool.query(
    "SELECT coalesce(sum(total_price), 0)::int AS revenue FROM bookings WHERE status='confirmed'"
  );

  const { rows: recent } = await pool.query(
    `SELECT b.reference, b.total_price, b.created_at, u.email,
            (SELECT string_agg(row_label || seat_number, ', ' ORDER BY id) FROM show_seats WHERE booking_id = b.id) AS seats
     FROM bookings b JOIN users u ON u.id = b.user_id
     WHERE b.status = 'confirmed'
     ORDER BY b.created_at DESC LIMIT 8`
  );

  res.json({ ...counts, total: 100, revenue: rev.revenue, recent });
}));

module.exports = router;
