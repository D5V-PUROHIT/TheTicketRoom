import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

async function api(path, { method = 'GET', body, key } = {}) {
  const token = localStorage.getItem('token');
  let r;
  try {
    r = await fetch('/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: 'Bearer ' + token }),
        ...(key && { 'Idempotency-Key': key }),
      },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error('Network issue. Please check connection.'), { code: 'NETWORK' });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error(data.error?.message || 'Something went wrong'), { code: data.error?.code });
  }
  return data;
}

const inr = (n) => '₹' + n;
const pad = (n) => String(n).padStart(2, '0');
const rows = 'ABCDEFGHIJ'.split('');

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [view, setView] = useState('book'); // 'portal', 'book', 'mine', 'admin'
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const timer = useRef();

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3800);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setView('portal');
    notify('Signed out successfully', 'ok');
  }, [notify]);

  const onAuthSuccess = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    setShowAuthModal(false);
    setView('book');
    notify(`Welcome back, ${data.user.name}!`, 'ok');
  };

  const openAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    const s = io({ auth: { token } });
    s.on('presence', (count) => setOnline(count || 1));
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [user]);

  return (
    <>
      {/* BMS Top Navigation (Only shown when on portal/tickets/admin) */}
      {view !== 'book' && (
        <header className="portal-nav">
          <div className="portal-nav-inner">
            <div className="brand" onClick={() => setView(user ? 'book' : 'portal')}>
              <span>book</span><span className="dark">my</span><span>show</span>
            </div>

            <div className="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search for Movies, Events, Plays, Sports and Activities" readOnly />
            </div>

            <div className="nav-actions">
              <div className="venue-select">
                <span>Mumbai</span>
                <span style={{ fontSize: 10 }}>▼</span>
              </div>

              {user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button
                    onClick={() => setView('book')}
                    style={{ fontWeight: 600, fontSize: 13, color: view === 'book' ? 'var(--bms-red)' : '#444' }}
                  >
                    Select Seats
                  </button>
                  <button
                    onClick={() => setView('mine')}
                    style={{ fontWeight: 600, fontSize: 13, color: view === 'mine' ? 'var(--bms-red)' : '#444' }}
                  >
                    My Bookings
                  </button>
                  {user.role === 'admin' && (
                    <button
                      onClick={() => setView('admin')}
                      style={{ fontWeight: 600, fontSize: 13, color: view === 'admin' ? 'var(--bms-red)' : '#444' }}
                    >
                      Admin
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: '#888' }}>Hi, {user.name.split(' ')[0]}</span>
                  <button onClick={logout} style={{ fontSize: 12, color: '#e11d48' }}>Sign out</button>
                </div>
              ) : (
                <button className="btn-bms-signin" onClick={() => openAuth('login')}>
                  Sign In
                </button>
              )}
            </div>
          </div>

          <div className="cat-bar">
            <div className="cat-bar-inner">
              <div className="cat-left">
                <span className="cat-item active" onClick={() => setView(user ? 'book' : 'portal')}>Movies</span>
                <span className="cat-item">Stream</span>
                <span className="cat-item">Events</span>
                <span className="cat-item">Plays</span>
                <span className="cat-item">Sports</span>
                <span className="cat-item">Activities</span>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <span className="cat-item">ListYourShow</span>
                <span className="cat-item">Corporates</span>
                <span className="cat-item">Offers</span>
                <span className="cat-item">Gift Cards</span>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main App Body */}
      <main>
        {/* Portal Landing View */}
        {view === 'portal' && (
          <LandingPortal onBook={() => (user ? setView('book') : openAuth('login'))} />
        )}

        {/* Theatre Seat Map (Exact BookMyShow Match) */}
        {view === 'book' && (
          <TheatreView
            user={user}
            socket={socket}
            notify={notify}
            logout={logout}
            online={online}
            onBack={() => setView(user ? 'mine' : 'portal')}
            onOpenAuth={() => openAuth('login')}
            onBookSuccess={() => setView('mine')}
          />
        )}

        {/* My Bookings View */}
        {view === 'mine' && (
          <MyBookings notify={notify} goBook={() => setView('book')} />
        )}

        {/* Admin Stats View */}
        {view === 'admin' && user?.role === 'admin' && (
          <AdminDashboard socket={socket} notify={notify} />
        )}
      </main>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          defaultMode={authMode}
          onClose={() => setShowAuthModal(false)}
          onAuth={onAuthSuccess}
          notify={notify}
        />
      )}

      {/* Toast Alert */}
      {toast && (
        <div className={`toast-bar ${toast.type}`} role="status">
          <span>{toast.type === 'ok' ? '✓' : '⚠️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </>
  );
}

/* ==========================================================
   LANDING PORTAL (BookMyShow Style)
   ========================================================== */
function LandingPortal({ onBook }) {
  return (
    <div className="hero-portal">
      <div className="hero-banner">
        <div className="poster-box">
          <span className="poster-art-badge">Hall 1 Exclusive</span>
          <div style={{ textAlign: 'center', margin: 'auto' }}>
            <div style={{ fontSize: 52 }}>🔭</div>
            <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, marginTop: 12 }}>
              Midnight at the Observatory
            </div>
            <div style={{ color: '#a78bfa', fontSize: 12 }}>IMAX 3D Experience</div>
          </div>
        </div>

        <div className="hero-content">
          <h1 className="hero-title">Midnight at the Observatory</h1>

          <div className="rating-bar">
            <span className="star-score">★ 9.4/10 <span>(48.2K Votes)</span></span>
            <span className="tech-pill">IMAX 3D</span>
            <span className="tech-pill">DOLBY ATMOS 7.1</span>
            <span className="tech-pill">4K LASER</span>
          </div>

          <div className="hero-meta">
            <span>2h 18m</span>
            <span>•</span>
            <span>Sci-Fi, Mystery, Cosmic Drama</span>
            <span>•</span>
            <span>English</span>
            <span>•</span>
            <span>Tonight, 10:00 PM</span>
          </div>

          <p className="hero-synopsis">
            When an unexplained deep-space celestial pulse disrupts Earth's deep-space observatory array, a team of astronomers races against the clock before the cosmic frequency terminates at precisely 10:00 PM.
          </p>

          <div>
            <button className="btn-book-hero" onClick={onBook}>
              Book Tickets
            </button>
          </div>
        </div>
      </div>

      <div className="section-header">
        <h2>Recommended Movies</h2>
      </div>

      <div className="movies-grid">
        <article className="movie-card" onClick={onBook} style={{ cursor: 'pointer' }}>
          <div className="card-media">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44 }}>🔭</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>Midnight at the Observatory</div>
            </div>
          </div>
          <div className="card-body">
            <h3 className="card-title">Midnight at the Observatory</h3>
            <p className="card-genres">Sci-Fi • Mystery</p>
          </div>
        </article>

        <article className="movie-card">
          <div className="card-media" style={{ background: '#1c1917' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44 }}>🏹</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>Ramayana</div>
            </div>
          </div>
          <div className="card-body">
            <h3 className="card-title">Ramayana - Hindi</h3>
            <p className="card-genres">Mythology • Action</p>
          </div>
        </article>

        <article className="movie-card">
          <div className="card-media" style={{ background: '#172554' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44 }}>🚀</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>Starlight Horizon</div>
            </div>
          </div>
          <div className="card-body">
            <h3 className="card-title">Starlight Horizon</h3>
            <p className="card-genres">Sci-Fi • Adventure</p>
          </div>
        </article>

        <article className="movie-card">
          <div className="card-media" style={{ background: '#3b0764' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44 }}>⏳</div>
              <div style={{ fontWeight: 700, marginTop: 8 }}>Chronicles of Chronos</div>
            </div>
          </div>
          <div className="card-body">
            <h3 className="card-title">Chronicles of Chronos</h3>
            <p className="card-genres">Thriller • Mystery</p>
          </div>
        </article>
      </div>
    </div>
  );
}

