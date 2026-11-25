// Tab 4 of Admin Dashboard: booking lookup by reference or customer email, plus refund & cancel actions.
import { inr } from '../../utils/formatters';

export default function CustomerSupportTab({ searchQ, onSearchChange, supportBookings, onSupportCancel }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700 }}>Booking Lookup & Refund Desk</h3>
        <input
          type="text"
          placeholder="Search by Reference (CX...) or Email"
          value={searchQ}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 6, width: 260 }}
        />
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
            <th style={{ padding: '8px' }}>Reference</th>
            <th style={{ padding: '8px' }}>Customer</th>
            <th style={{ padding: '8px' }}>Showtime</th>
            <th style={{ padding: '8px' }}>Seats</th>
            <th style={{ padding: '8px' }}>Total Paid</th>
            <th style={{ padding: '8px' }}>Status</th>
            <th style={{ padding: '8px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {supportBookings.map((b) => (
            <tr key={b.id} style={{ borderBottom: '1px solid var(--line)' }}>
              <td style={{ padding: '8px', fontWeight: 700, color: 'var(--accent)' }}>{b.reference}</td>
              <td style={{ padding: '8px' }}>{b.email || 'Customer'}</td>
              <td style={{ padding: '8px', fontSize: 12 }}>{b.show_time_str || 'Show #' + b.show_id}</td>
              <td style={{ padding: '8px' }}>{b.seats?.map((seat) => seat.label).join(', ')}</td>
              <td style={{ padding: '8px', color: 'var(--mint)', fontWeight: 700 }}>{inr(b.total_price)}</td>
              <td style={{ padding: '8px' }}>
                <span style={{
                  background: b.status === 'confirmed' ? 'var(--mint-soft)' : '#fee2e2',
                  color: b.status === 'confirmed' ? 'var(--mint)' : '#dc2626',
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                }}>
                  {b.status}
                </span>
              </td>
              <td style={{ padding: '8px' }}>
                {b.status === 'confirmed' && (
                  <button
                    type="button" className="btn-ghost"
                    style={{ padding: '4px 10px', fontSize: 11, borderColor: '#f87171', color: '#dc2626' }}
                    onClick={() => onSupportCancel(b.id)}
                  >
                    Refund & Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
