// Builds the Express web application: attaches security middleware, mounts API routes, serves built frontend, and clears expired holds.
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { pool } = require('./database/connection');
const { broadcastSeatsSafe } = require('./utils/seatBroadcast');
const { closeExpiredShows } = require('./services/showCutoffService');
const { unknownApiHandler, globalErrorHandler } = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const movieAndShowRoutes = require('./routes/movieAndShowRoutes');
const seatRoutes = require('./routes/seatRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentAndCouponRoutes = require('./routes/paymentAndCouponRoutes');
const healthRoutes = require('./routes/healthRoutes');

const adminOverviewRoutes = require('./routes/admin/adminOverviewRoutes');
const adminMovieRoutes = require('./routes/admin/adminMovieRoutes');
const adminShowRoutes = require('./routes/admin/adminShowRoutes');
const adminSupportRoutes = require('./routes/admin/adminSupportRoutes');
const adminFinanceRoutes = require('./routes/admin/adminFinanceRoutes');
const adminAuditAndUserRoutes = require('./routes/admin/adminAuditAndUserRoutes');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Mount public and customer APIs.
app.use('/api/auth', authRoutes);
app.use('/api', movieAndShowRoutes);
app.use('/api', seatRoutes);
app.use('/api', bookingRoutes);
app.use('/api', paymentAndCouponRoutes);
app.use('/', healthRoutes);

// Mount role-protected admin APIs.
app.use('/api/admin', adminOverviewRoutes);
app.use('/api/admin', adminMovieRoutes);
app.use('/api/admin', adminShowRoutes);
app.use('/api/admin', adminSupportRoutes);
app.use('/api/admin', adminFinanceRoutes);
app.use('/api/admin', adminAuditAndUserRoutes);

// Background cleaner: every 3 seconds, releases expired 2-minute holds and closes shows at starts_at.
setInterval(async () => {
  try {
    await closeExpiredShows(app);

    const { rows: expired } = await pool.query(`
      UPDATE show_seats
      SET status = 'available', held_by = NULL, hold_expires_at = NULL
      WHERE status = 'held' AND hold_expires_at <= now()
      RETURNING id, show_id
    `);
    if (expired.length && app.locals.io) {
      const byShow = {};
      expired.forEach((seat) => {
        byShow[seat.show_id] = byShow[seat.show_id] || [];
        byShow[seat.show_id].push(seat.id);
      });
      for (const [showId, seatIds] of Object.entries(byShow)) {
        broadcastSeatsSafe(app, seatIds, Number(showId));
      }
    }
  } catch {
    // Ignore timer errors during shutdown or test cleanup.
  }
}, 3000).unref();

// Serve compiled React website from frontend/dist in production.
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(frontendDistPath, 'index.html')));
}

app.use('/api', unknownApiHandler);
app.use(globalErrorHandler);

module.exports = app;
