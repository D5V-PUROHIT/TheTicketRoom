import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';

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

const initialMovie = {
  title: 'Baahubali: The Beginning',
  date_str: 'Friday, 28 November, 2026',
  time_str: '10:00 PM',
  poster_url: '/posters/bahubali.jpg',
  synopsis: 'In ancient Mahishmati, a daring young adventurer learns of his royal heritage and embarks on an epic quest to confront King Bhallaladeva and liberate his kingdom.',
  genre: 'Action • Epic • Mythology • Drama',
  language: 'Hindi, Telugu • Dolby Atmos 7.1',
  duration: '2h 39m',
  certificate: 'U/A 13+',
  rating: '9.6',
  votes: '84.5K',
};

const catalogueMovies = [
  {
    id: 'ramayana',
    title: 'Ramayana - Hindi',
    genre: 'Mythology • Epic • Action',
    language: 'Hindi • Dolby Atmos 7.1',
    rating: '9.8',
    votes: '112K',
    poster_url: '/poster-observatory.svg',
    time_str: '07:30 PM',
    date_str: 'Friday, 28 November, 2026',
    synopsis: 'An epic adaptation of the ancient legend of courage, righteousness, and the triumph of truth.',
  },
  {
    id: 'starlight',
    title: 'Starlight Horizon',
    genre: 'Sci-Fi • Space Adventure',
    language: 'English, Hindi • IMAX 3D',
    rating: '9.1',
    votes: '62K',
    poster_url: '/poster-starlight.svg',
    time_str: '04:15 PM',
    date_str: 'Saturday, 29 November, 2026',
    synopsis: 'Deep space explorers venture beyond the solar perimeter to investigate a mysterious celestial resonance.',
  },
  {
    id: 'chronos',
    title: 'Chronicles of Chronos',
    genre: 'Time-Travel • Mystery Thriller',
    language: 'English • Dolby Atmos',
    rating: '8.9',
    votes: '48K',
    poster_url: '/poster-chronos.svg',
    time_str: '01:00 PM',
    date_str: 'Sunday, 30 November, 2026',
    synopsis: 'A temporal physicist races against paradoxes to prevent the collapse of the prime timeline.',
  },
  {
    id: 'nebula',
    title: 'Nebula Whispers',
    genre: 'Drama • Sci-Fi • Odyssey',
    language: 'Hindi, English • 4K Laser',
    rating: '9.3',
    votes: '39K',
    poster_url: '/poster-nebula.svg',
    time_str: '11:15 PM',
    date_str: 'Saturday, 29 November, 2026',
    synopsis: 'A poetic odyssey across forgotten interstellar colonies in search of human origin.',
  },
];

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [view, setView] = useState('portal'); // 'portal', 'movie-details', 'book', 'confirmed', 'mine', 'admin'
  const [selectedMovie, setSelectedMovie] = useState(initialMovie);
  const [lastConfirmedBooking, setLastConfirmedBooking] = useState(null);
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
    notify(`Welcome back, ${data.user.name}!`, 'ok');
  };

  const openAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  // Load active screening from backend
  const loadActiveMovie = useCallback(() => {
    api('/movie')
      .then((d) => {
        if (d.movie) {
          const merged = { ...initialMovie, ...d.movie };
          setSelectedMovie(merged);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadActiveMovie();
  }, [loadActiveMovie]);

  // Connect socket.io for real-time seat & screening updates
  useEffect(() => {
    const token = localStorage.getItem('token');
    const s = io({ auth: { token } });
    s.on('presence', (count) => setOnline(count || 1));
    s.on('movie:update', (updated) => {
      setSelectedMovie((prev) => ({ ...prev, ...updated }));
      notify(`Cinema schedule updated: ${updated.title}`, 'ok');
    });
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [notify]);

  const handleBookMovie = (m) => {
    setSelectedMovie(m);
    setView('book');
  };

  const handleViewMovieDetails = (m) => {
    setSelectedMovie(m);
    setView('movie-details');
  };

  const handleBookingSuccess = (booking) => {
    setLastConfirmedBooking(booking);
    setView('confirmed');
  };

  return (
    <>
      {/* Top Banner Notice */}
      <div className="top-notice">
        <span>⚡</span>
        <span>
          <b>TheTicketRoom</b> — Live Online Cinema Reservations • Hold seats for 2 minutes with instant confirmation
        </span>
      </div>

      {/* Main Brand Navigation Bar */}
      <header className="portal-nav">
        <div className="portal-nav-inner">
          <div className="brand-wrap" onClick={() => setView('portal')}>
            <div className="brand-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <path d="M7 4v16" strokeDasharray="3 3" />
                <circle cx="15" cy="12" r="3" />
              </svg>
            </div>
            <span className="brand-name">
              TheTicket<span>Room</span>
            </span>
          </div>

          <div className="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Search movies, halls, genres, premium experiences..."
              readOnly
              onClick={() => notify('Showing all screenings for Friday, 28th Nov', 'ok')}
            />
          </div>

          <div className="nav-actions">
            <div className="hall-pill">
              <span>📍</span>
              <span>Hall 1: <b>Galaxy Cinema</b></span>
            </div>

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className={view === 'book' ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => setView('book')}
                >
                  Select Seats
                </button>
                <button
                  className={view === 'mine' ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => setView('mine')}
                >
                  My Bookings
                </button>
                {user.role === 'admin' && (
                  <button
                    className={view === 'admin' ? 'btn-primary' : 'btn-ghost'}
                    onClick={() => setView('admin')}
                  >
                    Admin Console
                  </button>
                )}
                <div className="user-badge">
                  <span>👤</span>
                  <span>{user.name.split(' ')[0]}</span>
                </div>
                <button className="btn-signout" onClick={logout}>
                  Sign out
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" onClick={() => openAuth('login')}>
                  Sign in
                </button>
                <button className="btn-primary" onClick={() => openAuth('register')}>
                  Register
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Secondary Category Bar */}
        <div className="cat-bar">
          <div className="cat-bar-inner">
            <div className="cat-nav-group">
              <span className={`cat-item ${view === 'portal' ? 'active' : ''}`} onClick={() => setView('portal')}>
                Movies
              </span>
              <span className="cat-item" onClick={() => setView('book')}>
                Live Hall 1
              </span>
              <span className="cat-item" onClick={() => notify('Dolby Atmos 7.1 Laser Projection Active', 'ok')}>
                Experiences
              </span>
              <span className="cat-item" onClick={() => notify('YES Bank & HDFC 20% Discount available at checkout', 'ok')}>
                Offers
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12.5 }}>
              <span style={{ color: 'var(--mint)', fontWeight: 700 }}>● {online} active booking now</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Application Body */}
      <main>
        {/* VIEW 1: Portal Landing Page */}
        {view === 'portal' && (
          <PortalView
            movie={selectedMovie}
            catalogue={catalogueMovies}
            onBook={() => handleBookMovie(selectedMovie)}
            onSelectMovie={handleViewMovieDetails}
          />
        )}

        {/* VIEW 2: Movie Details Page */}
        {view === 'movie-details' && (
          <MovieDetailsView
            movie={selectedMovie}
            onBook={() => handleBookMovie(selectedMovie)}
            onBack={() => setView('portal')}
          />
        )}

        {/* VIEW 3: Seat Selection Theatre Map */}
        {view === 'book' && (
          <TheatreSeatSelection
            user={user}
            movie={selectedMovie}
            socket={socket}
            online={online}
            notify={notify}
            onOpenAuth={() => openAuth('login')}
            onBack={() => setView('portal')}
            onSuccess={handleBookingSuccess}
          />
        )}

        {/* VIEW 4: Booking Confirmed & Real QR Code */}
        {view === 'confirmed' && (
          <BookingConfirmedModal
            booking={lastConfirmedBooking}
            movie={selectedMovie}
            onClose={() => setView('portal')}
            onViewAllBookings={() => setView('mine')}
          />
        )}

        {/* VIEW 5: My Bookings Passes */}
        {view === 'mine' && (
          <MyBookingsView
            movie={selectedMovie}
            notify={notify}
            onGoBook={() => setView('book')}
          />
        )}

        {/* VIEW 6: Admin Dashboard */}
        {view === 'admin' && user?.role === 'admin' && (
          <AdminDashboardView
            socket={socket}
            movie={selectedMovie}
            setMovie={setSelectedMovie}
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

      {/* Real-time Toast Alerts */}
      {toast && (
        <div className={`toast-bar ${toast.type}`} role="status">
          <span>{toast.type === 'ok' ? '✓' : toast.type === 'warn' ? '⚠️' : '✕'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </>
  );
}

/* ==========================================================
   VIEW 1: PORTAL LANDING VIEW
   ========================================================== */
function PortalView({ movie, catalogue, onBook, onSelectMovie }) {
  return (
    <div className="hero-portal">
      {/* Featured Screening Hero */}
      <section className="hero-banner">
        <div className="poster-box">
          <img
            src={movie.poster_url || '/posters/bahubali.jpg'}
            alt={movie.title}
            onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }}
          />
        </div>

        <div className="hero-content">
          <div className="premiere-pill">
            <span className="live-pulse-dot"></span>
            <span>TONIGHT'S PREMIERE SHOW • HALL 1</span>
          </div>

          <h1 className="hero-title">{movie.title}</h1>

          <div className="chips-row">
            <div className="score-chip">
              <span>★</span>
              <b>{movie.rating || '9.6'}/10</b>
              <span>({movie.votes || '84K'} votes)</span>
            </div>
            <span className="meta-chip">4K LASER</span>
            <span className="meta-chip">DOLBY ATMOS 7.1</span>
            <span className="meta-chip">{movie.certificate || 'U/A 13+'}</span>
          </div>

          <div className="hero-meta-line">
            <span>⏱ {movie.duration || '2h 39m'}</span>
            <span>•</span>
            <span>🎭 {movie.genre}</span>
            <span>•</span>
            <span>🗣 {movie.language}</span>
            <span>•</span>
            <span>🗓 <b>{movie.date_str} at {movie.time_str}</b></span>
          </div>

          <p className="hero-synopsis">
            {movie.synopsis}
          </p>

          <div className="hero-ctas">
            <button className="btn-hero-book" onClick={onBook}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M7 4v16" strokeDasharray="2 2" />
              </svg>
              <span>Book Tickets ({movie.time_str})</span>
            </button>
            <button className="btn-ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }} onClick={() => onSelectMovie(movie)}>
              View Full Story & Cast →
            </button>
          </div>
        </div>
      </section>

      {/* Recommended Movies Section */}
      <div style={{ margin: '36px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 22 }}>Recommended Screenings & Upcoming Releases</h2>
        <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>
          Explore all titles →
        </span>
      </div>

      <div className="movies-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
        {/* Active Movie Card */}
        <article
          className="movie-card"
          onClick={() => onSelectMovie(movie)}
          style={{
            cursor: 'pointer',
            background: '#fff',
            borderRadius: 14,
            border: '1px solid var(--line)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
        >
          <div style={{ position: 'relative', height: 320, background: '#1c1917' }}>
            <img
              src={movie.poster_url || '/posters/bahubali.jpg'}
              alt={movie.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }}
            />
            <span style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.75)', color: '#fbbf24', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
              ★ {movie.rating || '9.6'}/10
            </span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>{movie.title}</h3>
            <p style={{ fontSize: 12, color: 'var(--mute)' }}>{movie.genre}</p>
            <p style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 700, marginTop: 8 }}>
              Tonight at {movie.time_str} • Hall 1
            </p>
          </div>
        </article>

        {/* Catalogue Movies */}
        {catalogue.map((item) => (
          <article
            key={item.id}
            className="movie-card"
            onClick={() => onSelectMovie(item)}
            style={{
              cursor: 'pointer',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid var(--line)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
          >
            <div style={{ position: 'relative', height: 320, background: '#172554' }}>
              <img
                src={item.poster_url}
                alt={item.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <span style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.75)', color: '#fbbf24', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                ★ {item.rating}/10
              </span>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>{item.title}</h3>
              <p style={{ fontSize: 12, color: 'var(--mute)' }}>{item.genre}</p>
              <p style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginTop: 8 }}>
                {item.date_str}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================
   VIEW 2: MOVIE DETAILS VIEW
   ========================================================== */
function MovieDetailsView({ movie, onBook, onBack }) {
  const castList = [
    { name: 'Prabhas', role: 'Amarendra & Mahendra Baahubali', icon: '👑' },
    { name: 'Rana Daggubati', role: 'King Bhallaladeva', icon: '⚔️' },
    { name: 'Anushka Shetty', role: 'Devasena', icon: '🏹' },
    { name: 'S.S. Rajamouli', role: 'Director & Visionary', icon: '🎬' },
  ];

  return (
    <div className="movie-details-wrap">
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>❮</span>
        <span>Back to Movies</span>
      </button>

      <div className="details-hero-card">
        <div className="poster-box" style={{ height: 380 }}>
          <img
            src={movie.poster_url || '/posters/bahubali.jpg'}
            alt={movie.title}
            onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }}
          />
        </div>

        <div>
          <div className="chips-row">
            <span className="score-chip">★ {movie.rating || '9.6'}/10</span>
            <span className="meta-chip">{movie.certificate || 'U/A 13+'}</span>
            <span className="meta-chip">4K LASER</span>
            <span className="meta-chip">DOLBY ATMOS 7.1</span>
          </div>

          <h1 style={{ fontSize: 34, marginBottom: 8 }}>{movie.title}</h1>
          <p style={{ color: 'var(--mute)', fontSize: 14, marginBottom: 16 }}>
            {movie.duration || '2h 39m'} • {movie.genre} • {movie.language}
          </p>

          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: '#444', marginBottom: 20 }}>
            {movie.synopsis}
          </p>

          {/* Tonight's Featured Screening Card */}
          <div className="show-card-featured">
            <div className="show-time-badge">
              <div className="show-time-box">{movie.time_str || '10:00 PM'}</div>
              <div className="show-hall-desc">
                <b>Galaxy Cinema • Hall 1</b>
                <span>{movie.date_str || 'Friday, 28 November, 2026'} • Dolby Atmos 7.1</span>
              </div>
            </div>

            <button className="btn-primary" style={{ padding: '12px 28px', fontSize: 15 }} onClick={onBook}>
              Book Tickets ({movie.time_str || '10:00 PM'})
            </button>
          </div>

          {/* Seat Tiers Pricing Card */}
          <div className="tiers-pricing-bar">
            <div className="tier-price-box rec">
              <h5>RECLINER (Row A)</h5>
              <b>{inr(350)}</b>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>VIP Reclining Loungers</div>
            </div>
            <div className="tier-price-box clb">
              <h5>CLUB (Rows B-F)</h5>
              <b>{inr(250)}</b>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>Optimal Center Viewing</div>
            </div>
            <div className="tier-price-box prm">
              <h5>PREMIUM (Rows G-J)</h5>
              <b>{inr(180)}</b>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>Standard Auditorium View</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cast & Crew Section */}
      <h3 style={{ fontSize: 20, marginBottom: 14 }}>Cast & Key Crew</h3>
      <div className="cast-grid">
        {castList.map((c) => (
          <div className="cast-card" key={c.name}>
            <div className="cast-avatar">{c.icon}</div>
            <b>{c.name}</b>
            <span>{c.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================
   VIEW 3: THEATRE SEAT SELECTION
   ========================================================== */
function TheatreSeatSelection({ user, movie, socket, online, notify, onOpenAuth, onBack, onSuccess }) {
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
          // If unauthenticated, public preview can still load if backend allows or retry
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
      notify('Your 2-minute hold has expired. Please choose your seats again.', 'warn');
    }
  }, [left, mine.length, load, notify]);

  // 30-second warning toast
  useEffect(() => {
    if (mine.length > 0 && left <= 30 && left > 0 && !warned30s) {
      notify(`⚠️ Hold expiring in ${left}s! Complete your checkout now.`, 'warn');
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
      return notify(`Maximum ${cfg.maxSeats} seats allowed per customer`, 'err');
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

  // Best Available Seats for N People Suggester
  const quickPickSeats = async (n) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (busy) return;
    const priorityRows = ['D', 'E', 'C', 'F', 'B', 'A', 'G', 'H', 'I', 'J'];
    let chosen = null;

    for (const r of priorityRows) {
      const rowSeats = all.filter((s) => s.row_label === r).sort((a, b) => a.seat_number - b.seat_number);
      for (let i = 0; i <= rowSeats.length - n; i++) {
        const slice = rowSeats.slice(i, i + n);
        const free = slice.every((s) => s.status === 'available' || (s.status === 'held' && s.held_by === user.id));
        if (free) {
          chosen = slice.map((s) => s.id);
          break;
        }
      }
      if (chosen) break;
    }

    if (!chosen) {
      return notify(`Could not find ${n} adjacent available seats`, 'warn');
    }

    setBusy(true);
    try {
      const res = await api('/holds', { method: 'POST', body: { seatIds: chosen } });
      merge(res.seats);
      notify(`Selected ${n} best contiguous seats!`, 'ok');
    } catch (e) {
      notify(e.message, 'err');
      load();
    } finally {
      setBusy(false);
    }
  };

  const confirmBooking = async () => {
    if (!user) return onOpenAuth();
    setBusy(true);
    try {
      const res = await api('/bookings', { method: 'POST', key: key.current });
      key.current = crypto.randomUUID();
      notify('Booking Confirmed! Your tickets are ready.', 'ok');
      onSuccess(res.booking);
    } catch (e) {
      if (e.code !== 'NETWORK') key.current = crypto.randomUUID();
      notify(e.message, 'err');
      load();
    } finally {
      setBusy(false);
    }
  };

  const releaseSeats = async () => {
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
      {/* Top Header Bar */}
      <div className="theatre-topbar">
        <div className="theatre-top-left">
          <button className="btn-theatre-back" onClick={onBack} title="Back to movie">
            ❮
          </button>
          <div className="theatre-meta-title">
            <h2>{movie.title}</h2>
            <div className="theatre-meta-sub">
              Galaxy Cinema: Hall 1 • {movie.date_str} • {movie.time_str}
            </div>
          </div>
        </div>

        <div className="theatre-top-right">
          <div className="hall-pill">
            <span>🎟️</span>
            <span>{mine.length > 0 ? `${mine.length} Selected` : '4 Seats max'}</span>
          </div>
        </div>
      </div>

      {/* Showtimes Sub-bar */}
      <div className="showtimes-bar">
        <div className="showtime-pill">
          <span className="time">{movie.time_str}</span>
          <span className="audio">DOLBY ATMOS 7.1</span>
        </div>
        <div className="presence-pill">
          <span className="live-pulse-dot" style={{ background: 'var(--mint)' }}></span>
          <span><b>{online}</b> people booking now</span>
        </div>
      </div>

      {/* Quick Select Best Contiguous Seats */}
      <div className="quick-pick-bar">
        <div className="qp-label">
          <span>⚡</span>
          <span>Quick Select:</span>
        </div>
        <div className="qp-btns">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              className="btn-qp"
              disabled={busy}
              onClick={() => quickPickSeats(n)}
            >
              {n === 1 ? '1 Seat' : `${n} Seats`}
            </button>
          ))}
        </div>
      </div>

      {/* Auditorium Seating Canvas */}
      <div className="auditorium-box">
        {/* Curved Glowing Screen at the Top */}
        <div className="screen-glow-container">
          <div className="screen-curved-arc">
            <span>SCREEN (All eyes this way)</span>
          </div>
          <div className="screen-light-cone"></div>
        </div>

        {/* Tier 1: ₹350 RECLINER (Row A - Continuous 10 VIP Seats) */}
        <div className="tier-divider-line">
          <span className="tier-divider-label">{inr(350)} RECLINER</span>
        </div>
        {renderRow('A')}

        <div style={{ height: 16 }}></div>

        {/* Tier 2: ₹250 CLUB (Rows B to F - 2 / 6 / 2 Split) */}
        <div className="tier-divider-line">
          <span className="tier-divider-label">{inr(250)} CLUB</span>
        </div>
        {['B', 'C', 'D', 'E', 'F'].map((r) => renderRow(r))}

        <div style={{ height: 16 }}></div>

        {/* Tier 3: ₹180 PREMIUM (Rows G to J - 2 / 6 / 2 Split) */}
        <div className="tier-divider-line">
          <span className="tier-divider-label">{inr(180)} PREMIUM</span>
        </div>
        {['G', 'H', 'I', 'J'].map((r) => renderRow(r))}

        {/* Bottom Screen Bar Line */}
        <div className="bottom-screen-bar">
          <div className="bottom-screen-line"></div>
          <div className="bottom-screen-text">Screen Direction</div>
        </div>

        {/* BMS-style Legend */}
        <div className="theatre-legend">
          <div className="leg-item">
            <span className="leg-box"></span>
            <span>Available</span>
          </div>
          <div className="leg-item">
            <span className="leg-box sold"></span>
            <span>Sold</span>
          </div>
          <div className="leg-item">
            <span className="leg-box held"></span>
            <span>Held (2 min)</span>
          </div>
          <div className="leg-item">
            <span className="leg-box mine"></span>
            <span>Selected</span>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Order Bar (Appears when seats are selected) */}
      {mine.length > 0 && (
        <div className="sticky-order-bar">
          <div className="sticky-order-inner">
            <div className="order-left-details">
              <div className="seats-tag-summary">
                <span>Seats: </span>
                <b>{mine.map((s) => `${s.row_label}${pad(s.seat_number)}`).join(', ')}</b>
                <span style={{ color: 'var(--mute)', marginLeft: 8 }}>({mine.length} tickets)</span>
              </div>
              <div className={`hold-timer-pill ${left <= 30 ? 'urgent' : ''}`}>
                <span>⏳</span>
                <span>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} remaining</span>
              </div>
            </div>

            <div className="order-actions">
              <button className="btn-ghost" onClick={releaseSeats} disabled={busy}>
                Release
              </button>
              <button className="btn-pay-confirm" onClick={confirmBooking} disabled={busy || left === 0}>
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

    // Row A: 10 seats contiguous across
    if (r === 'A') {
      return (
        <div className="seat-row" key={r}>
          <span className="row-label">{r}</span>
          <div className="seat-block full-10">
            {rowSeats.map((s) => renderSeatBtn(s))}
          </div>
          <span className="row-label" style={{ marginLeft: 12, marginRight: 0 }}>{r}</span>
        </div>
      );
    }

    // Rows B to J: 2 seats | Aisle | 6 seats | Aisle | 2 seats
    const leftBlock = rowSeats.slice(0, 2);
    const centerBlock = rowSeats.slice(2, 8);
    const rightBlock = rowSeats.slice(8, 10);

    return (
      <div className="seat-row" key={r}>
        <span className="row-label">{r}</span>
        <div className="seat-block wing-2">{leftBlock.map((s) => renderSeatBtn(s))}</div>
        <div className="aisle-gap"></div>
        <div className="seat-block center-6">{centerBlock.map((s) => renderSeatBtn(s))}</div>
        <div className="aisle-gap"></div>
        <div className="seat-block wing-2">{rightBlock.map((s) => renderSeatBtn(s))}</div>
        <span className="row-label" style={{ marginLeft: 12, marginRight: 0 }}>{r}</span>
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
        id={`seat-${s.id}`}
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
   VIEW 4: BOOKING CONFIRMED & REAL QR CODE VIEW
   ========================================================== */
function BookingConfirmedModal({ booking, movie, onClose, onViewAllBookings }) {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    if (!booking?.reference) return;
    QRCode.toDataURL(booking.reference, {
      width: 160,
      margin: 1,
      color: { dark: '#2b2742', light: '#ffffff' },
    })
      .then(setQrCodeUrl)
      .catch((err) => console.error('QR code generation error', err));
  }, [booking?.reference]);

  if (!booking) return null;

  return (
    <div className="confirmed-modal-backdrop">
      <div className="confirmed-ticket-card">
        <div className="confirmed-header">
          <div className="confetti-badge">🎉</div>
          <h2>Booking Confirmed!</h2>
          <p>Seats are reserved under your reference. Show this ticket at the cinema entry.</p>
        </div>

        <div className="confirmed-body">
          <div className="booking-ref-display">{booking.reference}</div>

          <div className="qr-code-box">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt={`QR Code for ${booking.reference}`} style={{ width: 140, height: 140, display: 'block' }} />
            ) : (
              <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                Generating QR...
              </div>
            )}
          </div>

          <div style={{ fontSize: 14, textAlign: 'left', background: 'var(--bg)', padding: '14px 18px', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 20 }}>
            <div style={{ marginBottom: 6 }}>
              <b>Movie: </b><span>{movie.title}</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <b>Screening: </b><span>Galaxy Cinema • Hall 1 • {movie.date_str} at {movie.time_str}</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <b>Seats: </b>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {booking.seats?.map((s) => s.label).join(', ')}
              </span>
            </div>
            <div>
              <b>Total Paid: </b>
              <span style={{ color: 'var(--mint)', fontWeight: 800 }}>{inr(booking.total_price)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-print-ticket" onClick={() => window.print()}>
              🖨️ Print / Save Ticket
            </button>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={onViewAllBookings}>
              View in My Bookings
            </button>
            <button className="btn-ghost" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================
   VIEW 5: MY BOOKINGS VIEW
   ========================================================== */
function MyBookingsView({ movie, notify, onGoBook }) {
  const [list, setList] = useState(null);

  const load = () =>
    api('/bookings')
      .then((d) => setList(d.bookings))
      .catch((e) => notify(e.message, 'err'));

  useEffect(() => {
    load();
  }, []);

  const cancel = async (b) => {
    if (!window.confirm(`Cancel reservation ${b.reference}? Released seats will immediately become available.`)) return;
    try {
      await api(`/bookings/${b.id}`, { method: 'DELETE' });
      notify('Booking cancelled and seats released', 'ok');
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
        <p style={{ color: 'var(--mute)', margin: '8px 0 20px' }}>You haven't reserved any tickets yet.</p>
        <button className="btn-primary" onClick={onGoBook}>
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
          <TicketPassCard key={b.id} booking={b} movie={movie} onCancel={() => cancel(b)} />
        ))}
      </div>
    </div>
  );
}

function TicketPassCard({ booking, movie, onCancel }) {
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(booking.reference, {
      width: 90,
      margin: 1,
      color: { dark: '#2b2742', light: '#ffffff' },
    })
      .then(setQrUrl)
      .catch(() => {});
  }, [booking.reference]);

  return (
    <article className="e-pass-card">
      <div className="e-pass-header">
        <div>
          <h3>{movie.title}</h3>
          <span>Galaxy Cinema • Hall 1 • {movie.date_str} {movie.time_str}</span>
        </div>
        <div className="e-pass-ref">{booking.reference}</div>
      </div>

      <div className="e-pass-notch-row">
        <div className="e-pass-dash"></div>
      </div>

      <div className="e-pass-body">
        <div className="e-pass-info">
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <b>Seats: </b>
            <span>{booking.seats?.map((s) => s.label).join(', ')}</span>
          </div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <b>Total Paid: </b>
            <span style={{ color: 'var(--mint)', fontWeight: 700 }}>{inr(booking.total_price)}</span>
          </div>

          <div className="e-pass-actions">
            <button className="btn-print-ticket" onClick={() => window.print()}>
              🖨️ Print
            </button>
            <button
              className="btn-ghost"
              style={{ padding: '6px 12px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="e-pass-qr">
          {qrUrl ? (
            <img src={qrUrl} alt="Ticket QR" style={{ width: 80, height: 80, borderRadius: 6, border: '1px solid var(--line)' }} />
          ) : (
            <div style={{ width: 80, height: 80, background: '#eee', borderRadius: 6 }} />
          )}
        </div>
      </div>
    </article>
  );
}

/* ==========================================================
   VIEW 6: ADMIN DASHBOARD VIEW
   ========================================================== */
function AdminDashboardView({ socket, movie, setMovie, notify }) {
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
    poster_url: '/posters/bahubali.jpg',
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
        poster_url: '/posters/bahubali.jpg',
        genre: 'Action • Epic • Drama',
        language: 'Hindi • Dolby Atmos',
        synopsis: '',
        reset_hall: true,
      });
      notify(`Active screening changed to: ${res.movie.title}!`, 'ok');
      loadHistory();
      loadStats();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-wrap" style={{ maxWidth: 1080, margin: '30px auto', padding: '0 24px' }}>
      <h2>Cinema Administration & Control</h2>
      <p style={{ color: 'var(--mute)', marginBottom: 20 }}>
        Manage screening movies, modify showtimes, inspect live hall occupancy, and view audit history.
      </p>

      {/* Live Seat Stats Cards */}
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          <div style={{ padding: 18, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--mint)' }}>{s.available}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Available Seats</div>
          </div>
          <div style={{ padding: 18, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--peach)' }}>{s.held}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Held by Users (2-Min)</div>
          </div>
          <div style={{ padding: 18, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e11d48' }}>{s.booked}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Confirmed Booked</div>
          </div>
          <div style={{ padding: 18, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{inr(s.revenue)}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Total Revenue</div>
          </div>
        </div>
      )}

      {/* Active Screening & Change Date/Time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 28 }}>
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 20, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 16 }}>Current Active Movie</h3>
            <span style={{ background: 'var(--mint-soft)', color: 'var(--mint)', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
              NOW PLAYING 🟢
            </span>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <img
              src={movie.poster_url || '/posters/bahubali.jpg'}
              alt={movie.title}
              style={{ width: 90, height: 130, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }}
              onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }}
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
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 20, background: '#fff' }}>
          <h3 style={{ fontSize: 16, marginBottom: 6 }}>Change Date & Time</h3>
          <p style={{ color: 'var(--mute)', fontSize: 12, marginBottom: 16 }}>
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
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
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
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13 }}
                value={schedForm.time_str}
                onChange={(e) => setSchedForm({ ...schedForm, time_str: e.target.value })}
                placeholder="e.g. 10:00 PM"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-primary"
              style={{ width: '100%', padding: '10px' }}
            >
              {busy ? 'Saving...' : 'Update Showtime & Date'}
            </button>
          </form>
        </div>
      </div>

      {/* Add New Movie Form */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 22, background: '#fff', marginBottom: 28 }}>
        <h3 style={{ fontSize: 17, marginBottom: 4 }}>Add & Launch New Movie</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 18 }}>
          Switch the theatre to a brand new title. Previous movie will be saved in movie history.
        </p>

        <form onSubmit={handleAddNewMovie}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Movie Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Baahubali 2: The Conclusion"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
                value={newMovieForm.title}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, title: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Poster URL / Path</label>
              <input
                type="text"
                placeholder="/posters/bahubali.jpg or /poster-chronos.svg"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
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
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
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
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
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
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
                value={newMovieForm.genre}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, genre: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Audio & Language</label>
              <input
                type="text"
                placeholder="Hindi • Telugu • Dolby Atmos"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
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
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, font: 'inherit', fontSize: 13 }}
              value={newMovieForm.synopsis}
              onChange={(e) => setNewMovieForm({ ...newMovieForm, synopsis: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="reset-hall-seats"
              type="checkbox"
              checked={newMovieForm.reset_hall}
              onChange={(e) => setNewMovieForm({ ...newMovieForm, reset_hall: e.target.checked })}
            />
            <label htmlFor="reset-hall-seats" style={{ fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
              Reset all 100 seats to Available for this new screening
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-primary"
            style={{ padding: '11px 24px', fontSize: 14 }}
          >
            {busy ? 'Publishing Movie...' : '🚀 Set as Active Movie & Update Hall'}
          </button>
        </form>
      </div>

      {/* Past Movies History */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 22, background: '#fff' }}>
        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Movie History & Past Screenings</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 16 }}>
          Track past titles screened in Hall 1.
        </p>

        {history && history.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Movie</th>
                <th style={{ padding: '8px 10px' }}>Screening Date & Time</th>
                <th style={{ padding: '8px 10px' }}>Genre</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((m) => (
                <tr key={m.id || m.title} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px' }}>
                    <b>{m.title}</b>
                  </td>
                  <td style={{ padding: '10px' }}>
                    {m.date_str} at {m.time_str}
                  </td>
                  <td style={{ padding: '10px', color: 'var(--mute)' }}>{m.genre}</td>
                  <td style={{ padding: '10px' }}>
                    {m.active ? (
                      <span style={{ background: 'var(--mint-soft)', color: 'var(--mint)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
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
          <p style={{ color: 'var(--mute)', padding: '14px 0' }}>No previous movies recorded yet.</p>
        )}
      </div>
    </div>
  );
}

/* ==========================================================
   AUTH MODAL (Login / Register)
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 25, 50, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          maxWidth: 420,
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontSize: 18 }}>{mode === 'login' ? 'Sign In to TheTicketRoom' : 'Create an Account'}</h3>
          <button onClick={onClose} style={{ fontSize: 18, color: 'var(--mute)' }}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Quick Demo Credentials */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ flex: 1, fontSize: 12, padding: '7px 8px' }}
              onClick={() => fillDemo('user1@test.com', 'Test@1234')}
            >
              ⚡ User 1 (Demo)
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{ flex: 1, fontSize: 12, padding: '7px 8px' }}
              onClick={() => fillDemo('admin@test.com', 'Admin@123')}
            >
              👑 Admin Console
            </button>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Full Name</label>
                <input
                  type="text"
                  required
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Email Address</label>
              <input
                type="email"
                required
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Password</label>
              <input
                type="password"
                required
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '11px', fontSize: 14 }} disabled={busy}>
              {busy ? 'Please wait...' : mode === 'login' ? 'Sign In & Continue' : 'Register Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5, color: 'var(--mute)' }}>
            {mode === 'login' ? 'New here? ' : 'Already registered? '}
            <button
              type="button"
              style={{ color: 'var(--accent)', fontWeight: 700 }}
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
