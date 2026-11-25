// Runs on server start: creates tables if missing, seeds initial data, and runs one-time migrations.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('./connection');

/**
 * Ensures PostgreSQL schema, initial shows/seats, one-time fixes, and ID sequences are ready.
 */
async function initializeDatabase() {
  console.log('[TheTicketRoom] Checking database schema & migrations...');

  // 1. Apply schema.sql safely (CREATE IF NOT EXISTS / ALTER IF NOT EXISTS).
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log('[TheTicketRoom] Schema migrations applied successfully.');
    }
  } catch (err) {
    console.error('[TheTicketRoom] Migration error (non-fatal):', err.message);
  }

  // 2. Check if Show 1 already has all 100 seats; otherwise auto-seed everything.
  try {
    const { rows: [{ count }] } = await pool.query(
      'SELECT count(*)::int AS count FROM show_seats WHERE show_id = 1'
    );

    if (count < 100) {
      console.log(`[TheTicketRoom] show_seats has ${count} seats. Auto-seeding initial theatre data...`);
      await autoSeedTheatreData();
    } else {
      // Keep default show dates/posters healthy on existing deployments.
      await pool.query(
        `UPDATE shows SET date_str = 'Friday, 27 November, 2026', time_str = '10:00 PM' WHERE id = 1 AND (date_str LIKE '%28 November%' OR date_str IS NULL)`
      ).catch(() => {});
      await pool.query(
        `UPDATE shows SET status = 'scheduled', starts_at = '2026-12-04 19:30:00+05:30', date_str = 'Friday, 4 December, 2026', time_str = '07:30 PM' WHERE id = 2`
      ).catch(() => {});
      await pool.query(
        `UPDATE shows SET status = 'scheduled', starts_at = '2026-12-11 16:15:00+05:30', date_str = 'Friday, 11 December, 2026', time_str = '04:15 PM' WHERE id = 3`
      ).catch(() => {});
      await pool.query(
        `UPDATE movies SET poster_url = '/poster-ramayana.svg' WHERE id = 2 AND poster_url = '/poster-observatory.svg'`
      ).catch(() => {});
      await pool.query(
        `UPDATE screenings SET date_str = 'Friday, 27 November, 2026', time_str = '10:00 PM' WHERE active = true AND (date_str LIKE '%28 November%' OR date_str IS NULL)`
      ).catch(() => {});

      // One-time tracked migration: restore Show 1 from '01:00 PM' back to '10:00 PM'.
      try {
        const { rows: mig } = await pool.query(
          `SELECT 1 FROM audit_logs WHERE action = 'MIGRATE_RESTORE_10PM_V1' LIMIT 1`
        );
        if (!mig.length) {
          await pool.query(
            `UPDATE shows SET time_str = '10:00 PM', starts_at = '2026-11-27 22:00:00+05:30' WHERE id = 1 AND time_str = '01:00 PM'`
          );
          await pool.query(
            `UPDATE screenings SET time_str = '10:00 PM' WHERE active = true AND time_str = '01:00 PM'`
          );
          await pool.query(
            `INSERT INTO audit_logs (action, target_type, target_id, reason) VALUES ('MIGRATE_RESTORE_10PM_V1', 'show', 1, 'Restore default 10:00 PM showtime')`
          );
        }
      } catch {}

      await syncSequences();
      console.log('[TheTicketRoom] Theatre seats & schedule verified.');
    }
  } catch (err) {
    console.warn('[TheTicketRoom] Could not query show_seats, attempting auto-seed:', err.message);
    try {
      await autoSeedTheatreData();
    } catch (e) {
      console.error('[TheTicketRoom] Auto-seed failed:', e.message);
    }
  }
}

