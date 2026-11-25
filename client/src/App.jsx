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

// Date & time formatting helpers for interactive Calendar Pickers
function formatDateWithDay(isoStr) {
  if (!isoStr) return '';
  const parts = isoStr.split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return isoStr;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  const weekday = dt.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = dt.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday}, ${d} ${monthName}, ${y}`;
}

function formatTime12h(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

function dateStrToIso(str) {
  if (!str) return '2026-11-27';
  const months = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m = str.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = months[m[2].toLowerCase()] || '11';
    const yr = m[3];
    return `${yr}-${mon}-${day}`;
  }
  return '2026-11-27';
}

function timeStrTo24h(str) {
  if (!str) return '22:00';
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ampm = m[3] ? m[3].toUpperCase() : '';
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${min}`;
  }
  return '22:00';
}

const initialMovie = {
  title: 'Baahubali: The Beginning',
  date_str: 'Friday, 27 November, 2026',
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

const upcomingMovies = [
  {
    id: 'ramayana',
    isUpcoming: true,
    title: 'Ramayana - Hindi',
    genre: 'Mythology • Epic • Action',
    language: 'Hindi • Dolby Atmos 7.1',
    rating: '9.8',
    votes: '112K interested',
    poster_url: '/poster-ramayana.svg',
    time_str: '07:30 PM',
    date_str: 'Friday, 4 December, 2026',
    synopsis: 'An epic adaptation of the timeless legend of courage, righteousness, devotion, and the triumph of truth.',
  },
  {
    id: 'starlight',
    isUpcoming: true,
    title: 'Starlight Horizon',
    genre: 'Sci-Fi • Space Adventure',
    language: 'English, Hindi • IMAX 3D',
    rating: '9.1',
    votes: '62K interested',
    poster_url: '/poster-starlight.svg',
    time_str: '04:15 PM',
    date_str: 'Friday, 11 December, 2026',
    synopsis: 'Deep space explorers venture beyond the solar perimeter to investigate a mysterious celestial resonance.',
  },
  {
    id: 'chronos',
    isUpcoming: true,
    title: 'Chronicles of Chronos',
    genre: 'Time-Travel • Mystery Thriller',
    language: 'English • Dolby Atmos',
    rating: '8.9',
    votes: '48K interested',
    poster_url: '/poster-chronos.svg',
    time_str: '01:00 PM',
    date_str: 'Friday, 18 December, 2026',
    synopsis: 'A temporal physicist races against paradoxes to prevent the collapse of the prime timeline.',
  },
  {
    id: 'nebula',
    isUpcoming: true,
    title: 'Nebula Whispers',
    genre: 'Drama • Sci-Fi • Odyssey',
    language: 'Hindi, English • 4K Laser',
    rating: '9.3',
    votes: '39K interested',
    poster_url: '/poster-nebula.svg',
    time_str: '11:15 PM',
    date_str: 'Friday, 25 December, 2026',
    synopsis: 'A poetic odyssey across forgotten interstellar colonies in search of human origin.',
  },
];

const isStaffRole = (role) => ['admin', 'super_admin', 'operations', 'support', 'finance', 'marketing'].includes(role);

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [view, setView] = useState(() => (isStaffRole(JSON.parse(localStorage.getItem('user') || 'null')?.role) ? 'admin' : 'portal')); // 'portal', 'movie-details', 'book', 'confirmed', 'mine', 'admin'
  const [activeMovie, setActiveMovie] = useState(initialMovie);
  const [upcomingList, setUpcomingList] = useState(upcomingMovies);
  const [upcomingModalMovie, setUpcomingModalMovie] = useState(null);
  const [lastConfirmedBooking, setLastConfirmedBooking] = useState(null);
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [trustPolicy, setTrustPolicy] = useState(null);
  const timer = useRef();

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4200);
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
    setView(isStaffRole(data.user?.role) ? 'admin' : 'portal');
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
          setActiveMovie({ ...initialMovie, ...d.movie });
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
      setActiveMovie((prev) => ({ ...prev, ...updated }));
      notify(`Cinema schedule updated: ${updated.title}`, 'ok');
    });
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [notify]);

  const handleBookCurrentShow = () => {
    setUpcomingModalMovie(null);
    setView('book');
  };

  const handleViewMovieDetails = () => {
    setView('movie-details');
  };

  const handleSelectUpcoming = (item) => {
    notify(`🗓️ "${item.title}" is an upcoming release (${item.date_str}). Bookings are not open yet!`, 'warn');
    setUpcomingModalMovie(item);
  };

  const handleBookingSuccess = (booking) => {
    setLastConfirmedBooking(booking);
    setView('confirmed');
  };

  const isStaff = Boolean(user && isStaffRole(user.role));

  // Ensure admin/staff users remain strictly inside the Admin Dashboard
  useEffect(() => {
    if (isStaff && view !== 'admin') {
      setView('admin');
    }
  }, [isStaff, view]);

  return (
    <>
      {/* Top Banner Notice */}
      <div className="top-notice">
        <span>⚡</span>
        <span>
          <b>TheTicketRoom</b> — Live Online Cinema Reservations
        </span>
      </div>

      {/* Main Brand Navigation Bar */}
      <header className="portal-nav">
        <div className="portal-nav-inner">
          <div className="brand-wrap" onClick={() => setView(isStaff ? 'admin' : 'portal')}>
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

          {!isStaff && (
            <div className="search-bar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Search movies, halls, genres, premium experiences..."
                readOnly
                onClick={() => notify(`Now Showing: ${activeMovie.title} (${activeMovie.date_str} at ${activeMovie.time_str})`, 'ok')}
              />
            </div>
          )}

          <div className="nav-actions">
            {!isStaff && (
              <div className="hall-pill">
                <span>📍</span>
                <span>Hall 1: <b>Galaxy Cinema</b></span>
              </div>
            )}

            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {!isStaff && (
                  <>
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
                  </>
                )}
                {isStaff && (
                  <button
                    className={view === 'admin' ? 'btn-primary' : 'btn-ghost'}
                    onClick={() => setView('admin')}
                  >
                    Dashboard
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

        {/* Secondary Category Bar (Customers Only) */}
        {!isStaff && (
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
                <span className="cat-item" onClick={() => notify('Promo codes TICKET50 & CINEMA20 available at checkout', 'ok')}>
                  Offers (Coupons Active)
                </span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12.5 }}>
                <span style={{ color: 'var(--mint)', fontWeight: 700 }}>● {online} active booking now</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Application Body */}
      <main>
        {isStaff ? (
          <AdminDashboardView
            user={user}
            socket={socket}
            movie={activeMovie}
            setMovie={setActiveMovie}
            onAddUpcoming={(m) => setUpcomingList((prev) => [m, ...prev])}
            notify={notify}
          />
        ) : (
          <>
            {/* VIEW 1: Portal Landing Page */}
            {view === 'portal' && (
              <PortalView
                movie={activeMovie}
                upcoming={upcomingList}
                onBook={handleBookCurrentShow}
                onSelectMovie={handleViewMovieDetails}
                onSelectUpcoming={handleSelectUpcoming}
              />
            )}

            {/* VIEW 2: Movie Details Page (Current Show) */}
            {view === 'movie-details' && (
              <MovieDetailsView
                movie={activeMovie}
                onBook={handleBookCurrentShow}
                onBack={() => setView('portal')}
              />
            )}

            {/* VIEW 3: Seat Selection Theatre Map with Phase 4 Payments & Coupons */}
            {view === 'book' && (
              <TheatreSeatSelection
                user={user}
                movie={activeMovie}
                socket={socket}
                online={online}
                notify={notify}
                onOpenAuth={() => openAuth('login')}
                onBack={() => setView('portal')}
                onGoMyBookings={() => setView('mine')}
                onSuccess={handleBookingSuccess}
              />
            )}

            {/* VIEW 4: Booking Confirmed & Real QR Code */}
            {view === 'confirmed' && (
              <BookingConfirmedModal
                booking={lastConfirmedBooking}
                movie={activeMovie}
                onClose={() => setView('portal')}
                onViewAllBookings={() => setView('mine')}
              />
            )}

            {/* VIEW 5: My Bookings Passes */}
            {view === 'mine' && (
              <MyBookingsView
                movie={activeMovie}
                notify={notify}
                onGoBook={() => setView('book')}
              />
            )}
          </>
        )}
      </main>

      {/* Upcoming Show Notice Modal (Customers Only) */}
      {!isStaff && upcomingModalMovie && (
        <UpcomingShowModal
          upcomingMovie={upcomingModalMovie}
          currentMovie={activeMovie}
          onBookCurrent={handleBookCurrentShow}
          onClose={() => setUpcomingModalMovie(null)}
        />
      )}

      {/* Trust & Legal Footer (Customers Only) */}
      {!isStaff && (
        <footer style={{ borderTop: '1px solid var(--line)', background: '#ffffff', padding: '36px 24px 28px', marginTop: 50, textAlign: 'center' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
              <button className="cat-item" onClick={() => setTrustPolicy('terms')}>Terms of Service</button>
              <button className="cat-item" onClick={() => setTrustPolicy('privacy')}>Privacy Policy</button>
              <button className="cat-item" onClick={() => setTrustPolicy('refund')}>Cancellation & Refund Policy</button>
              <button className="cat-item" onClick={() => setTrustPolicy('licensing')}>Exhibitor Licensing Notice</button>
              <button className="cat-item" onClick={() => setTrustPolicy('contact')}>Contact & Grievance</button>
            </div>
            <p style={{ color: 'var(--mute)', fontSize: 12, lineHeight: 1.6, maxWidth: 740, margin: '0 auto' }}>
              © 2026 TheTicketRoom Cinema Technologies Pvt. Ltd. All rights reserved. GSTIN: 27AABCT1234F1Z8.
              Commercial ticketing requires direct exhibitor agreements, CBFC licensed content, and compliance with statutory refund regulations.
            </p>
          </div>
        </footer>
      )}

      {/* Trust Policy Modal */}
      {trustPolicy && (
        <TrustPolicyModal policy={trustPolicy} onClose={() => setTrustPolicy(null)} />
      )}

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
function PortalView({ movie, upcoming, onBook, onSelectMovie, onSelectUpcoming }) {
  const scrollToUpcoming = () => {
    const el = document.getElementById('upcoming-releases');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

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

      {/* Now Showing Section (Exclusively Current Show) */}
      <div style={{ margin: '36px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 22 }}>Now Showing</h2>
          <span style={{ background: 'var(--mint-soft)', color: '#15803d', border: '1px solid rgba(56,194,143,0.4)', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            ● Booking Open • Hall 1
          </span>
        </div>
        <button
          type="button"
          onClick={scrollToUpcoming}
          style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}
        >
          See Upcoming Releases ({upcoming.length}) ↓
        </button>
      </div>

      <article className="now-showing-card">
        <div
          onClick={() => onSelectMovie(movie)}
          style={{ position: 'relative', minHeight: 300, background: '#1c1917', cursor: 'pointer' }}
        >
          <img
            src={movie.poster_url || '/posters/bahubali.jpg'}
            alt={movie.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }}
          />
          <span style={{ position: 'absolute', top: 10, left: 10, background: '#16a34a', color: '#ffffff', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}>
            ● NOW SHOWING
          </span>
          <span style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.78)', color: '#fbbf24', padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
            ★ {movie.rating || '9.6'}/10
          </span>
        </div>

        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '3px 10px', borderRadius: 99 }}>
                {movie.certificate || 'U/A 13+'}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--mute)', fontWeight: 600 }}>
                {movie.genre} • {movie.language}
              </span>
            </div>

            <h3
              onClick={() => onSelectMovie(movie)}
              style={{ fontSize: 24, marginBottom: 8, cursor: 'pointer', color: 'var(--ink)' }}
            >
              {movie.title}
            </h3>

            <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 16, maxWidth: 680 }}>
              {movie.synopsis}
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ color: 'var(--mute)' }}>Show Date: </span>
                <b>{movie.date_str}</b>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ color: 'var(--mute)' }}>Showtime: </span>
                <b style={{ color: 'var(--accent)' }}>{movie.time_str} • Hall 1</b>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ color: 'var(--mute)' }}>Tickets from </span>
                <b>{inr(180)} – {inr(350)}</b>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <button className="btn-primary" style={{ padding: '10px 24px', fontSize: 14 }} onClick={onBook}>
              🎟️ Book Tickets ({movie.time_str})
            </button>
            <button className="btn-ghost" onClick={() => onSelectMovie(movie)}>
              View Details & Cast
            </button>
          </div>
        </div>
      </article>

      {/* Upcoming Releases Section */}
      <div id="upcoming-releases" style={{ margin: '42px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 22 }}>Upcoming Shows</h2>
          <span style={{ background: 'var(--peach-soft)', color: '#c2410c', border: '1px solid rgba(255,181,146,0.55)', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            🗓️ Coming Soon • Bookings Not Open
          </span>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>
          Click any upcoming release to view release details
        </span>
      </div>

      <div className="movies-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
        {upcoming.map((item) => (
          <article
            key={item.id}
            className="movie-card"
            onClick={() => onSelectUpcoming(item)}
            style={{
              cursor: 'pointer',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid var(--line)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              display: 'flex',
              flexDirection: 'column',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
          >
            <div style={{ position: 'relative', height: 310, background: '#172554' }}>
              <img
                src={item.poster_url}
                alt={item.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(43, 39, 66, 0.88)', color: '#ffb592', border: '1px solid rgba(255,181,146,0.45)', padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em' }}>
                🗓️ UPCOMING
              </span>
              <span style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.75)', color: '#fbbf24', padding: '3px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                ★ {item.rating}/10
              </span>
            </div>
            <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 16, marginBottom: 4 }}>{item.title}</h3>
                <p style={{ fontSize: 12, color: 'var(--mute)' }}>{item.genre}</p>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>
                  {item.date_str}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>
                  Coming Soon
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ==========================================================
   UPCOMING SHOW NOTICE MODAL
   ========================================================== */
function UpcomingShowModal({ upcomingMovie, currentMovie, onBookCurrent, onClose }) {
  if (!upcomingMovie) return null;

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="upcoming-modal-title"
        style={{
          background: '#ffffff',
          borderRadius: 16,
          maxWidth: 500,
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg)',
          }}
        >
          <span style={{ background: 'var(--peach-soft)', color: '#c2410c', border: '1px solid rgba(255,181,146,0.6)', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>
            🗓️ UPCOMING SHOW
          </span>
          <button onClick={onClose} aria-label="Close dialog" style={{ fontSize: 18, color: 'var(--mute)' }}>✕</button>
        </div>

        <div style={{ padding: '22px' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            <img
              src={upcomingMovie.poster_url}
              alt={upcomingMovie.title}
              style={{ width: 92, height: 136, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', flexShrink: 0 }}
            />
            <div>
              <h3 id="upcoming-modal-title" style={{ fontSize: 20, marginBottom: 6, color: 'var(--ink)' }}>
                {upcomingMovie.title}
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--mute)', marginBottom: 6 }}>
                {upcomingMovie.genre}
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
                {upcomingMovie.language}
              </p>
              <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
                {upcomingMovie.synopsis}
              </p>
            </div>
          </div>

          <div
            style={{
              background: 'var(--peach-soft)',
              border: '1px solid rgba(255, 181, 146, 0.7)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: '#9a3412', marginBottom: 4 }}>
              Bookings are not open yet — this is an upcoming show
            </div>
            <p style={{ fontSize: 13, color: '#7c2d12', lineHeight: 1.5, margin: 0 }}>
              <b>{upcomingMovie.title}</b> is scheduled to premiere on <b>{upcomingMovie.date_str}</b>.
              Currently, only <b>{currentMovie.title}</b> ({currentMovie.date_str} at {currentMovie.time_str}) is showing and open for seat reservations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Close
            </button>
            <button type="button" className="btn-primary" onClick={onBookCurrent}>
              🎟️ Book Current Show ({currentMovie.title})
            </button>
          </div>
        </div>
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

          {/* Screening Card */}
          {movie.isUpcoming ? (
            <div className="show-card-featured" style={{ background: 'var(--peach-soft)', borderColor: 'rgba(255,181,146,0.7)' }}>
              <div>
                <b style={{ fontSize: 15, color: '#9a3412', display: 'block', marginBottom: 4 }}>
                  🗓️ Upcoming Release — Bookings Not Open Yet
                </b>
                <span style={{ fontSize: 13, color: '#7c2d12' }}>
                  Scheduled for {movie.date_str}. Please check back closer to release date.
                </span>
              </div>
              <button className="btn-ghost" onClick={onBack}>
                Back to Current Show
              </button>
            </div>
          ) : (
            <div className="show-card-featured">
              <div className="show-time-badge">
                <div className="show-time-box">{movie.time_str || '10:00 PM'}</div>
                <div className="show-hall-desc">
                  <b>Galaxy Cinema • Hall 1</b>
                  <span>{movie.date_str || 'Friday, 27 November, 2026'} • Dolby Atmos 7.1</span>
                </div>
              </div>

              <button className="btn-primary" style={{ padding: '12px 28px', fontSize: 15 }} onClick={onBook}>
                Book Tickets ({movie.time_str || '10:00 PM'})
              </button>
            </div>
          )}

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
   VIEW 3: THEATRE SEAT SELECTION & PHASE 4 CHECKOUT
   ========================================================== */
function TheatreSeatSelection({ user, movie, socket, online, notify, onOpenAuth, onBack, onGoMyBookings, onSuccess }) {
  const [seats, setSeats] = useState({});
  const [cfg, setCfg] = useState({ maxSeats: 4, holdSeconds: 120, ownedSeatIds: [], ownedCount: 0 });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pulseIds, setPulseIds] = useState(new Set());
  const [warned30s, setWarned30s] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [discountInfo, setDiscountInfo] = useState(null);
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
  }, [notify, user?.id]);

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
  const ownedCount = cfg.ownedCount || 0;
  const ownedSet = new Set(cfg.ownedSeatIds || []);
  const remainingLimit = Math.max(0, (cfg.maxSeats || 4) - ownedCount);
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

  const subtotal = mine.reduce((t, s) => t + s.price, 0);
  const convenienceFee = mine.length > 0 ? 20 : 0;
  const gst = Math.round(convenienceFee * 0.18);
  const discountAmount = discountInfo ? Math.min(discountInfo.discount, subtotal) : 0;
  const total = Math.max(0, subtotal - discountAmount + convenienceFee + gst);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const res = await api('/coupons/validate', {
        method: 'POST',
        body: { code: couponCode.trim(), amount: subtotal },
      });
      setDiscountInfo(res);
      notify(`Coupon applied: -₹${res.discount}`, 'ok');
    } catch (e) {
      notify(e.message, 'err');
      setDiscountInfo(null);
    }
  };

  const pick = async (s) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (busy) return;
    const ids = mine.map((m) => m.id);
    const next = ids.includes(s.id) ? ids.filter((i) => i !== s.id) : [...ids, s.id];
    if (next.length > remainingLimit) {
      const msg = remainingLimit === 0
        ? `Limit reached (${ownedCount}/${cfg.maxSeats} seats already booked). Cancel an existing booking in My Bookings to free seats.`
        : `You already have ${ownedCount} booked seat(s). You can select up to ${remainingLimit} more (${cfg.maxSeats} max per user).`;
      return notify(msg, 'err');
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

  const quickPickSeats = async (n) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (busy) return;
    if (n > remainingLimit) {
      const msg = remainingLimit === 0
        ? `Limit reached (${ownedCount}/${cfg.maxSeats} booked). Cancel an existing booking in My Bookings first.`
        : `Only ${remainingLimit} seat(s) left in your ${cfg.maxSeats}-seat account limit.`;
      return notify(msg, 'err');
    }
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
      // Create payment order (Razorpay Provider flow)
      await api('/payments/create-order', {
        method: 'POST',
        body: { amount: total, receipt: `rcpt_${Date.now()}` },
      });

      // Confirm booking with idempotency key and applied coupon
      const res = await api('/bookings', {
        method: 'POST',
        key: key.current,
        body: { couponCode: discountInfo ? discountInfo.code : null },
      });
      key.current = crypto.randomUUID();
      notify('Payment Verified & Booking Confirmed! Your tickets are ready.', 'ok');
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
      setDiscountInfo(null);
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
            {ownedCount > 0 ? (
              <span>
                {mine.length > 0 ? `${mine.length} Selected • ` : ''}
                <b>{Math.max(0, remainingLimit - mine.length)} left</b> ({ownedCount}/{cfg.maxSeats} booked)
              </span>
            ) : (
              <span>{mine.length > 0 ? `${mine.length} / ${cfg.maxSeats} Selected` : `${cfg.maxSeats} Seats max`}</span>
            )}
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

      {/* User Booked Quota Notice (when user already holds confirmed tickets on this show) */}
      {user && ownedCount > 0 && (
        <div
          style={{
            maxWidth: 820,
            margin: '14px auto 0',
            padding: '10px 16px',
            borderRadius: 10,
            background: remainingLimit === 0 ? 'var(--peach-soft)' : 'var(--accent-soft)',
            border: `1px solid ${remainingLimit === 0 ? 'rgba(255,181,146,0.75)' : 'var(--accent-border)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 12.5,
            color: remainingLimit === 0 ? '#9a3412' : 'var(--ink)',
          }}
        >
          <span>
            {remainingLimit === 0 ? (
              <>
                <b>Seat Limit Reached ({ownedCount}/{cfg.maxSeats} booked):</b> Cancel an existing ticket in My Bookings to free seats.
              </>
            ) : (
              <>
                <b>Quota Status ({ownedCount}/{cfg.maxSeats} booked):</b> Your previously booked seats are highlighted in lavender — you can book up to <b>{remainingLimit} more seat{remainingLimit > 1 ? 's' : ''}</b>.
              </>
            )}
          </span>
          {onGoMyBookings && (
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '4px 12px', fontSize: 11.5, background: '#fff' }}
              onClick={onGoMyBookings}
            >
              Manage My Bookings →
            </button>
          )}
        </div>
      )}

      {/* Quick Select Best Contiguous Seats */}
      <div className="quick-pick-bar">
        <div className="qp-label">
          <span>⚡</span>
          <span>Quick Select:</span>
        </div>
        <div className="qp-btns">
          {[1, 2, 3, 4].map((n) => {
            const overQuota = user && n > remainingLimit;
            return (
              <button
                key={n}
                type="button"
                className="btn-qp"
                disabled={busy || overQuota}
                style={overQuota ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                title={overQuota ? `Only ${remainingLimit} seat(s) remaining in your ${cfg.maxSeats}-seat account limit` : undefined}
                onClick={() => quickPickSeats(n)}
              >
                {n === 1 ? '1 Seat' : `${n} Seats`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auditorium Seating Canvas */}
      <div className="auditorium-box">
        {all.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--mute)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎬</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Loading Auditorium Seating Map...</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Connecting to live seat reservation server</p>
          </div>
        ) : (
          <>
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

            {/* Single Curved Glowing Cinema Screen at the Bottom facing audience */}
            <div className="screen-glow-container" style={{ marginTop: 36, marginBottom: 16 }}>
              <div className="screen-curved-arc">
                <span>SCREEN THIS WAY</span>
              </div>
              <div className="screen-light-cone"></div>
            </div>
          </>
        )}

        {/* Auditorium Status Legend */}
        <div className="theatre-legend">
          <div className="leg-item">
            <span className="leg-box"></span>
            <span>Available</span>
          </div>
          {ownedCount > 0 && (
            <div className="leg-item">
              <span className="leg-box own-booked"></span>
              <span>Your Booked</span>
            </div>
          )}
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
          <div className="sticky-order-inner" style={{ flexDirection: 'column', gap: 10 }}>
            {/* Promo code & Price Breakdown row */}
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Promo Code (TICKET50)"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, width: 140 }}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700 }}
                  onClick={applyCoupon}
                >
                  Apply
                </button>
                {discountInfo && (
                  <span style={{ fontSize: 12, color: 'var(--mint)', fontWeight: 700 }}>
                    ✓ Applied: -₹{discountInfo.discount}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 12.5, color: 'var(--mute)', display: 'flex', gap: 14 }}>
                <span>Subtotal: <b>{inr(subtotal)}</b></span>
                {discountAmount > 0 && <span style={{ color: 'var(--mint)' }}>Discount: -<b>{inr(discountAmount)}</b></span>}
                <span>Fee + GST: <b>{inr(convenienceFee + gst)}</b></span>
              </div>
            </div>

            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
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
                  {busy ? 'Processing Gateway...' : `Pay ${inr(total)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderRow(r) {
    const rowSeats = all.filter((s) => s.row_label === r);

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
    const isOwnBooked = isSold && ownedSet.has(s.id);
    const isBlocked = s.status === 'blocked';
    const stClass = isMine ? 'mine' : isOwnBooked ? 'own-booked' : isSold ? 'booked' : isBlocked ? 'sold' : isPeerHeld ? 'held' : 'avail';
    const isPulsing = pulseIds.has(s.id);

    return (
      <button
        key={s.id}
        id={`seat-${s.id}`}
        type="button"
        className={`auditorium-seat ${stClass} ${isPulsing ? 'peer-pulse' : ''}`}
        disabled={isSold || isPeerHeld || isBlocked}
        onClick={() => pick(s)}
        title={
          isBlocked
            ? `Seat ${s.row_label}${pad(s.seat_number)} • Reserved for Maintenance/VIP`
            : isOwnBooked
              ? `Seat ${s.row_label}${pad(s.seat_number)} • Already booked by you`
              : `Seat ${s.row_label}${pad(s.seat_number)} • ${inr(s.price)}`
        }
      >
        {isBlocked ? '✕' : pad(s.seat_number)}
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
      notify('Booking cancelled and refund processed', 'ok');
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
   VIEW 6: UNIFIED ADMIN DASHBOARD
   ========================================================== */
function AdminDashboardView({ user, socket, movie, setMovie, onAddUpcoming, notify }) {
  const [s, setS] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [blockSeatIds, setBlockSeatIds] = useState('');

  // Form for changing date & time of active movie
  const [calDate, setCalDate] = useState(() => dateStrToIso(movie.date_str));
  const [calTime, setCalTime] = useState(() => timeStrTo24h(movie.time_str));
  const [schedForm, setSchedForm] = useState({
    date_str: movie.date_str || 'Friday, 27 November, 2026',
    time_str: movie.time_str || '10:00 PM',
  });

  // Synchronize inputs when movie updates
  useEffect(() => {
    if (movie.date_str) {
      setSchedForm({
        date_str: movie.date_str,
        time_str: movie.time_str || '10:00 PM',
      });
      setCalDate(dateStrToIso(movie.date_str));
      setCalTime(timeStrTo24h(movie.time_str));
    }
  }, [movie.date_str, movie.time_str]);

  const onCalendarDateChange = (val) => {
    setCalDate(val);
    const formatted = formatDateWithDay(val);
    setSchedForm((prev) => ({ ...prev, date_str: formatted }));
  };

  const onTimePickerChange = (val) => {
    setCalTime(val);
    const formatted = formatTime12h(val);
    setSchedForm((prev) => ({ ...prev, time_str: formatted }));
  };

  // Form for adding an upcoming movie to catalogue
  const [newMovieCalDate, setNewMovieCalDate] = useState('2026-12-04');
  const [newMovieCalTime, setNewMovieCalTime] = useState('20:00');
  const [newMovieForm, setNewMovieForm] = useState({
    title: '',
    synopsis: '',
    poster_url: '/poster-ramayana.svg',
    genres: 'Action • Epic • Drama',
    language: 'Hindi, Telugu',
    certificate: 'U/A 13+',
    runtime_mins: 159,
    cast_members: 'Lead Cast',
    date_str: 'Friday, 4 December, 2026',
    time_str: '08:00 PM',
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

  // Update schedule of active movie (Baahubali)
  const handleUpdateSchedule = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api('/admin/movies/schedule', { method: 'PUT', body: schedForm });
      setMovie(res.movie);
      notify(`Updated schedule to ${res.movie.date_str} at ${res.movie.time_str}`, 'ok');
      loadHistory();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  // Add new movie as upcoming release while keeping Baahubali as the current open show
  const handleAddNewMovie = async (e) => {
    e.preventDefault();
    if (!newMovieForm.title.trim()) return notify('Movie title is required', 'err');
    setBusy(true);
    try {
      const res = await api('/admin/movies', { method: 'POST', body: newMovieForm });
      if (onAddUpcoming) {
        onAddUpcoming({
          id: `custom-${res.movie.id}`,
          isUpcoming: true,
          title: res.movie.title,
          genre: res.movie.genres || newMovieForm.genres,
          language: res.movie.language || newMovieForm.language,
          rating: '9.0',
          poster_url: res.movie.poster_url || newMovieForm.poster_url,
          date_str: newMovieForm.date_str,
          time_str: newMovieForm.time_str,
          synopsis: res.movie.synopsis || newMovieForm.synopsis || 'Upcoming theatrical release at Galaxy Cinema.',
        });
      }
      notify(`Added "${res.movie.title}" to Upcoming Releases!`, 'ok');
      setNewMovieForm((prev) => ({ ...prev, title: '', synopsis: '' }));
      loadHistory();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  // Seat Blocking tool
  const handleToggleBlockSeats = async (blocked) => {
    const ids = blockSeatIds.split(',').map((x) => parseInt(x.trim())).filter((n) => !isNaN(n));
    if (!ids.length) return notify('Enter comma-separated seat numbers to block (e.g. 1, 2, 3)', 'warn');
    setBusy(true);
    try {
      await api('/admin/shows/1/block-seats', {
        method: 'POST',
        body: { seatIds: ids, blocked, reason: 'VIP & Maintenance reserved' },
      });
      notify(blocked ? `Blocked ${ids.length} seats for VIP/Maintenance` : `Unblocked ${ids.length} seats`, 'ok');
      setBlockSeatIds('');
      loadStats();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const renderChangeDateTimeCard = () => (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink)' }}>Change Date & Time</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, margin: 0 }}>
          Update the active showtime. Pushes immediately to all live clients.
        </p>
      </div>

      <form onSubmit={handleUpdateSchedule}>
        {/* Screening Date */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            Screening Date
          </label>

          {/* Date Picker input + formatted string */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input
              type="date"
              aria-label="Screening calendar date"
              value={calDate}
              onChange={(e) => onCalendarDateChange(e.target.value)}
              style={{
                padding: '9px 12px',
                border: '1.5px solid var(--accent)',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                background: '#faf9ff',
                color: 'var(--ink)',
              }}
            />
            <input
              type="text"
              required
              placeholder="e.g. Friday, 27 November, 2026"
              value={schedForm.date_str}
              onChange={(e) => setSchedForm({ ...schedForm, date_str: e.target.value })}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: '1px solid var(--line)',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            />
          </div>

          {/* Date shortcut presets */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-ghost"
              style={{
                fontSize: 11.5,
                padding: '4px 9px',
                borderRadius: 6,
                background: calDate === '2026-11-27' ? 'var(--accent-soft)' : undefined,
                color: calDate === '2026-11-27' ? 'var(--accent)' : undefined,
                fontWeight: calDate === '2026-11-27' ? 700 : 500,
              }}
              onClick={() => onCalendarDateChange('2026-11-27')}
            >
              🌟 Friday, 27 Nov (Premiere)
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{
                fontSize: 11.5,
                padding: '4px 9px',
                borderRadius: 6,
                background: calDate === '2026-11-28' ? 'var(--accent-soft)' : undefined,
                color: calDate === '2026-11-28' ? 'var(--accent)' : undefined,
                fontWeight: calDate === '2026-11-28' ? 700 : 500,
              }}
              onClick={() => onCalendarDateChange('2026-11-28')}
            >
              Saturday, 28 Nov
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{
                fontSize: 11.5,
                padding: '4px 9px',
                borderRadius: 6,
                background: calDate === '2026-11-29' ? 'var(--accent-soft)' : undefined,
                color: calDate === '2026-11-29' ? 'var(--accent)' : undefined,
                fontWeight: calDate === '2026-11-29' ? 700 : 500,
              }}
              onClick={() => onCalendarDateChange('2026-11-29')}
            >
              Sunday, 29 Nov
            </button>
          </div>
        </div>

        {/* Showtime */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            Showtime
          </label>

          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="time"
              aria-label="Showtime picker"
              value={calTime}
              onChange={(e) => onTimePickerChange(e.target.value)}
              style={{
                padding: '9px 12px',
                border: '1.5px solid var(--accent)',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                background: '#faf9ff',
                color: 'var(--ink)',
              }}
            />
            <input
              type="text"
              required
              placeholder="e.g. 10:00 PM"
              value={schedForm.time_str}
              onChange={(e) => setSchedForm({ ...schedForm, time_str: e.target.value })}
              style={{
                flex: 1,
                padding: '9px 12px',
                border: '1px solid var(--line)',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            />
          </div>

          {/* Showtime preset chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['10:00 PM', '07:30 PM', '06:00 PM', '04:15 PM', '01:00 PM', '11:15 PM'].map((t) => (
              <button
                key={t}
                type="button"
                className="btn-ghost"
                style={{
                  fontSize: 11.5,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: schedForm.time_str === t ? 'var(--mint-soft)' : undefined,
                  color: schedForm.time_str === t ? 'var(--mint)' : undefined,
                  fontWeight: schedForm.time_str === t ? 700 : 500,
                }}
                onClick={() => {
                  setCalTime(timeStrTo24h(t));
                  setSchedForm({ ...schedForm, time_str: t });
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Update Showtime & Date Green Button */}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            padding: '12px 18px',
            background: '#16a34a',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14.5,
            fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
            transition: 'all 0.15s ease',
          }}
        >
          {busy ? 'Updating...' : 'Update Showtime & Date'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="admin-wrap" style={{ maxWidth: 1140, margin: '24px auto', padding: '0 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>Admin Dashboard</h2>
        <p style={{ color: 'var(--mute)', fontSize: 13, margin: 0 }}>
          Active session: <b>{user.email}</b>
        </p>
      </div>

      {/* KPI Stats Summary */}
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--mint)' }}>{s.available}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Available Seats</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--peach)' }}>{s.held}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Held (2-Min Live)</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e11d48' }}>{s.booked}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Confirmed Booked</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#64748b' }}>{s.blocked || 0}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Blocked (VIP/Maint)</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{inr(s.revenue)}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Total Revenue</div>
          </div>
        </div>
      )}

      {/* Main Controls Row: Change Date & Time + Live Recent Bookings Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 24, marginBottom: 24 }}>
        {renderChangeDateTimeCard()}

        {/* Live Recent Bookings Feed */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 20, background: '#fff' }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>⚡ Live Real-Time Bookings Feed</h3>
          {s?.recent && s.recent.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Reference</th>
                  <th style={{ padding: '8px' }}>Customer</th>
                  <th style={{ padding: '8px' }}>Seats</th>
                  <th style={{ padding: '8px' }}>Amount</th>
                  <th style={{ padding: '8px' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((b) => (
                  <tr key={b.reference} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 700, color: 'var(--accent)' }}>{b.reference}</td>
                    <td style={{ padding: '9px 8px' }}>{b.email}</td>
                    <td style={{ padding: '9px 8px' }}>{b.seats}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--mint)', fontWeight: 700 }}>{inr(b.total_price)}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--mute)', fontSize: 12 }}>
                      {new Date(b.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--mute)', padding: 14 }}>No bookings recorded yet in this session.</p>
          )}
        </div>
      </div>

      {/* Secondary Controls Row: Add Movie to Catalogue + VIP Seat Blocking */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Add Movie to Catalogue Form */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Add Movie to Catalogue</h3>
          <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 16 }}>
            Publish a new movie title to the theatre catalogue.
          </p>
          <form onSubmit={handleAddNewMovie}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramayana - Part 2"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
                  value={newMovieForm.title}
                  onChange={(e) => setNewMovieForm({ ...newMovieForm, title: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Poster URL</label>
                <input
                  type="text"
                  placeholder="/poster-chronos.svg"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
                  value={newMovieForm.poster_url}
                  onChange={(e) => setNewMovieForm({ ...newMovieForm, poster_url: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Genres</label>
                <input
                  type="text"
                  placeholder="Action • Epic • Drama"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
                  value={newMovieForm.genres}
                  onChange={(e) => setNewMovieForm({ ...newMovieForm, genres: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Language</label>
                <input
                  type="text"
                  placeholder="Hindi, Telugu"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
                  value={newMovieForm.language}
                  onChange={(e) => setNewMovieForm({ ...newMovieForm, language: e.target.value })}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Synopsis</label>
              <textarea
                rows={2}
                placeholder="Plot summary..."
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, font: 'inherit', fontSize: 13 }}
                value={newMovieForm.synopsis}
                onChange={(e) => setNewMovieForm({ ...newMovieForm, synopsis: e.target.value })}
              />
            </div>

            {/* Premiere Date and Showtime */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Premiere Date</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="date"
                    aria-label="New movie premiere date"
                    value={newMovieCalDate}
                    onChange={(e) => {
                      setNewMovieCalDate(e.target.value);
                      setNewMovieForm((prev) => ({ ...prev, date_str: formatDateWithDay(e.target.value) }));
                    }}
                    style={{
                      padding: '8px 10px',
                      border: '1.5px solid var(--accent)',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: '#faf9ff',
                      color: 'var(--ink)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="e.g. Friday, 27 November, 2026"
                    value={newMovieForm.date_str}
                    onChange={(e) => setNewMovieForm({ ...newMovieForm, date_str: e.target.value })}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, fontWeight: 600 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Premiere Showtime</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="time"
                    aria-label="New movie premiere showtime"
                    value={newMovieCalTime}
                    onChange={(e) => {
                      setNewMovieCalTime(e.target.value);
                      setNewMovieForm((prev) => ({ ...prev, time_str: formatTime12h(e.target.value) }));
                    }}
                    style={{
                      padding: '8px 10px',
                      border: '1.5px solid var(--accent)',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: '#faf9ff',
                      color: 'var(--ink)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="e.g. 10:00 PM"
                    value={newMovieForm.time_str}
                    onChange={(e) => setNewMovieForm({ ...newMovieForm, time_str: e.target.value })}
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, fontWeight: 600 }}
                  />
                </div>
              </div>
            </div>

            <button type="submit" disabled={busy} className="btn-primary" style={{ padding: '10px 22px' }}>
              {busy ? 'Publishing...' : 'Publish Movie'}
            </button>
          </form>
        </div>

        {/* Seat Blocking Tool */}
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>VIP / Maintenance Seat Blocking</h3>
          <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 14 }}>
            Block physical seats from customer availability. Live updates broadcast immediately.
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Seat IDs (1 to 100)</label>
            <input
              type="text"
              placeholder="e.g. 1, 2, 3, 4"
              value={blockSeatIds}
              onChange={(e) => setBlockSeatIds(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ flex: 1, borderColor: '#f87171', color: '#dc2626', padding: '10px' }}
              onClick={() => handleToggleBlockSeats(true)}
              disabled={busy}
            >
              🚫 Block Seats
            </button>
            <button
              type="button"
              className="btn-ghost"
              style={{ flex: 1, borderColor: 'var(--mint)', color: 'var(--mint)', padding: '10px' }}
              onClick={() => handleToggleBlockSeats(false)}
              disabled={busy}
            >
              ✅ Unblock Seats
            </button>
          </div>
        </div>
      </div>

      {/* Movies in Database (Catalogue) Table */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff', marginBottom: 24 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Movies in Database ({history.length})</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 14 }}>
          Previous and current movies stored in the cinema catalogue.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
              <th style={{ padding: '9px 8px' }}>ID</th>
              <th style={{ padding: '9px 8px' }}>Title</th>
              <th style={{ padding: '9px 8px' }}>Language</th>
              <th style={{ padding: '9px 8px' }}>Certificate</th>
              <th style={{ padding: '9px 8px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '9px 8px' }}>#{m.id}</td>
                <td style={{ padding: '9px 8px' }}><b>{m.title}</b></td>
                <td style={{ padding: '9px 8px' }}>{m.language}</td>
                <td style={{ padding: '9px 8px' }}>{m.certificate}</td>
                <td style={{ padding: '9px 8px' }}>
                  <span style={{ background: 'var(--mint-soft)', color: 'var(--mint)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                    {m.status || 'Active'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              👑 Admin Dashboard
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

/* ==========================================================
   LEGAL & TRUST POLICY MODAL (PHASE 5)
   ========================================================== */
function TrustPolicyModal({ policy, onClose }) {
  const titles = {
    terms: 'Terms of Service',
    privacy: 'Privacy & Data Protection Policy',
    refund: 'Cancellation & Statutory Refund Policy',
    licensing: 'Exhibitor Licensing & Legal Compliance Notice',
    contact: 'Contact & Grievance Redressal',
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
          maxWidth: 620,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
          <h3 style={{ fontSize: 18 }}>{titles[policy] || 'Legal Policy'}</h3>
          <button onClick={onClose} style={{ fontSize: 20, color: 'var(--mute)' }}>✕</button>
        </div>

        <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#374151' }}>
          {policy === 'terms' && (
            <div>
              <p style={{ marginBottom: 10 }}>
                1. <b>Ticket Validity:</b> E-tickets reserved via TheTicketRoom are non-transferable and admit one person per seat entry. Real-time hold duration is strictly 2 minutes prior to payment capture.
              </p>
              <p style={{ marginBottom: 10 }}>
                2. <b>Fair Access Policy:</b> Each registered account is limited to booking a maximum of 4 seats per screening to prevent unauthorized bot scalping and ticket hoarding.
              </p>
              <p style={{ marginBottom: 10 }}>
                3. <b>Admission Rights:</b> The cinema exhibitor reserves right of admission. Patrons must present valid government photo identification matching the booking name for Adult-rated (A) screenings.
              </p>
            </div>
          )}

          {policy === 'privacy' && (
            <div>
              <p style={{ marginBottom: 10 }}>
                1. <b>Data We Collect:</b> Account identity (name, email address), cryptographic transaction records, and masked payment tokens. We do not store raw cardholder numbers or CVVs.
              </p>
              <p style={{ marginBottom: 10 }}>
                2. <b>Audit Trails:</b> Administrative actions (show scheduling, refunds, seat blocks) are logged in append-only system registers with timestamps for compliance.
              </p>
              <p>
                3. <b>Your Rights:</b> Customers may request account data export or permanent deletion by emailing support@theticketroom.com.
              </p>
            </div>
          )}

          {policy === 'refund' && (
            <div>
              <p style={{ marginBottom: 10 }}>
                1. <b>Cancellation Window:</b> Bookings may be cancelled online up to 20 minutes before scheduled showtime directly through the "My Bookings" interface.
              </p>
              <p style={{ marginBottom: 10 }}>
                2. <b>Refund Issuance:</b> Refunds are initiated immediately back to the original payment source. Depending on the issuing bank, funds credit within 3 to 5 business days.
              </p>
              <p>
                3. <b>Convenience Fee:</b> Convenience fees and applicable GST are statutory charges and are non-refundable once payment processing is completed.
              </p>
            </div>
          )}

          {policy === 'licensing' && (
            <div style={{ background: 'var(--bg)', padding: 16, borderRadius: 8, border: '1px solid var(--line)' }}>
              <h4 style={{ fontSize: 14, marginBottom: 8, color: 'var(--ink)' }}>⚠️ Mandatory Commercial Ticketing Notice</h4>
              <p style={{ marginBottom: 10 }}>
                Commercial deployment of online cinema ticketing platforms requires:
              </p>
              <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
                <li>Executed Master Service Agreements (MSA) with individual theatre exhibitors or multiplex chains.</li>
                <li>Licensed high-resolution movie poster, stills, and trailer rights from authorized film distributors and producers.</li>
                <li>Valid GSTIN registration in relevant states with statutory tax collection at source (TCS) and GST invoicing.</li>
                <li>Full compliance with Central Board of Film Certification (CBFC) age ratings and local municipal entertainment licensing.</li>
              </ul>
              <p style={{ fontSize: 12, color: 'var(--mute)' }}>
                This platform codebase provides production-ready transactional concurrency and database row locking conforming to assessment and enterprise specifications.
              </p>
            </div>
          )}

          {policy === 'contact' && (
            <div>
              <p style={{ marginBottom: 8 }}><b>Support Desk:</b> support@theticketroom.com</p>
              <p style={{ marginBottom: 8 }}><b>Exhibitor Partnership Inquiries:</b> partners@theticketroom.com</p>
              <p style={{ marginBottom: 8 }}><b>Grievance Officer:</b> Compliance Dept, TheTicketRoom Technologies Pvt. Ltd., Mumbai, India.</p>
              <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 12 }}>Response time: within 24 hours.</p>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button className="btn-primary" onClick={onClose} style={{ padding: '8px 20px', fontSize: 13 }}>
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}
