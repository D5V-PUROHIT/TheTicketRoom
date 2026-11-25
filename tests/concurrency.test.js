// Requires DATABASE_URL pointing at a seeded database (npm run seed).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const app = require('../backend/createApp');
const { pool } = require('../backend/database/connection');

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

const reset = async () => {
  await pool.query("UPDATE show_seats SET status='available', held_by=NULL, hold_expires_at=NULL, booking_id=NULL");
  await pool.query('DELETE FROM refunds');
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM coupon_redemptions');
  await pool.query('DELETE FROM bookings');
};

const login = async (n) =>
  (await call('/api/auth/login', { method: 'POST', body: { email: `user${n}@test.com`, password: 'Test@1234' } })).body.token;

before(async () => {
  await reset();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await reset();
  await pool.end();
});

test('200 users racing for the same 4 seats: exactly one wins, no server errors', async () => {
  const tokens = await Promise.all(Array.from({ length: 200 }, (_, i) => login(i + 1)));
  const holds = await Promise.all(
    tokens.map((token) => call('/api/holds', { method: 'POST', token, body: { seatIds: [1, 2, 3, 4] } }))
  );
  const winners = holds.map((h, i) => (h.status === 200 ? i : -1)).filter((i) => i >= 0);
  assert.equal(winners.length, 1);
  assert.ok(holds.every((h) => h.status === 200 || (h.status === 409 && h.body.error.code === 'SEAT_UNAVAILABLE')));
  const key = 'race-1';
  const [a, b] = await Promise.all(
    [1, 2].map(() => call('/api/bookings', { method: 'POST', token: tokens[winners[0]], key }))
  );
  assert.equal(a.body.booking.id, b.body.booking.id); // retry / double-click returns the same booking
  const { rows } = await pool.query(
    "SELECT count(*)::int AS seats, count(DISTINCT booking_id)::int AS bookings FROM seats WHERE status='booked'"
  );
  assert.deepEqual(rows[0], { seats: 4, bookings: 1 });
});

test('300 users picking random overlapping seats: no seat is ever booked twice', async () => {
  await reset();
  const tokens = await Promise.all(Array.from({ length: 300 }, (_, i) => login(i + 1)));
  const pick = () => [...new Set(Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 16)))];
  const results = await Promise.all(
    tokens.map(async (token, i) => {
      const h = await call('/api/holds', { method: 'POST', token, body: { seatIds: pick() } });
      if (h.status !== 200) {
        assert.equal(h.status, 409);
        return null;
      }
      const c = await call('/api/bookings', { method: 'POST', token, key: `k-${i}` });
      assert.equal(c.status, 201);
      return c.body.booking.seats.map((s) => s.id);
    })
  );
  const claimed = results.filter(Boolean).flat();
  assert.equal(new Set(claimed).size, claimed.length); // disjoint across all successful bookings
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM seats WHERE status='booked'");
  assert.equal(rows[0].n, claimed.length);
  assert.ok(claimed.length <= 16);
});

