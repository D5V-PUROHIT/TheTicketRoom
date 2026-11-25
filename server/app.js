require('dotenv').config();
const express = require('express'), helmet = require('helmet'), cors = require('cors');
const bcrypt = require('bcrypt'), jwt = require('jsonwebtoken'), crypto = require('crypto');
const path = require('path'), fs = require('fs');
const pool = require('./db');
const paymentGateway = require('./payments/gateway');
const { logAudit } = require('./audit');
const notifications = require('./notifications/email');

const MAX_SEATS = 4, HOLD_SECONDS = 120;
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is required');

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Seat projection: an expired hold is reported as available even before the sweeper runs.
const VIEW = `id, show_id, row_label, seat_number, tier, price,
  CASE WHEN status='held' AND hold_expires_at <= now() THEN 'available' ELSE status END AS status,
  CASE WHEN status='held' AND hold_expires_at > now() THEN held_by END AS held_by,
  CASE WHEN status='held' AND hold_expires_at > now() THEN hold_expires_at END AS hold_expires_at`;

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Real-time WebSocket broadcasting helper
const broadcast = async (ids, showId = 1) => {
  if (!ids || !ids.length || !app.locals.io) return;
  const { rows } = await pool.query(
    `SELECT ${VIEW} FROM show_seats WHERE id = ANY($1) ORDER BY id`, [ids]
  );
  app.locals.io.emit('seats:update', rows);
  app.locals.io.emit(`seats:update:${showId}`, rows);
};
app.locals.broadcast = (ids, showId) => broadcast(ids, showId).catch((e) => console.error('broadcast', e.message));

// Authentication & Tokens
const sign = (u) => jwt.sign({ id: u.id, role: u.role, email: u.email }, SECRET, { expiresIn: '8h' });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

const auth = (req, res, next) => {
  try {
    const raw = (req.get('Authorization') || '').replace('Bearer ', '');
    req.user = jwt.verify(raw, SECRET);
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
  }
};

// Allows unauthenticated visitors to view seats, but attaches req.user if token is present
const optionalAuth = (req, res, next) => {
  try {
    const raw = (req.get('Authorization') || '').replace('Bearer ', '');
    if (raw) req.user = jwt.verify(raw, SECRET);
  } catch {}
  next();
};

// Role-Based Access Control (RBAC) middleware
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'UNAUTHENTICATED', 'Sign in required'));
  const userRole = req.user.role;
  // super_admin and legacy 'admin' have full authorization across all admin endpoints
  if (userRole === 'super_admin' || userRole === 'admin') return next();
  if (roles.includes(userRole)) return next();
  next(new HttpError(403, 'FORBIDDEN', `Access forbidden: requires ${roles.join(' or ')} permission`));
};

const adminOnly = requireRole('super_admin', 'operations', 'support', 'finance', 'marketing');

// ---------- Authentication Routes ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 60)
    throw new HttpError(400, 'VALIDATION', 'Enter your name');
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new HttpError(400, 'VALIDATION', 'Enter a valid email');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    throw new HttpError(400, 'VALIDATION', 'Password must be 8 to 72 characters');

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows: [u] } = await pool.query(
      "INSERT INTO users(name, email, password_hash, role) VALUES ($1, $2, $3, 'user') RETURNING *",
      [name.trim(), email.toLowerCase(), hash]
    );
    res.status(201).json({ token: sign(u), user: pub(u) });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'EMAIL_TAKEN', 'That email is already registered');
    throw e;
  }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string')
    throw new HttpError(400, 'VALIDATION', 'Email and password are required');

  const { rows: [u] } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    throw new HttpError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');

  if (u.is_suspended)
    throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'Your account has been temporarily suspended. Contact support.');

  res.json({ token: sign(u), user: pub(u) });
}));

// ---------- Movie Catalogue & Shows Public APIs ----------
app.get('/api/movies', wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT m.*,
      coalesce(
        json_agg(
          json_build_object(
            'id', s.id,
            'hall_id', s.hall_id,
            'starts_at', s.starts_at,
            'date_str', s.date_str,
            'time_str', s.time_str,
            'status', s.status,
            'prices', json_build_object('recliner', s.price_recliner, 'club', s.price_club, 'premium', s.price_premium)
          ) ORDER BY s.starts_at ASC
        ) FILTER (WHERE s.id IS NOT NULL), '[]'
      ) AS shows
    FROM movies m
    LEFT JOIN shows s ON s.movie_id = m.id AND s.status IN ('open', 'scheduled')
    WHERE m.status = 'active'
    GROUP BY m.id
    ORDER BY m.id ASC
  `);
  res.json({ movies: rows });
}));

app.get('/api/movies/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [m] } = await pool.query('SELECT * FROM movies WHERE id = $1', [id]);
  if (!m) throw new HttpError(404, 'NOT_FOUND', 'Movie not found');
  const { rows: shows } = await pool.query(
    'SELECT * FROM shows WHERE movie_id = $1 AND status IN (\'open\', \'scheduled\') ORDER BY starts_at ASC',
    [id]
  );
  res.json({ movie: { ...m, shows } });
}));

app.get('/api/shows', wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, m.title AS movie_title, m.poster_url, m.certificate, m.language, m.genres, h.name AS hall_name
    FROM shows s
    JOIN movies m ON m.id = s.movie_id
    JOIN halls h ON h.id = s.hall_id
    WHERE s.status IN ('open', 'scheduled')
    ORDER BY s.starts_at ASC
  `);
  res.json({ shows: rows });
}));

