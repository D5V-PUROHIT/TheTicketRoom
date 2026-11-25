// Customer home screen showing the featured Hero show banner, Now Showing card, and Upcoming Releases.
import { inr } from '../../utils/formatters';

export default function HomeMoviePortal({ movie, upcoming, onBook, onSelectMovie, onSelectUpcoming }) {
  const scrollToUpcoming = () => {
    const el = document.getElementById('upcoming-releases');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="hero-portal">
      {/* Featured Premiere Banner */}
      <section className="hero-banner">
        <div className="poster-box">
          <img src={movie.poster_url || '/posters/bahubali.jpg'} alt={movie.title} onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }} />
        </div>

        <div className="hero-content">
          <div className="premiere-pill">
            <span className="live-pulse-dot"></span>
            <span>TONIGHT'S PREMIERE SHOW • HALL 1</span>
          </div>

          <h1 className="hero-title">{movie.title}</h1>

          <div className="chips-row">
            <div className="score-chip">
              <span>★</span><b>{movie.rating || '9.6'}/10</b><span>({movie.votes || '84K'} votes)</span>
            </div>
            <span className="meta-chip">4K LASER</span>
            <span className="meta-chip">DOLBY ATMOS 7.1</span>
            <span className="meta-chip">{movie.certificate || 'U/A 13+'}</span>
          </div>

          <div className="hero-meta-line">
            <span>⏱ {movie.duration || '2h 39m'}</span><span>•</span>
            <span>🎭 {movie.genre}</span><span>•</span>
            <span>🗣 {movie.language}</span><span>•</span>
            <span>🗓 <b>{movie.date_str} at {movie.time_str}</b></span>
          </div>

          <p className="hero-synopsis">{movie.synopsis}</p>

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

      {/* Now Showing Card */}
      <div style={{ margin: '36px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 22 }}>Now Showing</h2>
          <span style={{ background: 'var(--mint-soft)', color: '#15803d', border: '1px solid rgba(56,194,143,0.4)', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            ● Booking Open • Hall 1
          </span>
        </div>
        <button type="button" onClick={scrollToUpcoming} style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer' }}>
          See Upcoming Releases ({upcoming.length}) ↓
        </button>
      </div>

      <article className="now-showing-card">
        <div onClick={() => onSelectMovie(movie)} style={{ position: 'relative', minHeight: 300, background: '#1c1917', cursor: 'pointer' }}>
          <img src={movie.poster_url || '/posters/bahubali.jpg'} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }} />
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
              <span style={{ fontSize: 12.5, color: 'var(--mute)', fontWeight: 600 }}>{movie.genre} • {movie.language}</span>
            </div>

            <h3 onClick={() => onSelectMovie(movie)} style={{ fontSize: 24, marginBottom: 8, cursor: 'pointer', color: 'var(--ink)' }}>
              {movie.title}
            </h3>
            <p style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginBottom: 16, maxWidth: 680 }}>{movie.synopsis}</p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ color: 'var(--mute)' }}>Show Date: </span><b>{movie.date_str}</b>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ color: 'var(--mute)' }}>Showtime: </span><b style={{ color: 'var(--accent)' }}>{movie.time_str} • Hall 1</b>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ color: 'var(--mute)' }}>Tickets from </span><b>{inr(180)} – {inr(350)}</b>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <button className="btn-primary" style={{ padding: '10px 24px', fontSize: 14 }} onClick={onBook}>
              🎟️ Book Tickets ({movie.time_str})
            </button>
            <button className="btn-ghost" onClick={() => onSelectMovie(movie)}>View Details & Cast</button>
          </div>
        </div>
      </article>

      {/* Upcoming Shows Grid */}
      <div id="upcoming-releases" style={{ margin: '42px 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 22 }}>Upcoming Shows</h2>
          <span style={{ background: 'var(--peach-soft)', color: '#c2410c', border: '1px solid rgba(255,181,146,0.55)', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            🗓️ Coming Soon • Bookings Not Open
          </span>
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>Click any upcoming release to view release details</span>
      </div>

      <div className="movies-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
        {upcoming.map((item) => (
          <article
            key={item.id}
            className="movie-card"
            onClick={() => onSelectUpcoming(item)}
            style={{
              cursor: 'pointer', background: '#fff', borderRadius: 14, border: '1px solid var(--line)',
              overflow: 'hidden', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.2s, box-shadow 0.2s',
              display: 'flex', flexDirection: 'column',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
          >
            <div style={{ position: 'relative', height: 310, background: '#172554' }}>
              <img src={item.poster_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                <span style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600 }}>{item.date_str}</span>
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
