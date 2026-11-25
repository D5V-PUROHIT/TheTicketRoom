// Interactive 10x10 cinema seat map with live WebSocket sync, 4-seat quota bar, smart seat suggester, coupons, and GST slab breakdown.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../services/apiClient';
import { inr, pad } from '../../utils/formatters';
import { calculateClientPricing } from '../../utils/pricingCalculator';
import { suggestSmartSeats } from '../../utils/smartSeatSuggester';

export default function SeatMapBookingPage({ user, movie, openShows = [], selectedShowId, onSelectShow, socket, online, notify, onOpenAuth, onBack, onGoMyBookings, onSuccess }) {
  const activeShow = openShows.find((s) => s.id === selectedShowId) || openShows[0];
  const activeShowId = activeShow?.id || 1;
  const [seats, setSeats] = useState({});
  const [cfg, setCfg] = useState({ maxSeats: 4, holdSeconds: 120, ownedSeatIds: [], ownedCount: 0 });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [pulseIds, setPulseIds] = useState(new Set());
  const [warned30s, setWarned30s] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [discountInfo, setDiscountInfo] = useState(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const mergeUpdates = useCallback((list) => {
    setSeats((prev) => {
      const next = { ...prev };
      list.forEach((s) => (next[s.id] = s));
      return next;
    });
    setPulseIds(new Set(list.map((s) => s.id)));
    setTimeout(() => setPulseIds(new Set()), 600);
  }, []);

  const loadSeats = useCallback(() => {
    if (!openShows.length) return;
    apiRequest(`/shows/${activeShowId}/seats`)
      .then((d) => {
        setSeats(Object.fromEntries(d.seats.map((s) => [s.id, s])));
        setCfg(d);
      })
      .catch((e) => notify(e.message, 'err'));
  }, [notify, user?.id, activeShowId, openShows.length]);

  useEffect(() => {
    setSeats({});
    setDiscountInfo(null);
  }, [activeShowId]);

  useEffect(() => {
    loadSeats();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadSeats]);

  useEffect(() => {
    if (!socket) return;
    const evt = `seats:update:${activeShowId}`;
    socket.on(evt, mergeUpdates);
    socket.on('connect', loadSeats);
    return () => {
      socket.off(evt, mergeUpdates);
      socket.off('connect', loadSeats);
    };
  }, [socket, activeShowId, loadSeats, mergeUpdates]);

  const allSeats = Object.values(seats).sort((a, b) => a.id - b.id);
  const myHeldSeats = allSeats.filter((s) => s.status === 'held' && s.held_by === user?.id);
  const ownedCount = cfg.ownedCount || 0;
  const ownedSet = new Set(cfg.ownedSeatIds || []);
  const remainingLimit = Math.max(0, (cfg.maxSeats || 4) - ownedCount);
  const expiry = myHeldSeats.length ? Math.min(...myHeldSeats.map((s) => +new Date(s.hold_expires_at))) : 0;
  const secondsLeft = Math.max(0, Math.ceil((expiry - now) / 1000));

  // Derive tier prices directly from loaded seats (or show defaults) so custom <= Rs.100 shows display cleanly.
  const priceRecliner = allSeats.find((s) => s.tier === 'recliner')?.price ?? activeShow?.price_recliner ?? 350;
  const priceClub = allSeats.find((s) => s.tier === 'club')?.price ?? activeShow?.price_club ?? 250;
  const pricePremium = allSeats.find((s) => s.tier === 'premium')?.price ?? activeShow?.price_premium ?? 180;

  useEffect(() => {
    if (myHeldSeats.length > 0 && secondsLeft === 0) {
      loadSeats();
      notify('Your 2-minute hold has expired. Please choose your seats again.', 'warn');
    }
  }, [secondsLeft, myHeldSeats.length, loadSeats, notify]);

  useEffect(() => {
    if (myHeldSeats.length > 0 && secondsLeft <= 30 && secondsLeft > 0 && !warned30s) {
      notify(`⚠️ Hold expiring in ${secondsLeft}s! Complete your checkout now.`, 'warn');
      setWarned30s(true);
    }
    if (secondsLeft > 30 || myHeldSeats.length === 0) setWarned30s(false);
  }, [secondsLeft, myHeldSeats.length, warned30s, notify]);

  // Calculate subtotal, 5%/18% GST slabs, and final payable amount.
  const rawDiscount = discountInfo ? discountInfo.discount : 0;
  const pricing = calculateClientPricing(myHeldSeats, rawDiscount);

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const res = await apiRequest('/coupons/validate', {
        method: 'POST',
        body: { code: couponCode.trim(), amount: pricing.subtotal },
      });
      setDiscountInfo(res);
      notify(`Coupon applied: -₹${res.discount}`, 'ok');
    } catch (e) {
      notify(e.message, 'err');
      setDiscountInfo(null);
    }
  };

  const toggleSeatSelection = async (seat) => {
    if (!user) return onOpenAuth();
    if (busy) return;

    const currentIds = myHeldSeats.map((m) => m.id);
    const nextIds = currentIds.includes(seat.id) ? currentIds.filter((id) => id !== seat.id) : [...currentIds, seat.id];

    if (nextIds.length > remainingLimit) {
      const msg = remainingLimit === 0
        ? `Limit reached (${ownedCount}/${cfg.maxSeats} seats already booked). Cancel an existing booking in My Bookings to free seats.`
        : `You already have ${ownedCount} booked seat(s). You can select up to ${remainingLimit} more (${cfg.maxSeats} max per user).`;
      return notify(msg, 'err');
    }

    setBusy(true);
    try {
      const res = await apiRequest(`/shows/${activeShowId}/holds`, { method: 'POST', body: { seatIds: nextIds } });
      mergeUpdates(res.seats);
    } catch (e) {
      notify(e.message, 'err');
      loadSeats();
    } finally {
      setBusy(false);
    }
  };

  // Uses Smart Seat Suggester rules for 1, 2, 3, or 4 seats.
  const handleQuickSelect = async (count) => {
    if (!user) return onOpenAuth();
    if (busy) return;
    if (count > remainingLimit) {
      const msg = remainingLimit === 0
        ? `Limit reached (${ownedCount}/${cfg.maxSeats} booked). Cancel an existing booking in My Bookings first.`
        : `Only ${remainingLimit} seat(s) left in your ${cfg.maxSeats}-seat account limit.`;
      return notify(msg, 'err');
    }

    const suggestion = suggestSmartSeats(allSeats, count, user.id);
    if (!suggestion) {
      return notify(`Could not find ${count} available seat(s) in this show.`, 'warn');
    }

    setBusy(true);
    try {
      const res = await apiRequest(`/shows/${activeShowId}/holds`, { method: 'POST', body: { seatIds: suggestion.seatIds } });
      mergeUpdates(res.seats);
      notify(`Selected ${count} seat${count > 1 ? 's' : ''} (${suggestion.strategy})!`, 'ok');
    } catch (e) {
      notify(e.message, 'err');
      loadSeats();
    } finally {
      setBusy(false);
    }
  };

  const confirmAndPay = async () => {
    if (!user) return onOpenAuth();
    setBusy(true);
    try {
      await apiRequest('/payments/create-order', {
        method: 'POST',
        body: { amount: pricing.total, receipt: `rcpt_${Date.now()}` },
      });

      const res = await apiRequest(`/shows/${activeShowId}/bookings`, {
        method: 'POST',
        key: idempotencyKey.current,
        body: { couponCode: discountInfo ? discountInfo.code : null },
      });
      idempotencyKey.current = crypto.randomUUID();
      notify('Payment Verified & Booking Confirmed! Your tickets are ready.', 'ok');
      onSuccess(res.booking);
    } catch (e) {
      if (e.code !== 'NETWORK') idempotencyKey.current = crypto.randomUUID();
      notify(e.message, 'err');
      loadSeats();
    } finally {
      setBusy(false);
    }
  };

  const releaseAllSeats = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      const res = await apiRequest(`/shows/${activeShowId}/holds`, { method: 'POST', body: { seatIds: [] } });
      mergeUpdates(res.seats);
      setDiscountInfo(null);
      notify('Seats released', 'ok');
    } catch (e) {
      notify(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (openShows.length === 0) {
    return (
      <div className="theatre-screen-view" style={{ padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎬</div>
        <h2 style={{ marginBottom: 8 }}>No Open Showtimes Scheduled</h2>
        <p style={{ color: 'var(--mute)', marginBottom: 20 }}>Please check back later or return to the movie portal.</p>
        <button className="btn-primary" onClick={onBack}>Back to Movies</button>
      </div>
    );
  }

  function renderSeatButton(seat) {
    const isMine = seat.status === 'held' && seat.held_by === user?.id;
    const isPeerHeld = seat.status === 'held' && seat.held_by !== user?.id;
    const isSold = seat.status === 'booked';
    const isOwnBooked = isSold && ownedSet.has(seat.id);
    const isBlocked = seat.status === 'blocked';
    const stClass = isMine ? 'mine' : isOwnBooked ? 'own-booked' : isSold ? 'booked' : isBlocked ? 'sold' : isPeerHeld ? 'held' : 'avail';
    const isPulsing = pulseIds.has(seat.id);

    return (
      <button
        key={seat.id}
        id={`seat-${seat.id}`}
        type="button"
        className={`auditorium-seat ${stClass} ${isPulsing ? 'peer-pulse' : ''}`}
        disabled={isSold || isPeerHeld || isBlocked}
        onClick={() => toggleSeatSelection(seat)}
        title={
          isBlocked ? `Seat ${seat.row_label}${pad(seat.seat_number)} • Reserved`
            : isOwnBooked ? `Seat ${seat.row_label}${pad(seat.seat_number)} • Already booked by you`
              : `Seat ${seat.row_label}${pad(seat.seat_number)} • ${inr(seat.price)}`
        }
      >
        {isBlocked ? '✕' : pad(seat.seat_number)}
      </button>
    );
  }

  function renderRow(rowLetter) {
    const rowSeats = allSeats.filter((s) => s.row_label === rowLetter);

    if (rowLetter === 'A') {
      return (
        <div className="seat-row" key={rowLetter}>
          <span className="row-label">{rowLetter}</span>
          <div className="seat-block full-10">{rowSeats.map((s) => renderSeatButton(s))}</div>
          <span className="row-label" style={{ marginLeft: 12, marginRight: 0 }}>{rowLetter}</span>
        </div>
      );
    }

    return (
      <div className="seat-row" key={rowLetter}>
        <span className="row-label">{rowLetter}</span>
        <div className="seat-block wing-2">{rowSeats.slice(0, 2).map((s) => renderSeatButton(s))}</div>
        <div className="aisle-gap"></div>
        <div className="seat-block center-6">{rowSeats.slice(2, 8).map((s) => renderSeatButton(s))}</div>
        <div className="aisle-gap"></div>
        <div className="seat-block wing-2">{rowSeats.slice(8, 10).map((s) => renderSeatButton(s))}</div>
        <span className="row-label" style={{ marginLeft: 12, marginRight: 0 }}>{rowLetter}</span>
      </div>
    );
  }

  return (
    <div className="theatre-screen-view">
      {/* Top Movie & Quota Header */}
      <div className="theatre-topbar">
        <div className="theatre-top-left">
          <button className="btn-theatre-back" onClick={onBack} title="Back to movie">❮</button>
          <div className="theatre-meta-title">
            <h2>{movie.title}</h2>
            <div className="theatre-meta-sub">
              Galaxy Cinema: Hall 1 • {activeShow?.date_str || movie.date_str} • {activeShow?.time_str || movie.time_str}
            </div>
          </div>
        </div>

        <div className="theatre-top-right">
          <div className="hall-pill">
            <span>🎟️</span>
            {ownedCount > 0 ? (
              <span>
                {myHeldSeats.length > 0 ? `${myHeldSeats.length} Selected • ` : ''}
                <b>{Math.max(0, remainingLimit - myHeldSeats.length)} left</b> ({ownedCount}/{cfg.maxSeats} booked)
              </span>
            ) : (
              <span>{myHeldSeats.length > 0 ? `${myHeldSeats.length} / ${cfg.maxSeats} Selected` : `${cfg.maxSeats} Seats max`}</span>
            )}
          </div>
        </div>
      </div>

      {/* Showtimes Switcher & Live Viewers Pill */}
      <div className="showtimes-bar">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {openShows.map((sh) => {
            const isSelected = sh.id === activeShowId;
            return (
              <button
                key={sh.id}
                type="button"
                onClick={() => onSelectShow && onSelectShow(sh.id)}
                className={isSelected ? 'showtime-pill' : 'btn-ghost'}
                style={!isSelected ? { borderRadius: 6, padding: '6px 14px', fontSize: 12.5 } : undefined}
              >
                <span className="time">{sh.time_str}</span>
                {isSelected && <span className="audio">DOLBY ATMOS 7.1</span>}
              </button>
            );
          })}
        </div>
        <div className="presence-pill">
          <span className="live-pulse-dot" style={{ background: 'var(--mint)' }}></span>
          <span><b>{online}</b> people booking now</span>
        </div>
      </div>

      {/* User Booked Quota Banner */}
      {user && ownedCount > 0 && (
        <div
          style={{
            maxWidth: 820, margin: '14px auto 0', padding: '10px 16px', borderRadius: 10,
            background: remainingLimit === 0 ? 'var(--peach-soft)' : 'var(--accent-soft)',
            border: `1px solid ${remainingLimit === 0 ? 'rgba(255,181,146,0.75)' : 'var(--accent-border)'}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
            fontSize: 12.5, color: remainingLimit === 0 ? '#9a3412' : 'var(--ink)',
          }}
        >
          <span>
            {remainingLimit === 0 ? (
              <><b>Seat Limit Reached ({ownedCount}/{cfg.maxSeats} booked):</b> Cancel an existing ticket in My Bookings to free seats.</>
            ) : (
              <><b>Quota Status ({ownedCount}/{cfg.maxSeats} booked):</b> Your previously booked seats are highlighted in lavender — you can book up to <b>{remainingLimit} more seat{remainingLimit > 1 ? 's' : ''}</b>.</>
            )}
          </span>
          {onGoMyBookings && (
            <button type="button" className="btn-ghost" style={{ padding: '4px 12px', fontSize: 11.5, background: '#fff' }} onClick={onGoMyBookings}>
              Manage My Bookings →
            </button>
          )}
        </div>
      )}

      {/* Smart Quick Select Toolbar */}
      <div className="quick-pick-bar">
        <div className="qp-label"><span>⚡</span><span>Quick Select:</span></div>
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
                onClick={() => handleQuickSelect(n)}
              >
                {n === 1 ? '1 Seat' : `${n} Seats`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auditorium Seating Grid */}
      <div className="auditorium-box">
        {allSeats.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--mute)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎬</div>
            <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Loading Auditorium Seating Map...</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Connecting to live seat reservation server</p>
          </div>
        ) : (
          <>
            <div className="tier-divider-line">
              <span className="tier-divider-label">{inr(priceRecliner)} RECLINER • {priceRecliner <= 100 ? '5% GST' : '18% GST'}</span>
            </div>
            {renderRow('A')}

            <div style={{ height: 16 }}></div>
            <div className="tier-divider-line">
              <span className="tier-divider-label">{inr(priceClub)} CLUB • {priceClub <= 100 ? '5% GST' : '18% GST'}</span>
            </div>
            {['B', 'C', 'D', 'E', 'F'].map((r) => renderRow(r))}

            <div style={{ height: 16 }}></div>
            <div className="tier-divider-line">
              <span className="tier-divider-label">{inr(pricePremium)} PREMIUM • {pricePremium <= 100 ? '5% GST' : '18% GST'}</span>
            </div>
            {['G', 'H', 'I', 'J'].map((r) => renderRow(r))}

            <div className="screen-glow-container" style={{ marginTop: 36, marginBottom: 16 }}>
              <div className="screen-curved-arc"><span>SCREEN THIS WAY</span></div>
              <div className="screen-light-cone"></div>
            </div>
          </>
        )}

        <div className="theatre-legend">
          <div className="leg-item"><span className="leg-box"></span><span>Available</span></div>
          {ownedCount > 0 && <div className="leg-item"><span className="leg-box own-booked"></span><span>Your Booked</span></div>}
          <div className="leg-item"><span className="leg-box sold"></span><span>Sold</span></div>
          <div className="leg-item"><span className="leg-box held"></span><span>Held (2 min)</span></div>
          <div className="leg-item"><span className="leg-box mine"></span><span>Selected</span></div>
        </div>
      </div>

      {/* Sticky Bottom Checkout Summary Bar */}
      {myHeldSeats.length > 0 && (
        <div className="sticky-order-bar">
          <div className="sticky-order-inner" style={{ flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Promo Code (TICKET50)"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, width: 140 }}
                />
                <button type="button" className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700 }} onClick={applyCoupon}>Apply</button>
                {discountInfo && <span style={{ fontSize: 12, color: 'var(--mint)', fontWeight: 700 }}>✓ Applied: -₹{discountInfo.discount}</span>}
              </div>

              <div style={{ fontSize: 12, color: 'var(--mute)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>Tickets: <b>{inr(pricing.subtotal)}</b></span>
                {pricing.discountAmount > 0 && <span style={{ color: 'var(--mint)' }}>Discount: -<b>{inr(pricing.discountAmount)}</b></span>}
                <span>Ticket GST • {pricing.ticketGstLabel}: <b>{inr(pricing.ticketGst)}</b></span>
                <span>Conv. Fee + 18% GST: <b>{inr(pricing.convenienceFee)} + {inr(pricing.convenienceFeeGst)}</b></span>
              </div>
            </div>

            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="order-left-details">
                <div className="seats-tag-summary">
                  <span>Seats: </span>
                  <b>{myHeldSeats.map((s) => `${s.row_label}${pad(s.seat_number)}`).join(', ')}</b>
                  <span style={{ color: 'var(--mute)', marginLeft: 8 }}>({myHeldSeats.length} tickets)</span>
                </div>
                <div className={`hold-timer-pill ${secondsLeft <= 30 ? 'urgent' : ''}`}>
                  <span>⏳</span>
                  <span>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} remaining</span>
                </div>
              </div>

              <div className="order-actions">
                <button className="btn-ghost" onClick={releaseAllSeats} disabled={busy}>Release</button>
                <button className="btn-pay-confirm" onClick={confirmAndPay} disabled={busy || secondsLeft === 0}>
                  {busy ? 'Processing Gateway...' : `Pay ${inr(pricing.total)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
