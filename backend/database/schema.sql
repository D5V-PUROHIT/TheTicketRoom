-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users & Roles
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  totp_secret TEXT,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Upgrade users table if pre-existing
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','admin','super_admin','operations','support','finance','marketing'));

-- Movies Catalogue
CREATE TABLE IF NOT EXISTS movies (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  synopsis TEXT,
  poster_url TEXT NOT NULL DEFAULT '/posters/bahubali.jpg',
  trailer_url TEXT,
  cast_members TEXT DEFAULT 'Prabhas, Rana Daggubati, Anushka Shetty, Tamannaah Bhatia',
  language TEXT DEFAULT 'Hindi, Telugu',
  certificate TEXT DEFAULT 'U/A 13+',
  runtime_mins INT DEFAULT 159,
  genres TEXT DEFAULT 'Action • Epic • Mythology • Drama',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Halls
CREATE TABLE IF NOT EXISTS halls (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  total_seats INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hall template seats
CREATE TABLE IF NOT EXISTS hall_seats (
  id SERIAL PRIMARY KEY,
  hall_id INT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  row_label CHAR(1) NOT NULL,
  seat_number INT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('recliner', 'club', 'premium')),
  is_accessible BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (hall_id, row_label, seat_number)
);

-- Shows (Screenings)
CREATE TABLE IF NOT EXISTS shows (
  id SERIAL PRIMARY KEY,
  movie_id INT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  hall_id INT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  date_str TEXT NOT NULL,
  time_str TEXT NOT NULL,
  price_recliner INT NOT NULL DEFAULT 350,
  price_club INT NOT NULL DEFAULT 250,
  price_premium INT NOT NULL DEFAULT 180,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('scheduled', 'open', 'paused', 'closed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id),
  show_id INT REFERENCES shows(id),
  idempotency_key TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  total_price INT NOT NULL,
  subtotal INT NOT NULL DEFAULT 0,
  discount_amount INT NOT NULL DEFAULT 0,
  convenience_fee INT NOT NULL DEFAULT 0,
  gst_amount INT NOT NULL DEFAULT 0,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- Upgrade bookings table if pre-existing
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS show_id INT REFERENCES shows(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS subtotal INT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount INT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS convenience_fee INT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS gst_amount INT NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('confirmed', 'cancelled', 'refunded'));

-- Show Seats (Specific to each show)
CREATE TABLE IF NOT EXISTS show_seats (
  id SERIAL PRIMARY KEY,
  show_id INT NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  seat_id INT REFERENCES hall_seats(id) ON DELETE SET NULL,
  row_label CHAR(1) NOT NULL,
  seat_number INT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('recliner', 'club', 'premium')),
  price INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'booked', 'blocked')),
  held_by INT REFERENCES users(id),
  hold_expires_at TIMESTAMPTZ,
  booking_id INT REFERENCES bookings(id),
  UNIQUE (show_id, row_label, seat_number),
  CHECK (
    (status = 'available' AND held_by IS NULL AND booking_id IS NULL) OR
    (status = 'held' AND held_by IS NOT NULL AND hold_expires_at IS NOT NULL AND booking_id IS NULL) OR
    (status = 'booked' AND booking_id IS NOT NULL AND held_by IS NULL) OR
    (status = 'blocked' AND held_by IS NULL AND booking_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS show_seats_show_idx ON show_seats(show_id);
CREATE INDEX IF NOT EXISTS show_seats_held_by_idx ON show_seats(held_by) WHERE held_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS show_seats_booking_idx ON show_seats(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id);
CREATE INDEX IF NOT EXISTS bookings_show_idx ON bookings(show_id);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  booking_id INT REFERENCES bookings(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  gateway TEXT NOT NULL DEFAULT 'razorpay',
  gateway_order_id TEXT UNIQUE,
  gateway_payment_id TEXT UNIQUE,
  gateway_signature TEXT,
  amount INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'captured', 'failed', 'refunded')),
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('flat', 'percent')),
  discount_value INT NOT NULL,
  min_order_amount INT NOT NULL DEFAULT 0,
  max_discount INT,
  expires_at TIMESTAMPTZ,
  usage_limit INT,
  times_used INT NOT NULL DEFAULT 0,
  per_user_limit INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coupon redemptions
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id SERIAL PRIMARY KEY,
  coupon_id INT NOT NULL REFERENCES coupons(id),
  user_id INT NOT NULL REFERENCES users(id),
  booking_id INT NOT NULL REFERENCES bookings(id),
  discount_amount INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  payment_id INT REFERENCES payments(id),
  booking_id INT NOT NULL REFERENCES bookings(id),
  gateway_refund_id TEXT,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('pending', 'processed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id INT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INT,
  details JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Legacy screenings table kept for backward compatibility
CREATE TABLE IF NOT EXISTS screenings (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date_str TEXT NOT NULL,
  time_str TEXT NOT NULL,
  poster_url TEXT NOT NULL DEFAULT '/posters/bahubali.jpg',
  synopsis TEXT,
  genre TEXT DEFAULT 'Action • Epic • Mythology • Drama',
  language TEXT DEFAULT 'Hindi (Dolby Atmos)',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
