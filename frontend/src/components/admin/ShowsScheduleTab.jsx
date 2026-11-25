// Tab 2 of Admin Dashboard: edit/add showtimes alongside a live table of all scheduled shows.
import ShowScheduleFormCard from './ShowScheduleFormCard';

export default function ShowsScheduleTab({ showsList, scheduleProps }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 24, marginBottom: 24 }}>
      <ShowScheduleFormCard {...scheduleProps} />

      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff' }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>All Scheduled Screenings ({showsList.length})</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 14 }}>
          Shows with booked tickets are locked against schedule edits or cancellation.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>Show</th>
              <th style={{ padding: '8px 6px' }}>Date & Time</th>
              <th style={{ padding: '8px 6px' }}>Booked</th>
              <th style={{ padding: '8px 6px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {showsList.map((sh) => (
              <tr key={sh.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '8px 6px' }}><b>#{sh.id} {sh.movie_title}</b></td>
                <td style={{ padding: '8px 6px' }}>{sh.date_str} • {sh.time_str}</td>
                <td style={{ padding: '8px 6px', fontWeight: 700, color: sh.booked_count > 0 ? '#e11d48' : 'var(--mint)' }}>
                  {sh.booked_count} / 100
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: sh.status === 'open' ? 'var(--mint-soft)' : sh.status === 'cancelled' ? '#fee2e2' : 'var(--accent-soft)',
                    color: sh.status === 'open' ? 'var(--mint)' : sh.status === 'cancelled' ? '#dc2626' : 'var(--accent)',
                  }}>
                    {sh.status}
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
