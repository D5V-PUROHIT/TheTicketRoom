// k6 Concurrency Race Test for TheTicketRoom.
// Launches 50 simultaneous virtual users racing for the exact same 4 available seats.
// Verifies: exactly 1 winner, 49 clean 409 conflicts, 0 server errors (5xx), and 1 idempotent replay.
//
// Usage:
//   k6 run scripts/race.k6.js
//   k6 run -e BASE_URL=http://127.0.0.1:3000 scripts/race.k6.js

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://theticketroom.onrender.com';
const VUS = __ENV.VUS ? parseInt(__ENV.VUS, 10) : 50;
const SHOW_ID = __ENV.SHOW_ID ? parseInt(__ENV.SHOW_ID, 10) : 1;
const USER_OFFSET = __ENV.USER_OFFSET ? parseInt(__ENV.USER_OFFSET, 10) : 400;

http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const holdWins = new Counter('hold_wins');
const holdConflicts = new Counter('hold_conflicts');
const bookingsConfirmed = new Counter('bookings_confirmed');
const idempotentReplays = new Counter('idempotent_replays');
const serverErrors = new Rate('server_errors');

export const options = {
  setupTimeout: '120s',
  scenarios: {
    hot_seat_race: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '60s',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    server_errors: ['rate==0'],
    hold_wins: ['count==1'],
    hold_conflicts: [`count==${VUS - 1}`],
    bookings_confirmed: ['count==1'],
    idempotent_replays: ['count==1'],
  },
};

// Runs once before the race: logs in VUS test users and finds 4 currently available seats.
export function setup() {
  const tokens = [];
  const batchSize = 10;

  for (let start = 0; start < VUS; start += batchSize) {
    const reqs = [];
    const end = Math.min(VUS, start + batchSize);
    for (let i = start; i < end; i++) {
      const userNum = USER_OFFSET + i + 1;
      reqs.push({
        method: 'POST',
        url: `${BASE_URL}/api/auth/login`,
        body: JSON.stringify({ email: `user${userNum}@test.com`, password: 'Test@1234' }),
        params: { headers: { 'Content-Type': 'application/json' } },
      });
    }
    const responses = http.batch(reqs);
    for (const res of responses) {
      if (res.status !== 200) {
        throw new Error(`Setup login failed (${res.status}): ${res.body}`);
      }
      tokens.push(res.json('token'));
    }
  }

  const seatsRes = http.get(`${BASE_URL}/api/shows/${SHOW_ID}/seats`);
  if (seatsRes.status !== 200) {
    throw new Error(`Setup seat fetch failed (${seatsRes.status}): ${seatsRes.body}`);
  }

  const availableSeats = seatsRes.json('seats').filter((s) => s.status === 'available');
  if (availableSeats.length < 4) {
    throw new Error(`Need at least 4 available seats in Show ${SHOW_ID}, found ${availableSeats.length}`);
  }

  const hotSeatIds = availableSeats.slice(0, 4).map((s) => s.id);
  const hotSeatLabels = availableSeats.slice(0, 4).map((s) => `${s.row_label}${s.seat_number}`);
  console.log(`[k6 setup] Target: ${BASE_URL} | Show #${SHOW_ID} | Racing ${VUS} users for seats: ${hotSeatLabels.join(', ')} (IDs: ${hotSeatIds.join(', ')})`);

  return { tokens, hotSeatIds, hotSeatLabels };
}

// Each virtual user races concurrently for the exact same 4 seats.
export default function (data) {
  const token = data.tokens[__VU - 1];
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 1. Race to hold the exact same 4 seats
  const holdRes = http.post(
    `${BASE_URL}/api/shows/${SHOW_ID}/holds`,
    JSON.stringify({ seatIds: data.hotSeatIds }),
    { headers }
  );

  serverErrors.add(holdRes.status >= 500);

  check(holdRes, {
    'hold returns 200 or 409 (no 5xx)': (r) => r.status === 200 || r.status === 409,
  });

  if (holdRes.status === 409) {
    holdConflicts.add(1);
    check(holdRes, {
      'conflict error code is SEAT_UNAVAILABLE': (r) => r.json('error.code') === 'SEAT_UNAVAILABLE',
    });
    return;
  }

  if (holdRes.status !== 200) {
    return;
  }

  holdWins.add(1);

  // 2. Winner confirms booking using an Idempotency-Key
  const idempotencyKey = `k6-race-${__VU}-${Date.now()}`;
  const bookHeaders = { ...headers, 'Idempotency-Key': idempotencyKey };

  const bookRes = http.post(
    `${BASE_URL}/api/shows/${SHOW_ID}/bookings`,
    JSON.stringify({}),
    { headers: bookHeaders }
  );

  serverErrors.add(bookRes.status >= 500);

  const bookedOk = check(bookRes, {
    'winner booking returns 201': (r) => r.status === 201,
    'booked all 4 seats': (r) => (r.json('booking.seats') || []).length === 4,
  });

  if (bookedOk) {
    bookingsConfirmed.add(1);
    const firstBookingId = bookRes.json('booking.id');

    // 3. Test duplicate-click idempotency replay with the exact same key
    const replayRes = http.post(
      `${BASE_URL}/api/shows/${SHOW_ID}/bookings`,
      JSON.stringify({}),
      { headers: bookHeaders }
    );

    serverErrors.add(replayRes.status >= 500);

    const replayOk = check(replayRes, {
      'duplicate retry returns HTTP 200 replay': (r) => r.status === 200 && r.json('replayed') === true,
      'replay returns identical booking ID': (r) => r.json('booking.id') === firstBookingId,
    });

    if (replayOk) idempotentReplays.add(1);
  }
}

export function teardown(data) {
  const seatsRes = http.get(`${BASE_URL}/api/shows/${SHOW_ID}/seats`);
  if (seatsRes.status === 200) {
    const seats = seatsRes.json('seats');
    const targetBooked = seats.filter((s) => data.hotSeatIds.includes(s.id) && s.status === 'booked').length;
    console.log(`[k6 teardown] Target seats [${data.hotSeatLabels.join(', ')}] now booked: ${targetBooked}/4`);
  }
}
