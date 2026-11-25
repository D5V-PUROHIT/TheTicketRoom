// Admin endpoints to view and publish movies to the cinema catalogue (/api/admin/movies).
const express = require('express');
const { pool } = require('../../database/connection');
const { requireLogin, requireAnyAdmin, requireRole } = require('../../middleware/authMiddleware');
const { AppError, catchAsync } = require('../../middleware/errorMiddleware');
const { logAdminAction } = require('../../utils/auditLogger');

const router = express.Router();

// List all movies in the database.
router.get('/movies', requireLogin, requireAnyAdmin, catchAsync(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM movies ORDER BY id DESC');
  res.json({ movies: rows });
}));

// Publish a new movie title to the catalogue.
router.post('/movies', requireLogin, requireRole('operations'), catchAsync(async (req, res) => {
  const { title, synopsis, poster_url, cast_members, language, certificate, runtime_mins, genres } = req.body || {};
  if (!title || typeof title !== 'string') {
    throw new AppError(400, 'VALIDATION', 'Movie title is required');
  }

  const { rows: [movie] } = await pool.query(
    `INSERT INTO movies (title, synopsis, poster_url, cast_members, language, certificate, runtime_mins, genres)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      title.trim(),
      synopsis || '',
      poster_url || '/posters/bahubali.jpg',
      cast_members || 'Lead Cast',
      language || 'Hindi',
      certificate || 'U/A 13+',
      Number(runtime_mins) || 150,
      genres || 'Action • Drama',
    ]
  );

  await logAdminAction(pool, {
    adminId: req.user.id,
    action: 'CREATE_MOVIE',
    targetType: 'movie',
    targetId: movie.id,
    details: { title: movie.title },
    reason: 'New movie catalogue entry',
  });

  res.status(201).json({ movie });
}));

module.exports = router;
