// Standalone database reset & sample data script (run with: npm run seed).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { pool } = require('./connection');
const { syncSequences } = require('./startupSetup');

const USER_PASSWORD = 'Test@1234';
const ADMIN = { email: 'admin@test.com', password: 'Admin@123' };

const tierFor = (row) => ('A'.includes(row) ? 'recliner' : 'BCDEF'.includes(row) ? 'club' : 'premium');
const priceFor = (tier) => (tier === 'recliner' ? 350 : tier === 'club' ? 250 : 180);

(async () => {
  console.log('--- Initializing database schema ---');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  // Upgrade old physical `seats` table to updatable view if present.
  const { rows: tableCheck } = await pool.query(
    "SELECT table_type FROM information_schema.tables WHERE table_schema='public' AND table_name='seats'"
  );
  if (tableCheck.length && tableCheck[0].table_type === 'BASE TABLE') {
    console.log('Upgrading physical seats table to updatable view...');
    await pool.query('DROP TABLE seats CASCADE');
  }

  // 1. Hall 1
  const { rows: [hall] } = await pool.query(`
    INSERT INTO halls (id, name, total_seats)
    VALUES (1, 'Galaxy Cinema - Hall 1', 100)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, total_seats = 100
    RETURNING id
  `);

  // 2. Hall template seats (100 seats: A to J, 1 to 10)
  let seatSeq = 1;
  for (const row of 'ABCDEFGHIJ') {
    for (let n = 1; n <= 10; n++) {
      const tier = tierFor(row);
      await pool.query(`
        INSERT INTO hall_seats (id, hall_id, row_label, seat_number, tier, is_accessible)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (hall_id, row_label, seat_number) DO UPDATE SET tier = EXCLUDED.tier
      `, [seatSeq++, hall.id, row, n, tier, row === 'J' && (n === 1 || n === 10)]);
    }
  }

  // 3. Movies catalogue
  const movies = [
    {
      id: 1,
      title: 'Baahubali: The Beginning',
      synopsis: 'In ancient Mahishmati, a daring young adventurer learns of his royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
      poster_url: '/posters/bahubali.jpg',
      trailer_url: 'https://youtube.com',
      cast_members: 'Prabhas, Rana Daggubati, Anushka Shetty, Tamannaah Bhatia, S.S. Rajamouli',
      language: 'Hindi, Telugu',
      certificate: 'U/A 13+',
      runtime_mins: 159,
      genres: 'Action • Epic • Mythology • Drama',
    },
    {
      id: 2,
      title: 'Ramayana - Hindi',
      synopsis: 'An epic retelling of the timeless legend of courage, righteousness, devotion, and the triumph of truth.',
      poster_url: '/poster-ramayana.svg',
      trailer_url: 'https://youtube.com',
      cast_members: 'Ranbir Kapoor, Sai Pallavi, Yash',
      language: 'Hindi',
      certificate: 'U',
      runtime_mins: 165,
      genres: 'Mythology • Epic • Action',
    },
    {
      id: 3,
      title: 'Starlight Horizon',
      synopsis: 'Deep space explorers venture beyond the solar perimeter to investigate a mysterious celestial signal.',
      poster_url: '/poster-starlight.svg',
      trailer_url: 'https://youtube.com',
      cast_members: 'A. Vance, Elena Vance, Dr. Julian Thorne',
      language: 'English, Hindi',
      certificate: 'U/A 13+',
      runtime_mins: 142,
      genres: 'Sci-Fi • Space Adventure',
    },
    {
      id: 4,
      title: 'Chronicles of Chronos',
      synopsis: 'A temporal physicist races against paradoxes to prevent the collapse of the prime timeline.',
      poster_url: '/poster-chronos.svg',
      trailer_url: 'https://youtube.com',
      cast_members: 'Marcus Ward, Sarah Lin',
      language: 'English',
      certificate: 'A',
      runtime_mins: 128,
      genres: 'Time-Travel • Mystery Thriller',
    },
  ];

  for (const m of movies) {
    await pool.query(`
      INSERT INTO movies (id, title, synopsis, poster_url, trailer_url, cast_members, language, certificate, runtime_mins, genres, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, synopsis = EXCLUDED.synopsis, poster_url = EXCLUDED.poster_url,
        genres = EXCLUDED.genres, language = EXCLUDED.language
    `, [m.id, m.title, m.synopsis, m.poster_url, m.trailer_url, m.cast_members, m.language, m.certificate, m.runtime_mins, m.genres]);
  }

  // 4. Seed 3 shows (Show 1 Open, Show 2 & 3 Scheduled upcoming)
  const seededShows = [
    { id: 1, movie_id: 1, starts_at: '2026-11-27 22:00:00+05:30', date_str: 'Friday, 27 November, 2026', time_str: '10:00 PM', status: 'open' },
    { id: 2, movie_id: 2, starts_at: '2026-12-04 19:30:00+05:30', date_str: 'Friday, 4 December, 2026', time_str: '07:30 PM', status: 'scheduled' },
    { id: 3, movie_id: 3, starts_at: '2026-12-11 16:15:00+05:30', date_str: 'Friday, 11 December, 2026', time_str: '04:15 PM', status: 'scheduled' },
  ];
  for (const sh of seededShows) {
    await pool.query(`
      INSERT INTO shows (id, movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
      VALUES ($1, $2, 1, $3, $4, $5, 350, 250, 180, $6)
      ON CONFLICT (id) DO UPDATE SET
        movie_id = EXCLUDED.movie_id, starts_at = EXCLUDED.starts_at, date_str = EXCLUDED.date_str, time_str = EXCLUDED.time_str, status = EXCLUDED.status
    `, [sh.id, sh.movie_id, sh.starts_at, sh.date_str, sh.time_str, sh.status]);
  }

  // 5. Reset bookings and regenerate 300 show seats (100 per show)
  await pool.query('DELETE FROM bookings');
  await pool.query('DELETE FROM show_seats');

  let sId = 1;
  for (const sh of seededShows) {
    for (const row of 'ABCDEFGHIJ') {
      for (let n = 1; n <= 10; n++) {
        const tier = tierFor(row);
        const price = priceFor(tier);
        await pool.query(`
          INSERT INTO show_seats (id, show_id, row_label, seat_number, tier, price, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'available')
        `, [sId++, sh.id, row, n, tier, price]);
      }
    }
  }

  await syncSequences();

  // 6. Backward-compatible `seats` view for Show 1
  await pool.query(`
    CREATE OR REPLACE VIEW seats AS
      SELECT id, row_label, seat_number, price, status, held_by, hold_expires_at, booking_id
      FROM show_seats
      WHERE show_id = 1
      WITH CHECK OPTION
  `);

  // 7. Seed 500 test customer accounts for concurrency load tests
  console.log('Seeding 500 test users...');
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);
  await pool.query(`
    INSERT INTO users (name, email, password_hash, role)
    SELECT 'User ' || n, 'user' || n || '@test.com', $1, 'user'
    FROM generate_series(1, 500) n
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [userHash]);

  // 8. Seed Staff accounts
  const staff = [
    { name: 'System Admin', email: ADMIN.email, pass: ADMIN.password, role: 'super_admin' },
    { name: 'Operations Lead', email: 'ops@test.com', pass: 'Ops@1234', role: 'operations' },
    { name: 'Support Desk', email: 'support@test.com', pass: 'Support@1234', role: 'support' },
    { name: 'Finance Controller', email: 'finance@test.com', pass: 'Finance@1234', role: 'finance' },
    { name: 'Marketing Manager', email: 'marketing@test.com', pass: 'Marketing@1234', role: 'marketing' },
  ];
  for (const s of staff) {
    const h = await bcrypt.hash(s.pass, 10);
    await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash
    `, [s.name, s.email, h, s.role]);
  }

  // 9. Seed Promo Coupons
  const coupons = [
    { code: 'TICKET50', discount_type: 'flat', discount_value: 50, min_order_amount: 200 },
    { code: 'CINEMA20', discount_type: 'percent', discount_value: 20, min_order_amount: 300, max_discount: 100 },
  ];
  for (const c of coupons) {
    await pool.query(`
      INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (code) DO NOTHING
    `, [c.code, c.discount_type, c.discount_value, c.min_order_amount, c.max_discount || null]);
  }

  // 10. Legacy screenings entry
  await pool.query('UPDATE screenings SET active = false WHERE active = true');
  await pool.query(`
    INSERT INTO screenings (title, date_str, time_str, poster_url, synopsis, genre, language, active)
    VALUES (
      'Baahubali: The Beginning',
      'Friday, 27 November, 2026',
      '10:00 PM',
      '/posters/bahubali.jpg',
      'In ancient Mahishmati, a daring young adventurer learns of his royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
      'Action • Epic • Mythology • Drama',
      'Hindi, Telugu • Dolby Atmos 7.1',
      true
    )
  `);

  console.log('✅ Seed completed successfully (Show 1 Open + 500 test users + Staff + Coupons).');
  await pool.end();
})().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
