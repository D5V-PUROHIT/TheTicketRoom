// Popup shown when clicking an upcoming movie, reminding users bookings are only open for the active show.
export default function UpcomingMovieNoticeModal({ upcomingMovie, currentMovie, onBookCurrent, onClose }) {
  if (!upcomingMovie) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(30, 25, 50, 0.65)', backdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="upcoming-modal-title" style={{ background: '#ffffff', borderRadius: 16, maxWidth: 500, width: '100%', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
          <span style={{ background: 'var(--peach-soft)', color: '#c2410c', border: '1px solid rgba(255,181,146,0.6)', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>
            🗓️ UPCOMING SHOW
          </span>
          <button onClick={onClose} aria-label="Close dialog" style={{ fontSize: 18, color: 'var(--mute)' }}>✕</button>
        </div>

        <div style={{ padding: '22px' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            <img src={upcomingMovie.poster_url} alt={upcomingMovie.title} style={{ width: 92, height: 136, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', flexShrink: 0 }} />
            <div>
              <h3 id="upcoming-modal-title" style={{ fontSize: 20, marginBottom: 6, color: 'var(--ink)' }}>{upcomingMovie.title}</h3>
              <p style={{ fontSize: 12.5, color: 'var(--mute)', marginBottom: 6 }}>{upcomingMovie.genre}</p>
              <p style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>{upcomingMovie.language}</p>
              <p style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>{upcomingMovie.synopsis}</p>
            </div>
          </div>

          <div style={{ background: 'var(--peach-soft)', border: '1px solid rgba(255, 181, 146, 0.7)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#9a3412', marginBottom: 4 }}>
              Bookings are not open yet — this is an upcoming show
            </div>
            <p style={{ fontSize: 13, color: '#7c2d12', lineHeight: 1.5, margin: 0 }}>
              <b>{upcomingMovie.title}</b> is scheduled to premiere on <b>{upcomingMovie.date_str}</b>.
              Currently, only <b>{currentMovie.title}</b> ({currentMovie.date_str} at {currentMovie.time_str}) is showing and open for seat reservations.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="btn-primary" onClick={onBookCurrent}>🎟️ Book Current Show ({currentMovie.title})</button>
          </div>
        </div>
      </div>
    </div>
  );
}
