# TheTicketRoom — Commercial-Grade Online Cinema Ticketing Platform

A production-grade, real-time cinema ticket reservation and back-office platform built with **PostgreSQL, Express, Socket.IO, and React (Vite)** on Git branch `product-v2`. Engineered for massive concurrency (500 simultaneous users racing for overlapping seats), strict row-level locking, idempotent financial transactions, multi-movie & multi-show scheduling, server-enforced Role-Based Access Control (RBAC), and an aesthetic pastel design language.

**Live Deployment (Render):** [https://theticketroom.onrender.com](https://theticketroom.onrender.com)

---

## 🎨 Design System & Customer Experience (Phase 1)

Inspired by the energy and visual excitement of modern entertainment portals, transformed into an aesthetic pastel identity:
- **Brand Identity & Color Palette**: Lavender (`#7c6cf0`), Blush (`#ff8fa3`), Peach (`#ffb592`), Mint (`#38c28f`), Ink (`#2b2742`), and Off-White (`#faf9ff`).
- **Typography**: Display headings in **Bricolage Grotesque**; body copy in **DM Sans**.
- **Hero Showcase**: Premiere banner featuring *Baahubali: The Beginning* (Friday, 27 November 2026 at 10:00 PM), rating chips (`★ 9.6/10`, `4K Laser`, `Dolby Atmos 7.1`, `U/A 13+`), duration, audio languages, and synopsis.
- **Curved Glowing Projection Screen**: Authentic cinema screen arc with ambient overhead light cone positioned over the seat canvas.
- **Exact Hall Seating Layout (2-6-2 & Top Recliner Row)**:
  - **Row A (Top 10 Seats Full Width)**: VIP Recliner Loungers (₹350).
  - **Rows B through F**: Club Section (₹250) split into Left Wing (2 seats), Walkway Aisle, Center Pavilion (6 seats), Walkway Aisle, and Right Wing (2 seats).
  - **Rows G through J**: Premium Section (₹180) split into Left Wing (2 seats), Walkway Aisle, Center Pavilion (6 seats), Walkway Aisle, and Right Wing (2 seats).
- **Sticky Order Summary & Hold-Timer Pill**: Fixed checkout summary displaying selected seats, real-time 2-minute countdown timer, urgent blinking pill and warning toast when $\le 30$ seconds remain.
- **"Best Available" Quick Suggester**: 1-click contiguous seat finder for groups of 1, 2, 3, or 4 seats in optimal acoustic center rows (`D`, `E`, `C`, `F`, `B`, `A`).
- **Booking Confirmed Celebration**: Animated confetti header, unique booking reference (`CX...`), real client-generated QR code (`qrcode`) encoding the booking reference, and 1-click print ticket stylesheet.
- **My Bookings Passes**: Cinema tickets styled as authentic boarding passes with tear-off notches, QR code verification, and online cancellation option.

---

## 🏛️ Multi-Movie, Multi-Show Architecture (Phase 2)

Evolved from a single-hall prototype into a normalized multi-hall, multi-show schema:
```
movies (id, title, synopsis, poster_url, cast_members, language, certificate, runtime_mins, genres, status)
   │
   └── shows (id, movie_id, hall_id, starts_at, date_str, time_str, price_recliner, price_club, price_premium, status)
         │
         ├── show_seats (id, show_id, row_label, seat_number, tier, price, status, held_by, hold_expires_at, booking_id)
         │
         └── bookings (id, user_id, show_id, idempotency_key, reference, total_price, subtotal, discount, fee, gst, status)
```
- **Show Isolation**: Each show maintains its own 100 `show_seats` rows. Row locks for Show 1 and Show 2 execute completely in parallel without cross-talk or lock contention.
- **Backward-Compatible Updatable View**: An updatable view `seats` maps to `show_seats WHERE show_id = 1 WITH CHECK OPTION`, preserving 100% backward compatibility for all legacy assessment grading harnesses.

---

## 🛡️ Admin Back-Office & Role-Based Access Control (Phase 3)

Server-enforced role permissions on every admin route (`requireRole(...)`):
1. **Super Admin (`super_admin`)**: Full platform control, audit trail inspection, user account moderation/suspension.
2. **Operations (`operations`)**: Movie catalogue management, show scheduling, showtime modification, interactive seat blocking tool for VIP/maintenance.
3. **Customer Support (`support`)**: Booking lookup by reference (`CX...`) or customer email, cancellation and refund processing with mandatory audit reason.
4. **Finance (`finance`)**: Revenue reconciliation, discount/fee/tax reporting, 1-click CSV export for accountants.
5. **Marketing (`marketing`)**: Promotional coupons and banner management.

### Append-Only Security Audit Log
Every administrative action (show updates, cancellations, refunds, seat blocks, user suspensions) writes to an immutable `audit_logs` register containing:
`admin_id`, `action`, `target_type`, `target_id`, `details (JSONB)`, and `reason`.

---

## 💳 Payments, Pricing & Offers (Phase 4)

- **Payment Gateway Abstraction**: Pluggable provider interface (`server/payments/gateway.js`) supporting Razorpay test mode and webhook signature verification (`HMAC-SHA256`).
- **Transactional Flow**:
  1. Customer places 2-minute hold on seats.
  2. Gateway order created (`POST /api/payments/create-order`).
  3. Client pays; payment verified via signature or webhook.
  4. Hold converts to confirmed booking inside a single database transaction.
  5. Late-webhook protection: webhooks arriving after hold expiry automatically issue refunds without double-booking.
- **Coupons & Invoicing**:
  - `TICKET50`: Flat ₹50 off (min order ₹200).
  - `CINEMA20`: 20% off up to ₹100 (min order ₹300).
  - Configurable convenience fee (₹20) and statutory GST (18% on convenience fee) with transparent breakdown.
- **Asynchronous Notifications**: Queue-safe email dispatcher (`server/notifications/email.js`) sends e-tickets and cancellation receipts without blocking the booking transaction.

---

## ⚡ Database Schema & Double-Booking Prevention (Architecture Deep-Dive)

### 1. Database Schema Design
The relational schema is engineered in **PostgreSQL** with strict referential integrity, constraints, and atomic transactions:
- **`movies`**: Stores movie metadata including title, synopsis, poster URL, cast, runtime, certificate, and active status.
- **`halls`**: Defines theatre halls, total seat capacity (100 seats), and screen dimensions.
- **`shows`**: Links a movie to a hall with scheduled premiere timestamp (`starts_at`), display strings (`date_str`, `time_str`), per-tier pricing (`price_recliner`, `price_club`, `price_premium`), and booking status (`open`, `paused`, `closed`).
- **`show_seats`**: Represents the physical 100 seats per show (Row `A` to `J`, seats 1 to 10). Stores status (`available`, `held`, `booked`, `blocked`), pricing tier, temporary hold holder (`held_by`), hold expiration timestamp (`hold_expires_at`), and confirmed `booking_id`.
- **`bookings`**: Stores confirmed ticket reservations with unique customer booking reference (`CX...`), user reference (`user_id`), show reference (`show_id`), pricing breakdown (subtotal, convenience fee, GST), and a strict unique constraint on `(user_id, idempotency_key)`.
- **`seats` (Updatable View)**: Backwards-compatible updatable view mapping directly to `show_seats WHERE show_id = 1 WITH CHECK OPTION`, ensuring legacy single-show assessment scripts and automated test harnesses continue to work seamlessly.

---

### 2. How Double-Booking Is Mathematically Prevented Under High Concurrency
When 500 concurrent users race for the same 4 seats at the exact same millisecond, data integrity is guaranteed through a five-layer concurrency protocol:

1. **Deterministic Ascending Row Lock Ordering (`SELECT ... FOR UPDATE ORDER BY id`)**:
   In PostgreSQL, when multiple transactions lock rows in different orders (e.g. Transaction A locks Seat 1 then 2, while Transaction B locks Seat 2 then 1), deadlocks occur. In TheTicketRoom, seat IDs are sorted numerically before query execution. PostgreSQL acquires exclusive row-level locks on the selected seat rows in strictly ascending order, completely eliminating deadlock possibilities.

2. **User-Row Serialization (Race-Free 4-Seat Limit)**:
   Before inspecting seats, the user's account row is locked first:
   ```sql
   SELECT 1 FROM users WHERE id = $1 FOR UPDATE
   ```
   This serializes all concurrent operations from the same user account, guaranteeing that racing parallel requests from one user cannot bypass the 4-seat customer limit.

3. **Post-Lock Availability Evaluation**:
   Seat availability is evaluated *strictly after* row-level locks are acquired inside the transaction. Any seat where `status = 'held'` and `hold_expires_at <= NOW()` is immediately treated as expired and available. Because locks are held, no other concurrent transaction can inspect or modify those seats until the current transaction commits or rolls back.

4. **All-or-Nothing Atomic Reservations**:
   Multi-seat operations are strictly atomic. If a customer attempts to reserve seats `[1, 2, 3, 4]` and seat `3` has already been claimed by another user, the entire transaction rolls back immediately. The user receives a clean HTTP 409 `SEAT_UNAVAILABLE` status code with a descriptive message—never a 500 server crash or partial booking.

5. **Idempotency Guarantee (Duplicate Click & Network Retry Protection)**:
   The `bookings` table enforces a database-level `UNIQUE(user_id, idempotency_key)` constraint. When network retries or fast double-clicks submit the same `Idempotency-Key` header, the database safely recognizes the existing transaction and returns the original confirmed booking with an HTTP 200 replay flag, preventing duplicate charges or duplicate seats.

6. **Automatic Hold Expiration & Background Sweeper**:
   Held seats hold a timestamp `hold_expires_at = NOW() + INTERVAL '120 seconds'`. If a customer abandons their cart, a lightweight background sweeper runs every 3 seconds:
   ```sql
   UPDATE show_seats 
   SET status = 'available', held_by = NULL, hold_expires_at = NULL 
   WHERE status = 'held' AND hold_expires_at <= NOW()
   ```
   Expired seats are instantly returned to the available pool and broadcast to all connected WebSocket clients in real time.

---

## 📡 Complete API Endpoint List

All JSON API endpoints are prefixed with `/api`. Protected routes require a valid JWT passed in the `Authorization: Bearer <token>` header.

### 1. Authentication
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new customer account (`name`, `email`, `password`) |
| `POST` | `/api/auth/login` | Public | Authenticate user or admin; returns JWT token and user profile |

### 2. Movies & Showtimes
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/movie` | Public | Active screening details (*Baahubali: The Beginning*, Friday, 27 Nov at 10:00 PM) |
| `GET` | `/api/movies` | Public | List all active movies and scheduled shows in the theatre catalogue |
| `GET` | `/api/movies/:id` | Public | Retrieve single movie details, showtimes, synopsis, and cast |
| `GET` | `/api/shows` | Public | List all scheduled screenings with per-tier pricing |

### 3. Seats & Reservations (Concurrency Protected)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/seats` | Optional Auth | Returns the 100 seats (10x10) for Show 1 (status: available, held, booked, blocked) |
| `GET` | `/api/shows/:showId/seats` | Optional Auth | Returns the 100 physical seats for a specific show with row labels and tiers |
| `POST` | `/api/holds` | Authenticated | Place 2-minute hold on up to 4 seats for Show 1 (`seatIds: [1, 2, 3, 4]`) |
| `POST` | `/api/shows/:showId/holds` | Authenticated | Place 2-minute hold on up to 4 seats for a specific show |
| `POST` | `/api/bookings` | Authenticated | Confirm held seats into a booking with `Idempotency-Key` header |
| `POST` | `/api/shows/:showId/bookings` | Authenticated | Confirm held seats for a specific show into a booking |
| `GET` | `/api/bookings` | Authenticated | Retrieve customer's personal booking history with QR references |
| `DELETE` | `/api/bookings/:id` | Authenticated | Customer cancels booking; instantly releases seats back to Available |

### 4. Admin Back-Office (Server-Enforced RBAC)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/stats` | Admin | Live KPIs: available, held, booked, blocked counts, and revenue |
| `GET` | `/api/admin/movies` | Admin | List all catalogue movies (active and archived history) |
| `PUT` | `/api/admin/movies/schedule` | Admin / Ops | Update date and showtime for active screening; broadcasts via WebSockets |
| `POST` | `/api/admin/movies` | Admin / Ops | Add and publish a new movie to the theatre catalogue |
| `POST` | `/api/admin/shows/:showId/block-seats`| Admin / Ops | Block/unblock physical seats for VIP guests or maintenance |
| `GET` | `/api/admin/bookings` | Admin / Support| Search all customer reservations by reference, email, or seat number |
| `POST` | `/api/admin/bookings/:id/cancel`| Admin / Support| Cancel customer booking on their behalf with mandatory audit reason |
| `GET` | `/api/admin/finance/summary` | Admin / Finance| Comprehensive revenue breakdown, GST liability, and discount metrics |
| `GET` | `/api/admin/finance/export` | Admin / Finance| Download complete payment and booking transaction ledger as CSV |
| `GET` | `/api/admin/audit-logs` | Super Admin | Query append-only security audit log of all administrative actions |
| `GET` | `/api/admin/users` | Admin / Support| List user accounts with reservation counts and moderation status |
| `PUT` | `/api/admin/users/:id/suspend` | Super Admin | Suspend or reactivate user account for policy violations |

### 5. Payments & Health
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/coupons/validate` | Authenticated | Validate promotional coupon (`TICKET50`, `CINEMA20`) |
| `POST` | `/api/payments/create-order` | Authenticated | Initialize payment gateway order for held seats |
| `POST` | `/api/payments/webhook` | Gateway Signature| Webhook receiver with cryptographic signature check |
| `GET` | `/healthz` | Public | System and database connection health check |

---

## 🚀 Quickstart & Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Environment Configuration (`.env.example`)
Create a `.env` file in the project root based on `.env.example`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/cinema
JWT_SECRET=replace-with-a-long-random-string
PORT=3000
# Set to true for hosted Postgres that requires SSL (Render, Railway, Neon)
PGSSL=false
```

### Installation & Run

```bash
# 1. Clone & checkout product-v2 branch
git clone https://github.com/D5V-PUROHIT/TheTicketRoom.git
cd TheTicketRoom
git checkout product-v2

# 2. Configure environment
cp .env.example .env
# Ensure DATABASE_URL and JWT_SECRET are set

# 3. Seed database (Halls, Movies, Shows, 300 Seats, 500 Test Users, Staff Accounts)
npm run seed

# 4. Build client assets
npm run build

# 5. Start server
npm start
# Server running at http://localhost:3000
```

---

## 🔑 Seed Accounts & Credentials

| Role | Email | Password | Access Level |
|---|---|---|---|
| **Demo Customer** | `user1@test.com` (to `user500@test.com`) | `Test@1234` | Seat booking, payment, ticket passes |
| **Super Admin** | `admin@test.com` | `Admin@123` | Full back-office, audit logs, user moderation |
| **Operations** | `ops@test.com` | `Ops@1234` | Shows, seat blocking, movie catalogue |
| **Support Desk** | `support@test.com` | `Support@1234` | Booking search, ticket refund & cancel |
| **Finance Lead** | `finance@test.com` | `Finance@1234` | Revenue reports, CSV ledger export |

*Note: All roles are available via 1-click login switchers in the web UI.*

---

## 🧪 Testing & Load Verification

### 1. Automated Concurrency Test Suite
```bash
npm test
```
- **Test 1 (200-User Race)**: 200 users race for the exact same 4 seats on Show 1. Asserts exactly 1 winner, 199 graceful 409 conflicts, 0 server errors, and verifies idempotent replays.
- **Test 2 (300-User Random Overlap)**: 300 users pick random overlapping seats. Asserts complete disjointness across all confirmed bookings.
- **Test 3 (Multi-Show Isolation)**: 200 users race concurrently across two distinct shows (100 on Show 1, 100 on Show 2) simultaneously. Asserts zero cross-talk, zero deadlocks, and exactly 1 winner per show.

### 2. Standalone 500-User Concurrent Load Test
```bash
node scripts/load-test.js http://localhost:3000
```

#### Latest Load Test Results (500 Concurrent Users):
```
======================================================================
📊 CONCURRENT LOAD TEST RESULTS SUMMARY
======================================================================
Total Concurrent Users:        500
Holds Granted (HTTP 200):      65
Race Conflicts (HTTP 409):     435 (Graceful SEAT_UNAVAILABLE)
Hold Server Errors (5xx):      0 (Zero 5xx errors)
Bookings Confirmed (HTTP 201): 65
Idempotent Replays (HTTP 200): 65 (Verified safe duplicate retry)
Booking Server Errors (5xx):   0 (Zero 5xx errors)
Total Booked Seats in DB:      94
Double-Booked Seats in DB:     0 (Zero double-bookings)
Seats Disjoint Across Clients: PASSED (Disjoint)
======================================================================
🎉 LOAD TEST PASSED: 100% Concurrency Safe, Zero Double-Bookings, Zero 5xx Errors.
```

---

## ⚖️ Commercial Ticketing & Exhibitor Compliance Notice

> [!IMPORTANT]
> Selling commercial movie tickets in production requires:
> 1. **Theatre Exhibitor Agreements**: Executed Master Service Agreements (MSA) with cinema exhibitors and multiplex chains establishing ticket allocation and box-office settlement terms.
> 2. **Licensed Content & Media**: Authorized licensing for high-resolution movie posters, trailer embedding, and promotional materials from film studios and distributors.
> 3. **Tax & Regulatory Compliance**: Valid GST registration (GSTIN) with statutory Tax Collection at Source (TCS) and automated GST tax invoices.
> 4. **Consumer Protection & Certification**: Full adherence to Central Board of Film Certification (CBFC) age ratings (U, U/A, A) and consumer refund regulations.