// Single active movie endpoint for backward compatibility
const defaultMovie = {
  title: 'Baahubali: The Beginning',
  date_str: 'Friday, 27 November, 2026',
  time_str: '10:00 PM',
  poster_url: '/posters/bahubali.jpg',
  synopsis: 'In ancient Mahishmati, a daring young adventurer learns of his royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
  genre: 'Action • Epic • Mythology • Drama',
  language: 'Hindi, Telugu • Dolby Atmos 7.1',
};

app.get('/api/movie', wrap(async (req, res) => {
  try {
    const { rows: [s] } = await pool.query(`
      SELECT s.id AS show_id, s.date_str, s.time_str, m.title, m.poster_url, m.synopsis, m.genres AS genre, m.language
      FROM shows s JOIN movies m ON m.id = s.movie_id
      WHERE s.status = 'open' ORDER BY s.id ASC LIMIT 1
    `);
    if (s) return res.json({ movie: s });
    const { rows: [m] } = await pool.query('SELECT * FROM screenings WHERE active = true ORDER BY id DESC LIMIT 1');
    res.json({ movie: m || defaultMovie });
  } catch {
    res.json({ movie: defaultMovie });
  }
}));

// ---------- Seats & Holds (Multi-Show with Single-Show Fallback) ----------

// Get seats for a specific show (with auto-healing fallback)
app.get('/api/shows/:showId/seats', optionalAuth, wrap(async (req, res) => {
  const showId = Number(req.params.showId);
  if (!Number.isInteger(showId)) throw new HttpError(400, 'VALIDATION', 'Invalid showId');
  try {
    const { rows } = await pool.query(`SELECT ${VIEW} FROM show_seats WHERE show_id = $1 ORDER BY id`, [showId]);
    if (rows && rows.length > 0) {
      return res.json({ seats: rows, maxSeats: MAX_SEATS, holdSeconds: HOLD_SECONDS, showId });
    }
  } catch (err) {
    console.warn('[TheTicketRoom] show_seats query failed, attempting auto-heal:', err.message);
  }

  // Attempt auto-seed and reload
  const { initDb } = require('./init-db');
  await initDb().catch(() => {});
  const { rows } = await pool.query(`SELECT ${VIEW} FROM show_seats WHERE show_id = $1 ORDER BY id`, [showId]).catch(() => ({ rows: [] }));
  res.json({ seats: rows, maxSeats: MAX_SEATS, holdSeconds: HOLD_SECONDS, showId });
}));

// Default legacy seats route (maps to Show 1 with auto-healing fallback)
app.get('/api/seats', optionalAuth, wrap(async (req, res) => {
  const showId = Number(req.query.showId) || 1;
  try {
    const { rows } = await pool.query(`SELECT ${VIEW} FROM show_seats WHERE show_id = $1 ORDER BY id`, [showId]);
    if (rows && rows.length > 0) {
      return res.json({ seats: rows, maxSeats: MAX_SEATS, holdSeconds: HOLD_SECONDS, showId });
    }
  } catch (err) {
    console.warn('[TheTicketRoom] show_seats query failed, attempting auto-heal:', err.message);
  }

  // Fallback to legacy seats view or auto-seed
  try {
    const { rows } = await pool.query('SELECT id, row_label, seat_number, tier, price, status, held_by, hold_expires_at FROM seats ORDER BY id');
    if (rows && rows.length > 0) {
      return res.json({ seats: rows, maxSeats: MAX_SEATS, holdSeconds: HOLD_SECONDS, showId: 1 });
    }
  } catch {}

  const { initDb } = require('./init-db');
  await initDb().catch(() => {});
  const { rows } = await pool.query(`SELECT ${VIEW} FROM show_seats WHERE show_id = $1 ORDER BY id`, [showId]).catch(() => ({ rows: [] }));
  res.json({ seats: rows, maxSeats: MAX_SEATS, holdSeconds: HOLD_SECONDS, showId });
}));

