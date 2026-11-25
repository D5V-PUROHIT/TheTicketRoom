require('dotenv').config();
const express = require('express'), helmet = require('helmet'), cors = require('cors');
const bcrypt = require('bcrypt'), jwt = require('jsonwebtoken'), crypto = require('crypto');
const path = require('path'), fs = require('fs');
const pool = require('./db');

const MAX_SEATS = 4, HOLD_SECONDS = 120;
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}

// Seat projection: an expired hold is reported as available even before the sweeper runs.
const VIEW = `id, row_label, seat_number, price,
  CASE WHEN status='held' AND hold_expires_at <= now() THEN 'available' ELSE status END AS status,
  CASE WHEN status='held' AND hold_expires_at > now() THEN held_by END AS held_by,
  CASE WHEN status='held' AND hold_expires_at > now() THEN hold_expires_at END AS hold_expires_at`;

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10kb' }));

const broadcast = async (ids) => {
  if (!ids.length || !app.locals.io) return;
  const { rows } = await pool.query(`SELECT ${VIEW} FROM seats WHERE id = ANY($1) ORDER BY id`, [ids]);
  app.locals.io.emit('seats:update', rows);
};
app.locals.broadcast = (ids) => broadcast(ids).catch((e) => console.error('broadcast', e.message));

const sign = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '8h' });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.get('Authorization') || '').replace('Bearer ', ''), SECRET); next(); }
  catch { next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue')); }
};
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : next(new HttpError(403, 'FORBIDDEN', 'Admin access required'));

// ---------- Auth ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 60) throw new HttpError(400, 'VALIDATION', 'Enter your name');
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'VALIDATION', 'Enter a valid email');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) throw new HttpError(400, 'VALIDATION', 'Password must be 8 to 72 characters');
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows: [u] } = await pool.query(
      'INSERT INTO users(name, email, password_hash) VALUES ($1,$2,$3) RETURNING *',
      [name.trim(), email.toLowerCase(), hash]);
    res.status(201).json({ token: sign(u), user: pub(u) });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'EMAIL_TAKEN', 'That email is already registered');
    throw e;
  }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') throw new HttpError(400, 'VALIDATION', 'Email and password are required');
  const { rows: [u] } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) throw new HttpError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');
  res.json({ token: sign(u), user: pub(u) });
}));

