# TheTicketRoom: Real-Time Seat Booking System

A real-time cinema ticket booking platform built with **PostgreSQL, Express, Socket.IO, and React (Vite)**. Engineered for high concurrency under race conditions (500 simultaneous users) with zero double-bookings, row-level locking, and a modern BookMyShow-inspired entertainment experience.

**Live Deployment:** [https://theticketroom.onrender.com](https://theticketroom.onrender.com)

---

## Key Features

### 🎬 Visual & Experience Layer (BookMyShow Inspired)
- **Entertainment Landing Portal**: Blockbuster hero showcase for *"Midnight at the Observatory"*, synopsis, rating badges (`IMAX 3D`, `Dolby Atmos 7.1`, `★ 9.4/10`), and recommended movie carousel.
- **1-Click Quick Demo Login**: Instant login chips for **User 1** and **Cinema Admin** for effortless assessment.
- **Cinematic Seat Map**: Glowing curved projection screen with ambient light beam, tier color language (Recliner, Prime, Classic), and live peer-change pulse animations.
- **"Best Available" Quick-Suggester**: 1-click contiguous seat finder for groups of 1, 2, 3, or 4 seats in optimal acoustic center rows.
- **Hold Expiry Warning Toast**: Automatic notification alerting the user when their 2-minute hold has $\le 30$ seconds remaining.
- **Printable / Downloadable Ticket Passes**: Perforated boarding pass design with tear-off notches, barcode, simulated QR code, and browser print stylesheet.
- **Full Keyboard Accessibility**: Arrow key navigation (`Up`, `Down`, `Left`, `Right`) across the 10x10 seat grid; `Space`/`Enter` to toggle selection.
- **Responsive down to 360px**: Fluid layout with touch targets and horizontal scroll preservation on mobile devices.

### 🛡️ Concurrency & Data-Integrity Layer
- **PostgreSQL Row-Level Locking (`SELECT ... FOR UPDATE`)**: Taken in deterministic ascending seat ID order to eliminate race conditions and avoid deadlocks.
- **User Row Lock Serialization**: Serializes concurrent requests per user to make the 4-seat limit race-free.
- **Database CHECK Constraints**: `CHECK` constraints on `seats` ensure invalid combinations (e.g. held without expiry or booked without booking ID) are unrepresentable.
- **Idempotency Protection**: `UNIQUE (user_id, idempotency_key)` on bookings ensures double-clicks and network retries return the same confirmed booking.
- **Graceful Conflict Handling**: Users who lose a seat race receive HTTP 409 with code `SEAT_UNAVAILABLE` and friendly guidance — never a 5xx error.
- **Projection-Based Hold Expiry**: Reads project expired holds as `available` immediately at SQL query time, eliminating dependence on timer accuracy.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Database** | PostgreSQL 16+ (Row locks, partial indexes, constraints) |
| **Backend** | Node.js, Express, Socket.IO, JWT, bcrypt, Helmet, CORS |
| **Frontend** | React 18, Vite, Bricolage Grotesque & DM Sans typography |
| **Deployment** | Render Web Service + Managed PostgreSQL (Single repo) |

---

## Quickstart

### Prerequisites
- Node.js 18+
- PostgreSQL 13+

### Local Installation

```bash
git clone https://github.com/D5V-PUROHIT/TheTicketRoom.git
cd TheTicketRoom

# 1. Configure environment variables
cp .env.example .env
# Edit .env with your local or remote DATABASE_URL and JWT_SECRET

# 2. Install dependencies
npm install

# 3. Seed database (100 seats, 500 users, 1 admin)
npm run seed

# 4. Build client
npm run build

# 5. Start server
npm start
# App running at http://localhost:3000
```

---

## Seed Accounts & Credentials

| Role | Email | Password | Quick Action |
|---|---|---|---|
| **Demo User** | `user1@test.com` (up to `user500@test.com`) | `Test@1234` | Available via 1-Click chip |
| **Admin** | `admin@test.com` | `Admin@123` | Available via 1-Click chip |

---

## Concurrency Testing & Load Testing

### 1. Automated Concurrency Test Suite
```bash
npm test
```
- **Test 1 (200-User Race)**: 200 users simultaneously request the exact same 4 seats. Asserts exactly 1 winner, 199 graceful 409 responses, 0 server errors, and verifies idempotent duplicate booking replays.
- **Test 2 (300-User Overlap)**: 300 users pick random overlapping seats. Asserts disjointness: zero seats ever double-booked across all successful bookings.

### 2. Standalone 500-User Concurrent Load Test
```bash
npm run load-test
# Or test against a remote instance:
node scripts/load-test.js https://theticketroom.onrender.com
```
Fires 500 parallel user logins and simultaneous seat hold + confirmation races, then queries PostgreSQL to verify 0 double-bookings and 0 5xx errors.

---

## API Endpoints

All endpoints are prefixed with `/api`. Authenticated routes require `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Creates user account; returns token and user profile |
| `POST` | `/api/auth/login` | None | Validates credentials; returns token and user profile |
| `GET` | `/api/seats` | User | Fetches all 100 seats with effective live status and pricing |
| `POST` | `/api/holds` | User | Places or updates a 2-minute hold on `{ "seatIds": [1, 2] }` |
| `POST` | `/api/bookings` | User | Confirms live hold into a booking. Requires `Idempotency-Key` header |
| `GET` | `/api/bookings` | User | Retrieves user's confirmed bookings and seat labels |
| `DELETE` | `/api/bookings/:id` | User | Cancels user's booking and releases seats immediately |
| `GET` | `/api/admin/stats` | Admin | Real-time counts (Available, Held, Booked), revenue, and recent feed |

### WebSocket Events (Socket.IO)
- Handshake authenticated via JWT `socket.handshake.auth.token`.
- `seats:update`: Pushed to all clients on every hold, release, booking, cancellation, and expiry.
- `presence`: Broadcasts live count of connected users.

---

## Database Schema & Concurrency Design

Three primary tables:
1. `users`: ID, name, unique email, password hash, role (`user` or `admin`).
2. `seats`: Fixed 100 seats (`row_label`, `seat_number`), tier pricing (`price`), `status` (`available`, `held`, `booked`), `held_by`, `hold_expires_at`, and `booking_id`.
3. `bookings`: ID, `user_id`, `idempotency_key`, reference code (`CX...`), `total_price`, and `status`.

### Double-Booking Prevention Mechanics
- **Deterministic Lock Ordering**: Row locks (`SELECT ... FOR UPDATE`) are taken strictly in ascending seat ID order (`ORDER BY id`). This prevents deadlocks even when hundreds of requests target overlapping subsets.
- **User Serialization**: The user row is locked first (`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`), guaranteeing that a single user cannot bypass the 4-seat limit via concurrent requests.
- **All-or-Nothing Holds**: Multi-seat requests evaluate availability after all locks are held. If any seat is taken or held by another live session, the transaction rolls back cleanly with HTTP 409 `SEAT_UNAVAILABLE`.
- **Database CHECK Constraint**:
  ```sql
  CHECK (
    (status = 'available' AND held_by IS NULL AND booking_id IS NULL) OR
    (status = 'held' AND held_by IS NOT NULL AND hold_expires_at IS NOT NULL AND booking_id IS NULL) OR
    (status = 'booked' AND booking_id IS NOT NULL AND held_by IS NULL)
  )
  ```