// Core hold handler: locks user row first, locks requested seats in ascending ID order
async function executeHold({ uid, showId, requestedIds }) {
  const ids = [...new Set(requestedIds)];
  if (ids.length > MAX_SEATS)
    throw new HttpError(400, 'MAX_SEATS', `You can select at most ${MAX_SEATS} seats`);

  return await tx(async (c) => {
    // 1. Lock caller user row first (serializes this user's concurrent requests)
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [uid]);

    // 2. Enforce global maximum 4 seats per customer on this show
    const { rows: [{ n: owned }] } = await c.query(
      `SELECT count(*)::int AS n FROM show_seats s
       JOIN bookings b ON b.id = s.booking_id
       WHERE b.user_id = $1 AND s.show_id = $2 AND b.status = 'confirmed'`,
      [uid, showId]
    );
    if (owned + ids.length > MAX_SEATS)
      throw new HttpError(400, 'MAX_SEATS', `You already have ${owned} booked seat(s). Maximum is ${MAX_SEATS} per user.`);

    // 3. Row locks are taken in ascending id order across requested seats and caller's prior holds
    const { rows: locked } = await c.query(
      `SELECT *, (status='held' AND hold_expires_at > now()) AS live
       FROM show_seats
       WHERE show_id = $1 AND (id = ANY($2) OR held_by = $3)
       ORDER BY id FOR UPDATE`,
      [showId, ids, uid]
    );

    // 4. Verify availability of newly requested seats
    const taken = locked.filter(
      (s) => ids.includes(s.id) && (s.status === 'booked' || s.status === 'blocked' || (s.live && s.held_by !== uid))
    );
    if (taken.length) {
      throw new HttpError(
        409,
        'SEAT_UNAVAILABLE',
        `Seat ${taken.map((s) => s.row_label + s.seat_number).join(', ')} was just taken. Please choose another.`
      );
    }

    // 5. Release any previously held seats that were unselected
    const rel = await c.query(
      `UPDATE show_seats SET status='available', held_by=NULL, hold_expires_at=NULL
       WHERE show_id = $1 AND held_by = $2 AND status = 'held' AND NOT (id = ANY($3))
       RETURNING id`,
      [showId, uid, ids]
    );

    // 6. Hold newly requested seats
    let held = [];
    if (ids.length) {
      held = (
        await c.query(
          `UPDATE show_seats SET
             hold_expires_at = CASE WHEN status='held' AND held_by=$2 AND hold_expires_at > now()
                                    THEN hold_expires_at
                                    ELSE now() + make_interval(secs => $4::double precision) END,
             status = 'held', held_by = $2
           WHERE show_id = $1 AND id = ANY($3)
           RETURNING id`,
          [showId, uid, ids, HOLD_SECONDS]
        )
      ).rows;
    }

    return [...rel.rows, ...held].map((r) => r.id);
  });
}

// Hold seats on specific show
app.post('/api/shows/:showId/holds', auth, wrap(async (req, res) => {
  const showId = Number(req.params.showId);
  const raw = req.body && req.body.seatIds;
  if (!Array.isArray(raw) || !raw.every((n) => Number.isInteger(n) && n >= 1))
    throw new HttpError(400, 'VALIDATION', 'seatIds must be an array of positive integer seat ids');

  const changed = await executeHold({ uid: req.user.id, showId, requestedIds: raw });
  app.locals.broadcast(changed, showId);
  const { rows } = await pool.query(`SELECT ${VIEW} FROM show_seats WHERE id = ANY($1) ORDER BY id`, [changed]);
  res.json({ seats: rows });
}));

// Default legacy hold route (maps to Show 1 unless showId specified)
app.post('/api/holds', auth, wrap(async (req, res) => {
  const showId = Number(req.body?.showId) || 1;
  const raw = req.body && req.body.seatIds;
  if (!Array.isArray(raw) || !raw.every((n) => Number.isInteger(n) && n >= 1))
    throw new HttpError(400, 'VALIDATION', 'seatIds must be an array of integer seat ids');

  const changed = await executeHold({ uid: req.user.id, showId, requestedIds: raw });
  app.locals.broadcast(changed, showId);
  const { rows } = await pool.query(`SELECT ${VIEW} FROM show_seats WHERE id = ANY($1) ORDER BY id`, [changed]);
  res.json({ seats: rows });
}));

// ---------- Bookings & Pricing Calculations ----------
const bookingSelect = `SELECT b.id, b.show_id, b.reference, b.total_price, b.subtotal, b.discount_amount,
  b.convenience_fee, b.gst_amount, b.coupon_code, b.status, b.created_at,
  coalesce(
    json_agg(
      json_build_object('id', s.id, 'label', s.row_label || s.seat_number, 'price', s.price, 'tier', s.tier)
      ORDER BY s.id
    ) FILTER (WHERE s.id IS NOT NULL), '[]'
  ) AS seats
  FROM bookings b
  LEFT JOIN show_seats s ON s.booking_id = b.id`;

