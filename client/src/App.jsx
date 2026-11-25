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

const initialMovie = {
  title: 'Baahubali: The Beginning',
  date_str: 'Friday, 28 November, 2026',
  time_str: '10:00 PM',
  poster_url: '/baahubali.jpg',
  synopsis: 'In ancient Mahishmati, a daring young adventurer learns of his royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
  genre: 'Action • Epic • Mythology • Drama',
  language: 'Hindi, Telugu • Dolby Atmos 7.1'
};

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [view, setView] = useState('book'); // 'portal', 'book', 'mine', 'admin'
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(1);
  const [movie, setMovie] = useState(initialMovie);
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

  // Load movie info from backend
  const loadMovie = useCallback(() => {
    api('/movie')
      .then((d) => { if (d.movie) setMovie(d.movie); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMovie();
  }, [loadMovie]);

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    const s = io({ auth: { token } });
    s.on('presence', (count) => setOnline(count || 1));
    s.on('movie:update', (updatedMovie) => {
      setMovie(updatedMovie);
      notify(`Movie schedule updated: ${updatedMovie.title}`, 'ok');
    });
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [user, notify]);

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
          <LandingPortal
            movie={movie}
            onBook={() => (user ? setView('book') : openAuth('login'))}
          />
        )}

        {/* Theatre Seat Map (Exact BookMyShow Match) */}
        {view === 'book' && (
          <TheatreView
            user={user}
            movie={movie}
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
          <MyBookings movie={movie} notify={notify} goBook={() => setView('book')} />
        )}

        {/* Admin Stats View */}
        {view === 'admin' && user?.role === 'admin' && (
          <AdminDashboard
            socket={socket}
            movie={movie}
            setMovie={setMovie}
            notify={notify}
          />
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
function LandingPortal({ movie, onBook }) {
  return (
    <div className="hero-portal">
      <div className="hero-banner">
        <div className="poster-box" style={{ padding: 0 }}>
          <img
            src={movie.poster_url || '/baahubali.jpg'}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>

        <div className="hero-content">
          <h1 className="hero-title">{movie.title}</h1>

          <div className="rating-bar">
            <span className="star-score">★ 9.6/10 <span>(84.5K Votes)</span></span>
            <span className="tech-pill">4K LASER</span>
            <span className="tech-pill">DOLBY ATMOS 7.1</span>
            <span className="tech-pill">U/A 13+</span>
          </div>

          <div className="hero-meta">
            <span>2h 39m</span>
            <span>•</span>
            <span>{movie.genre}</span>
            <span>•</span>
            <span>{movie.language}</span>
            <span>•</span>
            <span>{movie.date_str} at {movie.time_str}</span>
          </div>

          <p className="hero-synopsis">
            {movie.synopsis}
          </p>

          <div>
            <button className="btn-book-hero" onClick={onBook}>
              Book Tickets ({movie.time_str})
            </button>
          </div>
        </div>
      </div>

      <div className="section-header">
        <h2>Recommended Movies</h2>
      </div>

      <div className="movies-grid">
        <article className="movie-card" onClick={onBook} style={{ cursor: 'pointer' }}>
          <div className="card-media" style={{ padding: 0 }}>
            <img
              src={movie.poster_url || '/baahubali.jpg'}
              alt={movie.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div className="card-body">
            <h3 className="card-title">{movie.title}</h3>
            <p className="card-genres">{movie.genre}</p>
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
function TheatreView({ user, movie, socket, notify, logout, online, onBack, onOpenAuth, onBookSuccess }) {
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
            <h2>{movie.title} - Hindi</h2>
            <div className="theatre-venue-sub">
              Galaxy Cinema: Cinemall, Mumbai | {movie.date_str} | {movie.time_str}
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

      {/* Showtimes Filter Bar: Single Selected Showtime at 10:00 PM */}
      <div className="showtimes-bar">
        <div className="showtime-pill active">
          <span className="time">{movie.time_str}</span>
          <span className="audio">DOLBY ATMOS</span>
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
        <span style={{ color: '#aaa' }}>• 1/1</span>
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
function MyBookings({ movie, notify, goBook }) {
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
                <h3>{movie.title}</h3>
                <span style={{ fontSize: 12, color: '#aaa' }}>Galaxy Cinema • Hall 1 • {movie.date_str} {movie.time_str}</span>
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
   ADMIN DASHBOARD VIEW (With Movie & Schedule Management)
   ========================================================== */
function AdminDashboard({ socket, movie, setMovie, notify }) {
  const [s, setS] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  // Form for changing date & time of active movie
  const [schedForm, setSchedForm] = useState({
    date_str: movie.date_str || 'Friday, 28 November, 2026',
    time_str: movie.time_str || '10:00 PM',
  });

  // Form for adding a new movie
  const [newMovieForm, setNewMovieForm] = useState({
    title: '',
    date_str: 'Friday, 28 November, 2026',
    time_str: '10:00 PM',
    poster_url: '/baahubali.jpg',
    genre: 'Action • Epic • Mythology',
    language: 'Hindi, Telugu • Dolby Atmos',
    synopsis: '',
    reset_hall: true,
  });

  const loadStats = useCallback(() => {
    api('/admin/stats').then(setS).catch((e) => notify(e.message, 'err'));
  }, [notify]);

  const loadHistory = useCallback(() => {
    api('/admin/movies').then((d) => setHistory(d.movies || [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
    loadHistory();
    if (!socket) return;
    let t;
    const h = () => {
      clearTimeout(t);
      t = setTimeout(loadStats, 300);
    };
    socket.on('seats:update', h);
    return () => {
      socket.off('seats:update', h);
      clearTimeout(t);
    };
  }, [socket, loadStats, loadHistory]);

  // Update schedule of active movie
  const handleUpdateSchedule = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/admin/movies/schedule', {
        method: 'PUT',
        body: schedForm,
      });
      setMovie(res.movie);
      notify(`Updated schedule to ${res.movie.date_str} at ${res.movie.time_str}`, 'ok');
      loadHistory();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  // Add new movie
  const handleAddNewMovie = async (e) => {
    e.preventDefault();
    if (!newMovieForm.title.trim()) return notify('Movie title is required', 'err');
    setBusy(true);
    try {
      const res = await api('/admin/movies', {
        method: 'POST',
        body: newMovieForm,
      });
      setMovie(res.movie);
      setSchedForm({ date_str: res.movie.date_str, time_str: res.movie.time_str });
      setNewMovieForm({
        title: '',
        date_str: 'Friday, 28 November, 2026',
        time_str: '10:00 PM',
        poster_url: '/baahubali.jpg',
        genre: 'Action • Epic • Drama',
        language: 'Hindi • Dolby Atmos',
        synopsis: '',
        reset_hall: true,
      });
      notify(`Active movie changed to: ${res.movie.title}!`, 'ok');
      loadHistory();
      loadStats();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-wrap">
      <h2>Cinema Administration & Control</h2>
      <p style={{ color: '#666', marginBottom: 20 }}>
        Manage screening movies, modify showtimes, and inspect live hall occupancy.
      </p>

      {/* Live Seat Stats Cards */}
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8, background: '#fafafa' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{s.available}</div>
            <div style={{ fontSize: 12, color: '#666' }}>Available Seats</div>
          </div>
          <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8, background: '#fafafa' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#d97706' }}>{s.held}</div>
            <div style={{ fontSize: 12, color: '#666' }}>Held by Users (2-Min)</div>
          </div>
          <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8, background: '#fafafa' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e11d48' }}>{s.booked}</div>
            <div style={{ fontSize: 12, color: '#666' }}>Confirmed Booked</div>
          </div>
          <div style={{ padding: 18, border: '1px solid #eee', borderRadius: 8, background: '#fafafa' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{inr(s.revenue)}</div>
            <div style={{ fontSize: 12, color: '#666' }}>Total Hall Revenue</div>
          </div>
        </div>
      )}

      {/* Active Screening & Change Date/Time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 28 }}>
        {/* Current Active Movie Card */}
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 20, background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16 }}>Current Active Movie</h3>
            <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
              NOW PLAYING 🟢
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <img
              src={movie.poster_url || '/baahubali.jpg'}
              alt={movie.title}
              style={{ width: 90, height: 130, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }}
            />
            <div style={{ fontSize: 13 }}>
              <h4 style={{ fontSize: 17, marginBottom: 4 }}>{movie.title}</h4>
              <p style={{ color: '#555', marginBottom: 6 }}><b>Screening:</b> {movie.date_str} at {movie.time_str}</p>
              <p style={{ color: '#666', marginBottom: 4 }}><b>Genre:</b> {movie.genre}</p>
              <p style={{ color: '#666', marginBottom: 4 }}><b>Audio:</b> {movie.language}</p>
              <p style={{ color: '#777', fontSize: 12, lineHeight: 1.4 }}>{movie.synopsis}</p>
            </div>
          </div>
        </div>

        {/* Change Date and Time Form */}
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 20, background: '#ffffff' }}>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>Change Date & Time</h3>
          <p style={{ color: '#666', fontSize: 12, marginBottom: 16 }}>
            Update the active showtime. Pushes immediately to all live clients.
          </p>

          <form onSubmit={handleUpdateSchedule}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Screening Date
              </label>
              <input
                type="text"
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
                value={schedForm.date_str}
                onChange={(e) => setSchedForm({ ...schedForm, date_str: e.target.value })}
                placeholder="e.g. Friday, 28 November, 2026"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                Showtime
              </label>
              <input
                type="text"
                required
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13 }}
                value={schedForm.time_str}
                onChange={(e) => setSchedForm({ ...schedForm, time_str: e.target.value })}
                placeholder="e.g. 10:00 PM"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              style={{
                background: 'var(--bms-green)',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: 4,
                fontWeight: 700,
                fontSize: 13,
                width: '100%'
              }}
            >
              {busy ? 'Saving...' : 'Update Showtime & Date'}
            </button>
          </form>
        </div>
      </div>

      {/* Add New Movie Form */}
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 22, background: '#ffffff', marginBottom: 28 }}>
        <h3 style={{ fontSize: 17, marginBottom: 4 }}>Add & Launch New Movie</h3>
        <p style={{ color: '#666', fontSize: 12.5, marginBottom: 18 }}>
          Switch the theatre to a brand new title. Previous movie will be safely saved in movie history.
        </p>

        <form onSubmit={handleAddNewMovie}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Movie Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Baahubali 2: The Conclusion"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                value={newMovieForm.title}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, title: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Poster URL / Path</label>
              <input
                type="text"
                placeholder="/baahubali.jpg or image URL"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                value={newMovieForm.poster_url}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, poster_url: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Premiere Date</label>
              <input
                type="text"
                required
                placeholder="e.g. Friday, 28 November, 2026"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                value={newMovieForm.date_str}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, date_str: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Showtime</label>
              <input
                type="text"
                required
                placeholder="e.g. 10:00 PM"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                value={newMovieForm.time_str}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, time_str: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Genre</label>
              <input
                type="text"
                placeholder="Action • Epic • Drama"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                value={newMovieForm.genre}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, genre: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Audio & Language</label>
              <input
                type="text"
                placeholder="Hindi • Telugu • Dolby Atmos"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4 }}
                value={newMovieForm.language}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, language: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Synopsis</label>
            <textarea
              rows={2}
              placeholder="Brief description of the movie story..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, font: 'inherit', fontSize: 13 }}
              value={newMovieForm.synopsis}
              onChange={(e) => setNewMovieForm({ ...newMovieForm, synopsis: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="reset-seats"
              type="checkbox"
              checked={newMovieForm.reset_hall}
              onChange={(e) => setNewMovieForm({ ...newMovieForm, reset_hall: e.target.checked })}
            />
            <label htmlFor="reset-seats" style={{ fontSize: 13, color: '#333', cursor: 'pointer' }}>
              Reset all 100 seats to Available for this new screening
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            style={{
              background: 'var(--bms-red)',
              color: '#fff',
              padding: '11px 24px',
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 14
            }}
          >
            {busy ? 'Publishing Movie...' : '🚀 Set as Active Movie & Update Hall'}
          </button>
        </form>
      </div>

      {/* Previous Movies History */}
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 22, background: '#ffffff' }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Movie History & Past Screenings</h3>
        <p style={{ color: '#666', fontSize: 12.5, marginBottom: 16 }}>
          Track past titles screened in Hall 1.
        </p>

        {history && history.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e0e0e0', color: '#666', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Movie</th>
                <th style={{ padding: '8px 10px' }}>Screening Date & Time</th>
                <th style={{ padding: '8px 10px' }}>Genre</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((m) => (
                <tr key={m.id || m.title} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>
                    <b>{m.title}</b>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {m.date_str} at {m.time_str}
                  </td>
                  <td style={{ padding: '10px', color: '#666' }}>{m.genre}</td>
                  <td style={{ padding: '10px' }}>
                    {m.active ? (
                      <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                        Active
                      </span>
                    ) : (
                      <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                        Archived
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888', padding: '14px 0' }}>No previous movies recorded yet.</p>
        )}
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
