// Finance & Accounting admin endpoints for revenue reconciliation, GST totals, and CSV ledger download.
const express = require('express');
const { pool } = require('../../database/connection');
const { requireLogin, requireRole } = require('../../middleware/authMiddleware');
const { catchAsync } = require('../../middleware/errorMiddleware');

const router = express.Router();

// Revenue, promo discounts, convenience fees, and GST collected summary.
router.get('/finance/summary', requireLogin, requireRole('finance'), catchAsync(async (req, res) => {
  const { rows: byMovie } = await pool.query(`
    SELECT m.title, count(b.id)::int AS bookings_count,
           coalesce(sum(b.total_price), 0)::int AS total_revenue
    FROM bookings b
    JOIN shows s ON s.id = b.show_id
    JOIN movies m ON m.id = s.movie_id
    WHERE b.status = 'confirmed'
    GROUP BY m.id, m.title
  `);

  const { rows: [totals] } = await pool.query(`
    SELECT coalesce(sum(total_price), 0)::int AS gross_revenue,
           coalesce(sum(discount_amount), 0)::int AS total_discounts,
           coalesce(sum(convenience_fee), 0)::int AS total_convenience_fees,
           coalesce(sum(gst_amount), 0)::int AS total_gst
    FROM bookings WHERE status = 'confirmed'
  `);

  res.json({ totals, byMovie });
}));

// Export full financial ledger as a downloadable CSV file.
router.get('/finance/export', requireLogin, requireRole('finance'), catchAsync(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT b.reference, b.created_at, u.email, m.title AS movie, s.date_str, s.time_str,
           b.subtotal, b.discount_amount, b.convenience_fee, b.gst_amount, b.total_price, b.status
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN shows s ON s.id = b.show_id
    JOIN movies m ON m.id = s.movie_id
    ORDER BY b.created_at DESC
  `);

  const headers = ['Reference', 'Date', 'Customer', 'Movie', 'Screening Date', 'Screening Time', 'Subtotal', 'Discount', 'Platform Fee', 'CGST + SGST', 'Total Paid', 'Status'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.reference,
      `"${new Date(r.created_at).toISOString()}"`,
      r.email,
      `"${r.movie}"`,
      `"${r.date_str}"`,
      r.time_str,
      r.subtotal,
      r.discount_amount,
      r.convenience_fee,
      r.gst_amount,
      r.total_price,
      r.status,
    ].join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="theticketroom-finance-report.csv"');
  res.send(lines.join('\n'));
}));

module.exports = router;