// Execute booking transaction
async function executeBooking({ uid, key, showId, couponCode = null }) {
  return await tx(async (c) => {
    // 1. Lock user row first
    await c.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [uid]);

    // 2. Idempotency check: replay previous booking if key matches
    const prior = await c.query(
      `${bookingSelect} WHERE b.user_id = $1 AND b.idempotency_key = $2 GROUP BY b.id`,
      [uid, key]
    );
    if (prior.rows[0]) return { booking: prior.rows[0], replayed: true, ids: [] };

    // 3. Lock held seats in ascending ID order
    const { rows: held } = await c.query(
      `SELECT id, price, row_label, seat_number, tier
       FROM show_seats
       WHERE show_id = $1 AND held_by = $2 AND status = 'held' AND hold_expires_at > now()
       ORDER BY id FOR UPDATE`,
      [showId, uid]
    );
    if (!held.length)
      throw new HttpError(409, 'HOLD_EXPIRED', 'Your hold has expired. Please select your seats again.');

    const ids = held.map((s) => s.id);
    const subtotal = held.reduce((t, s) => t + s.price, 0);

    // 4. Calculate coupons and fees
    let discount = 0;
    if (couponCode) {
      const { rows: [cpn] } = await c.query(
        'SELECT * FROM coupons WHERE code = $1 AND is_active = true FOR UPDATE',
        [couponCode.toUpperCase().trim()]
      );
      if (cpn && subtotal >= cpn.min_order_amount) {
        if (!cpn.expires_at || new Date(cpn.expires_at) > new Date()) {
          const { rows: [{ count: usedCount }] } = await c.query(
            'SELECT count(*)::int FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2',
            [cpn.id, uid]
          );
          if (usedCount < cpn.per_user_limit) {
            discount = cpn.discount_type === 'percent'
              ? Math.round((subtotal * cpn.discount_value) / 100)
              : cpn.discount_value;
            if (cpn.max_discount && discount > cpn.max_discount) discount = cpn.max_discount;
            discount = Math.min(discount, subtotal);
            await c.query('UPDATE coupons SET times_used = times_used + 1 WHERE id = $1', [cpn.id]);
          }
        }
      }
    }

    const convenienceFee = 20; // ₹20 flat convenience fee per booking
    const gst = Math.round(convenienceFee * 0.18); // 18% GST on convenience fee
    const total = Math.max(0, subtotal - discount + convenienceFee + gst);
    const ref = 'CX' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // 5. Insert confirmed booking record
    const { rows: [b] } = await c.query(
      `INSERT INTO bookings (user_id, show_id, idempotency_key, reference, total_price, subtotal, discount_amount, convenience_fee, gst_amount, coupon_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [uid, showId, key, ref, total, subtotal, discount, convenienceFee, gst, couponCode ? couponCode.toUpperCase() : null]
    );

    // 6. Transition show_seats to booked
    await c.query(
      `UPDATE show_seats SET status='booked', booking_id=$1, held_by=NULL, hold_expires_at=NULL WHERE id = ANY($2)`,
      [b.id, ids]
    );

    // 7. Record payment entry
    await c.query(
      `INSERT INTO payments (booking_id, user_id, amount, status, gateway)
       VALUES ($1, $2, $3, 'captured', 'test_mode')`,
      [b.id, uid, total * 100]
    );

    const full = await c.query(`${bookingSelect} WHERE b.id = $1 GROUP BY b.id`, [b.id]);
    return { booking: full.rows[0], replayed: false, ids };
  });
}

// Confirm booking for a specific show
app.post('/api/shows/:showId/bookings', auth, wrap(async (req, res) => {
  const showId = Number(req.params.showId);
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100)
    throw new HttpError(400, 'VALIDATION', 'Idempotency-Key header is required');

  const { couponCode } = req.body || {};
  const out = await executeBooking({ uid: req.user.id, key, showId, couponCode });
  app.locals.broadcast(out.ids, showId);

  // Send asynchronous e-ticket email notification
  notifications.sendBookingConfirmation({
    email: req.user.email,
    reference: out.booking.reference,
    movieTitle: 'Cinema Screening',
    showtime: 'Tonight at 10:00 PM',
    seats: out.booking.seats.map((s) => s.label).join(', '),
    totalPaid: out.booking.total_price,
  });

  res.status(out.replayed ? 200 : 201).json({ booking: out.booking, replayed: out.replayed });
}));

// Default legacy booking route
app.post('/api/bookings', auth, wrap(async (req, res) => {
  const showId = Number(req.body?.showId) || 1;
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100)
    throw new HttpError(400, 'VALIDATION', 'Idempotency-Key header is required');

  const { couponCode } = req.body || {};
  const out = await executeBooking({ uid: req.user.id, key, showId, couponCode });
  app.locals.broadcast(out.ids, showId);

  res.status(out.replayed ? 200 : 201).json({ booking: out.booking, replayed: out.replayed });
}));

app.get('/api/bookings', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `${bookingSelect} WHERE b.user_id = $1 AND b.status = 'confirmed' GROUP BY b.id ORDER BY b.created_at DESC`,
    [req.user.id]
  );
  res.json({ bookings: rows });
}));

app.delete('/api/bookings/:id', auth, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'VALIDATION', 'Invalid booking id');

  const result = await tx(async (c) => {
    const { rows: [b] } = await c.query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [id, req.user.id]
    );
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
    if (b.status === 'cancelled') return { ids: [], showId: b.show_id };

    await c.query('SELECT id FROM show_seats WHERE booking_id = $1 ORDER BY id FOR UPDATE', [id]);
    const r = await c.query(
      `UPDATE show_seats SET status='available', booking_id=NULL WHERE booking_id = $1 RETURNING id`,
      [id]
    );
    await c.query(`UPDATE bookings SET status='cancelled', cancellation_reason='Customer requested cancellation' WHERE id = $1`, [id]);
    await c.query(`UPDATE payments SET status='refunded' WHERE booking_id = $1`, [id]);
    return { ids: r.rows.map((x) => x.id), showId: b.show_id };
  });

  app.locals.broadcast(result.ids, result.showId);
  res.json({ cancelled: true });
}));

// Validate promotional coupon
app.post('/api/coupons/validate', auth, wrap(async (req, res) => {
  const { code, amount } = req.body || {};
  if (!code || typeof code !== 'string')
    throw new HttpError(400, 'VALIDATION', 'Coupon code required');

  const { rows: [cpn] } = await pool.query(
    'SELECT * FROM coupons WHERE code = $1 AND is_active = true',
    [code.toUpperCase().trim()]
  );
  if (!cpn) throw new HttpError(404, 'INVALID_COUPON', 'Invalid or expired coupon code');
  if (amount && amount < cpn.min_order_amount)
    throw new HttpError(400, 'MIN_AMOUNT', `Minimum order amount for ${cpn.code} is ₹${cpn.min_order_amount}`);

  const discount = cpn.discount_type === 'percent'
    ? Math.min(Math.round(((amount || 0) * cpn.discount_value) / 100), cpn.max_discount || 99999)
    : cpn.discount_value;

  res.json({ valid: true, code: cpn.code, discount_type: cpn.discount_type, discount });
}));

// ---------- Payment Gateway Integration (Razorpay Test Mode & Webhooks) ----------
app.post('/api/payments/create-order', auth, wrap(async (req, res) => {
  const { amount, receipt } = req.body || {};
  if (!amount || amount <= 0) throw new HttpError(400, 'VALIDATION', 'Valid order amount required');

  const order = await paymentGateway.createOrder({
    amount: Math.round(amount * 100), // convert to paise
    currency: 'INR',
    receipt: receipt || `rec_${Date.now()}`,
  });
  res.json({ order, keyId: paymentGateway.keyId });
}));

// Webhook for asynchronous payment provider confirmation
app.post('/api/payments/webhook', wrap(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const event = req.body?.event;
  const payload = req.body?.payload?.payment?.entity;

  if (signature && !paymentGateway.verifySignature({
    orderId: payload?.order_id,
    paymentId: payload?.id,
    signature
  })) {
    return res.status(400).json({ error: 'INVALID_SIGNATURE' });
  }

  // Idempotently record payment status
  if (payload?.id && event === 'payment.captured') {
    await pool.query(
      `UPDATE payments SET status = 'captured', gateway_payment_id = $1, updated_at = now()
       WHERE gateway_order_id = $2`,
      [payload.id, payload.order_id]
    );
  }
  res.json({ status: 'ok' });
}));

// ---------- Admin Back-Office Routes (With Strict Server-Side RBAC) ----------

// 1. Live Admin Statistics & Monitoring
app.get('/api/admin/stats', auth, adminOnly, wrap(async (req, res) => {
  const showId = Number(req.query.showId) || 1;
  const { rows: [counts] } = await pool.query(
    `SELECT count(*) FILTER (WHERE s='available')::int AS available,
            count(*) FILTER (WHERE s='held')::int AS held,
            count(*) FILTER (WHERE s='booked')::int AS booked,
            count(*) FILTER (WHERE s='blocked')::int AS blocked
     FROM (
       SELECT CASE WHEN status='held' AND hold_expires_at <= now() THEN 'available' ELSE status END AS s
       FROM show_seats WHERE show_id = $1
     ) t`,
    [showId]
  );
  const { rows: [rev] } = await pool.query(
    `SELECT coalesce(sum(total_price), 0)::int AS revenue FROM bookings WHERE status='confirmed'`
  );
  const { rows: recent } = await pool.query(
    `SELECT b.reference, b.total_price, b.created_at, u.email,
            (SELECT string_agg(row_label || seat_number, ', ' ORDER BY id) FROM show_seats WHERE booking_id = b.id) AS seats
     FROM bookings b JOIN users u ON u.id = b.user_id
     WHERE b.status = 'confirmed'
     ORDER BY b.created_at DESC LIMIT 8`
  );
  res.json({ ...counts, total: 100, revenue: rev.revenue, recent });
}));

// 2. Movie Catalogue Management (Role: operations, super_admin)
app.get('/api/admin/movies', auth, adminOnly, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM movies ORDER BY id DESC');
  res.json({ movies: rows });
}));

app.post('/api/admin/movies', auth, requireRole('operations'), wrap(async (req, res) => {
  const { title, synopsis, poster_url, cast_members, language, certificate, runtime_mins, genres } = req.body || {};
  if (!title || typeof title !== 'string') throw new HttpError(400, 'VALIDATION', 'Movie title is required');

  const { rows: [m] } = await pool.query(
    `INSERT INTO movies (title, synopsis, poster_url, cast_members, language, certificate, runtime_mins, genres)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      title.trim(),
      synopsis || '',
      poster_url || '/posters/bahubali.jpg',
      cast_members || 'Lead Cast',
      language || 'Hindi',
      certificate || 'U/A 13+',
      Number(runtime_mins) || 150,
      genres || 'Action • Drama',
    ]
  );

  await logAudit(pool, {
    adminId: req.user.id,
    action: 'CREATE_MOVIE',
    targetType: 'movie',
    targetId: m.id,
    details: { title: m.title },
    reason: 'New movie catalogue entry',
  });

  res.status(201).json({ movie: m });
}));

