// Endpoints to read the 100-seat hall map and the logged-in user's booked quota.
const express = require('express');
const { optionalLogin } = require('../middleware/authMiddleware');
const { AppError, catchAsync } = require('../middleware/errorMiddleware');
const { fetchShowSeatsWithQuota } = require('../services/seatHoldService');

const router = express.Router();

// Get live seat statuses for a specific show.
router.get('/shows/:showId/seats', optionalLogin, catchAsync(async (req, res) => {
  const showId = Number(req.params.showId);
  if (!Number.isInteger(showId)) throw new AppError(400, 'VALIDATION', 'Invalid showId');
  const payload = await fetchShowSeatsWithQuota(showId, req.user?.id, false);
  res.json(payload);
}));

// Legacy seats endpoint (defaults to Show 1).
router.get('/seats', optionalLogin, catchAsync(async (req, res) => {
  const showId = Number(req.query.showId) || 1;
  const payload = await fetchShowSeatsWithQuota(showId, req.user?.id, true);
  res.json(payload);
}));

module.exports = router;
