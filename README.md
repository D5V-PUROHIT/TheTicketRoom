# TheTicketRoom

A full-stack, real-time cinema seat reservation and theatre operations platform built with **PostgreSQL, Express, Socket.IO, and React (Vite)**. Designed for high-concurrency ticketing workloads, strict transactional seat locking, idempotent checkout, automated showtime cutoffs, Indian GST slab invoicing, smart seat recommendations, and role-based back-office operations.

**Live Application:** [https://theticketroom.onrender.com](https://theticketroom.onrender.com)

---

## Core Capabilities

### Customer Booking Experience
- **Movie Portal & Showtime Discovery**: Displays active screenings alongside upcoming releases with synopsis, audio formats, ratings, and live showtime availability.
- **Interactive 100-Seat Auditorium Map**: Renders a `10x10` seating layout with **Recliner (Row A)**, **Club (Rows B–F, 2-6-2 aisle split)**, and **Premium (Rows G–J, 2-6-2 aisle split)**.
- **Real-Time Live Sync**: WebSockets (`Socket.IO`) broadcast seat holds, confirmations, cancellations, and showtime updates across connected browsers alongside live viewer presence counts.
- **Customer Seat Quota**: Enforces a strict **4-seat maximum per user per show**, highlights already-owned booked seats in lavender, and tracks remaining quota in real time.
- **Smart Quick-Select Engine** (`frontend/src/utils/smartSeatSuggester.js`):
  - **1 Seat**: Randomly selects an available seat in **Recliner → Club → Premium** priority order.
  - **2 Seats**: Prioritizes left/right wing pairs (**`1–2`** or **`9–10`**), then adjacent pairs inside center rows (**`3–8`**), falling back to the two closest single seats if no adjacent pair exists.
  - **3 or 4 Seats**: Prioritizes contiguous seats inside center **`3–8`**, falling back to continuous row availability or the tightest cluster of nearby seats.
- **2-Minute Seat Hold Timer & QR e-Tickets**: Holds selected seats with a countdown timer and urgency alert (`<= 30s`), supports promo codes and one-click ticket cancellation, and generates scannable QR code boarding passes.

### Concurrency Safety & Transactional Integrity
- **Deadlock-Free Row Locking**: Seat IDs are deduplicated and locked in strictly ascending order (`SELECT ... FOR UPDATE ORDER BY id`) inside PostgreSQL transactions.
- **User-Row Serialization**: Locks the caller's row in `users` (`FOR UPDATE`) before evaluating quotas so concurrent parallel requests from the same account cannot exceed the 4-seat cap.
- **Atomic All-or-Nothing Holds**: If any seat in a multi-seat request is unavailable, the transaction rolls back and returns HTTP `409 SEAT_UNAVAILABLE`.
- **Idempotent Checkout**: Unique database constraint on `(user_id, idempotency_key)` ensures duplicate clicks or network retries safely replay the confirmed booking (`HTTP 200`, `replayed: true`) without double charging.
- **Automatic Hold & Showtime Sweeper**: A background task runs every `3 seconds` to release expired 2-minute holds and transition past shows cleanly.

### Showtime Lifecycle & Schedule Protection
- **Automatic Booking Cutoff**: Holds and checkout stop immediately once a show reaches `starts_at` (configurable earlier via `BOOKING_CUTOFF_MINUTES`), returning `409 SHOW_STARTED` / `BOOKING_CLOSED`.
- **Auto-Close & Public Filtering**: Open show queries exclude expired shows immediately, and the background sweeper marks them `closed` while preserving all confirmed bookings and releasing uncommitted holds.
- **Schedule & Cancellation Locks**: Once `booked > 0`, admins cannot modify that show's date/time (`409 SCHEDULE_LOCKED`) or cancel it (`409 SHOW_HAS_BOOKINGS`); new screenings must be added as separate showtimes. Unbooked shows (`0` tickets sold) remain editable and cancellable.

### Indian GST Slabs & Platform Pricing
Configured identically in `backend/services/gstAndPricingService.js` and `frontend/src/utils/pricingCalculator.js`:
- **Ticket Price <= ₹100**: **5% GST** (`2.5% CGST + 2.5% SGST`)
- **Ticket Price > ₹100**: **18% GST** (`9% CGST + 9% SGST`)
- **Platform Fee**: Flat **₹20** per booking (no extra tax applied to the Platform Fee)

### Admin Dashboard & Role-Based Access Control (RBAC)
Server-enforced permissions (`requireRole(...)`) power a 6-tab operations portal:
1. **Live Monitoring & KPIs**: Available/held/booked seat counters, revenue totals, schedule controls, and live booking stream.
2. **Shows & Schedule**: Manage unbooked show schedules, create additional showtimes with custom per-tier pricing, and monitor capacity per screening.
3. **Movie Catalogue**: Publish new upcoming titles with metadata, posters, and premiere dates.
4. **Customer Support**: Search reservations by booking reference (`CX...`), customer email, or name, and process cancellations/refunds with mandatory audit reasons.
5. **Finance & Reports**: View gross ticket revenue, discounts, platform fees, and CGST + SGST totals, with one-click CSV ledger export.
6. **Audit Log & Moderation**: Inspect the append-only `audit_logs` register and suspend/reactivate user accounts.

---

## Project Structure

```text
TheTicketRoom/
├── backend/                              # Node.js / Express API, PostgreSQL & Socket.IO server
│   ├── server.js                         # Boots HTTP + Socket.IO server and runs DB startup setup
│   ├── createApp.js                      # Configures Express, middleware, routes, static hosting & sweeper
│   ├── config/
│   │   └── bookingRules.js               # Seat limits, hold timer, booking cutoff & GST slab constants
│   ├── database/
│   │   ├── connection.js                 # PostgreSQL connection pool and runTransaction() helper
│   │   ├── schema.sql                    # Tables, constraints, indexes, and foreign keys
│   │   ├── startupSetup.js               # Startup schema verification, auto-seed, migrations & sequences
│   │   └── seedSampleData.js             # CLI seed script (npm run seed)
│   ├── middleware/
│   │   ├── authMiddleware.js             # JWT authentication and role-based access control (RBAC)
│   │   └── errorMiddleware.js            # AppError class, catchAsync() wrapper & error formatter
│   ├── services/
│   │   ├── gstAndPricingService.js       # Subtotal, discounts, CGST/SGST slabs & Platform Fee
│   │   ├── seatHoldService.js            # Row-locked 2-minute seat holds & quota enforcement
│   │   ├── ticketBookingService.js       # Idempotent booking confirmation & customer cancellation
│   │   ├── showCutoffService.js          # Booking cutoff enforcement & automatic show closure
│   │   ├── showScheduleService.js        # Transactional schedule updates & booked-show lock checks
│   │   ├── paymentGatewayService.js      # Razorpay test-mode order, signature verification & refunds
│   │   └── emailNotificationService.js   # Asynchronous non-blocking ticket notification queue
│   ├── utils/
│   │   ├── auditLogger.js                # Writes admin operations to immutable audit_logs
│   │   ├── seatBroadcast.js              # Pushes live WebSocket seat deltas per show
│   │   └── showtimeParser.js             # Parses human-readable dates/times into IST (+05:30) timestamps
│   └── routes/
│       ├── authRoutes.js                 # /api/auth/register & /api/auth/login
│       ├── movieAndShowRoutes.js         # /api/movie, /api/movies, /api/shows
│       ├── seatRoutes.js                 # /api/seats & /api/shows/:showId/seats
│       ├── bookingRoutes.js              # Holds, booking checkout, history & cancellation
│       ├── paymentAndCouponRoutes.js     # Coupon validation, payment orders & webhook verification
│       ├── healthRoutes.js               # /healthz database & uptime probe
│       └── admin/                        # Role-protected administrative routes
│           ├── adminOverviewRoutes.js    # /api/admin/stats
│           ├── adminMovieRoutes.js       # /api/admin/movies
│           ├── adminShowRoutes.js        # /api/admin/shows, schedule & seat blocking
│           ├── adminSupportRoutes.js     # /api/admin/bookings & support cancellations
│           ├── adminFinanceRoutes.js     # /api/admin/finance/summary & CSV export
│           └── adminAuditAndUserRoutes.js# /api/admin/audit-logs & user moderation
│
├── frontend/                             # React 18 + Vite client application
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js                    # Local proxy for /api and /socket.io
│   ├── public/                           # Movie posters & SVG assets
│   └── src/
│       ├── main.jsx                      # React root entry point
│       ├── App.jsx                       # Application state, Socket.IO listeners & view routing
│       ├── constants/moviesData.js       # Default active screening & upcoming catalogue metadata
│       ├── services/apiClient.js         # Authenticated fetch wrapper with Idempotency-Key support
│       ├── styles/appStyles.css          # Theme variables, auditorium layout, passes & print CSS
│       ├── utils/
│       │   ├── formatters.js             # Currency, date/time pickers & role helpers
│       │   ├── pricingCalculator.js      # Client-side CGST/SGST slab & Platform Fee breakdown
│       │   └── smartSeatSuggester.js     # Smart seat selection rules (1, 2, 3, or 4 seats)
│       └── components/
│           ├── common/                   # Navbar (with profile menu), Footer, AuthModal, Toast, PolicyModal
│           ├── customer/                 # HomeMoviePortal, MovieDetailsPage, SeatMapBookingPage,
│           │                             # BookingConfirmedModal, MyBookingsPage, TicketPassCard
│           └── admin/                    # AdminDashboard + 6 operational tabs & ShowScheduleFormCard
│
├── tests/                                # Automated Node test suite (npm test)
│   ├── concurrency.test.js               # 200-user race, 300-user overlap, multi-show & lock tests
│   ├── googleAuth.test.js                # Google OAuth ID-token login, linking & suspension checks
│   ├── gstSlabPricing.test.js            # 5% / 18% CGST+SGST & end-to-end invoice verification
│   ├── showBookingCutoff.test.js         # Showtime cutoff, SHOW_STARTED/BOOKING_CLOSED & auto-close tests
│   └── smartSeatSuggester.test.js        # Smart Quick-Select rules across tiers & fallbacks
│
├── scripts/                              # Load testing & operational scripts
│   ├── concurrentLoadTest.js             # 500-user Node.js concurrent booking stress test
│   ├── race.k6.js                        # k6 50-VU simultaneous hot-seat race & idempotency test
│   └── resetHallSeats.js                 # Database reset helper (clears bookings & releases seats)
│
├── package.json                          # Root scripts and backend dependencies
├── .env.example                          # Sample environment configuration
└── .gitignore
```

---

## API Endpoints

### Public & Customer Routes
| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new customer account |
| `POST` | `/api/auth/login` | Public | Authenticate user or staff; returns JWT token |
| `POST` | `/api/auth/google` | Public | Verify Google Sign-In ID token & issue JWT |
| `GET` | `/api/auth/google-config` | Public | Expose configured Google OAuth Client ID to client |
| `GET` | `/api/movie` | Public | Current active screening metadata & open booking flag |
| `GET` | `/api/movies` | Public | List active movies with bookable/scheduled shows |
| `GET` | `/api/movies/:id` | Public | Movie details and open/scheduled showtimes |
| `GET` | `/api/shows` | Public | List all bookable open shows (before cutoff) and scheduled shows |
| `GET` | `/api/shows/:showId/seats` | Optional Auth | Live 100-seat status map plus authenticated user's quota |
| `GET` | `/api/seats` | Optional Auth | Seat status map for Show `#1` |
| `POST` | `/api/shows/:showId/holds` | Authenticated | Place or update 2-minute hold on up to 4 seats |
| `POST` | `/api/holds` | Authenticated | Place 2-minute hold on Show `#1` seats |
| `POST` | `/api/shows/:showId/bookings` | Authenticated | Confirm held seats into a booking (requires `Idempotency-Key`) |
| `POST` | `/api/bookings` | Authenticated | Confirm held seats for Show `#1` |
| `GET` | `/api/bookings` | Authenticated | List caller's confirmed bookings and seat details |
| `DELETE` | `/api/bookings/:id` | Authenticated | Cancel reservation and release seats immediately |
| `POST` | `/api/coupons/validate` | Authenticated | Validate promo code (`TICKET50`, `CINEMA20`) |
| `POST` | `/api/payments/create-order` | Authenticated | Create test-mode payment order |
| `POST` | `/api/payments/webhook` | Gateway Signature | Verify Razorpay HMAC signature & update payment status |
| `GET` | `/healthz` | Public | Server uptime and PostgreSQL connectivity health check |

### Admin & Staff Routes (RBAC Protected)
| Method | Endpoint | Roles | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Any Staff | Seat availability KPIs, revenue, and recent bookings feed |
| `GET` | `/api/admin/movies` | Any Staff | List all movies in the catalogue |
| `POST` | `/api/admin/movies` | Operations / Super Admin | Publish a new movie title |
| `GET` | `/api/admin/shows` | Any Staff | List all screenings with live booked, held & available counts |
| `POST` | `/api/admin/shows` | Operations / Super Admin | Schedule a new showtime with 100 seats & tier prices |
| `PUT` | `/api/admin/shows/:id` | Operations / Super Admin | Update date/time or cancel show (blocked if `booked > 0`) |
| `PUT` | `/api/admin/movies/schedule` | Operations / Super Admin | Update unbooked show schedule (`409` if tickets sold) |
| `POST` | `/api/admin/shows/:showId/block-seats` | Operations / Super Admin | Block/unblock unbooked physical seats |
| `GET` | `/api/admin/bookings` | Support / Super Admin | Search bookings by reference, email, or customer name |
| `POST` | `/api/admin/bookings/:id/cancel` | Support / Super Admin | Cancel & refund customer booking with mandatory reason |
| `GET` | `/api/admin/finance/summary` | Finance / Super Admin | Gross revenue, discounts, platform fees & CGST/SGST totals |
| `GET` | `/api/admin/finance/export` | Finance / Super Admin | Export full financial ledger as CSV |
| `GET` | `/api/admin/audit-logs` | Super Admin | Retrieve latest 100 audit trail events |
| `GET` | `/api/admin/users` | Support / Super Admin | List users with booking totals and suspension status |
| `PUT` | `/api/admin/users/:id/suspend` | Super Admin | Suspend or unsuspend a customer account |

---

## Setup & Local Development

### Prerequisites
- **Node.js** `18+`
- **PostgreSQL** `14+`
- **k6** (optional, for running `scripts/race.k6.js`)

### Configuration
Copy `.env.example` to `.env` and configure your database connection and JWT secret:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/cinema
JWT_SECRET=replace-with-a-long-random-string
PORT=3000
PGSSL=false
```

Optional environment variables:
- `GOOGLE_CLIENT_ID`: Google Cloud Web OAuth Client ID to enable "Continue with Google" sign-in.
- `BOOKING_CUTOFF_MINUTES` (default `0`): Closes online holds/bookings that many minutes before `starts_at`.
- `PG_MAX_POOL` (default `50`): PostgreSQL connection pool size.
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`: Gateway credentials for payment order/webhook signatures.

### Installation & Run

```bash
# 1. Install backend dependencies
npm install

# 2. Seed database (hall, 4 movies, 3 shows, 300 seats, 500 customers, staff, coupons)
npm run seed

# 3. Install frontend dependencies and build production bundle (frontend/dist)
npm run build

# 4. Start the server (http://localhost:3000)
npm start
```

For active development, run `npm run dev` (watches `backend/server.js`) and `npm --prefix frontend run dev` (Vite dev server proxying `/api` and `/socket.io` to port `3000`).

---

## Testing & Load Verification

### 1. Automated Test Suite (`npm test`)
Runs **17 automated tests** covering concurrency, Google Sign-In, GST slabs, showtime cutoffs, and smart seat selection:
- `tests/concurrency.test.js`: 200-user same-seat race, 300-user random overlap, multi-show isolation, and strict showtime lock/cancel rules.
- `tests/googleAuth.test.js`: Google OAuth token verification, account creation/linking, password-login guard, and suspension checks.
- `tests/gstSlabPricing.test.js`: 5% (`<= ₹100`) and 18% (`> ₹100`) CGST+SGST slabs, mixed-tier orders, flat `₹20` Platform Fee, and end-to-end API verification.
- `tests/showBookingCutoff.test.js`: IST date/time parsing, `409 SHOW_STARTED` / `BOOKING_CLOSED` enforcement on holds and confirmations, public query exclusion, and automated closing via `closeExpiredShows()`.
- `tests/smartSeatSuggester.test.js`: All tier priority, corner-pair, center `3–8`, and close-proximity fallback paths.

### 2. k6 Concurrency Race Test
Requires [k6](https://k6.io/):

```bash
# Target live Render deployment (creates real booking for 4 seats)
k6 run scripts/race.k6.js

# Target local server
k6 run -e BASE_URL=http://127.0.0.1:3000 scripts/race.k6.js
```

Verified against `https://theticketroom.onrender.com` with 50 simultaneous VUs racing for seats `A1–A4`: `1` hold win, `49` graceful `409 SEAT_UNAVAILABLE` conflicts, `1` confirmed booking, `1` idempotent replay, `100%` checks passed (`103/103`), and `0.00%` server errors.

### 3. 500-User Node Stress Test & Hall Reset
```bash
# Run 500-user concurrent booking stress test against local or remote target
npm run load-test
# Or: node scripts/concurrentLoadTest.js http://localhost:3000

# Reset seats and clear bookings in PostgreSQL
node scripts/resetHallSeats.js --yes
```

---

## Seeded Demo Accounts

| Role | Email | Password |
|---|---|---|
| Customer | `user1@test.com` .. `user500@test.com` | `Test@1234` |
| Super Admin | `admin@test.com` | `Admin@123` |
| Operations | `ops@test.com` | `Ops@1234` |
| Support | `support@test.com` | `Support@1234` |
| Finance | `finance@test.com` | `Finance@1234` |
| Marketing | `marketing@test.com` | `Marketing@1234` |

Promo coupons active in seeded data: **`TICKET50`** (₹50 flat off, min order ₹200) and **`CINEMA20`** (20% off up to ₹100, min order ₹300).

---

## License & Commercial Notice

Commercial deployment of online cinema ticketing requires executed agreements with theatre exhibitors, licensed studio media assets, valid GSTIN invoicing, and compliance with applicable film certification and consumer refund rules.