// 3. Show Scheduling & Seat Blocking (Role: operations, super_admin)
app.post('/api/admin/shows', auth, requireRole('operations'), wrap(async (req, res) => {
  const { movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium } = req.body || {};
  if (!movie_id || !hall_id || !date_str || !time_str)
    throw new HttpError(400, 'VALIDATION', 'movie_id, hall_id, date_str, and time_str are required');

  const { rows: [newShow] } = await pool.query(
    `INSERT INTO shows (movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
     VALUES ($1, $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7, $8, 'open')
     RETURNING *`,
    [movie_id, hall_id, starts_at || null, date_str, time_str, price_recliner || 350, price_club || 250, price_premium || 180]
  );

  // Auto-generate 100 show_seats based on hall template
  const { rows: templateSeats } = await pool.query(
    'SELECT * FROM hall_seats WHERE hall_id = $1 ORDER BY id',
    [hall_id]
  );
  for (const ts of templateSeats) {
    const price = ts.tier === 'recliner' ? (price_recliner || 350) : ts.tier === 'club' ? (price_club || 250) : (price_premium || 180);
    await pool.query(
      `INSERT INTO show_seats (show_id, seat_id, row_label, seat_number, tier, price, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'available')`,
      [newShow.id, ts.id, ts.row_label, ts.seat_number, ts.tier, price]
    );
  }

  await logAudit(pool, {
    adminId: req.user.id,
    action: 'CREATE_SHOW',
    targetType: 'show',
    targetId: newShow.id,
    details: { movie_id, date_str, time_str },
    reason: 'Scheduled new screening',
  });

  res.status(201).json({ show: newShow });
}));

