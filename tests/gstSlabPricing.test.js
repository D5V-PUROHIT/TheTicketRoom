// Tests for Indian GST slabs:
// - Ticket price <= Rs.100 -> 5% GST (2.5% CGST + 2.5% SGST)
// - Ticket price > Rs.100 -> 18% GST (9% CGST + 9% SGST)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const app = require('../backend/createApp');
const { pool } = require('../backend/database/connection');
const { calculateBookingPricing, getTicketGstSlab } = require('../backend/services/gstAndPricingService');

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

test('Ticket price <= Rs.100 uses 5% GST (2.5% CGST + 2.5% SGST)', () => {
  const slab100 = getTicketGstSlab(100);
  assert.equal(slab100.isLowSlab, true);
  assert.equal(slab100.rate, 0.05);
  assert.equal(slab100.cgstExact, 2.5);
  assert.equal(slab100.sgstExact, 2.5);
  assert.equal(slab100.gstExact, 5);

  const pricing = calculateBookingPricing([{ price: 100 }], 0);
  assert.equal(pricing.subtotal, 100);
  assert.equal(pricing.ticketGst, 5); // 5% of Rs.100
  assert.equal(pricing.convenienceFee, 20);
  assert.equal(pricing.convenienceFeeGst, 4); // 18% of Rs.20 rounded
  assert.equal(pricing.gstAmount, 9);
  assert.equal(pricing.totalPrice, 129);
});

test('Ticket price > Rs.100 uses 18% GST (9% CGST + 9% SGST)', () => {
  const slab250 = getTicketGstSlab(250);
  assert.equal(slab250.isLowSlab, false);
  assert.equal(slab250.rate, 0.18);
  assert.equal(slab250.cgstExact, 22.5);
  assert.equal(slab250.sgstExact, 22.5);

  const pricing = calculateBookingPricing([{ price: 250 }, { price: 250 }], 0);
  assert.equal(pricing.subtotal, 500);
  assert.equal(pricing.ticketGst, 90); // 18% of Rs.500
  assert.equal(pricing.convenienceFee, 20);
  assert.equal(pricing.convenienceFeeGst, 4);
  assert.equal(pricing.gstAmount, 94);
  assert.equal(pricing.totalPrice, 614);
});

test('Mixed ticket prices apply 5% to <= Rs.100 seats and 18% to > Rs.100 seats', () => {
  // 1 seat at Rs.100 (5% = Rs.5) + 1 seat at Rs.200 (18% = Rs.36) => Ticket GST = Rs.41 + Fee GST Rs.4 = Rs.45
  const pricing = calculateBookingPricing([{ price: 100 }, { price: 200 }], 0);
  assert.equal(pricing.subtotal, 300);
  assert.equal(pricing.ticketGst, 41);
  assert.equal(pricing.gstAmount, 45);
  assert.equal(pricing.totalPrice, 365);
});

test('End-to-end API applies 5% GST slab when show seats cost <= Rs.100', async () => {
  const userLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'user1@test.com', password: 'Test@1234' },
  });
  const adminLogin = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@test.com', password: 'Admin@123' },
  });
  const userTok = userLogin.body.token;
  const adminTok = adminLogin.body.token;

  // Admin creates a budget show where Recliner=100, Club=90, Premium=80 (all <= Rs.100)
  const createdShow = await call('/api/admin/shows', {
    method: 'POST',
    token: adminTok,
    body: {
      movie_id: 1,
      hall_id: 1,
      date_str: 'Saturday, 28 November, 2026',
      time_str: '11:00 AM',
      price_recliner: 100,
      price_club: 90,
      price_premium: 80,
    },
  });
  assert.equal(createdShow.status, 201);
  const showId = createdShow.body.show.id;

  const seatsRes = await call(`/api/shows/${showId}/seats`, { token: userTok });
  const seatA1 = seatsRes.body.seats.find((s) => s.row_label === 'A' && s.seat_number === 1);
  assert.equal(seatA1.price, 100);

  const hold = await call(`/api/shows/${showId}/holds`, {
    method: 'POST',
    token: userTok,
    body: { seatIds: [seatA1.id] },
  });
  assert.equal(hold.status, 200);

  const booked = await call(`/api/shows/${showId}/bookings`, {
    method: 'POST',
    token: userTok,
    key: 'gst-5pct-test',
  });
  assert.equal(booked.status, 201);
  assert.equal(booked.body.booking.subtotal, 100);
  assert.equal(booked.body.booking.gst_amount, 9); // 5% ticket GST (Rs.5) + 18% fee GST (Rs.4)
  assert.equal(booked.body.booking.total_price, 129);

  // Clean up test booking and show
  await pool.query('UPDATE show_seats SET booking_id=NULL, status=\'available\' WHERE show_id=$1', [showId]);
  await pool.query('DELETE FROM payments WHERE booking_id=$1', [booked.body.booking.id]);
  await pool.query('DELETE FROM bookings WHERE id=$1', [booked.body.booking.id]);
  await pool.query('DELETE FROM shows WHERE id=$1', [showId]);
});
