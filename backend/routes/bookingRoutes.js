// Customer endpoints to hold seats, confirm bookings, view tickets, and cancel bookings.
const express = require('express');
const { pool } = require('../database/connection');
const { SEAT_VIEW_COLUMNS } = require('../config/bookingRules');
const { requireLogin } = require('../middleware/authMiddleware');
const { AppError, catchAsync } = require('../middleware/errorMiddleware');
const { holdSeatsForUser } = require('../services/seatHoldService');
const { BOOKING_DETAILS_QUERY, confirmBookingForUser, cancelBookingByCustomer } = require('../services/ticketBookingService');
const { broadcastSeatsSafe } = require('../utils/seatBroadcast');
const emailNotifications = require('../services/emailNotificationService');

const router = express.Router();

function validateSeatIds(raw) {
  if (!Array.isArray(raw) || !raw.every((n) => Number.isInteger(n) && n >= 1)) {
    throw new AppError(400, 'VALIDATION', 'seatIds must be an array of positive integer seat ids');
  }
  return raw;
}

// Hold seats on a specific show.
router.post('/shows/:showId/holds', requireLogin, catchAsync(async (req, res) => {
  const showId = Number(req.params.showId);
  const requestedIds = validateSeatIds(req.body && req.body.seatIds);

  const changedIds = await holdSeatsForUser({ userId: req.user.id, showId, requestedIds });
  broadcastSeatsSafe(req.app, changedIds, showId);

  const { rows } = await pool.query(`SELECT ${SEAT_VIEW_COLUMNS} FROM show_seats WHERE id = ANY($1) ORDER BY id`, [changedIds]);
  res.json({ seats: rows });
}));

// Legacy hold endpoint (defaults to Show 1).
router.post('/holds', requireLogin, catchAsync(async (req, res) => {
  const showId = Number(req.body?.showId) || 1;
  const requestedIds = validateSeatIds(req.body && req.body.seatIds);

  const changedIds = await holdSeatsForUser({ userId: req.user.id, showId, requestedIds });
  broadcastSeatsSafe(req.app, changedIds, showId);

  const { rows } = await pool.query(`SELECT ${SEAT_VIEW_COLUMNS} FROM show_seats WHERE id = ANY($1) ORDER BY id`, [changedIds]);
  res.json({ seats: rows });
}));

// Confirm booking for a specific show.
router.post('/shows/:showId/bookings', requireLogin, catchAsync(async (req, res) => {
  const showId = Number(req.params.showId);
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100) {
    throw new AppError(400, 'VALIDATION', 'Idempotency-Key header is required');
  }

  const { couponCode } = req.body || {};
  const result = await confirmBookingForUser({ userId: req.user.id, idempotencyKey: key, showId, couponCode });
  broadcastSeatsSafe(req.app, result.seatIds, showId);

  emailNotifications.sendBookingConfirmation({
    email: req.user.email,
    reference: result.booking.reference,
    movieTitle: result.booking.movie_title || 'Cinema Screening',
    showtime: `${result.booking.show_date_str || ''} ${result.booking.show_time_str || ''}`.trim() || 'Scheduled Show',
    seats: result.booking.seats.map((s) => s.label).join(', '),
    totalPaid: result.booking.total_price,
  });

  res.status(result.replayed ? 200 : 201).json({ booking: result.booking, replayed: result.replayed });
}));

// Legacy confirm booking endpoint (defaults to Show 1).
router.post('/bookings', requireLogin, catchAsync(async (req, res) => {
  const showId = Number(req.body?.showId) || 1;
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100) {
    throw new AppError(400, 'VALIDATION', 'Idempotency-Key header is required');
  }

  const { couponCode } = req.body || {};
  const result = await confirmBookingForUser({ userId: req.user.id, idempotencyKey: key, showId, couponCode });
  broadcastSeatsSafe(req.app, result.seatIds, showId);

  res.status(result.replayed ? 200 : 201).json({ booking: result.booking, replayed: result.replayed });
}));

// List customer's confirmed bookings.
router.get('/bookings', requireLogin, catchAsync(async (req, res) => {
  const { rows } = await pool.query(
    `${BOOKING_DETAILS_QUERY} WHERE b.user_id = $1 AND b.status = 'confirmed' GROUP BY b.id ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json({ bookings: rows });
}));

// Cancel a booking and immediately free seats.
router.delete('/bookings/:id', requireLogin, catchAsync(async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId)) throw new AppError(400, 'VALIDATION', 'Invalid booking id');

  const result = await cancelBookingByCustomer({ bookingId, userId: req.user.id });
  broadcastSeatsSafe(req.app, result.seatIds, result.showId);
  res.json({ cancelled: true });
}));

module.exports = router;
