// Admin endpoints for creating new shows, updating unbooked schedules, cancelling unbooked shows, and blocking seats.
const express = require('express');
const { pool, runTransaction } = require('../../database/connection');
const { requireLogin, requireAnyAdmin, requireRole } = require('../../middleware/authMiddleware');
const { AppError, catchAsync } = require('../../middleware/errorMiddleware');
const { updateShowScheduleOrStatus } = require('../../services/showScheduleService');
const { logAdminAction } = require('../../utils/auditLogger');
const { broadcastSeatsSafe } = require('../../utils/seatBroadcast');
const { parseShowTimestampIST } = require('../../utils/showtimeParser');

const router = express.Router();

// List all shows with live booked, held, and available counts.
router.get('/shows', requireLogin, requireAnyAdmin, catchAsync(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, m.title AS movie_title, h.name AS hall_name,
      (SELECT count(*)::int FROM show_seats ss WHERE ss.show_id = s.id AND ss.status = 'booked') AS booked_count,
      (SELECT count(*)::int FROM show_seats ss WHERE ss.show_id = s.id AND ss.status = 'held' AND ss.hold_expires_at > now()) AS held_count,
      (SELECT count(*)::int FROM show_seats ss WHERE ss.show_id = s.id AND (ss.status = 'available' OR (ss.status = 'held' AND ss.hold_expires_at <= now()))) AS available_count
    FROM shows s
    JOIN movies m ON m.id = s.movie_id
    JOIN halls h ON h.id = s.hall_id
    ORDER BY s.id ASC
  `);
  res.json({ shows: rows });
}));

// Add a brand-new showtime with 100 fresh seats.
router.post('/shows', requireLogin, requireRole('operations'), catchAsync(async (req, res) => {
  const {
    movie_id = 1,
    hall_id = 1,
    starts_at,
    date_str,
    time_str,
    price_recliner = 350,
    price_club = 250,
    price_premium = 180,
  } = req.body || {};

  if (!date_str || !time_str) {
    throw new AppError(400, 'VALIDATION', 'date_str and time_str are required');
  }

  const pRecliner = Math.max(1, Math.round(Number(price_recliner) || 350));
  const pClub = Math.max(1, Math.round(Number(price_club) || 250));
  const pPremium = Math.max(1, Math.round(Number(price_premium) || 180));
  const resolvedStartsAt = starts_at || parseShowTimestampIST(date_str, time_str);

  const newShow = await runTransaction(async (client) => {
    await client.query(`SELECT setval('shows_id_seq', COALESCE((SELECT max(id) FROM shows), 1))`);
    const { rows: [created] } = await client.query(
      `INSERT INTO shows (movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
       VALUES ($1, $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7, $8, 'open')
       RETURNING *`,
      [movie_id, hall_id, resolvedStartsAt || null, date_str.trim(), time_str.trim(), pRecliner, pClub, pPremium]
    );

    const { rows: templateSeats } = await client.query(
      'SELECT * FROM hall_seats WHERE hall_id = $1 ORDER BY id',
      [hall_id]
    );
    await client.query(`SELECT setval('show_seats_id_seq', COALESCE((SELECT max(id) FROM show_seats), 1))`);
    for (const ts of templateSeats) {
      const price = ts.tier === 'recliner' ? pRecliner : ts.tier === 'club' ? pClub : pPremium;
      await client.query(
        `INSERT INTO show_seats (show_id, seat_id, row_label, seat_number, tier, price, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
        [created.id, ts.id, ts.row_label, ts.seat_number, ts.tier, price]
      );
    }

    await logAdminAction(client, {
      adminId: req.user.id,
      action: 'CREATE_SHOW',
      targetType: 'show',
      targetId: created.id,
      details: { movie_id, date_str: created.date_str, time_str: created.time_str },
      reason: 'Scheduled new screening showtime',
    });

    return created;
  });

  if (req.app.locals.io) {
    req.app.locals.io.emit('shows:update', { show: newShow });
  }

  res.status(201).json({ show: newShow });
}));

// Update date/time or cancel a show (blocked by showScheduleService if booked > 0).
router.put('/shows/:id', requireLogin, requireRole('operations'), catchAsync(async (req, res) => {
  const showId = Number(req.params.id);
  const { status, date_str, time_str } = req.body || {};

  const out = await updateShowScheduleOrStatus({
    showId,
    status,
    date_str,
    time_str,
    adminId: req.user.id,
  });

  if (out.releasedSeatIds.length) {
    broadcastSeatsSafe(req.app, out.releasedSeatIds, showId);
  }
  if (req.app.locals.io) {
    req.app.locals.io.emit('shows:update', { show: out.updated });
  }

  res.json({ show: out.updated, movie: out.movieInfo });
}));

// Legacy schedule update endpoint used by admin date/time form.
router.put('/movies/schedule', requireLogin, requireRole('operations'), catchAsync(async (req, res) => {
  const { showId = 1, date_str, time_str } = req.body || {};
  if (!date_str || !time_str) {
    throw new AppError(400, 'VALIDATION', 'Date and time are required');
  }

  const resolvedId = Number(showId) || 1;
  const out = await updateShowScheduleOrStatus({
    showId: resolvedId,
    date_str,
    time_str,
    adminId: req.user.id,
  });

  if (req.app.locals.io) {
    if (resolvedId === 1) req.app.locals.io.emit('movie:update', out.movieInfo);
    req.app.locals.io.emit('shows:update', { show: out.updated });
  }

  res.json({ movie: out.movieInfo, show: out.updated });
}));

// Block or unblock seats for maintenance or VIPs (server API preserved).
router.post('/shows/:showId/block-seats', requireLogin, requireRole('operations'), catchAsync(async (req, res) => {
  const showId = Number(req.params.showId);
  const { seatIds, blocked = true, reason = 'VIP / Maintenance block' } = req.body || {};
  if (!Array.isArray(seatIds) || !seatIds.length) {
    throw new AppError(400, 'VALIDATION', 'seatIds array required');
  }

  const changedIds = await runTransaction(async (client) => {
    const { rows: locked } = await client.query(
      'SELECT id, status FROM show_seats WHERE show_id = $1 AND id = ANY($2) ORDER BY id FOR UPDATE',
      [showId, seatIds]
    );
    const alreadyBooked = locked.filter((s) => s.status === 'booked');
    if (alreadyBooked.length) {
      throw new AppError(409, 'ALREADY_BOOKED', 'Cannot block seats that are already booked by customers');
    }

    const nextStatus = blocked ? 'blocked' : 'available';
    const { rows } = await client.query(
      `UPDATE show_seats SET status = $1, held_by = NULL, hold_expires_at = NULL
       WHERE show_id = $2 AND id = ANY($3) RETURNING id`,
      [nextStatus, showId, seatIds]
    );
    return rows.map((r) => r.id);
  });

  broadcastSeatsSafe(req.app, changedIds, showId);

  await logAdminAction(pool, {
    adminId: req.user.id,
    action: blocked ? 'BLOCK_SEATS' : 'UNBLOCK_SEATS',
    targetType: 'show_seats',
    targetId: showId,
    details: { seatIds, blocked },
    reason,
  });

  res.json({ updated: changedIds.length, seatIds: changedIds });
}));

module.exports = router;
