# TheTicketRoom — Real-Time Cinema Ticketing Platform

A production-grade, real-time cinema ticket reservation and admin platform built with **PostgreSQL, Express, Socket.IO, and React (Vite)**. Engineered for high concurrency (500+ simultaneous users racing for overlapping seats), strict row-level locking, idempotent payments, multi-show scheduling, Indian GST slab invoicing, smart seat suggestion, and role-based access control (RBAC).

**Live Deployment (Render):** [https://theticketroom.onrender.com](https://theticketroom.onrender.com)

---

## Clear Folder & File Map (Where Everything Lives)

```text
TheTicketRoom/
├── backend/                          # All Node.js API, database & business logic
│   ├── server.js                     # Starts HTTP + Socket.IO server & DB setup
│   ├── createApp.js                  # Express middleware, mounts routes, cleans expired holds
│   ├── config/
│   │   └── bookingRules.js           # 4-seat cap, 2-min hold timer, platform fee & GST rates
│   ├── database/
│   │   ├── connection.js             # PostgreSQL connection pool & transaction helper
│   │   ├── schema.sql                # SQL tables, constraints & indexes
│   │   ├── startupSetup.js           # Startup schema check, auto-seed & migrations
│   │   └── seedSampleData.js         # Manual seed script (npm run seed)
│   ├── middleware/
│   │   ├── authMiddleware.js         # JWT verification & admin role permission guards
│   │   └── errorMiddleware.js        # Standard error formatting & async route wrapper
│   ├── services/
│   │   ├── gstAndPricingService.js   # Ticket CGST+SGST slabs (5% <= Rs.100, 18% > Rs.100)
│   │   ├── seatHoldService.js        # Concurrency-safe 2-minute seat lock & 4-seat limit check
│   │   ├── ticketBookingService.js   # Booking confirmation (idempotent) & customer cancellation
│   │   ├── showScheduleService.js    # Locks show edits/cancellations once tickets are booked
│   │   ├── paymentGatewayService.js  # Razorpay test-mode order, signature & refund helper
│   │   └── emailNotificationService.js # Non-blocking e-ticket email queue
│   ├── utils/
│   │   ├── auditLogger.js            # Writes admin actions into append-only audit_logs
│   │   └── seatBroadcast.js          # Pushes live WebSocket seat changes to connected users
│   └── routes/
│       ├── authRoutes.js             # /api/auth/login & /api/auth/register
│       ├── movieAndShowRoutes.js     # Public movie details & showtime listings
│       ├── seatRoutes.js             # Seat map status + caller's 4-seat quota
│       ├── bookingRoutes.js          # Seat holds, booking checkout, My Bookings & cancel
│       ├── paymentAndCouponRoutes.js # Coupon validation, payment orders & webhooks
│       ├── healthRoutes.js           # /healthz server & DB check
│       └── admin/                    # Role-protected Admin Dashboard APIs
│           ├── adminOverviewRoutes.js     # KPI counts, revenue & live bookings feed
│           ├── adminMovieRoutes.js        # Movie catalogue list & create
│           ├── adminShowRoutes.js         # Add shows, edit/cancel unbooked shows, block seats
│           ├── adminSupportRoutes.js      # Booking search & customer support cancel/refund
│           ├── adminFinanceRoutes.js      # Finance summary & CSV report export
│           └── adminAuditAndUserRoutes.js # Audit trail viewer & user suspend/unsuspend
│
├── frontend/                         # React + Vite web application
│   ├── index.html
│   ├── vite.config.js                # Local dev proxy for /api and /socket.io
│   ├── public/                       # Movie posters & favicon
│   └── src/
│       ├── main.jsx                  # Mounts React app
│       ├── App.jsx                   # Root layout, auth state, Socket.IO & page switching
│       ├── constants/moviesData.js   # Featured movie & upcoming movies list
│       ├── services/apiClient.js     # Fetch helper attaching JWT token
│       ├── styles/appStyles.css      # Pastel theme, auditorium map & ticket styles
│       ├── utils/
│       │   ├── formatters.js         # Rupee, padding, calendar date/time helpers
│       │   ├── pricingCalculator.js  # Client-side GST slab calculator matching backend
│       │   └── smartSeatSuggester.js # Smart Quick-Select algorithm (1, 2, 3, 4 seats)
│       └── components/
│           ├── common/               # Navbar, Footer, AuthModal, TrustPolicyModal, ToastAlert
│           ├── customer/             # HomeMoviePortal, MovieDetailsPage, SeatMapBookingPage,
│           │                         # BookingConfirmedModal, MyBookingsPage, TicketPassCard
│           └── admin/                # AdminDashboard + 6 tabs + ShowScheduleFormCard
│
├── tests/                            # Automated verification suite (npm test)
│   ├── concurrency.test.js           # 200-user race, 300-user overlap, multi-show & lock rules
│   ├── gstSlabPricing.test.js        # 5% (<= Rs.100) & 18% (> Rs.100) GST slab tests
│   └── smartSeatSuggester.test.js    # Smart Quick-Select rules for 1, 2, 3 & 4 seats
│
├── scripts/
│   └── concurrentLoadTest.js         # 500-user load & zero-double-booking stress test
│
├── package.json                      # Root scripts: start, dev, build, seed, test, load-test
└── .env.example                      # DATABASE_URL, JWT_SECRET, PORT, PGSSL
```

---

## Indian GST Slab Rules (Effective Sept 22, 2025)

- **Ticket price up to ₹100**: **5% GST** (`2.5% CGST + 2.5% SGST`)
- **Ticket price above ₹100**: **18% GST** (`9% CGST + 9% SGST`)
- **Platform Fee (₹20 flat)**: Flat fee per booking (no extra GST on Platform Fee)

Both `backend/services/gstAndPricingService.js` and `frontend/src/utils/pricingCalculator.js` calculate this identically so the checkout button total always matches the invoice stored in PostgreSQL.

---

## Smart Seat Suggestion Algorithm (`frontend/src/utils/smartSeatSuggester.js`)

Tier priority order: **Recliner (Row A) → Club (Rows B–F) → Premium (Rows G–J)**.
- **1 Seat**: Randomly selects an available seat in Recliner first; if full, randomly in Club; if full, randomly in Premium.
- **2 Seats**: Prefers left/right corner pairs (`1–2` or `9–10`) first, then adjacent seats inside center block (`3–8`), falling back to the closest two single seats if no two adjacent seats exist anywhere.
- **3 or 4 Seats**: Prefers `3` or `4` adjacent seats inside center block (`3–8`) first, falling back to adjacent seats anywhere (continuous Row A) or the tightest cluster of close seats.

---

## Quickstart & Commands

```bash
# Configure environment
cp .env.example .env

# Seed database (Hall 1, Movies, Shows, Seats, 500 Test Users, Staff, Coupons)
npm run seed

# Build React frontend into frontend/dist
npm run build

# Run full test suite (concurrency + GST slabs + smart seat selection)
npm test

# Start server (http://localhost:3000)
npm start
```

---

## Seed Accounts

| Role | Email | Password |
|---|---|---|
| Customer | `user1@test.com` .. `user500@test.com` | `Test@1234` |
| Super Admin | `admin@test.com` | `Admin@123` |
| Operations | `ops@test.com` | `Ops@1234` |
| Support | `support@test.com` | `Support@1234` |
| Finance | `finance@test.com` | `Finance@1234` |
