// Tests for strong password rules across shared policy logic and POST /api/auth/register.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../backend/createApp');
const { pool } = require('../backend/database/connection');

const TEST_EMAIL = 'pw-policy-test@example.com';
let server;
let base;
let evaluatePassword;

const call = async (urlPath, body) => {
  const res = await fetch(base + urlPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  const mod = await import(pathToFileURL(path.resolve(__dirname, '../shared/passwordPolicy.mjs')).href);
  evaluatePassword = mod.evaluatePassword;
  await pool.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
  await pool.end();
});

test('evaluatePassword enforces min/max length, uppercase, lowercase, number, and special character', () => {
  assert.equal(evaluatePassword('Ab1@xyz').valid, false); // 7 chars
  assert.equal(evaluatePassword('ticket@2026').valid, false); // missing uppercase
  assert.equal(evaluatePassword('TICKET@2026').valid, false); // missing lowercase
  assert.equal(evaluatePassword('TicketRoom@').valid, false); // missing number
  assert.equal(evaluatePassword('Ticket 2026').valid, false); // whitespace is not a special character
  assert.equal(evaluatePassword(`${'Aa1@'.repeat(18)}Extra`).tooLong, true); // > 72 chars

  const valid = evaluatePassword('TicketRoom@2026');
  assert.equal(valid.valid, true);
  assert.equal(valid.passedCount, 5);
  assert.equal(valid.errorMessage, null);
});

test('POST /api/auth/register rejects weak passwords and accepts strong password', async () => {
  const weakCases = ['Sh1@rt', 'alllowercase1@', 'ALLUPPERCASE1@', 'NoNumbersHere@', 'NoSpecial123'];

  for (const password of weakCases) {
    const res = await call('/api/auth/register', { name: 'Policy Tester', email: TEST_EMAIL, password });
    assert.equal(res.status, 400, `Expected 400 for password: ${password}`);
    assert.equal(res.body.error.code, 'VALIDATION');
  }

  const ok = await call('/api/auth/register', {
    name: 'Policy Tester',
    email: TEST_EMAIL,
    password: 'TicketRoom@2026',
  });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.token);

  const login = await call('/api/auth/login', {
    email: TEST_EMAIL,
    password: 'TicketRoom@2026',
  });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});