/* ==========================================================
   THEATRE SEAT VIEW (Exact Match to User's BookMyShow Screenshot)
   ========================================================== */
function TheatreView({ user, socket, notify, logout, online, onBack, onOpenAuth, onBookSuccess }) {
  const [seats, setSeats] = useState({});
  const [cfg, setCfg] = useState({ maxSeats: 4, holdSeconds: 120 });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pulseIds, setPulseIds] = useState(new Set());
  const [warned30s, setWarned30s] = useState(false);
  const key = useRef(crypto.randomUUID());

  const merge = useCallback((list) => {
    setSeats((prev) => {
      const next = { ...prev };
      list.forEach((s) => (next[s.id] = s));
      return next;
    });
    const ids = new Set(list.map((s) => s.id));
    setPulseIds(ids);
    setTimeout(() => setPulseIds(new Set()), 600);
  }, []);

  const load = useCallback(() => {
    api('/seats')
      .then((d) => {
        setSeats(Object.fromEntries(d.seats.map((s) => [s.id, s])));
        setCfg(d);
      })
      .catch((e) => {
        if (e.code === 'UNAUTHENTICATED') {
          // If guest, load seats anyway or open auth
          api('/seats').catch(() => {});
        } else {
          notify(e.message, 'err');
        }
      });
  }, [notify]);

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    socket.on('seats:update', merge);
    socket.on('connect', load);
    return () => {
      socket.off('seats:update', merge);
      socket.off('connect', load);
    };
  }, [socket, load, merge]);

  const all = Object.values(seats).sort((a, b) => a.id - b.id);
  const mine = all.filter((s) => s.status === 'held' && s.held_by === user?.id);
  const expiry = mine.length ? Math.min(...mine.map((s) => +new Date(s.hold_expires_at))) : 0;
  const left = Math.max(0, Math.ceil((expiry - now) / 1000));

  useEffect(() => {
    if (mine.length > 0 && left === 0) {
      load();
      notify('Hold timed out. Please reselect your seats.', 'warn');
    }
  }, [left, mine.length, load, notify]);

  // 30-second expiry warning toast
  useEffect(() => {
    if (mine.length > 0 && left <= 30 && left > 0 && !warned30s) {
      notify(`⚠️ Hold expiring in ${left}s! Complete your booking now.`, 'warn');
      setWarned30s(true);
    }
    if (left > 30 || mine.length === 0) {
      setWarned30s(false);
    }
  }, [left, mine.length, warned30s, notify]);

  const total = mine.reduce((t, s) => t + s.price, 0);

  const pick = async (s) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (busy) return;
    const ids = mine.map((m) => m.id);
    const next = ids.includes(s.id) ? ids.filter((i) => i !== s.id) : [...ids, s.id];
    if (next.length > cfg.maxSeats) {
      return notify(`Maximum ${cfg.maxSeats} seats allowed per user`, 'err');
    }
    setBusy(true);
    try {
      const res = await api('/holds', { method: 'POST', body: { seatIds: next } });
      merge(res.seats);
    } catch (e) {
      notify(e.message, 'err');
      load();
    } finally {
      setBusy(false);
    }
  };

  // Quick Pick Best Contiguous Available Seats
  const quickSelect = async (groupSize) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (busy) return;
    const priorityRows = ['D', 'E', 'C', 'F', 'B', 'A', 'G', 'H', 'I', 'J'];
    let chosen = null;

    for (const r of priorityRows) {
      const rowSeats = all.filter((s) => s.row_label === r).sort((a, b) => a.seat_number - b.seat_number);
      for (let i = 0; i <= rowSeats.length - groupSize; i++) {
        const slice = rowSeats.slice(i, i + groupSize);
        const free = slice.every((s) => s.status === 'available' || (s.status === 'held' && s.held_by === user.id));
        if (free) {
          chosen = slice.map((s) => s.id);
          break;
        }
      }
      if (chosen) break;
    }

    if (!chosen) {
      return notify(`Could not find ${groupSize} seats together`, 'warn');
    }

    setBusy(true);
    try {
      const res = await api('/holds', { method: 'POST', body: { seatIds: chosen } });
      merge(res.seats);
      notify(`Selected ${groupSize} best seats!`, 'ok');
    } catch (e) {
      notify(e.message, 'err');
      load();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!user) return onOpenAuth();
    setBusy(true);
    try {
      await api('/bookings', { method: 'POST', key: key.current });
      key.current = crypto.randomUUID();
      notify('Booking Confirmed! Seats reserved.', 'ok');
      onBookSuccess();
    } catch (e) {
      if (e.code !== 'NETWORK') key.current = crypto.randomUUID();
      notify(e.message, 'err');
      load();
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const res = await api('/holds', { method: 'POST', body: { seatIds: [] } });
      merge(res.seats);
      notify('Seats released', 'ok');
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="theatre-screen-view">
      {/* Top Bar (Matches Screenshot) */}
      <div className="theatre-topbar">
        <div className="theatre-top-left">
          <button className="btn-theatre-back" onClick={onBack} title="Back">
            ❮
          </button>
          <div className="theatre-movie-meta">
            <h2>Midnight at the Observatory - English</h2>
            <div className="theatre-venue-sub">
              Galaxy Cinema: Cinemall, Mumbai | Tonight, 25 November, 2026 | 10:00 PM
            </div>
          </div>
        </div>

        <div className="theatre-top-right">
          <div className="ticket-selector-badge">
            <span>✏️</span>
            <span>{mine.length > 0 ? `${mine.length} Tickets` : '4 Tickets max'}</span>
          </div>
        </div>
      </div>

      {/* Showtimes Filter Bar (Matches Screenshot) */}
      <div className="showtimes-bar">
        <div className="showtime-pill">
          <span className="time">03:30 PM</span>
          <span className="audio">DOLBY 7.1</span>
        </div>
        <div className="showtime-pill">
          <span className="time">06:00 PM</span>
          <span className="audio">DOLBY 7.1</span>
        </div>
        <div className="showtime-pill active">
          <span className="time">10:00 PM</span>
          <span className="audio">DOLBY ATMOS</span>
        </div>
        <div className="showtime-pill">
          <span className="time">11:30 PM</span>
          <span className="audio">DOLBY 7.1</span>
        </div>
      </div>

      {/* Quick Pick Toolbar */}
      <div className="quick-pick-row">
        <div className="quick-pick-label">
          <span>⚡</span>
          <span>Quick Select:</span>
        </div>
        <div className="quick-pick-btns">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className="btn-qp"
              disabled={busy}
              onClick={() => quickSelect(n)}
            >
              {n === 1 ? '1 Seat' : `${n} Seats`}
            </button>
          ))}
        </div>
      </div>

      {/* Auditorium Seat Map */}
      <div className="auditorium-box">
        {/* Tier 1: ₹350 RECLINER (Row A - Top 10 Seats Full Width) */}
        <div className="tier-header-line">
          <span className="tier-header-title">{inr(350)} RECLINER</span>
        </div>
        {renderRow('A')}

        {/* Spacing / Aisle under top row */}
        <div style={{ height: 18 }} />

        {/* Tier 2: ₹250 CLUB (Rows B through F with 2 - 6 - 2 Aisle Split) */}
        <div className="tier-header-line">
          <span className="tier-header-title">{inr(250)} CLUB</span>
        </div>
        {['B', 'C', 'D', 'E', 'F'].map((r) => renderRow(r))}

        {/* Tier 3: ₹180 PREMIUM (Rows G through J with 2 - 6 - 2 Aisle Split) */}
        <div className="tier-header-line">
          <span className="tier-header-title">{inr(180)} PREMIUM</span>
        </div>
        {['G', 'H', 'I', 'J'].map((r) => renderRow(r))}

        {/* Screen at Bottom (Clean Screen Line like User Diagram) */}
        <div className="bms-diagram-screen">
          <div className="screen-bar-line" />
          <div className="screen-bar-text">Screen</div>
        </div>

        {/* BMS Legend (Matches User's Screenshot) */}
        <div className="bms-legend">
          <div className="bms-legend-item">
            <span className="bms-legend-box" />
            <span>Available</span>
          </div>
          <div className="bms-legend-item">
            <span className="bms-legend-box sold" />
            <span>Sold</span>
          </div>
          <div className="bms-legend-item">
            <span className="bms-legend-box held" />
            <span>Bestseller / Held</span>
          </div>
          <div className="bms-legend-item">
            <span className="bms-legend-box selected" />
            <span>Selected</span>
          </div>
        </div>

        {/* Floating Zoom Buttons (Matches Screenshot) */}
        <div className="floating-zoom">
          <button className="btn-zoom" title="Zoom in">+</button>
          <button className="btn-zoom" title="Zoom out">−</button>
        </div>
      </div>

      {/* Bottom Promo Strip (Matches Screenshot) */}
      <div className="bms-promo-strip">
        <span style={{ color: '#16a34a', fontWeight: 700 }}>✔</span>
        <span>YES Private Debit Card Offer: 20% instant discount applied at checkout</span>
        <span style={{ color: '#aaa' }}>• 1/3</span>
      </div>

      {/* Sticky Bottom Checkout Bar (When Seats Selected) */}
      {mine.length > 0 && (
        <div className="bms-checkout-bar">
          <div className="bms-checkout-inner">
            <div className="bms-checkout-left">
              <div className="bms-selected-seats-info">
                <span>Selected: </span>
                <b>{mine.map((s) => `${s.row_label}${pad(s.seat_number)}`).join(', ')}</b>
                <span style={{ color: '#777', marginLeft: 8 }}>({mine.length} seats)</span>
              </div>
              <div className={`bms-timer-pill ${left <= 30 ? 'urgent' : ''}`}>
                ⏳ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} remaining
              </div>
            </div>

            <div className="bms-checkout-right">
              <button className="btn-bms-release" onClick={release} disabled={busy}>
                Release
              </button>
              <button className="btn-bms-pay" onClick={confirm} disabled={busy || left === 0}>
                {busy ? 'Processing...' : `Pay ${inr(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderRow(r) {
    const rowSeats = all.filter((s) => s.row_label === r);

    // Row A: Top 10 seats span continuously across (as in user wireframe)
    if (r === 'A') {
      return (
        <div className="bms-seat-row row-a-full" key={r}>
          <span className="bms-row-letter">{r}</span>
          <div className="bms-seat-block full-10">
            {rowSeats.map((s) => renderSeatBtn(s))}
          </div>
          <span className="bms-row-letter" style={{ marginLeft: 12, marginRight: 0 }}>{r}</span>
        </div>
      );
    }

    // Rows B to J: 2 seats (Left Wing) | Aisle | 6 seats (Center Block) | Aisle | 2 seats (Right Wing)
    const leftBlock = rowSeats.slice(0, 2);
    const centerBlock = rowSeats.slice(2, 8);
    const rightBlock = rowSeats.slice(8, 10);

    return (
      <div className="bms-seat-row" key={r}>
        <span className="bms-row-letter">{r}</span>

        {/* Left Wing (2 Seats) */}
        <div className="bms-seat-block wing-2">
          {leftBlock.map((s) => renderSeatBtn(s))}
        </div>

        {/* Left Aisle Gap */}
        <div className="bms-aisle-gap" />

        {/* Center Block (6 Seats) */}
        <div className="bms-seat-block center-6">
          {centerBlock.map((s) => renderSeatBtn(s))}
        </div>

        {/* Right Aisle Gap */}
        <div className="bms-aisle-gap" />

        {/* Right Wing (2 Seats) */}
        <div className="bms-seat-block wing-2">
          {rightBlock.map((s) => renderSeatBtn(s))}
        </div>

        <span className="bms-row-letter" style={{ marginLeft: 12, marginRight: 0 }}>{r}</span>
      </div>
    );
  }

  function renderSeatBtn(s) {
    const isMine = s.status === 'held' && s.held_by === user?.id;
    const isPeerHeld = s.status === 'held' && s.held_by !== user?.id;
    const isSold = s.status === 'booked';
    const stClass = isMine ? 'mine' : isSold ? 'booked' : isPeerHeld ? 'held' : 'avail';
    const isPulsing = pulseIds.has(s.id);

    return (
      <button
        key={s.id}
        id={`seat-bms-${s.id}`}
        type="button"
        className={`bms-seat ${stClass} ${isPulsing ? 'peer-pulse' : ''}`}
        disabled={isSold || isPeerHeld}
        onClick={() => pick(s)}
        title={`Seat ${s.row_label}${pad(s.seat_number)} • ${inr(s.price)}`}
      >
        {pad(s.seat_number)}
      </button>
    );
  }
}

/* ==========================================================
   MY BOOKINGS VIEW
   ========================================================== */
function MyBookings({ notify, goBook }) {
  const [list, setList] = useState(null);

  const load = () =>
    api('/bookings')
      .then((d) => setList(d.bookings))
      .catch((e) => notify(e.message, 'err'));

  useEffect(() => {
    load();
  }, []);

  const cancel = async (b) => {
    if (!window.confirm(`Cancel booking ${b.reference}? Seats will be released.`)) return;
    try {
      await api(`/bookings/${b.id}`, { method: 'DELETE' });
      notify('Booking cancelled', 'ok');
      load();
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  if (!list) {
    return <div className="tickets-wrap"><p style={{ textAlign: 'center', padding: 40 }}>Loading tickets...</p></div>;
  }

  if (!list.length) {
    return (
      <div className="tickets-wrap" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h2>No bookings found</h2>
        <p style={{ color: '#777', margin: '8px 0 20px' }}>You haven't reserved any tickets yet.</p>
        <button className="btn-bms-signin" style={{ padding: '10px 24px' }} onClick={goBook}>
          Book Seats Now
        </button>
      </div>
    );
  }

  return (
    <div className="tickets-wrap">
      <h2>My Confirmed Bookings ({list.length})</h2>
      <div className="tickets-grid">
        {list.map((b) => (
          <article className="cinema-pass" key={b.id}>
            <div className="pass-header">
              <div>
                <h3>Midnight at the Observatory</h3>
                <span style={{ fontSize: 12, color: '#aaa' }}>Galaxy Cinema • Hall 1</span>
              </div>
              <b style={{ color: '#fbbf24', fontSize: 16 }}>{b.reference}</b>
            </div>
            <div className="pass-body">
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <b>Seats: </b>
                <span>{b.seats.map((s) => s.label).join(', ')}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 14 }}>
                <b>Total Paid: </b>
                <span style={{ color: 'var(--bms-green)', fontWeight: 700 }}>{inr(b.total_price)}</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  style={{ flex: 1, padding: 8, border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }}
                  onClick={() => window.print()}
                >
                  🖨️ Print Ticket
                </button>
                <button
                  type="button"
                  style={{ padding: '8px 14px', border: '1px solid #f87171', color: '#dc2626', borderRadius: 4, fontSize: 12 }}
                  onClick={() => cancel(b)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================
   ADMIN DASHBOARD
   ========================================================== */
function AdminDashboard({ socket, notify }) {
  const [s, setS] = useState(null);

  const load = useCallback(() => {
    api('/admin/stats').then(setS).catch((e) => notify(e.message, 'err'));
  }, [notify]);

  useEffect(() => {
    load();
    if (!socket) return;
    let t;
    const h = () => {
      clearTimeout(t);
      t = setTimeout(load, 300);
    };
    socket.on('seats:update', h);
    return () => {
      socket.off('seats:update', h);
      clearTimeout(t);
    };
  }, [socket, load]);

  if (!s) return null;

  return (
    <div className="admin-wrap">
      <h2>Auditorium Live Admin Stats</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, margin: '20px 0' }}>
        <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{s.available}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Available</div>
        </div>
        <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{s.held}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Held (2-Min Lock)</div>
        </div>
        <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#e11d48' }}>{s.booked}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Booked</div>
        </div>
        <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{inr(s.revenue)}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Revenue</div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================
   AUTH MODAL
   ========================================================== */
function AuthModal({ defaultMode = 'login', onClose, onAuth, notify }) {
  const [mode, setMode] = useState(defaultMode);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const fillDemo = (email, password) => {
    setMode('login');
    setF({ name: '', email, password });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: f });
      onAuth(data);
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-dialog">
        <div className="auth-header">
          <button className="btn-close-modal" onClick={onClose}>✕</button>
          <h3>{mode === 'login' ? 'Sign in to BookMyShow' : 'Create an Account'}</h3>
        </div>

        <div className="auth-body">
          <div className="demo-chips">
            <button
              type="button"
              className="btn-demo-chip"
              onClick={() => fillDemo('user1@test.com', 'Test@1234')}
            >
              ⚡ User 1 (Demo)
            </button>
            <button
              type="button"
              className="btn-demo-chip"
              onClick={() => fillDemo('admin@test.com', 'Admin@123')}
            >
              👑 Cinema Admin
            </button>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="auth-field">
                <label>Full Name</label>
                <input
                  type="text"
                  required
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </div>
            )}
            <div className="auth-field">
              <label>Email Address</label>
              <input
                type="email"
                required
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                required
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-auth-submit" disabled={busy}>
              {busy ? 'Please wait...' : mode === 'login' ? 'Continue' : 'Register & Continue'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5, color: '#666' }}>
            {mode === 'login' ? 'New to BookMyShow? ' : 'Already registered? '}
            <button
              type="button"
              style={{ color: 'var(--bms-red)', fontWeight: 600 }}
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
