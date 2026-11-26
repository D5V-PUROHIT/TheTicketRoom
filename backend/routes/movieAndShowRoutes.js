// Public API endpoints for reading active movie info, movies catalogue, and bookable/scheduled showtimes.
const express = require('express');
const { pool } = require('../database/connection');
const { BOOKING_CUTOFF_MINUTES } = require('../config/bookingRules');
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

// List all active movies along with upcoming scheduled or still-bookable open shows.
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
    LEFT JOIN shows s ON s.movie_id = m.id
      AND ((s.status = 'open' AND s.starts_at > now() + make_interval(mins => $1::int)) OR s.status = 'scheduled')
    WHERE m.status = 'active'
    GROUP BY m.id
    ORDER BY m.id ASC
  `, [BOOKING_CUTOFF_MINUTES]);
  res.json({ movies: rows });
}));

// Get details and active/upcoming showtimes for one movie.
router.get('/movies/:id', catchAsync(async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [movie] } = await pool.query('SELECT * FROM movies WHERE id = $1', [id]);
  if (!movie) throw new AppError(404, 'NOT_FOUND', 'Movie not found');
  const { rows: shows } = await pool.query(
    `SELECT * FROM shows
     WHERE movie_id = $1
       AND ((status = 'open' AND starts_at > now() + make_interval(mins => $2::int)) OR status = 'scheduled')
     ORDER BY starts_at ASC`,
    [id, BOOKING_CUTOFF_MINUTES]
  );
  res.json({ movie: { ...movie, shows } });
}));

// List all bookable open shows (before cutoff) and scheduled upcoming shows.
router.get('/shows', catchAsync(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, m.title AS movie_title, m.poster_url, m.certificate, m.language, m.genres, h.name AS hall_name
    FROM shows s
    JOIN movies m ON m.id = s.movie_id
    JOIN halls h ON h.id = s.hall_id
    WHERE ((s.status = 'open' AND s.starts_at > now() + make_interval(mins => $1::int)) OR s.status = 'scheduled')
    ORDER BY s.starts_at ASC
  `, [BOOKING_CUTOFF_MINUTES]);
  res.json({ shows: rows });
}));

// Single currently active open movie endpoint (ignores closed/expired shows).
router.get('/movie', catchAsync(async (req, res) => {
  try {
    const { rows: [show] } = await pool.query(`
      SELECT s.id AS show_id, s.date_str, s.time_str, m.title, m.poster_url, m.synopsis, m.genres AS genre, m.language
      FROM shows s JOIN movies m ON m.id = s.movie_id
      WHERE s.status = 'open' AND s.starts_at > now() + make_interval(mins => $1::int)
      ORDER BY s.starts_at ASC, s.id ASC LIMIT 1
    `, [BOOKING_CUTOFF_MINUTES]);
    if (show) return res.json({ movie: show, bookingOpen: true });

    const { rows: [legacy] } = await pool.query('SELECT * FROM screenings WHERE active = true ORDER BY id DESC LIMIT 1');
    res.json({ movie: legacy || fallbackMovie, bookingOpen: false });
  } catch {
    res.json({ movie: fallbackMovie, bookingOpen: false });
  }
}));

module.exports = router;
