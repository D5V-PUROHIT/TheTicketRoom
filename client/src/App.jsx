import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
    throw Object.assign(new Error('Network problem. Check connection and try again.'), { code: 'NETWORK' });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error(data.error?.message || 'Something went wrong'), { code: data.error?.code });
  }
  return data;
}

const inr = (n) => '₹' + n;
const rows = 'ABCDEFGHIJ'.split('');

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [tab, setTab] = useState('book'); // 'book', 'mine', 'admin', 'explore'
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authDefaultMode, setAuthDefaultMode] = useState('login');
  const timer = useRef();

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setTab('explore');
    notify('Signed out successfully', 'ok');
  }, [notify]);

  const onAuthSuccess = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    setShowAuthModal(false);
    setTab('book');
    notify(`Welcome back, ${data.user.name}!`, 'ok');
  };

  const openAuth = (mode = 'login') => {
    setAuthDefaultMode(mode);
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
      {/* Top Banner Notice */}
      <div className="top-notice">
        <span>🍿 Premiere Night:</span>
        <b>Midnight at the Observatory (IMAX 3D)</b>
        <span>• Tonight 10:00 PM • Hall 1 • Limited 100 Seats</span>
      </div>

      {/* BookMyShow Style Navigation Bar */}
      <header className="portal-nav">
        <div className="portal-nav-inner">
          <div className="brand" onClick={() => setTab(user ? 'book' : 'explore')}>
            <div className="brand-badge">🎟️</div>
            <span>TheTicketRoom<span className="brand-sub">.</span></span>
          </div>

          <div className="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input type="text" placeholder="Search for Movies, Events, Plays, Sports and Activities..." readOnly />
          </div>

          <div className="nav-actions">
            <div className="venue-pill">
              <span>📍</span>
              <span>Galaxy Cinema • <b>Hall 1</b></span>
            </div>

            {user ? (
              <>
                <nav className="nav-tabs" aria-label="Portal Navigation">
                  <button className={tab === 'book' ? 'on' : ''} onClick={() => setTab('book')}>
                    Book Seats
                  </button>
                  <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
                    My Tickets
                  </button>
                  {user.role === 'admin' && (
                    <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>
                      Admin
                    </button>
                  )}
                </nav>

                <div className="user-menu">
                  <div className="user-badge">
                    <span>👤</span>
                    <span>{user.name.split(' ')[0]}</span>
                    {user.role === 'admin' && <span className="role-pill">Admin</span>}
                  </div>
                  <button className="btn-signout" onClick={logout} title="Sign out">
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-suggest"
                  style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', padding: '8px 18px' }}
                  onClick={() => openAuth('login')}
                >
                  Sign In
                </button>
                <button
                  className="btn-suggest"
                  style={{ padding: '8px 16px' }}
                  onClick={() => openAuth('register')}
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Categories Bar */}
        <div className="cat-bar">
          <div className="cat-bar-inner">
            <span className="cat-item active" onClick={() => setTab(user ? 'book' : 'explore')}>🎬 Movies</span>
            <span className="cat-item">🍿 Stream (New)</span>
            <span className="cat-item">🎭 Live Events</span>
            <span className="cat-item">🎪 Plays & Comedy</span>
            <span className="cat-item">🏆 Sports</span>
            <span className="cat-item">🎁 Exclusive Offers</span>
            <span className="cat-item">💳 Gift Cards</span>
          </div>
        </div>
      </header>

      {/* Main View Router */}
      <main>
        {(!user || tab === 'explore') && (
          <LandingPortal
            onBookClick={() => (user ? setTab('book') : openAuth('login'))}
            onQuickDemo={(email, password) => {
              openAuth('login');
            }}
          />
        )}

        {user && tab === 'book' && (
          <Book
            user={user}
            socket={socket}
            notify={notify}
            logout={logout}
            online={online}
            goTickets={() => setTab('mine')}
          />
        )}

        {user && tab === 'mine' && <Mine notify={notify} goBook={() => setTab('book')} />}

        {user && user.role === 'admin' && tab === 'admin' && <Admin socket={socket} notify={notify} />}
      </main>

      {/* Auth Modal (BookMyShow Style) */}
      {showAuthModal && (
        <AuthModal
          defaultMode={authDefaultMode}
          onClose={() => setShowAuthModal(false)}
          onAuth={onAuthSuccess}
          notify={notify}
        />
      )}

      {/* Toast notifications */}
      {toast && (
        <div className={`toast-bar ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.type === 'ok' ? '✓' : toast.type === 'warn' ? '⚠️' : '✕'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </>
  );
}

/* ==========================================================
   LANDING ENTERTAINMENT PORTAL (BookMyShow Inspired)
   ========================================================== */
function LandingPortal({ onBookClick, onQuickDemo }) {
  return (
    <div className="hero-portal">
      {/* Blockbuster Hero Banner */}
      <section className="hero-banner" aria-label="Featured Movie">
        <div className="poster-box">
          <div className="poster-art">
            <div className="poster-celestial" />
            <div className="poster-telescope">🔭</div>
            <span className="poster-badge">Hall 1 Exclusive</span>
            <div className="poster-info">
              <h3>Midnight at the Observatory</h3>
              <p>IMAX 3D Experience</p>
            </div>
          </div>
        </div>

        <div className="hero-content">
          <div className="premiere-tag">
            <span className="live-pulse-dot" />
            <span>EXCLUSIVE PREMIERE • TONIGHT 10:00 PM</span>
          </div>

          <h1 className="hero-title">Midnight at the Observatory</h1>

          <div className="rating-bar">
            <div className="star-score">
              <span>★</span> 9.4/10 <span>(48.2K Votes)</span>
            </div>
            <span className="tech-pill">IMAX 3D</span>
            <span className="tech-pill">DOLBY ATMOS 7.1</span>
            <span className="tech-pill">4K LASER</span>
            <span className="tech-pill">U/A 13+</span>
          </div>

          <div className="hero-meta">
            <span><b>2h 18m</b></span>
            <span>•</span>
            <span>Sci-Fi, Mystery, Cosmic Drama</span>
            <span>•</span>
            <span>English, Hindi</span>
            <span>•</span>
            <span>Dir: Nolan Vance</span>
          </div>

          <p className="hero-synopsis">
            When an unexplained deep-space celestial pulse aligns with Earth's winter solstice, a reclusive astrophysicist discovers that the radio burst is not random noise — it is an encrypted countdown signaling at precisely 10:00 PM tonight.
          </p>

          <div className="hero-actions">
            <button className="btn-book-hero" onClick={onBookClick}>
              <span>🎟️</span>
              <span>Book Tickets Now (10:00 PM)</span>
            </button>
            <button className="btn-demo-quick" onClick={onBookClick}>
              <span>⚡</span>
              <span>1-Click Sign In (Demo)</span>
            </button>
          </div>
        </div>
      </section>

      {/* Recommended Movies Section (BookMyShow Style Carousel) */}
      <section className="section-wrap" aria-label="Recommended Movies">
        <div className="section-header">
          <div>
            <h2>Recommended Movies</h2>
            <p>Trending screenings with live seat selection</p>
          </div>
        </div>

        <div className="movies-grid">
          {/* Card 1: Our Active Movie */}
          <article className="movie-card">
            <div className="card-media" style={{ background: 'linear-gradient(180deg, #1e123d, #0b061d)' }}>
              <span className="card-badge-now">Now Showing</span>
              <div style={{ textAlign: 'center', margin: 'auto' }}>
                <div style={{ fontSize: 46 }}>🔭</div>
                <div style={{ color: '#c4b5fd', fontWeight: 700, fontSize: 13, marginTop: 8 }}>Observatory Hall 1</div>
              </div>
              <div className="card-rating-float">★ 9.4 <span>(48K)</span></div>
            </div>
            <div className="card-body">
              <h3 className="card-title">Midnight at the Observatory</h3>
              <p className="card-genres">Sci-Fi • Mystery • Cosmic Drama</p>
              <div className="card-footer">
                <span className="card-time">Tonight 10:00 PM</span>
                <button className="btn-card-book" onClick={onBookClick}>Book Seats</button>
              </div>
            </div>
          </article>

          {/* Card 2: Coming Soon */}
          <article className="movie-card">
            <div className="card-media" style={{ background: 'linear-gradient(180deg, #1b263b, #0d1b2a)' }}>
              <span className="card-badge-soon">Coming Friday</span>
              <div style={{ textAlign: 'center', margin: 'auto' }}>
                <div style={{ fontSize: 46 }}>🚀</div>
                <div style={{ color: '#93c5fd', fontWeight: 700, fontSize: 13, marginTop: 8 }}>IMAX Experience</div>
              </div>
              <div className="card-rating-float">★ 9.1 <span>(12K)</span></div>
            </div>
            <div className="card-body">
              <h3 className="card-title">Starlight Horizon</h3>
              <p className="card-genres">Adventure • Space Exploration</p>
              <div className="card-footer">
                <span className="card-time">Nov 28, 2026</span>
                <button className="btn-card-book" style={{ opacity: 0.6 }} disabled>Coming Soon</button>
              </div>
            </div>
          </article>

          {/* Card 3 */}
          <article className="movie-card">
            <div className="card-media" style={{ background: 'linear-gradient(180deg, #2d1a3c, #130a1c)' }}>
              <span className="card-badge-soon">Advance Booking</span>
              <div style={{ textAlign: 'center', margin: 'auto' }}>
                <div style={{ fontSize: 46 }}>⏳</div>
                <div style={{ color: '#f472b6', fontWeight: 700, fontSize: 13, marginTop: 8 }}>Dolby Atmos</div>
              </div>
              <div className="card-rating-float">★ 8.8 <span>(9K)</span></div>
            </div>
            <div className="card-body">
              <h3 className="card-title">Chronicles of Chronos</h3>
              <p className="card-genres">Thriller • Time Mystery</p>
              <div className="card-footer">
                <span className="card-time">Dec 01, 2026</span>
                <button className="btn-card-book" style={{ opacity: 0.6 }} disabled>Notify Me</button>
              </div>
            </div>
          </article>

          {/* Card 4 */}
          <article className="movie-card">
            <div className="card-media" style={{ background: 'linear-gradient(180deg, #1a2f2b, #091714)' }}>
              <span className="card-badge-soon">Festival Cut</span>
              <div style={{ textAlign: 'center', margin: 'auto' }}>
                <div style={{ fontSize: 46 }}>🌌</div>
                <div style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 13, marginTop: 8 }}>4K Laser</div>
              </div>
              <div className="card-rating-float">★ 9.5 <span>(31K)</span></div>
            </div>
            <div className="card-body">
              <h3 className="card-title">Nebula Whispers</h3>
              <p className="card-genres">Sci-Fi • Philosophical Drama</p>
              <div className="card-footer">
                <span className="card-time">Dec 05, 2026</span>
                <button className="btn-card-book" style={{ opacity: 0.6 }} disabled>Trailer</button>
              </div>
            </div>
          </article>
        </div>

        {/* Hall Amenities Row */}
        <div className="amenities-row">
          <div className="amenity-card rec">
            <div className="amenity-icon">🛋️</div>
            <div className="amenity-info">
              <h4>VIP Recliner (Rows A–B)</h4>
              <p>Plush motorized leather recliners, personal side table & in-seat food service.</p>
              <div className="amenity-price">{inr(350)} per seat</div>
            </div>
          </div>
          <div className="amenity-card prm">
            <div className="amenity-icon">🍿</div>
            <div className="amenity-info">
              <h4>Prime Center (Rows C–F)</h4>
              <p>Acoustic focal sweet spot with direct eye-level IMAX laser sightlines.</p>
              <div className="amenity-price">{inr(250)} per seat</div>
            </div>
          </div>
          <div className="amenity-card cls">
            <div className="amenity-icon">🎟️</div>
            <div className="amenity-info">
              <h4>Classic Stadium (Rows G–J)</h4>
              <p>Steep stadium tiered seating with panoramic perspective and clear Dolby sound.</p>
              <div className="amenity-price">{inr(180)} per seat</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ==========================================================
   AUTHENTICATION MODAL
   ========================================================== */
function AuthModal({ defaultMode = 'login', onClose, onAuth, notify }) {
  const [mode, setMode] = useState(defaultMode);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      <div className="auth-dialog" role="dialog" aria-modal="true">
        <div className="auth-header">
          <button className="btn-close-modal" onClick={onClose} aria-label="Close modal">✕</button>
          <h2>{mode === 'login' ? 'Welcome Back!' : 'Create Account'}</h2>
          <p>Book tickets for Midnight at the Observatory (Tonight 10:00 PM)</p>
        </div>

        <div className="auth-body">
          {/* Quick Demo Credentials Buttons */}
          <div className="demo-section">
            <div className="demo-header">
              <span className="demo-title">⚡ 1-Click Fast Demo Login</span>
              <span style={{ fontSize: 11, color: 'var(--mute)' }}>For Evaluators</span>
            </div>
            <div className="demo-chips">
              <button
                type="button"
                className="btn-demo-chip"
                onClick={() => fillDemo('user1@test.com', 'Test@1234')}
              >
                <span>👤</span>
                <span>User 1 (Demo)</span>
              </button>
              <button
                type="button"
                className="btn-demo-chip"
                onClick={() => fillDemo('admin@test.com', 'Admin@123')}
              >
                <span>👑</span>
                <span>Cinema Admin</span>
              </button>
            </div>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === 'login' ? 'on' : ''}`}
              onClick={() => setMode('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === 'register' ? 'on' : ''}`}
              onClick={() => setMode('register')}
            >
              New Registration
            </button>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="reg-name">Full Name</label>
                <div className="auth-input-wrap">
                  <input
                    id="reg-name"
                    type="text"
                    required
                    placeholder="e.g. Alex Morgan"
                    value={f.name}
                    onChange={(e) => setF({ ...f, name: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email Address</label>
              <div className="auth-input-wrap">
                <input
                  id="auth-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={f.email}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-pwd">Password</label>
              <div className="auth-input-wrap">
                <input
                  id="auth-pwd"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="btn-toggle-pwd"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-auth-submit" disabled={busy}>
              {busy ? 'Verifying...' : mode === 'login' ? 'Sign In & Select Seats' : 'Create Account & Continue'}
            </button>

            <div className="auth-footer-notice">
              <span>🔒</span>
              <span>2-minute concurrent hold lock guarantees no double-booking</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================
   BOOKING VIEW (Cinematic Seat Map & Real-time Holds)
   ========================================================== */
function Book({ user, socket, notify, logout, online, goTickets }) {
  const [seats, setSeats] = useState({});
  const [cfg, setCfg] = useState({ maxSeats: 4, holdSeconds: 120 });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pulseIds, setPulseIds] = useState(new Set());
  const [showCelebration, setShowCelebration] = useState(null);
  const [warnedExpiry, setWarnedExpiry] = useState(false);
  const key = useRef(crypto.randomUUID());

  // Merge seat updates from API or WebSocket
  const merge = useCallback((list) => {
    setSeats((prev) => {
      const next = { ...prev };
      list.forEach((s) => (next[s.id] = s));
      return next;
    });

    // Flash animation on peer-updated seats
    const ids = new Set(list.map((s) => s.id));
    setPulseIds(ids);
    setTimeout(() => setPulseIds(new Set()), 800);
  }, []);

  const load = useCallback(() => {
    api('/seats')
      .then((d) => {
        setSeats(Object.fromEntries(d.seats.map((s) => [s.id, s])));
        setCfg(d);
      })
      .catch((e) => {
        if (e.code === 'UNAUTHENTICATED') logout();
        else notify(e.message, 'err');
      });
  }, [logout, notify]);

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
  const mine = all.filter((s) => s.status === 'held' && s.held_by === user.id);
  const expiry = mine.length ? Math.min(...mine.map((s) => +new Date(s.hold_expires_at))) : 0;
  const left = Math.max(0, Math.ceil((expiry - now) / 1000));

  // Reload when hold expires
  useEffect(() => {
    if (mine.length && left === 0) {
      load();
      notify('Your hold expired. Please select your seats again.', 'warn');
    }
  }, [left, mine.length, load, notify]);

  // Warning toast when 30 seconds remain
  useEffect(() => {
    if (mine.length > 0 && left <= 30 && left > 0 && !warnedExpiry) {
      notify(`⚠️ Hold expiring in ${left}s! Please confirm your booking.`, 'warn');
      setWarnedExpiry(true);
    }
    if (left > 30 || mine.length === 0) {
      setWarnedExpiry(false);
    }
  }, [left, mine.length, warnedExpiry, notify]);

  const total = mine.reduce((t, s) => t + s.price, 0);
  const count = (st) => all.filter((s) => s.status === st).length;

  // Toggle seat selection
  const pick = async (s) => {
    if (busy) return;
    const ids = mine.map((m) => m.id);
    const next = ids.includes(s.id) ? ids.filter((i) => i !== s.id) : [...ids, s.id];
    if (next.length > cfg.maxSeats) {
      return notify(`Maximum limit is ${cfg.maxSeats} seats per user`, 'err');
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

  // Best Available Seats Suggester (Group of 1, 2, 3, or 4 contiguous seats)
  const suggestBest = async (groupSize) => {
    if (busy) return;
    // Search best rows in priority order: Center Prime (D, E, C, F), then Recliner (B, A), then Classic (G, H, I, J)
    const rowOrder = ['D', 'E', 'C', 'F', 'B', 'A', 'G', 'H', 'I', 'J'];
    let chosenIds = null;

    for (const r of rowOrder) {
      const rowSeats = all.filter((s) => s.row_label === r).sort((a, b) => a.seat_number - b.seat_number);
      // Look for contiguous available seats (or seats already held by me)
      for (let i = 0; i <= rowSeats.length - groupSize; i++) {
        const slice = rowSeats.slice(i, i + groupSize);
        const allAvailable = slice.every((s) => s.status === 'available' || (s.status === 'held' && s.held_by === user.id));
        if (allAvailable) {
          chosenIds = slice.map((s) => s.id);
          break;
        }
      }
      if (chosenIds) break;
    }

    if (!chosenIds) {
      return notify(`Could not find ${groupSize} seats together. Try picking individual seats.`, 'warn');
    }

    setBusy(true);
    try {
      const res = await api('/holds', { method: 'POST', body: { seatIds: chosenIds } });
      merge(res.seats);
      notify(`Selected ${groupSize} best available seats!`, 'ok');
    } catch (e) {
      notify(e.message, 'err');
      load();
    } finally {
      setBusy(false);
    }
  };

  // Keyboard navigation across the 10x10 seat map
  const handleSeatKeyDown = (e, s) => {
    const rowIdx = rows.indexOf(s.row_label);
    const colIdx = s.seat_number - 1; // 0 to 9
    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (e.key === 'ArrowUp' && rowIdx > 0) targetRow--;
    else if (e.key === 'ArrowDown' && rowIdx < rows.length - 1) targetRow++;
    else if (e.key === 'ArrowLeft' && colIdx > 0) targetCol--;
    else if (e.key === 'ArrowRight' && colIdx < 9) targetCol++;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      pick(s);
      return;
    } else {
      return;
    }

    e.preventDefault();
    const targetId = targetRow * 10 + targetCol + 1;
    const el = document.getElementById(`seat-btn-${targetId}`);
    if (el) el.focus();
  };

  // Confirm booking
  const confirm = async () => {
    setBusy(true);
    try {
      const res = await api('/bookings', { method: 'POST', key: key.current });
      key.current = crypto.randomUUID();
      setShowCelebration(res.booking);
    } catch (e) {
      if (e.code !== 'NETWORK') key.current = crypto.randomUUID();
      notify(e.message, 'err');
      load();
    } finally {
      setBusy(false);
    }
  };

  // Release all held seats
  const release = async () => {
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
    <div className="theatre-layout">
      {/* Header bar */}
      <div className="booking-header">
        <div>
          <h1>Midnight at the Observatory</h1>
          <p>Tonight, 10:00 PM • Hall 1 • Dolby Atmos 7.1 • 100 Seats</p>
        </div>
        <div className="live-presence">
          <span className="live-pulse-dot" style={{ background: '#10b981', boxShadow: '0 0 10px #10b981' }} />
          <span><b>{online}</b> watching seats live</span>
        </div>
      </div>

      {/* Main Seat Map Area */}
      <section className="theatre-card" aria-label="Interactive Seat Map">
        {/* Quick Best Available Suggester */}
        <div className="suggester-bar">
          <div className="suggester-title">
            <span>✨</span>
            <span>Best Available Quick-Pick:</span>
          </div>
          <div className="suggester-btns">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className="btn-suggest"
                disabled={busy}
                onClick={() => suggestBest(n)}
              >
                {n === 1 ? '1 Seat' : `${n} Together`}
              </button>
            ))}
          </div>
        </div>

        {/* Glowing Curved Screen */}
        <div className="screen-container">
          <div className="screen-curve">
            <span>Screen • Eye Level This Way</span>
          </div>
          <div className="screen-light-beam" />
        </div>

        {/* 10 x 10 Seat Chart */}
        <div className="seating-chart" role="grid" aria-label="Auditorium Seating Grid">
          {rows.map((r, rIdx) => {
            const isRecliner = r === 'A' || r === 'B';
            const isPrime = r === 'C' || r === 'D' || r === 'E' || r === 'F';
            const isFirstOfTier = r === 'A' || r === 'C' || r === 'G';

            return (
              <div key={r}>
                {isFirstOfTier && (
                  <div className={`seat-tier-divider ${isRecliner ? 'rec first' : isPrime ? 'prm' : 'cls'}`}>
                    <span>
                      {isRecliner ? '🛋️ VIP Recliner (Rows A–B)' : isPrime ? '🍿 Prime Acoustic (Rows C–F)' : '🎟️ Classic Stadium (Rows G–J)'}
                    </span>
                    <span>{isRecliner ? inr(350) : isPrime ? inr(250) : inr(180)}</span>
                  </div>
                )}

                <div className="seat-row" role="row">
                  <span className="row-label" aria-hidden="true">{r}</span>
                  <div className="row-seats">
                    {all.filter((s) => s.row_label === r).map((s) => {
                      const isMine = s.status === 'held' && s.held_by === user.id;
                      const isPeerHeld = s.status === 'held' && s.held_by !== user.id;
                      const st = isMine ? 'mine' : isPeerHeld ? 'held' : s.status;
                      const isPulsing = pulseIds.has(s.id);

                      return (
                        <button
                          key={s.id}
                          id={`seat-btn-${s.id}`}
                          type="button"
                          role="gridcell"
                          className={`seat-btn t${s.price} ${st} ${isPulsing ? 'peer-pulse' : ''}`}
                          disabled={st === 'booked' || st === 'held'}
                          onClick={() => pick(s)}
                          onKeyDown={(e) => handleSeatKeyDown(e, s)}
                          aria-label={`Seat ${r}${s.seat_number}, ${inr(s.price)}, ${
                            isMine ? 'Selected by you' : isPeerHeld ? 'Held by another user' : s.status
                          }`}
                          aria-selected={isMine}
                          title={`Seat ${r}${s.seat_number} • ${inr(s.price)} (${isMine ? 'Yours' : s.status})`}
                        >
                          {isMine ? '✓' : s.seat_number}
                        </button>
                      );
                    })}
                  </div>
                  <span className="row-label" aria-hidden="true">{r}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="seat-legend">
          <div className="legend-item">
            <span className="legend-box" />
            <span>Available ({count('available')})</span>
          </div>
          <div className="legend-item">
            <span className="legend-box mine" />
            <span>Selected by You ({mine.length})</span>
          </div>
          <div className="legend-item">
            <span className="legend-box held" />
            <span>Held by Others ({all.filter((s) => s.status === 'held' && s.held_by !== user.id).length})</span>
          </div>
          <div className="legend-item">
            <span className="legend-box booked" />
            <span>Booked ({count('booked')})</span>
          </div>
        </div>
      </section>

      {/* Sidebar: Hold & Checkout Panel */}
      <aside className="booking-sidebar">
        <div className="side-card">
          <h3>Your Selection</h3>

          <div className="chips-holder">
            {mine.length > 0 ? (
              mine.map((s) => (
                <span className="selected-chip" key={s.id}>
                  <span>Seat {s.row_label}{s.seat_number}</span>
                  <span style={{ opacity: 0.7 }}>({inr(s.price)})</span>
                </span>
              ))
            ) : (
              <span style={{ color: 'var(--mute)', fontSize: 13 }}>
                Click seats on the map or use Quick-Pick (max {cfg.maxSeats}).
              </span>
            )}
          </div>

          {mine.length > 0 && (
            <>
              <div className="bill-line">
                <span>Selected Seats</span>
                <b>{mine.map((s) => `${s.row_label}${s.seat_number}`).join(', ')}</b>
              </div>
              <div className="bill-line">
                <span>Tickets Count</span>
                <b>{mine.length} of {cfg.maxSeats} max</b>
              </div>
              <div className="bill-line total">
                <span>Total Amount</span>
                <b style={{ color: 'var(--accent)', fontSize: 18 }}>{inr(total)}</b>
              </div>

              {/* Hold Timer Box */}
              <div className="hold-timer-box">
                <div className="timer-header">
                  <span>Seats Locked For You</span>
                  <span className={`timer-digits ${left <= 30 ? 'urgent' : ''}`}>
                    {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
                  </span>
                </div>
                <div className="timer-track">
                  <div
                    className={`timer-fill ${left <= 30 ? 'urgent' : ''}`}
                    style={{ width: `${(left / cfg.holdSeconds) * 100}%` }}
                  />
                </div>
              </div>

              <button
                className="btn-confirm-booking"
                disabled={busy || left === 0}
                onClick={confirm}
              >
                {busy ? 'Securing Booking...' : `Confirm & Book (${inr(total)})`}
              </button>

              <button
                className="btn-release-hold"
                disabled={busy}
                onClick={release}
              >
                Release Seats
              </button>
            </>
          )}
        </div>

        {/* Perks Box */}
        <div className="side-card" style={{ background: '#faf9ff', borderColor: 'var(--accent-border)' }}>
          <h4 style={{ fontSize: 14, marginBottom: 8, color: 'var(--accent)' }}>🔒 100% Concurrency Safe</h4>
          <p style={{ fontSize: 12.5, color: 'var(--mute)', lineHeight: 1.5 }}>
            Seats are locked at PostgreSQL database row-level. Double-clicks and simultaneous bookings are mathematically impossible.
          </p>
        </div>
      </aside>

      {/* Booking Celebration Modal */}
      {showCelebration && (
        <div className="modal-backdrop">
          <div className="auth-dialog" style={{ textAlign: 'center', padding: '36px 28px' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 28, marginBottom: 6 }}>Booking Confirmed!</h2>
            <p style={{ color: 'var(--mute)', fontSize: 14, marginBottom: 20 }}>
              Your seats are reserved for <b>Midnight at the Observatory</b>.
            </p>

            <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: 12, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: 'var(--mute)' }}>BOOKING REFERENCE</div>
              <div style={{ fontFamily: 'Bricolage Grotesque', fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>
                {showCelebration.reference}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                Seats: {showCelebration.seats?.map((s) => s.label).join(', ')} • {inr(showCelebration.total_price)}
              </div>
            </div>

            <button
              className="btn-book-hero"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => {
                setShowCelebration(null);
                goTickets();
              }}
            >
              View My Tickets 🎟️
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================
   MY BOOKINGS VIEW (Printable Boarding Pass Style Tickets)
   ========================================================== */
function Mine({ notify, goBook }) {
  const [list, setList] = useState(null);

  const load = () =>
    api('/bookings')
      .then((d) => setList(d.bookings))
      .catch((e) => notify(e.message, 'err'));

  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  const cancel = async (b) => {
    if (!window.confirm(`Cancel booking ${b.reference}? Your seats (${b.seats.map((s) => s.label).join(', ')}) will be released to others.`)) return;
    try {
      await api(`/bookings/${b.id}`, { method: 'DELETE' });
      notify('Booking cancelled and seats released', 'ok');
      load();
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  const printTicket = (ref) => {
    window.print();
  };

  if (!list) {
    return (
      <div className="tickets-wrap" style={{ textAlign: 'center', padding: '80px 0' }}>
        <p style={{ color: 'var(--mute)' }}>Loading your tickets...</p>
      </div>
    );
  }

  if (!list.length) {
    return (
      <div className="tickets-wrap" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎟️</div>
        <h2>No bookings found yet</h2>
        <p style={{ color: 'var(--mute)', maxWidth: 420, margin: '8px auto 24px' }}>
          You haven't reserved any tickets yet. Explore the seat map and book up to 4 seats for tonight's premiere.
        </p>
        <button
          className="btn-book-hero"
          style={{ display: 'inline-flex', padding: '12px 28px' }}
          onClick={goBook}
        >
          Book Seats Now
        </button>
      </div>
    );
  }

  return (
    <div className="tickets-wrap">
      <div className="section-header">
        <div>
          <h2>My Cinema Passes ({list.length})</h2>
          <p>Present this digital ticket at the theatre entrance or print it below</p>
        </div>
      </div>

      <div className="tickets-grid">
        {list.map((b) => (
          <article className="cinema-pass" key={b.id}>
            <div className="pass-header">
              <div className="pass-movie">
                <h3>Midnight at the Observatory</h3>
                <p>Galaxy Cinema • Hall 1 • IMAX 3D</p>
              </div>
              <div className="pass-ref">{b.reference}</div>
            </div>

            <div className="pass-notch-row">
              <div className="pass-dash" />
            </div>

            <div className="pass-body">
              <div className="pass-meta-grid">
                <div>
                  <span className="pass-meta-label">DATE & TIME</span>
                  <span className="pass-meta-value">Tonight, 10:00 PM</span>
                </div>
                <div>
                  <span className="pass-meta-label">TOTAL PAID</span>
                  <span className="pass-meta-value" style={{ color: 'var(--accent)' }}>
                    {inr(b.total_price)}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 6 }}>
                <span className="pass-meta-label">CONFIRMED SEATS ({b.seats.length})</span>
                <div className="pass-seats-chips" style={{ marginTop: 6 }}>
                  {b.seats.map((s) => (
                    <span className="pass-seat-badge" key={s.id}>
                      Seat {s.label} ({inr(s.price)})
                    </span>
                  ))}
                </div>
              </div>

              <div className="pass-barcode">
                <div className="barcode-lines" />
                <span style={{ fontSize: 11, color: 'var(--mute)', fontFamily: 'monospace' }}>
                  {b.reference}
                </span>
              </div>

              <div className="pass-actions">
                <button
                  type="button"
                  className="btn-print-pass"
                  onClick={() => printTicket(b.reference)}
                  title="Print or Save as PDF"
                >
                  <span>🖨️</span>
                  <span>Print Ticket</span>
                </button>
                <button
                  type="button"
                  className="btn-cancel-pass"
                  onClick={() => cancel(b)}
                  title="Cancel booking and refund seats"
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
   ADMIN DASHBOARD VIEW
   ========================================================== */
function Admin({ socket, notify }) {
  const [s, setS] = useState(null);

  const load = useCallback(() => {
    api('/admin/stats')
      .then(setS)
      .catch((e) => notify(e.message, 'err'));
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

  const pct = (n) => `${((n / s.total) * 100).toFixed(1)}%`;

  return (
    <div className="admin-wrap">
      <div className="section-header">
        <div>
          <h2>Auditorium Live Analytics</h2>
          <p>Real-time occupancy, revenue and concurrent booking transactions</p>
        </div>
      </div>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-val" style={{ color: 'var(--ok)' }}>{s.available}</div>
          <div className="admin-stat-label">Available Seats</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-val" style={{ color: 'var(--held)' }}>{s.held}</div>
          <div className="admin-stat-label">Currently Held (2-min)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-val" style={{ color: 'var(--accent)' }}>{s.booked}</div>
          <div className="admin-stat-label">Booked Seats</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-val" style={{ color: 'var(--ink)' }}>{inr(s.revenue)}</div>
          <div className="admin-stat-label">Total Revenue</div>
        </div>
      </div>

      {/* Hall Occupancy Progress */}
      <div className="occupancy-card">
        <h3>Occupancy Breakdown ({s.booked + s.held} / {s.total} Seats Claimed)</h3>
        <div className="occupancy-track">
          <div
            className="occupancy-seg booked"
            style={{ width: `${(s.booked / s.total) * 100}%` }}
            title={`Booked: ${pct(s.booked)}`}
          />
          <div
            className="occupancy-seg held"
            style={{ width: `${(s.held / s.total) * 100}%` }}
            title={`Held: ${pct(s.held)}`}
          />
        </div>
        <p style={{ color: 'var(--mute)', fontSize: 13 }}>
          {s.booked} confirmed booked ({pct(s.booked)}), {s.held} held by active sessions ({pct(s.held)}), {s.available} free. Updates via WebSocket.
        </p>
      </div>

      {/* Recent Bookings Feed */}
      <div className="admin-table-card">
        <h3>Latest Confirmed Bookings</h3>
        {s.recent && s.recent.length > 0 ? (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Seats</th>
                <th>Amount</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.map((r) => (
                <tr key={r.reference}>
                  <td>
                    <b style={{ color: 'var(--accent)' }}>{r.reference}</b>
                  </td>
                  <td>{r.email}</td>
                  <td>{r.seats}</td>
                  <td><b>{inr(r.total_price)}</b></td>
                  <td style={{ color: 'var(--mute)' }}>
                    {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--mute)', padding: '20px 0' }}>No bookings confirmed yet.</p>
        )}
      </div>
    </div>
  );
}
