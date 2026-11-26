// Tests for automatic showtime booking cutoff (SHOW_STARTED / BOOKING_CLOSED) and closing expired shows.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../backend/createApp');
const { pool } = require('../backend/database/connection');
const { parseShowTimestampIST } = require('../backend/utils/showtimeParser');
const { closeExpiredShows } = require('../backend/services/showCutoffService');

let server, base;
const call = async (path, { method = 'GET', body, token, key } = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(key && { 'Idempotency-Key': key }),
    },
    body: body && JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

test('parseShowTimestampIST converts readable show date and 12h time into IST timestamp', () => {
  const iso = parseShowTimestampIST('Friday, 27 November, 2026', '10:00 PM');
  assert.equal(iso, '2026-11-27T22:00:00+05:30');

  const noon = parseShowTimestampIST('Saturday, 28 November, 2026', '12:30 PM');
  assert.equal(noon, '2026-11-28T12:30:00+05:30');
});

test('Started or closed shows block holds & bookings with SHOW_STARTED / BOOKING_CLOSED and disappear from open listings', async () => {
  const userLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'user2@test.com', password: 'Test@1234' },
  });
  const adminLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@test.com', password: 'Admin@123' },
  });
  const userTok = userLogin.body.token;
  const adminTok = adminLogin.body.token;

  // Create a show that starts 2 seconds in the future
  const created = await call('/api/admin/shows', {
    method: 'POST',
    token: adminTok,
    body: {
      movie_id: 1,
      hall_id: 1,
      starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      date_str: 'Friday, 27 November, 2026',
      time_str: '10:00 PM',
    },
  });
  assert.equal(created.status, 201);
  const showId = created.body.show.id;

  const seatsRes = await call(`/api/shows/${showId}/seats`, { token: userTok });
  const firstSeatId = seatsRes.body.seats[0].id;

  // 1. User places a 2-minute hold while show has NOT started yet
  const holdOk = await call(`/api/shows/${showId}/holds`, {
    method: 'POST',
    token: userTok,
    body: { seatIds: [firstSeatId] },
  });
  assert.equal(holdOk.status, 200);

  // 2. Push starts_at into the past (simulating clock crossing 10:00 PM showtime)
  await pool.query(`UPDATE shows SET starts_at = now() - interval '10 seconds' WHERE id = $1`, [showId]);

  // 3. New hold request is immediately rejected with 409 SHOW_STARTED
  const holdAfterStart = await call(`/api/shows/${showId}/holds`, {
    method: 'POST',
    token: userTok,
    body: { seatIds: [firstSeatId] },
  });
  assert.equal(holdAfterStart.status, 409);
  assert.equal(holdAfterStart.body.error.code, 'SHOW_STARTED');

  // 4. Attempting to confirm the prior hold after showtime is ALSO rejected with 409 SHOW_STARTED
  const bookAfterStart = await call(`/api/shows/${showId}/bookings`, {
    method: 'POST',
    token: userTok,
    key: 'cutoff-book-test',
  });
  assert.equal(bookAfterStart.status, 409);
  assert.equal(bookAfterStart.body.error.code, 'SHOW_STARTED');

  // 5. Public /api/shows must NOT include this started show anymore
  const openShowsRes = await call('/api/shows');
  assert.equal(openShowsRes.body.shows.some((s) => s.id === showId), false);

  // 6. Sweeper closes expired show, transitions status to 'closed', and releases uncommitted held seat
  const closed = await closeExpiredShows(app);
  assert.ok(closed.some((s) => s.id === showId));

  const { rows: [closedRow] } = await pool.query('SELECT status FROM shows WHERE id = $1', [showId]);
  assert.equal(closedRow.status, 'closed');

  const { rows: [seatAfterClose] } = await pool.query('SELECT status, held_by FROM show_seats WHERE id = $1', [firstSeatId]);
  assert.equal(seatAfterClose.status, 'available');
  assert.equal(seatAfterClose.held_by, null);

  // 7. Closed show rejects requests with 409 BOOKING_CLOSED
  const holdWhenClosed = await call(`/api/shows/${showId}/holds`, {
    method: 'POST',
    token: userTok,
    body: { seatIds: [firstSeatId] },
  });
  assert.equal(holdWhenClosed.status, 409);
  assert.equal(holdWhenClosed.body.error.code, 'BOOKING_CLOSED');

  // Clean up test show
  await pool.query('DELETE FROM shows WHERE id = $1', [showId]);
});
