// Enforces show schedule integrity: prevents changing time/date or cancelling a show once tickets are sold.
const { runTransaction } = require('../database/connection');
const { AppError } = require('../middleware/errorMiddleware');
const { logAdminAction } = require('../utils/auditLogger');

/**
 * Updates show date, time, or status safely.
 * Blocks date/time edits and show cancellation whenever booked tickets > 0.
 */
async function updateShowScheduleOrStatus({ showId, date_str, time_str, status, adminId }) {
  return runTransaction(async (client) => {
    const { rows: [show] } = await client.query('SELECT * FROM shows WHERE id = $1 FOR UPDATE', [showId]);
    if (!show) throw new AppError(404, 'NOT_FOUND', 'Show not found');

    const { rows: [counts] } = await client.query(
      `SELECT
         (SELECT count(*)::int FROM show_seats WHERE show_id = $1 AND status = 'booked') AS seat_booked,
         (SELECT count(*)::int FROM bookings WHERE show_id = $1 AND status = 'confirmed') AS booking_count`,
      [showId]
    );
    const hasBookings = counts.seat_booked > 0 || counts.booking_count > 0;

    const scheduleChanged =
      (date_str !== undefined && date_str !== null && date_str.trim() !== show.date_str) ||
      (time_str !== undefined && time_str !== null && time_str.trim() !== show.time_str);

    if (hasBookings && scheduleChanged) {
      throw new AppError(
        409,
        'SCHEDULE_LOCKED',
        `Cannot change show date or time while ${counts.seat_booked} seat(s) are booked. Keep ${show.time_str} as-is and add a new showtime instead.`
      );
    }

    if (status === 'cancelled' && hasBookings) {
      throw new AppError(
        409,
        'SHOW_HAS_BOOKINGS',
        `Cannot cancel this show while ${counts.seat_booked} ticket(s) are already booked. A show can only be cancelled when 0 tickets are booked.`
      );
    }

    const nextStatus = status || show.status;
    const nextDate = date_str ? date_str.trim() : show.date_str;
    const nextTime = time_str ? time_str.trim() : show.time_str;

    const { rows: [updated] } = await client.query(
      'UPDATE shows SET status = $1, date_str = $2, time_str = $3 WHERE id = $4 RETURNING *',
      [nextStatus, nextDate, nextTime, showId]
    );

    let releasedSeatIds = [];
    if (nextStatus === 'cancelled') {
      const released = await client.query(
        `UPDATE show_seats SET status = 'available', held_by = NULL, hold_expires_at = NULL
         WHERE show_id = $1 AND status = 'held' RETURNING id`,
        [showId]
      );
      releasedSeatIds = released.rows.map((r) => r.id);
    }

    if (showId === 1 && nextStatus === 'open') {
      await client.query('UPDATE screenings SET date_str = $1, time_str = $2 WHERE active = true', [nextDate, nextTime]);
    }

    await logAdminAction(client, {
      adminId,
      action: nextStatus === 'cancelled' ? 'CANCEL_SHOW' : 'UPDATE_SCHEDULE',
      targetType: 'show',
      targetId: showId,
      details: { status: nextStatus, date_str: nextDate, time_str: nextTime },
      reason: nextStatus === 'cancelled' ? 'Admin cancelled unbooked show' : 'Screening schedule modification',
    });

    const { rows: [movieInfo] } = await client.query(
      'SELECT s.*, m.title, m.poster_url, m.synopsis, m.genres AS genre, m.language FROM shows s JOIN movies m ON m.id = s.movie_id WHERE s.id = $1',
      [showId]
    );

    return { updated, movieInfo, releasedSeatIds };
  });
}

module.exports = { updateShowScheduleOrStatus };
