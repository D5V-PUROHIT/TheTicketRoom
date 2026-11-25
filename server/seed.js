const fs = require('fs'), path = require('path'), bcrypt = require('bcrypt');
const pool = require('./db');

const USER_PASSWORD = 'Test@1234';
const ADMIN = { email: 'admin@test.com', password: 'Admin@123' };
const tier = (row) => ('AB'.includes(row) ? 350 : 'CDEF'.includes(row) ? 250 : 180);

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  for (const row of 'ABCDEFGHIJ') {
    for (let n = 1; n <= 10; n++) {
      await pool.query(
        'INSERT INTO seats(row_label, seat_number, price) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [row, n, tier(row)]
      );
    }
  }
  // Reset hall state so the seed always starts from an empty theatre.
  await pool.query("UPDATE seats SET status='available', held_by=NULL, hold_expires_at=NULL, booking_id=NULL");
  await pool.query('DELETE FROM bookings');
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users(name, email, password_hash)
     SELECT 'User ' || n, 'user' || n || '@test.com', $1 FROM generate_series(1, 500) n
     ON CONFLICT (email) DO NOTHING`,
    [userHash]
  );
  await pool.query(
    `INSERT INTO users(name, email, password_hash, role) VALUES ('Admin', $1, $2, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    [ADMIN.email, await bcrypt.hash(ADMIN.password, 10)]
  );
  console.log('Seeded 100 seats, 500 users and 1 admin.');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