// Seat Blocking endpoint for maintenance or VIP guests
app.post('/api/admin/shows/:showId/block-seats', auth, requireRole('operations'), wrap(async (req, res) => {
  const showId = Number(req.params.showId);
  const { seatIds, blocked = true, reason = 'VIP / Maintenance block' } = req.body || {};
  if (!Array.isArray(seatIds) || !seatIds.length)
    throw new HttpError(400, 'VALIDATION', 'seatIds array required');

  const changed = await tx(async (c) => {
    const { rows: locked } = await c.query(
      'SELECT id, status FROM show_seats WHERE show_id = $1 AND id = ANY($2) ORDER BY id FOR UPDATE',
      [showId, seatIds]
    );
    const booked = locked.filter((s) => s.status === 'booked');
    if (booked.length)
      throw new HttpError(409, 'ALREADY_BOOKED', 'Cannot block seats that are already booked by customers');

    const nextStatus = blocked ? 'blocked' : 'available';
    const { rows } = await c.query(
      `UPDATE show_seats SET status = $1, held_by = NULL, hold_expires_at = NULL
       WHERE show_id = $2 AND id = ANY($3) RETURNING id`,
      [nextStatus, showId, seatIds]
    );
    return rows.map((r) => r.id);
  });

  app.locals.broadcast(changed, showId);

  await logAudit(pool, {
    adminId: req.user.id,
    action: blocked ? 'BLOCK_SEATS' : 'UNBLOCK_SEATS',
    targetType: 'show_seats',
    targetId: showId,
    details: { seatIds, blocked },
    reason,
  });

  res.json({ updated: changed.length, seatIds: changed });
}));

