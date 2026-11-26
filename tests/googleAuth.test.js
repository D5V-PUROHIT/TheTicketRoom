// Tests for Google Sign-In (/api/auth/google-config and /api/auth/google).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-google-client-id.apps.googleusercontent.com';

const fs = require('fs');
const path = require('path');
const app = require('../backend/createApp');
const { pool } = require('../backend/database/connection');
const authRoutes = require('../backend/routes/authRoutes');

let server, base;
const call = async (urlPath, { method = 'GET', body } = {}) => {
  const r = await fetch(base + urlPath, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};

before(async () => {
  // Ensure schema columns (google_id, nullable password_hash) are present before running Google auth tests.
  await pool.query(fs.readFileSync(path.join(__dirname, '../backend/database/schema.sql'), 'utf8'));
  await pool.query("DELETE FROM users WHERE email = 'google-test-user@example.com'");
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.query("DELETE FROM users WHERE email = 'google-test-user@example.com'");
  await pool.end();
});

test('GET /api/auth/google-config returns configured GOOGLE_CLIENT_ID and sets Google-popup safe headers', async () => {
  const raw = await fetch(`${base}/api/auth/google-config`);
  assert.equal(raw.status, 200);
  assert.equal(raw.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  assert.equal(raw.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');

  const body = await raw.json();
  assert.equal(body.clientId, process.env.GOOGLE_CLIENT_ID);
});

test('POST /api/auth/google rejects missing or unverified credentials cleanly', async () => {
  const missing = await call('/api/auth/google', { method: 'POST', body: {} });
  assert.equal(missing.status, 400);

  authRoutes.setGoogleTokenVerifier(async () => {
    throw new Error('Bad signature');
  });
  const bad = await call('/api/auth/google', { method: 'POST', body: { credential: 'fake-jwt' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'INVALID_GOOGLE_TOKEN');
});

test('POST /api/auth/google creates user, issues JWT, blocks password login nicely, and enforces suspension', async () => {
  authRoutes.setGoogleTokenVerifier(async (token) => {
    assert.equal(token, 'valid-mock-google-token');
    return {
      sub: 'google-sub-999111',
      email: 'google-test-user@example.com',
      email_verified: true,
      name: 'Google Test Patron',
    };
  });

  // 1. First Google login creates customer account
  const first = await call('/api/auth/google', {
    method: 'POST',
    body: { credential: 'valid-mock-google-token' },
  });
  assert.equal(first.status, 200);
  assert.ok(first.body.token);
  assert.equal(first.body.user.email, 'google-test-user@example.com');
  assert.equal(first.body.user.role, 'user');

  // 2. Trying password login on a Google-only user returns 400 USE_GOOGLE_LOGIN instead of 500
  const pwAttempt = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'google-test-user@example.com', password: 'SomePassword123' },
  });
  assert.equal(pwAttempt.status, 400);
  assert.equal(pwAttempt.body.error.code, 'USE_GOOGLE_LOGIN');

  // 3. Repeat Google login reuses exact same user ID
  const second = await call('/api/auth/google', {
    method: 'POST',
    body: { credential: 'valid-mock-google-token' },
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.user.id, first.body.user.id);

  // 4. Suspended account cannot sign in via Google
  await pool.query('UPDATE users SET is_suspended = true WHERE id = $1', [first.body.user.id]);
  const suspended = await call('/api/auth/google', {
    method: 'POST',
    body: { credential: 'valid-mock-google-token' },
  });
  assert.equal(suspended.status, 403);
  assert.equal(suspended.body.error.code, 'ACCOUNT_SUSPENDED');
});