// ---------- Seats ----------
app.get('/api/seats', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT ${VIEW} FROM seats ORDER BY id`);
  res.json({ seats: rows, maxSeats: MAX_SEATS, holdSeconds: HOLD_SECONDS });
}));

// Replaces the caller's current selection with seatIds (empty array releases everything).
// All-or-nothing: if any requested seat is unavailable, nothing changes.
app.post('/api/holds', auth, wrap(async (req, res) => {
  const raw = req.body && req.body.seatIds;
  if (!Array.isArray(raw) || !raw.every((n) => Number.isInteger(n) && n >= 1 && n <= 100))
    throw new HttpError(400, 'VALIDATION', 'seatIds must be an array of seat ids');
  const ids = [...new Set(raw)];
  if (ids.length > MAX_SEATS) throw new HttpError(400, 'MAX_SEATS', `You can select at most ${MAX_SEATS} seats`);
  const uid = req.user.id;

  const changed = await tx(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [uid]); // serialises this user's own requests
    const { rows: [{ n: owned }] } = await c.query(
      'SELECT count(*)::int AS n FROM seats s JOIN bookings b ON b.id = s.booking_id WHERE b.user_id = $1', [uid]);
    if (owned + ids.length > MAX_SEATS)
      throw new HttpError(400, 'MAX_SEATS', `You already have ${owned} booked seat(s). The limit is ${MAX_SEATS} per user`);
    // Row locks are taken in id order, so concurrent requests cannot deadlock.
    const { rows: locked } = await c.query(
      `SELECT *, (status='held' AND hold_expires_at > now()) AS live
       FROM seats WHERE id = ANY($1) OR held_by = $2 ORDER BY id FOR UPDATE`, [ids, uid]);
    const taken = locked.filter((s) => ids.includes(s.id) && (s.status === 'booked' || (s.live && s.held_by !== uid)));
    if (taken.length)
      throw new HttpError(409, 'SEAT_UNAVAILABLE',
        `Seat ${taken.map((s) => s.row_label + s.seat_number).join(', ')} was just taken. Please choose another.`);
    const rel = await c.query(
      `UPDATE seats SET status='available', held_by=NULL, hold_expires_at=NULL
       WHERE held_by = $1 AND status = 'held' AND NOT (id = ANY($2)) RETURNING id`, [uid, ids]);
    let held = [];
    if (ids.length) {
      held = (await c.query(
        `UPDATE seats SET
           hold_expires_at = CASE WHEN status='held' AND held_by=$1 AND hold_expires_at > now()
                                  THEN hold_expires_at ELSE now() + make_interval(secs => $3::double precision) END,
           status = 'held', held_by = $1
         WHERE id = ANY($2) RETURNING id`, [uid, ids, HOLD_SECONDS])).rows;
    }
    return [...rel.rows, ...held].map((r) => r.id);
  });
  app.locals.broadcast(changed);
  const { rows } = await pool.query(`SELECT ${VIEW} FROM seats WHERE id = ANY($1) ORDER BY id`, [changed]);
  res.json({ seats: rows });
}));

// ---------- Bookings ----------
const bookingSelect = `SELECT b.id, b.reference, b.total_price, b.status, b.created_at,
  json_agg(json_build_object('id', s.id, 'label', s.row_label || s.seat_number, 'price', s.price) ORDER BY s.id) AS seats
  FROM bookings b JOIN seats s ON s.booking_id = b.id`;

app.post('/api/bookings', auth, wrap(async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100) throw new HttpError(400, 'VALIDATION', 'Idempotency-Key header is required');
  const uid = req.user.id;
  const out = await tx(async (c) => {
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [uid]);
    const prior = await c.query(`${bookingSelect} WHERE b.user_id=$1 AND b.idempotency_key=$2 GROUP BY b.id`, [uid, key]);
    if (prior.rows[0]) return { booking: prior.rows[0], replayed: true, ids: [] };
    const { rows: held } = await c.query(
      `SELECT id, price FROM seats WHERE held_by = $1 AND status = 'held' AND hold_expires_at > now()
       ORDER BY id FOR UPDATE`, [uid]);
    if (!held.length) throw new HttpError(409, 'HOLD_EXPIRED', 'Your hold has expired. Please select your seats again.');
    const ids = held.map((s) => s.id);
    const total = held.reduce((t, s) => t + s.price, 0);
    const { rows: [b] } = await c.query(
      'INSERT INTO bookings(user_id, idempotency_key, reference, total_price) VALUES ($1,$2,$3,$4) RETURNING id',
      [uid, key, 'CX' + crypto.randomBytes(4).toString('hex').toUpperCase(), total]);
    await c.query(
      `UPDATE seats SET status='booked', booking_id=$1, held_by=NULL, hold_expires_at=NULL WHERE id = ANY($2)`, [b.id, ids]);
    const full = await c.query(`${bookingSelect} WHERE b.id=$1 GROUP BY b.id`, [b.id]);
    return { booking: full.rows[0], replayed: false, ids };
  });
  app.locals.broadcast(out.ids);
  res.status(out.replayed ? 200 : 201).json({ booking: out.booking, replayed: out.replayed });
}));

app.get('/api/bookings', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `${bookingSelect} WHERE b.user_id=$1 AND b.status='confirmed' GROUP BY b.id ORDER BY b.created_at DESC`, [req.user.id]);
  res.json({ bookings: rows });
}));

app.delete('/api/bookings/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'VALIDATION', 'Invalid booking id');
  const ids = await tx(async (c) => {
    const { rows: [b] } = await c.query('SELECT * FROM bookings WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, req.user.id]);
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
    if (b.status === 'cancelled') return [];
    await c.query('SELECT id FROM seats WHERE booking_id=$1 ORDER BY id FOR UPDATE', [id]);
    const r = await c.query(`UPDATE seats SET status='available', booking_id=NULL WHERE booking_id=$1 RETURNING id`, [id]);
    await c.query(`UPDATE bookings SET status='cancelled' WHERE id=$1`, [id]);
    return r.rows.map((x) => x.id);
  });
  app.locals.broadcast(ids);
  res.json({ cancelled: true });
}));

// ---------- Admin ----------
app.get('/api/admin/stats', auth, adminOnly, wrap(async (req, res) => {
  const { rows: [counts] } = await pool.query(
    `SELECT count(*) FILTER (WHERE s='available')::int AS available,
            count(*) FILTER (WHERE s='held')::int AS held,
            count(*) FILTER (WHERE s='booked')::int AS booked
     FROM (SELECT CASE WHEN status='held' AND hold_expires_at <= now() THEN 'available' ELSE status END AS s FROM seats) t`);
  const { rows: [rev] } = await pool.query(`SELECT coalesce(sum(total_price),0)::int AS revenue FROM bookings WHERE status='confirmed'`);
  const { rows: recent } = await pool.query(
    `SELECT b.reference, b.total_price, b.created_at, u.email,
            (SELECT string_agg(row_label || seat_number, ', ' ORDER BY id) FROM seats WHERE booking_id = b.id) AS seats
     FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.status='confirmed' ORDER BY b.created_at DESC LIMIT 8`);
  res.json({ ...counts, total: 100, revenue: rev.revenue, recent });
}));

// ---------- Static client + errors ----------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use('/api', (req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'Unknown endpoint')));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid JSON' } });
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' } });
});

module.exports = app;
