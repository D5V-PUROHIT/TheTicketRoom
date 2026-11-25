// Displays detailed movie synopsis, cast list, open showtimes selector, and tier pricing breakdown.
import { inr } from '../../utils/formatters';

export default function MovieDetailsPage({ movie, openShows = [], selectedShowId, onSelectShow, onBook, onBack }) {
  const currentShow = openShows.find((s) => s.id === selectedShowId) || openShows[0];
  const priceRecliner = currentShow?.price_recliner || 350;
  const priceClub = currentShow?.price_club || 250;
  const pricePremium = currentShow?.price_premium || 180;

  const castList = [
    { name: 'Prabhas', role: 'Amarendra & Mahendra Baahubali', icon: '👑' },
    { name: 'Rana Daggubati', role: 'King Bhallaladeva', icon: '⚔️' },
    { name: 'Anushka Shetty', role: 'Devasena', icon: '🏹' },
    { name: 'S.S. Rajamouli', role: 'Director & Visionary', icon: '🎬' },
  ];

  return (
    <div className="movie-details-wrap">
      <button className="btn-ghost" onClick={onBack} style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>❮</span><span>Back to Movies</span>
      </button>

      <div className="details-hero-card">
        <div className="poster-box" style={{ height: 380 }}>
          <img src={movie.poster_url || '/posters/bahubali.jpg'} alt={movie.title} onError={(e) => { e.target.src = '/posters/bahubali.jpg'; }} />
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
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: '#444', marginBottom: 20 }}>{movie.synopsis}</p>

          {movie.isUpcoming ? (
            <div className="show-card-featured" style={{ background: 'var(--peach-soft)', borderColor: 'rgba(255,181,146,0.7)' }}>
              <div>
                <b style={{ fontSize: 15, color: '#9a3412', display: 'block', marginBottom: 4 }}>🗓️ Upcoming Release — Bookings Not Open Yet</b>
                <span style={{ fontSize: 13, color: '#7c2d12' }}>Scheduled for {movie.date_str}. Please check back closer to release date.</span>
              </div>
              <button className="btn-ghost" onClick={onBack}>Back to Current Show</button>
            </div>
          ) : openShows.length === 0 ? (
            <div className="show-card-featured" style={{ background: 'var(--bg)', borderColor: 'var(--line)' }}>
              <div>
                <b style={{ fontSize: 15, color: 'var(--ink)', display: 'block', marginBottom: 4 }}>No Open Showtimes Right Now</b>
                <span style={{ fontSize: 13, color: 'var(--mute)' }}>Showtimes have been cleared by cinema administration. Please check back shortly.</span>
              </div>
            </div>
          ) : (
            <div className="show-card-featured" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14 }}>
              {openShows.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)' }}>Available Showtimes:</span>
                  {openShows.map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      className={currentShow?.id === sh.id ? 'btn-primary' : 'btn-ghost'}
                      style={{ padding: '5px 14px', fontSize: 12.5 }}
                      onClick={() => onSelectShow && onSelectShow(sh.id)}
                    >
                      {sh.time_str} ({sh.date_str.split(',')[0]})
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div className="show-time-badge">
                  <div className="show-time-box">{currentShow?.time_str || movie.time_str || '10:00 PM'}</div>
                  <div className="show-hall-desc">
                    <b>Galaxy Cinema • Hall 1</b>
                    <span>{currentShow?.date_str || movie.date_str || 'Friday, 27 November, 2026'} • Dolby Atmos 7.1</span>
                  </div>
                </div>
                <button className="btn-primary" style={{ padding: '12px 28px', fontSize: 15 }} onClick={onBook}>
                  Book Tickets ({currentShow?.time_str || movie.time_str || '10:00 PM'})
                </button>
              </div>
            </div>
          )}

          <div className="tiers-pricing-bar">
            <div className="tier-price-box rec">
              <h5>RECLINER (Row A)</h5>
              <b>{inr(priceRecliner)}</b>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
                VIP Reclining Loungers • {priceRecliner <= 100 ? '5% GST' : '18% GST'}
              </div>
            </div>
            <div className="tier-price-box clb">
              <h5>CLUB (Rows B-F)</h5>
              <b>{inr(priceClub)}</b>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
                Optimal Center Viewing • {priceClub <= 100 ? '5% GST' : '18% GST'}
              </div>
            </div>
            <div className="tier-price-box prm">
              <h5>PREMIUM (Rows G-J)</h5>
              <b>{inr(pricePremium)}</b>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
                Standard Auditorium View • {pricePremium <= 100 ? '5% GST' : '18% GST'}
              </div>
            </div>
          </div>
        </div>
      </div>

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
