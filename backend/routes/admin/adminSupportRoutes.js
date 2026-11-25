// Customer Support admin endpoints to search reservations and issue refunds/cancellations.
const express = require('express');
const { pool, runTransaction } = require('../../database/connection');
const { requireLogin, requireRole } = require('../../middleware/authMiddleware');
const { AppError, catchAsync } = require('../../middleware/errorMiddleware');
const { BOOKING_DETAILS_QUERY } = require('../../services/ticketBookingService');
const { logAdminAction } = require('../../utils/auditLogger');
const { broadcastSeatsSafe } = require('../../utils/seatBroadcast');

const router = express.Router();

// Search customer bookings by reference code (CX...), email, or name.
router.get('/bookings', requireLogin, requireRole('support'), catchAsync(async (req, res) => {
  const { q } = req.query;
  let sql = `${BOOKING_DETAILS_QUERY} JOIN users u ON u.id = b.user_id `;
  const params = [];
  if (q && q.trim()) {
    sql += ' WHERE b.reference ILIKE $1 OR u.email ILIKE $1 OR u.name ILIKE $1 ';
    params.push(`%${q.trim()}%`);
  }
  sql += ' GROUP BY b.id, u.id ORDER BY b.created_at DESC LIMIT 50';
  const { rows } = await pool.query(sql, params);
  res.json({ bookings: rows });
}));

// Cancel a customer's booking on their behalf and record audit reason.
router.post('/bookings/:id/cancel', requireLogin, requireRole('support'), catchAsync(async (req, res) => {
  const bookingId = Number(req.params.id);
  const { reason } = req.body || {};
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new AppError(400, 'VALIDATION', 'A mandatory cancellation reason is required for support audit');
  }

  const result = await runTransaction(async (client) => {
    const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
    if (!booking) throw new AppError(404, 'NOT_FOUND', 'Booking not found');
    if (booking.status === 'cancelled') return { seatIds: [], showId: booking.show_id };

    await client.query('SELECT id FROM show_seats WHERE booking_id = $1 ORDER BY id FOR UPDATE', [bookingId]);
    const released = await client.query(
      `UPDATE show_seats SET status='available', booking_id=NULL WHERE booking_id = $1 RETURNING id`,
      [bookingId]
    );
    await client.query(
      `UPDATE bookings SET status='cancelled', cancellation_reason=$1 WHERE id = $2`,
      [reason.trim(), bookingId]
    );
    await client.query(`UPDATE payments SET status='refunded' WHERE booking_id = $1`, [bookingId]);

    await logAdminAction(client, {
      adminId: req.user.id,
      action: 'ADMIN_CANCEL_BOOKING',
      targetType: 'booking',
      targetId: bookingId,
      details: { reference: booking.reference, total_price: booking.total_price },
      reason: reason.trim(),
    });

    return { seatIds: released.rows.map((x) => x.id), showId: booking.show_id };
  });

  broadcastSeatsSafe(req.app, result.seatIds, result.showId);
  res.json({ cancelled: true, refundIssued: true });
}));

module.exports = router;
