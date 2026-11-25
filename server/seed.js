const fs = require('fs'), path = require('path'), bcrypt = require('bcrypt');
const pool = require('./db');

const USER_PASSWORD = 'Test@1234';
const ADMIN = { email: 'admin@test.com', password: 'Admin@123' };

const tierFor = (row) => ('A'.includes(row) ? 'recliner' : 'BCDEF'.includes(row) ? 'club' : 'premium');
const priceFor = (tier) => (tier === 'recliner' ? 350 : tier === 'club' ? 250 : 180);

(async () => {
  console.log('--- Initializing database schema ---');
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  // If `seats` is an old physical table instead of a view, migrate or drop it to replace with view
  const { rows: tableCheck } = await pool.query(
    "SELECT table_type FROM information_schema.tables WHERE table_schema='public' AND table_name='seats'"
  );
  if (tableCheck.length && tableCheck[0].table_type === 'BASE TABLE') {
    console.log('Upgrading physical seats table to updatable view...');
    await pool.query('DROP TABLE seats CASCADE');
  }

  // 1. Create or ensure Hall 1 exists
  const { rows: [hall] } = await pool.query(`
    INSERT INTO halls (id, name, total_seats)
    VALUES (1, 'Galaxy Cinema - Hall 1', 100)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, total_seats = 100
    RETURNING id
  `);

  // 2. Populate hall_seats template (100 seats)
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

  // 3. Populate Movies Catalogue
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
      poster_url: '/poster-observatory.svg',
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

  // 4. Populate Shows
  // Show 1: Tonight's Main Show (Friday 28 November 2026, 10:00 PM) - Baahubali
  await pool.query(`
    INSERT INTO shows (id, movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
    VALUES (1, 1, 1, '2026-11-28 22:00:00+05:30', 'Friday, 28 November, 2026', '10:00 PM', 350, 250, 180, 'open')
    ON CONFLICT (id) DO UPDATE SET
      movie_id = EXCLUDED.movie_id, date_str = EXCLUDED.date_str, time_str = EXCLUDED.time_str, status = 'open'
  `);

  // Show 2: Early Evening Show (Friday 28 November 2026, 06:00 PM) - Ramayana
  await pool.query(`
    INSERT INTO shows (id, movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
    VALUES (2, 2, 1, '2026-11-28 18:00:00+05:30', 'Friday, 28 November, 2026', '06:00 PM', 350, 250, 180, 'open')
    ON CONFLICT (id) DO UPDATE SET
      movie_id = EXCLUDED.movie_id, date_str = EXCLUDED.date_str, time_str = EXCLUDED.time_str, status = 'open'
  `);

  // Show 3: Weekend Matinee (Saturday 29 November 2026, 04:15 PM) - Starlight Horizon
  await pool.query(`
    INSERT INTO shows (id, movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
    VALUES (3, 3, 1, '2026-11-29 16:15:00+05:30', 'Saturday, 29 November, 2026', '04:15 PM', 350, 250, 180, 'open')
    ON CONFLICT (id) DO UPDATE SET
      movie_id = EXCLUDED.movie_id, date_str = EXCLUDED.date_str, time_str = EXCLUDED.time_str, status = 'open'
  `);

  // 5. Clean up old bookings and show seats to re-seed cleanly
  await pool.query('DELETE FROM bookings');
  await pool.query('DELETE FROM show_seats');

  // Populate show_seats for Show 1 (IDs 1..100)
  let sId = 1;
  for (const row of 'ABCDEFGHIJ') {
    for (let n = 1; n <= 10; n++) {
      const tier = tierFor(row);
      const price = priceFor(tier);
      await pool.query(`
        INSERT INTO show_seats (id, show_id, row_label, seat_number, tier, price, status)
        VALUES ($1, 1, $2, $3, $4, $5, 'available')
      `, [sId++, row, n, tier, price]);
    }
  }

  // Populate show_seats for Show 2 (IDs 101..200)
  for (const row of 'ABCDEFGHIJ') {
    for (let n = 1; n <= 10; n++) {
      const tier = tierFor(row);
      const price = priceFor(tier);
      await pool.query(`
        INSERT INTO show_seats (id, show_id, row_label, seat_number, tier, price, status)
        VALUES ($1, 2, $2, $3, $4, $5, 'available')
      `, [sId++, row, n, tier, price]);
    }
  }

  // Populate show_seats for Show 3 (IDs 201..300)
  for (const row of 'ABCDEFGHIJ') {
    for (let n = 1; n <= 10; n++) {
      const tier = tierFor(row);
      const price = priceFor(tier);
      await pool.query(`
        INSERT INTO show_seats (id, show_id, row_label, seat_number, tier, price, status)
        VALUES ($1, 3, $2, $3, $4, $5, 'available')
      `, [sId++, row, n, tier, price]);
    }
  }

  // Set sequence to highest seat ID so new seats get incremental IDs
  await pool.query(`SELECT setval('show_seats_id_seq', (SELECT max(id) FROM show_seats))`);

  // 6. Create the backward-compatible updatable view `seats` targeting Show 1
  await pool.query(`
    CREATE OR REPLACE VIEW seats AS
      SELECT id, row_label, seat_number, price, status, held_by, hold_expires_at, booking_id
      FROM show_seats
      WHERE show_id = 1
      WITH CHECK OPTION
  `);

  // 7. Seed 500 assessment users
  console.log('Seeding 500 test users...');
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);
  await pool.query(`
    INSERT INTO users (name, email, password_hash, role)
    SELECT 'User ' || n, 'user' || n || '@test.com', $1, 'user'
    FROM generate_series(1, 500) n
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [userHash]);

  // 8. Seed Staff Accounts with Role-Based Access Control
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

  // 9. Seed Promotional Coupons
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

  // 10. Update legacy screenings table
  await pool.query('UPDATE screenings SET active = false WHERE active = true');
  await pool.query(`
    INSERT INTO screenings (title, date_str, time_str, poster_url, synopsis, genre, language, active)
    VALUES (
      'Baahubali: The Beginning',
      'Friday, 28 November, 2026',
      '10:00 PM',
      '/posters/bahubali.jpg',
      'In ancient Mahishmati, a daring young adventurer learns of his regal royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
      'Action • Epic • Mythology • Drama',
      'Hindi, Telugu • Dolby Atmos 7.1',
      true
    )
  `);

  console.log('✅ Seed completed successfully:');
  console.log('- 1 Hall (Galaxy Cinema - Hall 1 with 100 template seats)');
  console.log('- 4 Movies catalogue (Baahubali, Ramayana, Starlight Horizon, Chronicles of Chronos)');
  console.log('- 3 Shows scheduled (Show 1 Baahubali @ 10:00 PM, Show 2 Ramayana @ 06:00 PM, Show 3 Starlight @ 04:15 PM)');
  console.log('- 300 Show Seats created (100 per show, Show 1 seats IDs 1..100 accessible via view "seats")');
  console.log('- 500 test users seeded (user1@test.com..user500@test.com / Test@1234)');
  console.log('- Staff accounts seeded: admin@test.com (super_admin), ops@test.com, support@test.com, finance@test.com, marketing@test.com');
  console.log('- Promotional coupons seeded (TICKET50, CINEMA20)');
  await pool.end();
})().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