// Update active movie schedule (Matches legacy admin control form)
app.put('/api/admin/movies/schedule', auth, requireRole('operations'), wrap(async (req, res) => {
  const { date_str, time_str } = req.body || {};
  if (!date_str || !time_str) throw new HttpError(400, 'VALIDATION', 'Date and time are required');

  const { rows: [updatedShow] } = await pool.query(
    `UPDATE shows SET date_str = $1, time_str = $2 WHERE id = 1 RETURNING *`,
    [date_str.trim(), time_str.trim()]
  );
  await pool.query(
    `UPDATE screenings SET date_str = $1, time_str = $2 WHERE active = true`,
    [date_str.trim(), time_str.trim()]
  );

  const { rows: [m] } = await pool.query(
    'SELECT s.*, m.title, m.poster_url, m.synopsis, m.genres AS genre, m.language FROM shows s JOIN movies m ON m.id = s.movie_id WHERE s.id = 1'
  );

  if (app.locals.io) {
    app.locals.io.emit('movie:update', m);
  }

  await logAudit(pool, {
    adminId: req.user.id,
    action: 'UPDATE_SCHEDULE',
    targetType: 'show',
    targetId: 1,
    details: { date_str, time_str },
    reason: 'Screening time modification',
  });

  res.json({ movie: m });
}));

// 4. Support Desk & Booking Lookup (Role: support, super_admin)
app.get('/api/admin/bookings', auth, requireRole('support'), wrap(async (req, res) => {
  const { q } = req.query;
  let sql = `${bookingSelect} JOIN users u ON u.id = b.user_id `;
  const params = [];
  if (q && q.trim()) {
    sql += ` WHERE b.reference ILIKE $1 OR u.email ILIKE $1 OR u.name ILIKE $1 `;
    params.push(`%${q.trim()}%`);
  }
  sql += ` GROUP BY b.id, u.id ORDER BY b.created_at DESC LIMIT 50`;
  const { rows } = await pool.query(sql, params);
  res.json({ bookings: rows });
}));

// Support admin cancellation with mandatory reason
app.post('/api/admin/bookings/:id/cancel', auth, requireRole('support'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { reason } = req.body || {};
  if (!reason || typeof reason !== 'string' || !reason.trim())
    throw new HttpError(400, 'VALIDATION', 'A mandatory cancellation reason is required for support audit');

  const result = await tx(async (c) => {
    const { rows: [b] } = await c.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
    if (!b) throw new HttpError(404, 'NOT_FOUND', 'Booking not found');
    if (b.status === 'cancelled') return { ids: [], showId: b.show_id };

    await c.query('SELECT id FROM show_seats WHERE booking_id = $1 ORDER BY id FOR UPDATE', [id]);
    const r = await c.query('UPDATE show_seats SET status=\'available\', booking_id=NULL WHERE booking_id = $1 RETURNING id', [id]);
    await c.query('UPDATE bookings SET status=\'cancelled\', cancellation_reason=$1 WHERE id = $2', [reason.trim(), id]);
    await c.query('UPDATE payments SET status=\'refunded\' WHERE booking_id = $1', [id]);

    await logAudit(c, {
      adminId: req.user.id,
      action: 'ADMIN_CANCEL_BOOKING',
      targetType: 'booking',
      targetId: id,
      details: { reference: b.reference, total_price: b.total_price },
      reason: reason.trim(),
    });

    return { ids: r.rows.map((x) => x.id), showId: b.show_id };
  });

  app.locals.broadcast(result.ids, result.showId);
  res.json({ cancelled: true, refundIssued: true });
}));

// 5. Finance & Revenue Reconciliation (Role: finance, super_admin)
app.get('/api/admin/finance/summary', auth, requireRole('finance'), wrap(async (req, res) => {
  const { rows: byMovie } = await pool.query(`
    SELECT m.title, count(b.id)::int AS bookings_count,
           coalesce(sum(b.total_price), 0)::int AS total_revenue
    FROM bookings b
    JOIN shows s ON s.id = b.show_id
    JOIN movies m ON m.id = s.movie_id
    WHERE b.status = 'confirmed'
    GROUP BY m.id, m.title
  `);
  const { rows: [totals] } = await pool.query(`
    SELECT coalesce(sum(total_price), 0)::int AS gross_revenue,
           coalesce(sum(discount_amount), 0)::int AS total_discounts,
           coalesce(sum(convenience_fee), 0)::int AS total_convenience_fees,
           coalesce(sum(gst_amount), 0)::int AS total_gst
    FROM bookings WHERE status = 'confirmed'
  `);
  res.json({ totals, byMovie });
}));

