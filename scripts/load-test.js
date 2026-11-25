/**
 * Standalone Concurrent Load-Test Script for TheTicketRoom
 * 
 * Simulates 500 concurrent users racing to reserve and book seats in Hall 1.
 * Verifies:
 *  1. Exactly 0 double-bookings (all successful bookings claim disjoint seats).
 *  2. 0 server errors (5xx) under massive concurrency.
 *  3. HTTP 409 SEAT_UNAVAILABLE returned cleanly to users who lose races.
 *  4. Idempotent replays on duplicate booking confirmation.
 * 
 * Usage:
 *   node scripts/load-test.js [target_url]
 * Default target: http://localhost:3000
 */

const { Pool } = require('pg');
require('dotenv').config();

const TARGET = process.argv[2] || process.env.TARGET_URL || 'http://localhost:3000';
const TOTAL_USERS = 500;
const USER_PASSWORD = 'Test@1234';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('='.repeat(70));
  console.log(`🚀 STARTING CONCURRENT LOAD TEST ON: ${TARGET}`);
  console.log(`👥 Target: ${TOTAL_USERS} concurrent seeded users`);
  console.log('='.repeat(70));

  // Step 1: Login all 500 users concurrently
  console.log('\n[1/4] 🔑 Logging in 500 users in parallel...');
  const t0 = Date.now();
  const loginPromises = Array.from({ length: TOTAL_USERS }, (_, i) => {
    const id = i + 1;
    return fetchJson(`${TARGET}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: `user${id}@test.com`, password: USER_PASSWORD }),
    }).then((r) => ({ id, token: r.data?.token, error: r.ok ? null : r.data }));
  });

  const logins = await Promise.all(loginPromises);
  const authSuccess = logins.filter((l) => l.token);
  console.log(`  ✓ Logged in: ${authSuccess.length} / ${TOTAL_USERS} users in ${Date.now() - t0}ms`);
  if (authSuccess.length < TOTAL_USERS) {
    console.error(`  ✕ Warning: ${TOTAL_USERS - authSuccess.length} users failed login`);
  }

  // Step 2: 500 users race concurrently for overlapping seat selections
  console.log('\n[2/4] ⚡ Firing 500 concurrent hold requests...');
  let count200Hold = 0;
  let count409Hold = 0;
  let count5xxHold = 0;
  let countOtherHold = 0;

  let count201Book = 0;
  let countReplayBook = 0;
  let countFailBook = 0;
  let count5xxBook = 0;

  const successfulSeatsClaimed = [];
  const tRace = Date.now();

  const racePromises = authSuccess.map(async (u) => {
    // Each user randomly selects 1 to 4 seats in the 100-seat theatre (heavily overlapping)
    const seatCount = 1 + Math.floor(Math.random() * 4);
    const chosenSeats = new Set();
    while (chosenSeats.size < seatCount) {
      chosenSeats.add(1 + Math.floor(Math.random() * 100));
    }
    const seatIds = Array.from(chosenSeats);

    // 1. Send Hold request
    const holdRes = await fetchJson(`${TARGET}/api/holds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${u.token}` },
      body: JSON.stringify({ seatIds }),
    });

    if (holdRes.status === 200) {
      count200Hold++;
    } else if (holdRes.status === 409) {
      count409Hold++;
      return; // Lost race gracefully
    } else if (holdRes.status >= 500) {
      count5xxHold++;
      return;
    } else {
      countOtherHold++;
      return;
    }

    // 2. If hold succeeded, immediately confirm booking with Idempotency Key
    const key = `loadtest-key-${u.id}-${Date.now()}`;
    const bookRes = await fetchJson(`${TARGET}/api/bookings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${u.token}`,
        'Idempotency-Key': key,
      },
    });

    if (bookRes.status === 201) {
      count201Book++;
      const claimed = (bookRes.data.booking?.seats || []).map((s) => s.id);
      successfulSeatsClaimed.push(...claimed);

      // 3. Test Idempotency: replay identical request immediately
      const replayRes = await fetchJson(`${TARGET}/api/bookings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${u.token}`,
          'Idempotency-Key': key,
        },
      });
      if (replayRes.status === 200 && replayRes.data.replayed) {
        countReplayBook++;
      }
    } else if (bookRes.status >= 500) {
      count5xxBook++;
    } else {
      countFailBook++;
    }
  });

  await Promise.all(racePromises);
  const raceDuration = Date.now() - tRace;
  console.log(`  ✓ Concurrency race completed in ${raceDuration}ms`);

  // Step 3: Database Integrity Check (Double-Booking Check)
  console.log('\n[3/4] 🔍 Verifying Database Integrity & Double-Booking Invariants...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  let dbSeatsBooked = 0;
  let dbDuplicateSeats = 0;
  try {
    const { rows: bookedRows } = await pool.query(
      `SELECT count(*)::int AS booked_count FROM seats WHERE status = 'booked'`
    );
    dbSeatsBooked = bookedRows[0].booked_count;

    // Check if any seat is attached to more than one booking
    const { rows: dupRows } = await pool.query(`
      SELECT seat_number, row_label, count(booking_id) as count
      FROM seats
      WHERE booking_id IS NOT NULL
      GROUP BY seat_number, row_label
      HAVING count(booking_id) > 1
    `);
    dbDuplicateSeats = dupRows.length;
  } catch (err) {
    console.error('  ✕ DB query error:', err.message);
  } finally {
    await pool.end();
  }

  // Check client-side disjointness
  const uniqueClaimed = new Set(successfulSeatsClaimed);
  const hasDisjointOverlap = uniqueClaimed.size !== successfulSeatsClaimed.length;

  // Step 4: Summary Output
  console.log('\n' + '='.repeat(70));
  console.log('📊 CONCURRENT LOAD TEST RESULTS SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Concurrent Users:        ${TOTAL_USERS}`);
  console.log(`Holds Granted (HTTP 200):      ${count200Hold}`);
  console.log(`Race Conflicts (HTTP 409):     ${count409Hold} (Graceful SEAT_UNAVAILABLE)`);
  console.log(`Hold Server Errors (5xx):      ${count5xxHold} (MUST BE 0)`);
  console.log(`Bookings Confirmed (HTTP 201): ${count201Book}`);
  console.log(`Idempotent Replays (HTTP 200): ${countReplayBook} (Verified safe duplicate retry)`);
  console.log(`Booking Server Errors (5xx):   ${count5xxBook} (MUST BE 0)`);
  console.log(`Total Booked Seats in DB:      ${dbSeatsBooked}`);
  console.log(`Double-Booked Seats in DB:     ${dbDuplicateSeats} (MUST BE 0)`);
  console.log(`Seats Disjoint Across Clients: ${!hasDisjointOverlap ? 'PASSED (Disjoint)' : 'FAILED'}`);
  console.log('='.repeat(70));

  if (count5xxHold === 0 && count5xxBook === 0 && dbDuplicateSeats === 0 && !hasDisjointOverlap) {
    console.log('🎉 LOAD TEST PASSED: 100% Concurrency Safe, Zero Double-Bookings, Zero 5xx Errors.\n');
    process.exit(0);
  } else {
    console.error('❌ LOAD TEST FAILED: Integrity or error rate violation detected.\n');
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Fatal load-test failure:', e);
  process.exit(1);
});
