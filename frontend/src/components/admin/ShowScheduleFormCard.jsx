// Reusable card inside Admin Dashboard to edit unbooked shows, cancel empty shows, or add new showtimes.
import { formatDateWithDay, formatTime12h, timeStrTo24h } from '../../utils/formatters';

export default function ShowScheduleFormCard({
  movie,
  activeShows,
  currentShow,
  selectedShowId,
  setSelectedShowId,
  isShowLocked,
  currentBookedCount,
  calDate,
  calTime,
  schedForm,
  setSchedForm,
  onCalendarDateChange,
  onTimePickerChange,
  setCalTime,
  handleUpdateSchedule,
  handleCancelUnbookedShow,
  newShowCalDate,
  setNewShowCalDate,
  newShowCalTime,
  setNewShowCalTime,
  newShowForm,
  setNewShowForm,
  handleCreateNewShowtime,
  busy,
}) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: 'var(--ink)' }}>Change Date & Time</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, margin: 0 }}>
          Edit an unbooked showtime or add a new showtime separately.
        </p>
      </div>

      {/* Show Selector Pills */}
      {activeShows.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {activeShows.map((sh) => {
            const active = (currentShow?.id || selectedShowId) === sh.id;
            return (
              <button
                key={sh.id}
                type="button"
                className={active ? 'btn-primary' : 'btn-ghost'}
                style={{ fontSize: 11.5, padding: '5px 11px', borderRadius: 8 }}
                onClick={() => setSelectedShowId(sh.id)}
              >
                {sh.time_str} ({sh.booked_count > 0 ? `🔒 ${sh.booked_count} booked` : '0 booked'})
              </button>
            );
          })}
        </div>
      )}

      {/* Lock warning when show has at least 1 booked ticket */}
      {isShowLocked && (
        <div style={{ marginBottom: 14, padding: '11px 14px', borderRadius: 10, background: 'var(--peach-soft)', border: '1px solid rgba(255,181,146,0.8)', color: '#9a3412', fontSize: 12.5, lineHeight: 1.5 }}>
          <b>🔒 Showtime Locked ({currentBookedCount} ticket(s) booked)</b>
          <div>
            Cannot edit time or cancel a show once tickets are sold. Keep <b>{currentShow?.time_str || movie.time_str}</b> as-is and add a new showtime below (e.g. 01:00 PM).
          </div>
        </div>
      )}

      <form onSubmit={handleUpdateSchedule}>
        <div style={{ marginBottom: 14, opacity: isShowLocked ? 0.6 : 1 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Screening Date</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input
              type="date" disabled={isShowLocked} aria-label="Screening calendar date" value={calDate}
              onChange={(e) => onCalendarDateChange(e.target.value)}
              style={{ padding: '9px 12px', border: '1.5px solid var(--accent)', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: isShowLocked ? 'not-allowed' : 'pointer', background: '#faf9ff', color: 'var(--ink)' }}
            />
            <input
              type="text" required disabled={isShowLocked} placeholder="e.g. Friday, 27 November, 2026"
              value={schedForm.date_str} onChange={(e) => setSchedForm({ ...schedForm, date_str: e.target.value })}
              style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { iso: '2026-11-27', label: '🌟 Friday, 27 Nov (Premiere)' },
              { iso: '2026-11-28', label: 'Saturday, 28 Nov' },
              { iso: '2026-11-29', label: 'Sunday, 29 Nov' },
            ].map((p) => (
              <button
                key={p.iso} type="button" disabled={isShowLocked} className="btn-ghost"
                style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, background: calDate === p.iso ? 'var(--accent-soft)' : undefined, color: calDate === p.iso ? 'var(--accent)' : undefined, fontWeight: calDate === p.iso ? 700 : 500 }}
                onClick={() => onCalendarDateChange(p.iso)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16, opacity: isShowLocked ? 0.6 : 1 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Showtime</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="time" disabled={isShowLocked} aria-label="Showtime picker" value={calTime}
              onChange={(e) => onTimePickerChange(e.target.value)}
              style={{ padding: '9px 12px', border: '1.5px solid var(--accent)', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: isShowLocked ? 'not-allowed' : 'pointer', background: '#faf9ff', color: 'var(--ink)' }}
            />
            <input
              type="text" required disabled={isShowLocked} placeholder="e.g. 10:00 PM"
              value={schedForm.time_str} onChange={(e) => setSchedForm({ ...schedForm, time_str: e.target.value })}
              style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['10:00 PM', '07:30 PM', '06:00 PM', '04:15 PM', '01:00 PM', '11:15 PM'].map((t) => (
              <button
                key={t} type="button" disabled={isShowLocked} className="btn-ghost"
                style={{ fontSize: 11.5, padding: '3px 8px', borderRadius: 6, background: schedForm.time_str === t ? 'var(--mint-soft)' : undefined, color: schedForm.time_str === t ? 'var(--mint)' : undefined, fontWeight: schedForm.time_str === t ? 700 : 500 }}
                onClick={() => { setCalTime(timeStrTo24h(t)); setSchedForm({ ...schedForm, time_str: t }); }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit" disabled={busy || isShowLocked}
            style={{ flex: 1, padding: '11px 16px', background: isShowLocked ? '#94a3b8' : '#16a34a', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: busy || isShowLocked ? 'not-allowed' : 'pointer', boxShadow: isShowLocked ? 'none' : '0 2px 6px rgba(22, 163, 74, 0.25)' }}
          >
            {isShowLocked ? 'Locked (Tickets Sold)' : busy ? 'Updating...' : 'Update Showtime & Date'}
          </button>

          {!isShowLocked && currentShow && currentShow.status === 'open' && (
            <button
              type="button" disabled={busy} className="btn-ghost"
              style={{ borderRadius: 8, padding: '11px 14px', borderColor: '#fca5a5', color: '#dc2626', fontSize: 13, fontWeight: 700 }}
              onClick={handleCancelUnbookedShow}
            >
              Cancel Show
            </button>
          )}
        </div>
      </form>

      {/* Add Another Showtime Form */}
      <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px dashed var(--line)' }}>
        <h4 style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 4, color: 'var(--ink)' }}>➕ Add New Showtime ({movie.title})</h4>
        <p style={{ color: 'var(--mute)', fontSize: 12, marginBottom: 12 }}>
          Add another screening (e.g. 01:00 PM) with 100 fresh seats while keeping existing shows untouched.
        </p>

        <form onSubmit={handleCreateNewShowtime}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input
              type="date" aria-label="New showtime date" value={newShowCalDate}
              onChange={(e) => { setNewShowCalDate(e.target.value); setNewShowForm((p) => ({ ...p, date_str: formatDateWithDay(e.target.value) })); }}
              style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}
            />
            <input
              type="time" aria-label="New showtime hour" value={newShowCalTime}
              onChange={(e) => { setNewShowCalTime(e.target.value); setNewShowForm((p) => ({ ...p, time_str: formatTime12h(e.target.value) })); }}
              style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12.5, fontWeight: 600 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--mute)', marginBottom: 2 }}>Recliner (₹)</label>
              <input type="number" min="1" value={newShowForm.price_recliner} onChange={(e) => setNewShowForm((p) => ({ ...p, price_recliner: e.target.value }))} style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--mute)', marginBottom: 2 }}>Club (₹)</label>
              <input type="number" min="1" value={newShowForm.price_club} onChange={(e) => setNewShowForm((p) => ({ ...p, price_club: e.target.value }))} style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--mute)', marginBottom: 2 }}>Premium (₹)</label>
              <input type="number" min="1" value={newShowForm.price_premium} onChange={(e) => setNewShowForm((p) => ({ ...p, price_premium: e.target.value }))} style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12 }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" readOnly value={`${newShowForm.date_str} • ${newShowForm.time_str}`} style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12, background: '#f8fafc', color: 'var(--ink)', fontWeight: 600 }} />
            <button type="submit" disabled={busy} className="btn-primary" style={{ borderRadius: 8, padding: '8px 16px', fontSize: 13 }}>Add Showtime</button>
          </div>
        </form>
      </div>
    </div>
  );
}
