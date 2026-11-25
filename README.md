# TheTicketRoom: Real-Time Seat Booking System

Real-time seat booking for a single screening (one movie, 10:00 PM, one hall, 100 seats in a 10 x 10 grid) built to stay correct when hundreds of users book at the same moment.

**Stack:** PostgreSQL, Node.js + Express, Socket.IO, React (Vite). The Express server also serves the built React app, so the whole project deploys as one web service plus one database.

## Features

- Register and login with bcrypt password hashing and JWT authentication (8 hour expiry)
- 10 x 10 seat map with Available, Held and Booked states, updated live for everyone over WebSockets
- Selecting seats places a 2 minute hold with a visible countdown; unconfirmed holds are released automatically
- Maximum 4 seats per user (counting seats already booked); confirmation is all-or-nothing
- Idempotent confirmation: double clicks and network retries never create duplicate bookings
- Clear `SEAT_UNAVAILABLE` response (HTTP 409) for users who lose a race
- My Bookings with ticket cards and cancellation
- Admin dashboard with live available / held / booked counts, revenue and latest bookings
- Extras: tiered pricing (Recliner, Prime, Classic), live "watching now" counter, price total for the current selection

## Setup

Requirements: Node.js 18+, PostgreSQL 13+.

```bash
git clone <repo-url> && cd cinema-booking
cp .env.example .env            # then edit DATABASE_URL and JWT_SECRET
createdb cinema                 # or create the database in any other way
npm install
npm run seed                    # creates tables, 100 seats, 500 users, 1 admin
npm run build                   # builds the React client into client/dist
npm start                       # http://localhost:3000
```

Development with hot reload: run `npm run dev` (API on port 3000) and, in a second terminal, `cd client && npm install && npm run dev` (UI on port 5173, proxied to the API).

### Environment variables (`.env.example`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign tokens (required) |
| `PORT` | HTTP port, defaults to 3000 |
| `PGSSL` | Set to `true` for hosted databases that require SSL |

### Seed script

`npm run seed` is safe to run repeatedly. It creates the schema, inserts the 100 seats, inserts any missing users, and resets the hall to empty (all seats available, all bookings removed).

### Credentials

| Role | Email | Password |
| --- | --- | --- |
| Users | `user1@test.com` to `user500@test.com` | `Test@1234` |
| Admin | `admin@test.com` | `Admin@123` |

### Tests

```bash
npm test
```

The suite runs against the database in `DATABASE_URL` (seed it first) and resets the hall before and after.

1. 200 users request the same 4 seats at the same instant. Asserts exactly one wins, every other response is a 409 `SEAT_UNAVAILABLE` (no 5xx), a duplicate confirmation with the same idempotency key returns the same booking, and the database holds exactly 4 booked seats under 1 booking.
2. 300 users each pick 4 random seats from the same 16 and hold then confirm. Asserts no seat appears in more than one booking and the booked-seat count matches the seats claimed by successful bookings.

### Deployment (Render)

Create a PostgreSQL instance and a Web Service from the repository. Build command `npm install && npm run build`, start command `npm start`, and set `DATABASE_URL`, `JWT_SECRET` and `PGSSL=true`. Run `npm run seed` once from the service shell.

## API

All endpoints are prefixed with `/api`. Errors use the shape `{ "error": { "code", "message" } }`. Authenticated routes expect `Authorization: Bearer <token>`.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | none | Create an account, returns token and user |
| POST | `/auth/login` | none | Sign in, returns token and user |
| GET | `/seats` | user | All 100 seats with effective status, plus limits |
| POST | `/holds` | user | Body `{ "seatIds": [1,2] }`. Replaces the caller's current selection; an empty array releases it. 409 `SEAT_UNAVAILABLE` if any seat is taken, 400 `MAX_SEATS` over the limit |
| POST | `/bookings` | user | Converts the caller's live hold into a booking. Requires an `Idempotency-Key` header. 409 `HOLD_EXPIRED` if there is no live hold |
| GET | `/bookings` | user | The caller's confirmed bookings |
| DELETE | `/bookings/:id` | user | Cancels the caller's booking and frees its seats |
| GET | `/admin/stats` | admin | Live counts, revenue and latest bookings |

WebSocket (Socket.IO, token passed in the handshake `auth`): the server emits `seats:update` with the changed seats whenever a seat is held, released, booked, cancelled or expires, and `presence` with the number of connected clients.

## Database schema and double-booking prevention

Three tables: `users` (role is `user` or `admin`), `seats` (one row per seat with `status`, `held_by`, `hold_expires_at` and `booking_id`) and `bookings` (reference code, total, status, and a `UNIQUE (user_id, idempotency_key)` constraint). A `CHECK` constraint on `seats` makes inconsistent states unrepresentable, for example a booked seat that also has a holder, and `UNIQUE (row_label, seat_number)` keeps the grid fixed at 100 seats.

Double-booking is prevented in the database, not in application memory. Every hold, confirmation and cancellation runs in a transaction that first takes `SELECT ... FOR UPDATE` row locks on the affected seats, always in ascending id order so concurrent requests queue instead of deadlocking. Availability is evaluated after the locks are held, so two requests can never both observe a seat as free. A request that finds any seat unavailable aborts the whole transaction, which gives all-or-nothing behaviour for multi-seat selections. Each transaction also locks the caller's user row first, which serialises one user's own concurrent requests and makes the 4-seat limit race-free.

Holds are stored on the seat row with an expiry timestamp. Reads treat an expired hold as available immediately, so correctness never depends on a timer, and a background sweep every 3 seconds persists the release and broadcasts it. Confirmation only accepts holds that are still live. Retries are handled by the idempotency key: the booking row is unique per user and key, so a repeated request returns the original booking instead of creating another.

## Assumptions

- The 4 seat limit counts both active holds and confirmed bookings for the same user.
- Selecting seats replaces the user's previous selection, and re-selecting a seat that is already held by the same user does not extend its 2 minute window.
- Cancelling a booking immediately returns the seats to Available. Payment is out of scope.
- The 500 seeded users share one bcrypt hash of the common password to keep seeding fast; hashes for newly registered users are salted individually.
- Registration is open and creates regular users only; the admin account is created by the seed script.
