// Promotional coupon verification and Razorpay payment gateway endpoints.
const express = require('express');
const { pool } = require('../database/connection');
const { requireLogin } = require('../middleware/authMiddleware');
const { AppError, catchAsync } = require('../middleware/errorMiddleware');
const paymentGateway = require('../services/paymentGatewayService');

const router = express.Router();

// Validate a promo code such as TICKET50 or CINEMA20.
router.post('/coupons/validate', requireLogin, catchAsync(async (req, res) => {
  const { code, amount } = req.body || {};
  if (!code || typeof code !== 'string') {
    throw new AppError(400, 'VALIDATION', 'Coupon code required');
  }

  const { rows: [coupon] } = await pool.query(
    'SELECT * FROM coupons WHERE code = $1 AND is_active = true',
    [code.toUpperCase().trim()]
  );
  if (!coupon) throw new AppError(404, 'INVALID_COUPON', 'Invalid or expired coupon code');
  if (amount && amount < coupon.min_order_amount) {
    throw new AppError(400, 'MIN_AMOUNT', `Minimum order amount for ${coupon.code} is ₹${coupon.min_order_amount}`);
  }

  const discount = (coupon.discount_type === 'percent' || coupon.discount_type === 'percentage')
    ? Math.min(Math.round(((amount || 0) * coupon.discount_value) / 100), coupon.max_discount || 99999)
    : coupon.discount_value;

  res.json({ valid: true, code: coupon.code, discount_type: coupon.discount_type, discount });
}));

// Initialize payment gateway order.
router.post('/payments/create-order', requireLogin, catchAsync(async (req, res) => {
  const { amount, receipt } = req.body || {};
  if (!amount || amount <= 0) throw new AppError(400, 'VALIDATION', 'Valid order amount required');

  const order = await paymentGateway.createOrder({
    amount: Math.round(amount * 100),
    currency: 'INR',
    receipt: receipt || `rec_${Date.now()}`,
  });
  res.json({ order, keyId: paymentGateway.keyId });
}));

// Receive async Razorpay webhook notifications.
router.post('/payments/webhook', catchAsync(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const event = req.body?.event;
  const payload = req.body?.payload?.payment?.entity;

  if (signature && !paymentGateway.verifySignature({
    orderId: payload?.order_id,
    paymentId: payload?.id,
    signature,
  })) {
    return res.status(400).json({ error: 'INVALID_SIGNATURE' });
  }

  if (payload?.id && event === 'payment.captured') {
    await pool.query(
      `UPDATE payments SET status = 'captured', gateway_payment_id = $1, updated_at = now()
       WHERE gateway_order_id = $2`,
      [payload.id, payload.order_id]
    );
  }
  res.json({ status: 'ok' });
}));

module.exports = router;
