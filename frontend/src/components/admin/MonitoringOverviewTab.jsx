// Tab 1 of Admin Dashboard: live seat availability KPIs, schedule form, and recent bookings feed.
import { inr } from '../../utils/formatters';
import ShowScheduleFormCard from './ShowScheduleFormCard';

export default function MonitoringOverviewTab({ stats, scheduleProps }) {
  return (
    <>
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--mint)' }}>{stats.available}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Available Seats</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--peach)' }}>{stats.held}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Held (2-Min Live)</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e11d48' }}>{stats.booked}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Confirmed Booked</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{inr(stats.revenue)}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Total Revenue</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 24, marginBottom: 24 }}>
        <ShowScheduleFormCard {...scheduleProps} />

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 20, background: '#fff' }}>
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>⚡ Live Real-Time Bookings Feed</h3>
          {stats?.recent && stats.recent.length > 0 ? (
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
                {stats.recent.map((b) => (
                  <tr key={b.reference} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '9px 8px', fontWeight: 700, color: 'var(--accent)' }}>{b.reference}</td>
                    <td style={{ padding: '9px 8px' }}>{b.email}</td>
                    <td style={{ padding: '9px 8px' }}>{b.seats}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--mint)', fontWeight: 700 }}>{inr(b.total_price)}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--mute)', fontSize: 12 }}>{new Date(b.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--mute)', padding: 14 }}>No bookings recorded yet in this session.</p>
          )}
        </div>
      </div>
    </>
  );
}
