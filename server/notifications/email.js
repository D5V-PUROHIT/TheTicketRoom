// Async, non-blocking notification dispatcher for tickets, reminders, and cancellations
class NotificationService {
  constructor() {
    this.queue = [];
    this.sent = [];
  }

  // Enqueue notification without blocking DB transactions
  sendBookingConfirmation({ email, reference, movieTitle, showtime, seats, totalPaid }) {
    const item = {
      type: 'booking_confirmation',
      to: email,
      subject: `Your e-Ticket for ${movieTitle} [${reference}]`,
      reference,
      movieTitle,
      showtime,
      seats,
      totalPaid,
      enqueued_at: new Date().toISOString(),
    };
    this.queue.push(item);
    setImmediate(() => this.process());
    return true;
  }

  sendCancellation({ email, reference, refundAmount, reason }) {
    const item = {
      type: 'booking_cancellation',
      to: email,
      subject: `Booking Cancelled: ${reference}`,
      reference,
      refundAmount,
      reason,
      enqueued_at: new Date().toISOString(),
    };
    this.queue.push(item);
    setImmediate(() => this.process());
    return true;
  }

  process() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      // In production, would send via SendGrid / SES / Postmark
      this.sent.push({ ...item, dispatched_at: new Date().toISOString() });
      if (process.env.NODE_ENV !== 'test') {
        console.log(`[Notification] ${item.type} dispatched to ${item.to} for ref ${item.reference}`);
      }
    }
  }
}

module.exports = new NotificationService();
