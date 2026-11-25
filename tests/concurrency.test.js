// Requires DATABASE_URL pointing at a seeded database (npm run seed).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const app = require('../server/app');
const pool = require('../server/db');

let server, base;
const call = async (path, { method = 'GET', body, token, key } = {}) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...(key && { 'Idempotency-Key': key }) },
    body: body && JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};
const reset = async () => {
  await pool.query("UPDATE seats SET status='available', held_by=NULL, hold_expires_at=NULL, booking_id=NULL");
  await pool.query('DELETE FROM bookings');
};
const login = async (n) => (await call('/api/auth/login', { method: 'POST', body: { email: `user${n}@test.com`, password: 'Test@1234' } })).body.token;

before(async () => { await reset(); server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { server.close(); await reset(); await pool.end(); });

test('200 users racing for the same 4 seats: exactly one wins, no server errors', async () => {
  const tokens = await Promise.all(Array.from({ length: 200 }, (_, i) => login(i + 1)));
  const holds = await Promise.all(tokens.map((token) => call('/api/holds', { method: 'POST', token, body: { seatIds: [1, 2, 3, 4] } })));
  const winners = holds.map((h, i) => (h.status === 200 ? i : -1)).filter((i) => i >= 0);
  assert.equal(winners.length, 1);
  assert.ok(holds.every((h) => h.status === 200 || (h.status === 409 && h.body.error.code === 'SEAT_UNAVAILABLE')));
  const key = 'race-1';
  const [a, b] = await Promise.all([1, 2].map(() => call('/api/bookings', { method: 'POST', token: tokens[winners[0]], key })));
  assert.equal(a.body.booking.id, b.body.booking.id); // retry / double-click returns the same booking
  const { rows } = await pool.query("SELECT count(*)::int AS seats, count(DISTINCT booking_id)::int AS bookings FROM seats WHERE status='booked'");
  assert.deepEqual(rows[0], { seats: 4, bookings: 1 });
});

test('300 users picking random overlapping seats: no seat is ever booked twice', async () => {
  await reset();
  const tokens = await Promise.all(Array.from({ length: 300 }, (_, i) => login(i + 1)));
  const pick = () => [...new Set(Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 16)))];
  const results = await Promise.all(tokens.map(async (token, i) => {
    const h = await call('/api/holds', { method: 'POST', token, body: { seatIds: pick() } });
    if (h.status !== 200) { assert.equal(h.status, 409); return null; }
    const c = await call('/api/bookings', { method: 'POST', token, key: `k-${i}` });
    assert.equal(c.status, 201);
    return c.body.booking.seats.map((s) => s.id);
  }));
  const claimed = results.filter(Boolean).flat();
  assert.equal(new Set(claimed).size, claimed.length); // disjoint across all successful bookings
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM seats WHERE status='booked'");
  assert.equal(rows[0].n, claimed.length);
  assert.ok(claimed.length <= 16);
});
