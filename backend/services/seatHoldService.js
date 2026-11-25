// Handles concurrency-safe 2-minute seat holds with strict row locks and 4-seat quota enforcement.
const { pool, runTransaction } = require('../database/connection');
const { initializeDatabase } = require('../database/startupSetup');
const { MAX_SEATS_PER_USER, HOLD_DURATION_SECONDS, SEAT_VIEW_COLUMNS } = require('../config/bookingRules');
const { AppError } = require('../middleware/errorMiddleware');

/**
 * Fetches all 100 seats for a show plus how many seats this user has already booked.
 */
async function fetchShowSeatsWithQuota(showId, userId, allowLegacyFallback = false) {
  let rows = [];
  let resolvedShowId = showId;

  try {
    const res = await pool.query(`SELECT ${SEAT_VIEW_COLUMNS} FROM show_seats WHERE show_id = $1 ORDER BY id`, [showId]);
    rows = res.rows || [];
  } catch (err) {
    console.warn('[TheTicketRoom] show_seats query failed, attempting auto-heal:', err.message);
  }

  if (!rows.length && allowLegacyFallback) {
    try {
      const legacy = await pool.query(
        'SELECT id, row_label, seat_number, tier, price, status, held_by, hold_expires_at FROM seats ORDER BY id'
      );
      if (legacy.rows && legacy.rows.length > 0) {
        rows = legacy.rows;
        resolvedShowId = 1;
      }
    } catch {}
  }

  if (!rows.length) {
    await initializeDatabase().catch(() => {});
    const res = await pool
      .query(`SELECT ${SEAT_VIEW_COLUMNS} FROM show_seats WHERE show_id = $1 ORDER BY id`, [showId])
      .catch(() => ({ rows: [] }));
    rows = res.rows || [];
  }

  let ownedSeatIds = [];
  if (userId) {
    try {
      const { rows: ownedRows } = await pool.query(
        `SELECT s.id FROM show_seats s
         JOIN bookings b ON b.id = s.booking_id
         WHERE b.user_id = $1 AND s.show_id = $2 AND b.status = 'confirmed'
         ORDER BY s.id`,
        [userId, resolvedShowId]
      );
      ownedSeatIds = ownedRows.map((r) => r.id);
    } catch {}
  }

  return {
    seats: rows,
    maxSeats: MAX_SEATS_PER_USER,
    holdSeconds: HOLD_DURATION_SECONDS,
    showId: resolvedShowId,
    ownedSeatIds,
    ownedCount: ownedSeatIds.length,
  };
}

/**
 * Atomically holds selected seats for a user for 2 minutes.
 * Locks user row first to enforce the 4-seat cap, then locks seats in ascending ID order to avoid deadlocks.
 */
async function holdSeatsForUser({ userId, showId, requestedIds }) {
  const seatIds = [...new Set(requestedIds)];
  if (seatIds.length > MAX_SEATS_PER_USER) {
    throw new AppError(400, 'MAX_SEATS', `You can select at most ${MAX_SEATS_PER_USER} seats`);
  }

  return runTransaction(async (client) => {
    // Lock user row first so parallel requests from the same account cannot bypass the 4-seat quota.
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);

    // Prevent booking seats on a cancelled show.
    const { rows: [showRow] } = await client.query('SELECT id, status FROM shows WHERE id = $1 FOR SHARE', [showId]);
    if (!showRow) throw new AppError(404, 'NOT_FOUND', 'Show not found');
    if (showRow.status === 'cancelled') {
      throw new AppError(409, 'SHOW_CANCELLED', 'This showtime has been cancelled and is no longer accepting bookings.');
    }

    // Check total already-booked seats + newly requested seats against strict 4-seat cap.
    const { rows: [{ n: owned }] } = await client.query(
      `SELECT count(*)::int AS n FROM show_seats s
       JOIN bookings b ON b.id = s.booking_id
       WHERE b.user_id = $1 AND s.show_id = $2 AND b.status = 'confirmed'`,
      [userId, showId]
    );
    if (owned + seatIds.length > MAX_SEATS_PER_USER) {
      const remaining = Math.max(0, MAX_SEATS_PER_USER - owned);
      const msg = remaining === 0
        ? `You already have ${owned}/${MAX_SEATS_PER_USER} booked seats (limit reached). Cancel a booking in My Bookings to free seats.`
        : `You already have ${owned} booked seat(s) — you can select at most ${remaining} more (${MAX_SEATS_PER_USER} max per user).`;
      throw new AppError(400, 'MAX_SEATS', msg);
    }

    // Acquire row locks in ascending ID order across requested seats + user's previous holds.
    const { rows: locked } = await client.query(
      `SELECT *, (status='held' AND hold_expires_at > now()) AS live
       FROM show_seats
       WHERE show_id = $1 AND (id = ANY($2) OR held_by = $3)
       ORDER BY id FOR UPDATE`,
      [showId, seatIds, userId]
    );

    const unavailable = locked.filter(
      (s) => seatIds.includes(s.id) && (s.status === 'booked' || s.status === 'blocked' || (s.live && s.held_by !== userId))
    );
    if (unavailable.length) {
      throw new AppError(
        409,
        'SEAT_UNAVAILABLE',
        `Seat ${unavailable.map((s) => s.row_label + s.seat_number).join(', ')} was just taken. Please choose another.`
      );
    }

    // Release seats this user deselected.
    const released = await client.query(
      `UPDATE show_seats SET status='available', held_by=NULL, hold_expires_at=NULL
       WHERE show_id = $1 AND held_by = $2 AND status = 'held' AND NOT (id = ANY($3))
       RETURNING id`,
      [showId, userId, seatIds]
    );

    // Hold newly requested seats (preserving existing expiry if already held by this user).
    let held = [];
    if (seatIds.length) {
      held = (
        await client.query(
          `UPDATE show_seats SET
             hold_expires_at = CASE WHEN status='held' AND held_by=$2 AND hold_expires_at > now()
                                    THEN hold_expires_at
                                    ELSE now() + make_interval(secs => $4::double precision) END,
             status = 'held', held_by = $2
           WHERE show_id = $1 AND id = ANY($3)
           RETURNING id`,
          [showId, userId, seatIds, HOLD_DURATION_SECONDS]
        )
      ).rows;
    }

    return [...released.rows, ...held].map((r) => r.id);
  });
}

module.exports = { fetchShowSeatsWithQuota, holdSeatsForUser };
