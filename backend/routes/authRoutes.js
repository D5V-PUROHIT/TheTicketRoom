// Handles user registration, email/password sign-in, and Google Sign-In (/api/auth/*).
const express = require('express');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const { pool } = require('../database/connection');
const { createAuthToken, publicUserProfile } = require('../middleware/authMiddleware');
const { AppError, catchAsync } = require('../middleware/errorMiddleware');

const router = express.Router();

// Default Google ID-token verifier (overridable in automated tests).
let verifyGoogleToken = async (credential, clientId) => {
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  return ticket.getPayload();
};

// Expose Google Client ID cleanly so frontend works automatically without extra build-time setup.
router.get('/google-config', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// Register a new customer account.
router.post('/register', catchAsync(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 60) {
    throw new AppError(400, 'VALIDATION', 'Enter your name');
  }
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION', 'Enter a valid email');
  }
  const { evaluatePassword } = await import('../../shared/passwordPolicy.mjs');
  const pwCheck = evaluatePassword(password);
  if (!pwCheck.valid) {
    throw new AppError(400, 'VALIDATION', pwCheck.errorMessage);
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows: [user] } = await pool.query(
      "INSERT INTO users(name, email, password_hash, role) VALUES ($1, $2, $3, 'user') RETURNING *",
      [name.trim(), email.toLowerCase(), hash]
    );
    res.status(201).json({ token: createAuthToken(user), user: publicUserProfile(user) });
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'EMAIL_TAKEN', 'That email is already registered');
    throw err;
  }
}));

// Authenticate an existing customer or admin with email and password.
router.post('/login', catchAsync(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new AppError(400, 'VALIDATION', 'Email and password are required');
  }

  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user) {
    throw new AppError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');
  }
  if (!user.password_hash) {
    throw new AppError(400, 'USE_GOOGLE_LOGIN', 'This account uses Google Sign-In. Please click Continue with Google.');
  }
  if (!(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');
  }
  if (user.is_suspended) {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been temporarily suspended. Contact support.');
  }

  res.json({ token: createAuthToken(user), user: publicUserProfile(user) });
}));

// Authenticate or register customer via verified Google Sign-In ID token.
router.post('/google', catchAsync(async (req, res) => {
  const { credential } = req.body || {};
  if (!credential || typeof credential !== 'string') {
    throw new AppError(400, 'VALIDATION', 'Google credential token is required');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new AppError(500, 'CONFIG_ERROR', 'GOOGLE_CLIENT_ID is not configured on the server');
  }

  let payload;
  try {
    payload = await verifyGoogleToken(credential, clientId);
  } catch {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in could not be verified. Please try again.');
  }

  if (!payload?.email || !payload.email_verified || !payload.sub) {
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'A verified Google account email is required');
  }

  const email = payload.email.toLowerCase();
  const displayName = (payload.name || email.split('@')[0]).trim().slice(0, 60);
  const googleId = String(payload.sub);

  let { rows: [user] } = await pool.query(
    'SELECT * FROM users WHERE google_id = $1 OR email = $2 LIMIT 1',
    [googleId, email]
  );

  if (!user) {
    const created = await pool.query(
      "INSERT INTO users(name, email, google_id, role) VALUES ($1, $2, $3, 'user') RETURNING *",
      [displayName, email, googleId]
    );
    user = created.rows[0];
  } else if (!user.google_id) {
    const linked = await pool.query(
      'UPDATE users SET google_id = $1 WHERE id = $2 RETURNING *',
      [googleId, user.id]
    );
    user = linked.rows[0];
  }

  if (user.is_suspended) {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your account has been temporarily suspended. Contact support.');
  }

  res.json({ token: createAuthToken(user), user: publicUserProfile(user) });
}));

router.setGoogleTokenVerifier = (fn) => {
  verifyGoogleToken = fn;
};

module.exports = router;
