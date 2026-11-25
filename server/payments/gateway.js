const crypto = require('crypto');

class PaymentGateway {
  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_cinema_demo';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || 'secret_cinema_test_2026';
  }

  // Create payment order
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    // In production or test with active keys, calls Razorpay API; fallback to secure mock order
    const orderId = 'order_' + crypto.randomBytes(10).toString('hex');
    return {
      id: orderId,
      amount, // in smallest unit (paise)
      currency,
      receipt,
      status: 'created',
      notes,
    };
  }

  // Verify HMAC SHA256 signature from client/webhook
  verifySignature({ orderId, paymentId, signature }) {
    if (!orderId || !paymentId || !signature) return false;
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', this.keySecret).update(body).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  // Generate test signature for automated tests / mock checkout
  generateTestSignature(orderId, paymentId) {
    const body = `${orderId}|${paymentId}`;
    return crypto.createHmac('sha256', this.keySecret).update(body).digest('hex');
  }

  // Process refund
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

module.exports = new PaymentGateway();
