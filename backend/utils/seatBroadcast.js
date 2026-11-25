// Sends real-time WebSocket updates whenever seats are held, booked, released, or cancelled.
const { pool } = require('../database/connection');
const { SEAT_VIEW_COLUMNS } = require('../config/bookingRules');

/**
 * Fetches updated seat rows and pushes them to all connected browsers via Socket.IO.
 */
async function emitSeatUpdates(app, seatIds, showId = 1) {
  if (!seatIds || !seatIds.length || !app.locals.io) return;
  const { rows } = await pool.query(
    `SELECT ${SEAT_VIEW_COLUMNS} FROM show_seats WHERE id = ANY($1) ORDER BY id`,
    [seatIds]
  );
  app.locals.io.emit('seats:update', rows);
  app.locals.io.emit(`seats:update:${showId}`, rows);
}

// Non-blocking wrapper so a WebSocket hiccup never fails an HTTP booking response.
function broadcastSeatsSafe(app, seatIds, showId = 1) {
  emitSeatUpdates(app, seatIds, showId).catch((e) => console.error('broadcast error:', e.message));
}

module.exports = { broadcastSeatsSafe };
