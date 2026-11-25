// Top banner, logo, search bar, login/customer navigation buttons, and live presence indicator.
export default function Navbar({ user, isStaff, view, setView, activeMovie, online, onOpenAuth, onLogout, notify }) {
  return (
    <>
      <div className="top-notice">
        <span>⚡</span>
        <span>
          <b>TheTicketRoom</b> — Live Online Cinema Reservations
        </span>
      </div>

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
                    <button className={view === 'book' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('book')}>
                      Select Seats
                    </button>
                    <button className={view === 'mine' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('mine')}>
                      My Bookings
                    </button>
                  </>
                )}
                {isStaff && (
                  <button className={view === 'admin' ? 'btn-primary' : 'btn-ghost'} onClick={() => setView('admin')}>
                    Dashboard
                  </button>
                )}
                <div className="user-badge">
                  <span>👤</span>
                  <span>{user.name.split(' ')[0]}</span>
                </div>
                <button className="btn-signout" onClick={onLogout}>Sign out</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" onClick={() => onOpenAuth('login')}>Sign in</button>
                <button className="btn-primary" onClick={() => onOpenAuth('register')}>Register</button>
              </div>
            )}
          </div>
        </div>

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
    </>
  );
}
