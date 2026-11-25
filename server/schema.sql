CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  total_price INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS seats (
  id SERIAL PRIMARY KEY,
  row_label CHAR(1) NOT NULL,
  seat_number INT NOT NULL,
  price INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','booked')),
  held_by INT REFERENCES users(id),
  hold_expires_at TIMESTAMPTZ,
  booking_id INT REFERENCES bookings(id),
  UNIQUE (row_label, seat_number),
  CHECK (
    (status = 'available' AND held_by IS NULL AND booking_id IS NULL) OR
    (status = 'held' AND held_by IS NOT NULL AND hold_expires_at IS NOT NULL AND booking_id IS NULL) OR
    (status = 'booked' AND booking_id IS NOT NULL AND held_by IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS seats_held_by_idx ON seats(held_by) WHERE held_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS seats_booking_idx ON seats(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id);

CREATE TABLE IF NOT EXISTS screenings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date_str TEXT NOT NULL,
  time_str TEXT NOT NULL,
  poster_url TEXT NOT NULL DEFAULT '/baahubali.jpg',
  synopsis TEXT,
  genre TEXT DEFAULT 'Action • Epic • Drama',
  language TEXT DEFAULT 'Hindi (Dolby Atmos)',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