async function autoSeedTheatreData() {
  const hash = await bcrypt.hash('Test@1234', 10);
  const adminHash = await bcrypt.hash('Admin@123', 10);

  await pool.query(`
    INSERT INTO halls (id, name, total_seats)
    VALUES (1, 'Galaxy Cinema - Hall 1', 100)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, total_seats = 100;
  `);

  const catalogue = [
    {
      id: 1,
      title: 'Baahubali: The Beginning',
      synopsis: 'In ancient Mahishmati, a daring young adventurer learns of his royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
      poster_url: '/posters/bahubali.jpg',
      genres: 'Action • Epic • Mythology • Drama',
      language: 'Hindi, Telugu',
    },
    {
      id: 2,
      title: 'Ramayana - Hindi',
      synopsis: 'An epic adaptation of the ancient legend of courage, righteousness, and the triumph of truth.',
      poster_url: '/poster-ramayana.svg',
      genres: 'Mythology • Epic • Action',
      language: 'Hindi',
    },
    {
      id: 3,
      title: 'Starlight Horizon',
      synopsis: 'Deep space explorers venture beyond the solar perimeter to investigate a mysterious celestial resonance.',
      poster_url: '/poster-starlight.svg',
      genres: 'Sci-Fi • Space Adventure',
      language: 'English, Hindi',
    },
    {
      id: 4,
      title: 'Chronicles of Chronos',
      synopsis: 'A temporal physicist races against paradoxes to prevent the collapse of the prime timeline.',
      poster_url: '/poster-chronos.svg',
      genres: 'Time-Travel • Mystery Thriller',
      language: 'English',
    },
  ];

  for (const m of catalogue) {
    await pool.query(`
      INSERT INTO movies (id, title, synopsis, poster_url, cast_members, language, certificate, runtime_mins, genres)
      VALUES ($1, $2, $3, $4, 'Lead Cast', $5, 'U/A 13+', 159, $6)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, synopsis = EXCLUDED.synopsis, poster_url = EXCLUDED.poster_url,
        genres = EXCLUDED.genres, language = EXCLUDED.language;
    `, [m.id, m.title, m.synopsis, m.poster_url, m.language, m.genres]);
  }

  await pool.query(`
    INSERT INTO shows (id, movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
    VALUES (1, 1, 1, '2026-11-27 22:00:00+05:30', 'Friday, 27 November, 2026', '10:00 PM', 350, 250, 180, 'open')
    ON CONFLICT (id) DO UPDATE SET
      movie_id = EXCLUDED.movie_id, starts_at = EXCLUDED.starts_at, date_str = EXCLUDED.date_str, time_str = EXCLUDED.time_str, status = 'open';
  `);

  await pool.query(`
    INSERT INTO shows (id, movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
    VALUES (2, 2, 1, '2026-12-04 19:30:00+05:30', 'Friday, 4 December, 2026', '07:30 PM', 350, 250, 180, 'scheduled')
    ON CONFLICT (id) DO UPDATE SET
      movie_id = EXCLUDED.movie_id, starts_at = EXCLUDED.starts_at, date_str = EXCLUDED.date_str, time_str = EXCLUDED.time_str, status = 'scheduled';
  `);

  const tierFor = (r) => (r === 'A' ? 'recliner' : 'BCDEF'.includes(r) ? 'club' : 'premium');
  const priceFor = (t) => (t === 'recliner' ? 350 : t === 'club' ? 250 : 180);

  let sId = 1;
  for (const row of 'ABCDEFGHIJ') {
    for (let n = 1; n <= 10; n++) {
      const tier = tierFor(row);
      const price = priceFor(tier);
      await pool.query(`
        INSERT INTO show_seats (id, show_id, row_label, seat_number, tier, price, status)
        VALUES ($1, 1, $2, $3, $4, $5, 'available')
        ON CONFLICT (id) DO UPDATE SET
          show_id = 1, row_label = EXCLUDED.row_label, seat_number = EXCLUDED.seat_number,
          tier = EXCLUDED.tier, price = EXCLUDED.price;
      `, [sId++, row, n, tier, price]);
    }
  }

  await pool.query(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES
      (1, 'Test User 1', 'user1@test.com', $1, 'user'),
      (2, 'Test User 2', 'user2@test.com', $1, 'user'),
      (3, 'Test User 3', 'user3@test.com', $1, 'user'),
      (999, 'Super Administrator', 'admin@test.com', $2, 'super_admin'),
      (1001, 'Cinema Operations Manager', 'ops@test.com', $1, 'operations'),
      (1002, 'Customer Support Specialist', 'support@test.com', $1, 'support'),
      (1003, 'Finance Controller', 'finance@test.com', $1, 'finance'),
      (1004, 'Growth Marketing Lead', 'marketing@test.com', $1, 'marketing')
    ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash;
  `, [hash, adminHash]);

  await pool.query(`
    INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, is_active)
    VALUES
      ('TICKET50', 'flat', 50, 180, true),
      ('CINEMA20', 'percent', 20, 200, true)
    ON CONFLICT (code) DO NOTHING;
  `);

  await syncSequences();
  console.log('[TheTicketRoom] Auto-seed complete: Hall, Movies, Shows, 100 Seats, Users, and Coupons initialized.');
}

async function syncSequences() {
  const seqs = [
    ['halls_id_seq', 'halls'],
    ['hall_seats_id_seq', 'hall_seats'],
    ['movies_id_seq', 'movies'],
    ['shows_id_seq', 'shows'],
    ['show_seats_id_seq', 'show_seats'],
    ['users_id_seq', 'users'],
  ];
  for (const [seq, tbl] of seqs) {
    await pool.query(`SELECT setval('${seq}', COALESCE((SELECT max(id) FROM ${tbl}), 1))`).catch(() => {});
  }
}

module.exports = { initializeDatabase, syncSequences };
