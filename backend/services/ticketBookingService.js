// Handles booking confirmation (with idempotency + GST slab calculation) and booking cancellation.
const crypto = require('crypto');
const { pool, runTransaction } = require('../database/connection');
const { AppError } = require('../middleware/errorMiddleware');
const { calculateBookingPricing } = require('./gstAndPricingService');

// Shared SQL query returning full booking details including seat list and show date/time.
const BOOKING_DETAILS_QUERY = `SELECT b.id, b.show_id, b.reference, b.total_price, b.subtotal, b.discount_amount,
  b.convenience_fee, b.gst_amount, b.coupon_code, b.status, b.created_at,
  (SELECT u2.email FROM users u2 WHERE u2.id = b.user_id) AS email,
  (SELECT sh.date_str FROM shows sh WHERE sh.id = b.show_id) AS show_date_str,
  (SELECT sh.time_str FROM shows sh WHERE sh.id = b.show_id) AS show_time_str,
  (SELECT m.title FROM shows sh JOIN movies m ON m.id = sh.movie_id WHERE sh.id = b.show_id) AS movie_title,
  coalesce(
    json_agg(
      json_build_object('id', s.id, 'label', s.row_label || s.seat_number, 'price', s.price, 'tier', s.tier)
      ORDER BY s.id
    ) FILTER (WHERE s.id IS NOT NULL), '[]'
  ) AS seats
  FROM bookings b
  LEFT JOIN show_seats s ON s.booking_id = b.id`;

/**
 * Converts a user's active held seats into a confirmed booking inside one transaction.
 * Supports safe duplicate clicks via idempotencyKey and calculates 5%/18% GST slabs.
 */
async function confirmBookingForUser({ userId, idempotencyKey, showId, couponCode = null }) {
  return runTransaction(async (client) => {
    await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);

    const { rows: [showRow] } = await client.query('SELECT id, status FROM shows WHERE id = $1 FOR SHARE', [showId]);
    if (showRow && showRow.status === 'cancelled') {
      throw new AppError(409, 'SHOW_CANCELLED', 'This showtime has been cancelled.');
    }

    // Replay previous booking if same Idempotency-Key arrives twice.
    const prior = await client.query(
      `${BOOKING_DETAILS_QUERY} WHERE b.user_id = $1 AND b.idempotency_key = $2 GROUP BY b.id`,
      [userId, idempotencyKey]
    );
    if (prior.rows[0]) {
      return { booking: prior.rows[0], replayed: true, seatIds: [] };
    }

    // Lock user's held seats in ascending ID order.
    const { rows: heldSeats } = await client.query(
      `SELECT id, price, row_label, seat_number, tier
       FROM show_seats
       WHERE show_id = $1 AND held_by = $2 AND status = 'held' AND hold_expires_at > now()
       ORDER BY id FOR UPDATE`,
      [showId, userId]
    );
    if (!heldSeats.length) {
      throw new AppError(409, 'HOLD_EXPIRED', 'Your hold has expired. Please select your seats again.');
    }

    const seatIds = heldSeats.map((s) => s.id);
    const subtotal = heldSeats.reduce((sum, s) => sum + s.price, 0);

    // Apply valid promo coupon discount if provided.
    let discount = 0;
    if (couponCode) {
      const cleanCode = couponCode.toUpperCase().trim();
      const { rows: [coupon] } = await client.query(
        'SELECT * FROM coupons WHERE code = $1 AND is_active = true FOR UPDATE',
        [cleanCode]
      );
      if (coupon && subtotal >= coupon.min_order_amount) {
        if (!coupon.expires_at || new Date(coupon.expires_at) > new Date()) {
          const { rows: [{ count: usedCount }] } = await client.query(
            'SELECT count(*)::int FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2',
            [coupon.id, userId]
          );
          if (usedCount < coupon.per_user_limit) {
            discount = (coupon.discount_type === 'percent' || coupon.discount_type === 'percentage')
              ? Math.round((subtotal * coupon.discount_value) / 100)
              : coupon.discount_value;
            if (coupon.max_discount && discount > coupon.max_discount) discount = coupon.max_discount;
            discount = Math.min(discount, subtotal);
            await client.query('UPDATE coupons SET times_used = times_used + 1 WHERE id = $1', [coupon.id]);
          }
        }
      }
    }

    // Compute subtotal, convenience fee, and Indian GST slabs (5% <= Rs.100, 18% > Rs.100).
    const pricing = calculateBookingPricing(heldSeats, discount);
    const reference = 'CX' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const { rows: [createdBooking] } = await client.query(
      `INSERT INTO bookings (user_id, show_id, idempotency_key, reference, total_price, subtotal, discount_amount, convenience_fee, gst_amount, coupon_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        userId,
        showId,
        idempotencyKey,
        reference,
        pricing.totalPrice,
        pricing.subtotal,
        pricing.discountAmount,
        pricing.convenienceFee,
        pricing.gstAmount,
        couponCode ? couponCode.toUpperCase().trim() : null,
      ]
    );

    await client.query(
      `UPDATE show_seats SET status='booked', booking_id=$1, held_by=NULL, hold_expires_at=NULL WHERE id = ANY($2)`,
      [createdBooking.id, seatIds]
    );

    await client.query(
      `INSERT INTO payments (booking_id, user_id, amount, status, gateway)
       VALUES ($1, $2, $3, 'captured', 'test_mode')`,
      [createdBooking.id, userId, pricing.totalPrice * 100]
    );

    const full = await client.query(`${BOOKING_DETAILS_QUERY} WHERE b.id = $1 GROUP BY b.id`, [createdBooking.id]);
    return { booking: full.rows[0], replayed: false, seatIds, pricing };
  });
}

/**
 * Cancels a customer's confirmed booking and immediately frees all seats back to 'available'.
 */
async function cancelBookingByCustomer({ bookingId, userId }) {
  return runTransaction(async (client) => {
    const { rows: [booking] } = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [bookingId, userId]
    );
    if (!booking) throw new AppError(404, 'NOT_FOUND', 'Booking not found');
    if (booking.status === 'cancelled') return { seatIds: [], showId: booking.show_id };

    await client.query('SELECT id FROM show_seats WHERE booking_id = $1 ORDER BY id FOR UPDATE', [bookingId]);
    const released = await client.query(
      `UPDATE show_seats SET status='available', booking_id=NULL WHERE booking_id = $1 RETURNING id`,
      [bookingId]
    );
    await client.query(
      `UPDATE bookings SET status='cancelled', cancellation_reason='Customer requested cancellation' WHERE id = $1`,
      [bookingId]
    );
    await client.query(`UPDATE payments SET status='refunded' WHERE booking_id = $1`, [bookingId]);

    return { seatIds: released.rows.map((x) => x.id), showId: booking.show_id };
  });
}

module.exports = { BOOKING_DETAILS_QUERY, confirmBookingForUser, cancelBookingByCustomer };
