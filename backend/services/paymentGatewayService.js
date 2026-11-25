// Mock/Test Razorpay payment gateway wrapper for creating orders, verifying signatures, and refunds.
const crypto = require('crypto');

class PaymentGatewayService {
  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_cinema_demo';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || 'secret_cinema_test_2026';
  }

  // Creates an order record in smallest currency unit (paise).
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    const orderId = 'order_' + crypto.randomBytes(10).toString('hex');
    return {
      id: orderId,
      amount,
      currency,
      receipt,
      status: 'created',
      notes,
    };
  }

  // Verifies HMAC-SHA256 webhook/client signature safely.
  verifySignature({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', this.keySecret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  generateTestSignature(orderId, paymentId) {
    const body = `${orderId}|${paymentId}`;
    return crypto.createHmac('sha256', this.keySecret).update(body).digest('hex');
  }

  async processRefund({ paymentId, amount, reason }) {
    const refundId = 'rfnd_' + crypto.randomBytes(8).toString('hex');
    return {
      id: refundId,
      paymentId,
      amount,
      reason,
      status: 'processed',
      created_at: new Date().toISOString(),
    };
  }
}

module.exports = new PaymentGatewayService();