// CSV Export for Accountants
app.get('/api/admin/finance/export', auth, requireRole('finance'), wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.reference, b.created_at, u.email, m.title AS movie, s.date_str, s.time_str,
           b.subtotal, b.discount_amount, b.convenience_fee, b.gst_amount, b.total_price, b.status
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN shows s ON s.id = b.show_id
    JOIN movies m ON m.id = s.movie_id
    ORDER BY b.created_at DESC
  `);
  const headers = ['Reference', 'Date', 'Customer', 'Movie', 'Screening Date', 'Screening Time', 'Subtotal', 'Discount', 'Convenience Fee', 'GST', 'Total Paid', 'Status'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.reference,
      `"${new Date(r.created_at).toISOString()}"`,
      r.email,
      `"${r.movie}"`,
      `"${r.date_str}"`,
      r.time_str,
      r.subtotal,
      r.discount_amount,
      r.convenience_fee,
      r.gst_amount,
      r.total_price,
      r.status,
    ].join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="theticketroom-finance-report.csv"');
  res.send(lines.join('\n'));
}));

// 6. Audit Log Inspection (Role: super_admin)
app.get('/api/admin/audit-logs', auth, requireRole('super_admin'), wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT a.*, u.email AS admin_email, u.name AS admin_name
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.admin_id
    ORDER BY a.created_at DESC LIMIT 100
  `);
  res.json({ logs: rows });
}));

// 7. User Suspension & Account Moderation (Role: super_admin, support)
app.get('/api/admin/users', auth, requireRole('support'), wrap(async (req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT u.id, u.name, u.email, u.role, u.is_suspended, u.created_at,
           count(b.id)::int AS bookings_count,
           coalesce(sum(b.total_price), 0)::int AS total_spent
    FROM users u
    LEFT JOIN bookings b ON b.user_id = u.id AND b.status = 'confirmed'
  `;
  const params = [];
  if (q && q.trim()) {
    sql += ' WHERE u.email ILIKE $1 OR u.name ILIKE $1 ';
    params.push(`%${q.trim()}%`);
  }
  sql += ' GROUP BY u.id ORDER BY u.id ASC LIMIT 50';
  const { rows } = await pool.query(sql, params);
  res.json({ users: rows });
}));

app.put('/api/admin/shows/:id', auth, requireRole('operations'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { status, date_str, time_str } = req.body || {};
  const { rows: [s] } = await pool.query(
    `UPDATE shows SET
       status = coalesce($1, status),
       date_str = coalesce($2, date_str),
       time_str = coalesce($3, time_str)
     WHERE id = $4 RETURNING *`,
    [status || null, date_str || null, time_str || null, id]
  );
  if (!s) throw new HttpError(404, 'NOT_FOUND', 'Show not found');

  await logAudit(pool, {
    adminId: req.user.id,
    action: 'UPDATE_SHOW',
    targetType: 'show',
    targetId: id,
    details: { status: s.status, date_str: s.date_str, time_str: s.time_str },
    reason: 'Admin show update',
  });

  res.json({ show: s });
}));

app.put('/api/admin/users/:id/suspend', auth, requireRole('super_admin'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { suspended = true, reason } = req.body || {};
  const { rows: [u] } = await pool.query(
    'UPDATE users SET is_suspended = $1 WHERE id = $2 RETURNING id, name, email, is_suspended',
    [suspended, id]
  );
  if (!u) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  await logAudit(pool, {
    adminId: req.user.id,
    action: suspended ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
    targetType: 'user',
    targetId: id,
    details: { email: u.email, suspended },
    reason: reason || 'Administrative action',
  });

  res.json({ user: u });
}));

// Periodic Sweeper for Expired Holds (Runs every 3 seconds)
setInterval(async () => {
  try {
    const { rows: expired } = await pool.query(`
      UPDATE show_seats
      SET status = 'available', held_by = NULL, hold_expires_at = NULL
      WHERE status = 'held' AND hold_expires_at <= now()
      RETURNING id, show_id
    `);
    if (expired.length && app.locals.broadcast) {
      const byShow = {};
      expired.forEach((s) => {
        byShow[s.show_id] = byShow[s.show_id] || [];
        byShow[s.show_id].push(s.id);
      });
      for (const [showId, ids] of Object.entries(byShow)) {
        app.locals.broadcast(ids, Number(showId));
      }
    }
  } catch (e) {
    // Suppress background errors during test teardowns
  }
}, 3000).unref();

// Health Check Endpoint
app.get('/healthz', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT 1 AS ok');
  res.json({
    status: 'ok',
    service: 'TheTicketRoom',
    database: rows[0]?.ok === 1 ? 'healthy' : 'degraded',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}));

// ---------- Static Client Hosting & Error Handler ----------
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use('/api', (req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'Unknown API endpoint')));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError)
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid JSON payload' } });
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error occurred' } });
});

module.exports = app;