test('Multi-show isolation: 200 users concurrently racing across two distinct shows never interfere with each other', async () => {
  await reset();
  // 100 users for Show 1, 100 users for Show 2
  const tokensShow1 = await Promise.all(Array.from({ length: 100 }, (_, i) => login(i + 1)));
  const tokensShow2 = await Promise.all(Array.from({ length: 100 }, (_, i) => login(i + 101)));

  // Show 1 seats are 1..4, Show 2 seats are 101..104
  const [holdsShow1, holdsShow2] = await Promise.all([
    Promise.all(tokensShow1.map((token) => call('/api/shows/1/holds', { method: 'POST', token, body: { seatIds: [1, 2, 3, 4] } }))),
    Promise.all(tokensShow2.map((token) => call('/api/shows/2/holds', { method: 'POST', token, body: { seatIds: [101, 102, 103, 104] } }))),
  ]);

  const winnersShow1 = holdsShow1.map((h, i) => (h.status === 200 ? i : -1)).filter((i) => i >= 0);
  const winnersShow2 = holdsShow2.map((h, i) => (h.status === 200 ? i : -1)).filter((i) => i >= 0);

  assert.equal(winnersShow1.length, 1, 'Show 1 must have exactly 1 winner');
  assert.equal(winnersShow2.length, 1, 'Show 2 must have exactly 1 winner');

  // Confirm bookings on both shows simultaneously
  const [b1, b2] = await Promise.all([
    call('/api/shows/1/bookings', { method: 'POST', token: tokensShow1[winnersShow1[0]], key: 'show1-race' }),
    call('/api/shows/2/bookings', { method: 'POST', token: tokensShow2[winnersShow2[0]], key: 'show2-race' }),
  ]);

  assert.equal(b1.status, 201);
  assert.equal(b2.status, 201);
  assert.equal(b1.body.booking.seats.length, 4);
  assert.equal(b2.body.booking.seats.length, 4);

  // Verify total booked seats across both shows in show_seats table
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM show_seats WHERE status='booked'");
  assert.equal(rows[0].n, 8, 'Total booked seats across both shows must equal 8');
});

test('Strict showtime rules: block schedule edit/cancel when booked > 0, allow adding new showtime and cancelling unbooked shows', async () => {
  await reset();
  const userTok = await login(1);
  const adminLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@test.com', password: 'Admin@123' },
  });
  assert.equal(adminLogin.status, 200);
  const adminTok = adminLogin.body.token;

  // 1. User books 1 seat on Show 1 (10:00 PM)
  const h = await call('/api/holds', { method: 'POST', token: userTok, body: { seatIds: [1] } });
  assert.equal(h.status, 200);
  const b = await call('/api/bookings', { method: 'POST', token: userTok, key: 'lock-test-1' });
  assert.equal(b.status, 201);

  // 2. Admin tries to modify Show 1 time -> blocked with 409 SCHEDULE_LOCKED
  const editLocked = await call('/api/admin/movies/schedule', {
    method: 'PUT',
    token: adminTok,
    body: { showId: 1, date_str: 'Friday, 27 November, 2026', time_str: '01:00 PM' },
  });
  assert.equal(editLocked.status, 409);
  assert.equal(editLocked.body.error.code, 'SCHEDULE_LOCKED');

  // 3. Admin tries to cancel Show 1 while ticket is booked -> blocked with 409 SHOW_HAS_BOOKINGS
  const cancelLocked = await call('/api/admin/shows/1', {
    method: 'PUT',
    token: adminTok,
    body: { status: 'cancelled' },
  });
  assert.equal(cancelLocked.status, 409);
  assert.equal(cancelLocked.body.error.code, 'SHOW_HAS_BOOKINGS');

  // 4. Admin creates a brand new 01:00 PM show keeping Show 1 intact
  const created = await call('/api/admin/shows', {
    method: 'POST',
    token: adminTok,
    body: { movie_id: 1, hall_id: 1, date_str: 'Friday, 27 November, 2026', time_str: '01:00 PM' },
  });
  assert.equal(created.status, 201);
  const newShowId = created.body.show.id;

  // 5. New show has 0 bookings -> admin can both reschedule AND cancel it cleanly
  const editEmpty = await call(`/api/admin/shows/${newShowId}`, {
    method: 'PUT',
    token: adminTok,
    body: { time_str: '02:00 PM' },
  });
  assert.equal(editEmpty.status, 200);
  assert.equal(editEmpty.body.show.time_str, '02:00 PM');

  const cancelEmpty = await call(`/api/admin/shows/${newShowId}`, {
    method: 'PUT',
    token: adminTok,
    body: { status: 'cancelled' },
  });
  assert.equal(cancelEmpty.status, 200);
  assert.equal(cancelEmpty.body.show.status, 'cancelled');

  // Clean up test show row
  await pool.query('DELETE FROM shows WHERE id = $1', [newShowId]);
});
