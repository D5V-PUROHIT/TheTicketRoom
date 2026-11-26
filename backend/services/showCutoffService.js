// Enforces online booking cutoff at showtime (starts_at) and closes expired shows automatically.
const { pool } = require('../database/connection');
const { BOOKING_CUTOFF_MINUTES } = require('../config/bookingRules');
const { AppError } = require('../middleware/errorMiddleware');
const { broadcastSeatsSafe } = require('../utils/seatBroadcast');

/**
 * Checks whether a show is currently open for seat holds or bookings.
 * Throws a clear SHOW_STARTED / BOOKING_CLOSED / SHOW_CANCELLED error if booking is not allowed.
 */
function assertShowOpenForBooking(showRow, cutoffMinutes = BOOKING_CUTOFF_MINUTES) {
  if (!showRow) {
    throw new AppError(404, 'NOT_FOUND', 'Show not found');
  }
  if (showRow.status === 'cancelled') {
    throw new AppError(409, 'SHOW_CANCELLED', 'This showtime has been cancelled and is no longer accepting bookings.');
  }
  if (showRow.status === 'paused') {
    throw new AppError(409, 'BOOKING_CLOSED', 'Online booking for this showtime is currently paused.');
  }
  if (showRow.status === 'closed') {
    throw new AppError(
      409,
      'BOOKING_CLOSED',
      `Showtime (${showRow.time_str || 'scheduled'}) has started — online booking is now closed.`
    );
  }
  if (showRow.status === 'scheduled') {
    throw new AppError(409, 'BOOKING_CLOSED', 'Bookings are not open yet for this upcoming showtime.');
  }

  if (showRow.starts_at) {
    const startsAtMs = new Date(showRow.starts_at).getTime();
    const cutoffMs = startsAtMs - cutoffMinutes * 60 * 1000;
    const nowMs = Date.now();

    if (nowMs >= startsAtMs) {
      throw new AppError(
        409,
        'SHOW_STARTED',
        `Showtime (${showRow.time_str || 'scheduled'}) has started — online booking is now closed.`
      );
    }
    if (cutoffMinutes > 0 && nowMs >= cutoffMs) {
      throw new AppError(
        409,
        'BOOKING_CLOSED',
        `Online booking closed ${cutoffMinutes} minutes before the ${showRow.time_str || ''} showtime.`
      );
    }
  }
}

/**
 * Marks any 'open' show whose cutoff timestamp has passed as 'closed',
 * releases any lingering 'held' seats, and notifies connected browsers via Socket.IO.
 */
async function closeExpiredShows(app, cutoffMinutes = BOOKING_CUTOFF_MINUTES) {
  const { rows: closedShows } = await pool.query(
    `UPDATE shows
     SET status = 'closed'
     WHERE status = 'open'
       AND starts_at <= now() + make_interval(mins => $1::int)
     RETURNING id, time_str, date_str`,
    [cutoffMinutes]
  );

  if (!closedShows.length) return [];

  const closedIds = closedShows.map((s) => s.id);

  // Release any unpaid 2-minute holds on newly closed shows (confirmed bookings remain booked).
  const { rows: released } = await pool.query(
    `UPDATE show_seats
     SET status = 'available', held_by = NULL, hold_expires_at = NULL
     WHERE show_id = ANY($1) AND status = 'held'
     RETURNING id, show_id`,
    [closedIds]
  );

  if (app?.locals?.io) {
    if (released.length) {
      const byShow = {};
      for (const s of released) {
        byShow[s.show_id] = byShow[s.show_id] || [];
        byShow[s.show_id].push(s.id);
      }
      for (const [showId, ids] of Object.entries(byShow)) {
        broadcastSeatsSafe(app, ids, Number(showId));
      }
    }
    app.locals.io.emit('shows:update', { closedShowIds: closedIds });
  }

  return closedShows;
}

module.exports = { assertShowOpenForBooking, closeExpiredShows };
