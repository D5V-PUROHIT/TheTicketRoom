// Public API endpoints for reading active movie info, movies catalogue, and open/scheduled showtimes.
const express = require('express');
const { pool } = require('../database/connection');
const { AppError, catchAsync } = require('../middleware/errorMiddleware');

const router = express.Router();

const fallbackMovie = {
  title: 'Baahubali: The Beginning',
  date_str: 'Friday, 27 November, 2026',
  time_str: '10:00 PM',
  poster_url: '/posters/bahubali.jpg',
  synopsis: 'In ancient Mahishmati, a daring young adventurer learns of his royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
  genre: 'Action • Epic • Mythology • Drama',
  language: 'Hindi, Telugu • Dolby Atmos 7.1',
};

// List all active movies along with their open or upcoming shows.
router.get('/movies', catchAsync(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT m.*,
      coalesce(
        json_agg(
          json_build_object(
            'id', s.id,
            'hall_id', s.hall_id,
            'starts_at', s.starts_at,
            'date_str', s.date_str,
            'time_str', s.time_str,
            'status', s.status,
            'prices', json_build_object('recliner', s.price_recliner, 'club', s.price_club, 'premium', s.price_premium)
          ) ORDER BY s.starts_at ASC
        ) FILTER (WHERE s.id IS NOT NULL), '[]'
      ) AS shows
    FROM movies m
    LEFT JOIN shows s ON s.movie_id = m.id AND s.status IN ('open', 'scheduled')
    WHERE m.status = 'active'
    GROUP BY m.id
    ORDER BY m.id ASC
  `);
  res.json({ movies: rows });
}));

// Get details and showtimes for one movie.
router.get('/movies/:id', catchAsync(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [movie] } = await pool.query('SELECT * FROM movies WHERE id = $1', [id]);
  if (!movie) throw new AppError(404, 'NOT_FOUND', 'Movie not found');
  const { rows: shows } = await pool.query(
    "SELECT * FROM shows WHERE movie_id = $1 AND status IN ('open', 'scheduled') ORDER BY starts_at ASC",
    [id]
  );
  res.json({ movie: { ...movie, shows } });
}));

// List all open/scheduled showtimes across movies.
router.get('/shows', catchAsync(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, m.title AS movie_title, m.poster_url, m.certificate, m.language, m.genres, h.name AS hall_name
    FROM shows s
    JOIN movies m ON m.id = s.movie_id
    JOIN halls h ON h.id = s.hall_id
    WHERE s.status IN ('open', 'scheduled')
    ORDER BY s.starts_at ASC
  `);
  res.json({ shows: rows });
}));

// Single currently active movie endpoint (backward compatible).
router.get('/movie', catchAsync(async (req, res) => {
  try {
    const { rows: [show] } = await pool.query(`
      SELECT s.id AS show_id, s.date_str, s.time_str, m.title, m.poster_url, m.synopsis, m.genres AS genre, m.language
      FROM shows s JOIN movies m ON m.id = s.movie_id
      WHERE s.status = 'open' ORDER BY s.id ASC LIMIT 1
    `);
    if (show) return res.json({ movie: show });
    const { rows: [legacy] } = await pool.query('SELECT * FROM screenings WHERE active = true ORDER BY id DESC LIMIT 1');
    res.json({ movie: legacy || fallbackMovie });
  } catch {
    res.json({ movie: fallbackMovie });
  }
}));

module.exports = router;
