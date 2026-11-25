// Tab 6 of Admin Dashboard: security audit trail viewer and user account suspend/unsuspend controls.
export default function AuditAndUsersTab({ auditLogs, usersList, onToggleSuspendUser }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 24 }}>
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 20, background: '#fff' }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Append-Only Security Audit Trail</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Action</th>
              <th style={{ padding: 6 }}>Admin</th>
              <th style={{ padding: 6 }}>Reason</th>
              <th style={{ padding: 6 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: 6, fontWeight: 700 }}>{a.action}</td>
                <td style={{ padding: 6 }}>{a.admin_email || 'System'}</td>
                <td style={{ padding: 6, color: 'var(--mute)' }}>{a.reason || 'N/A'}</td>
                <td style={{ padding: 6, color: '#888' }}>{new Date(a.created_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 20, background: '#fff' }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Customer Accounts & Moderation</h3>
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>User</th>
                <th style={{ padding: 6 }}>Bookings</th>
                <th style={{ padding: 6 }}>Status</th>
                <th style={{ padding: 6 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {usersList.slice(0, 30).map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: 6 }}>{u.email}</td>
                  <td style={{ padding: 6 }}>{u.bookings_count}</td>
                  <td style={{ padding: 6 }}>
                    {u.is_suspended ? (
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>Suspended</span>
                    ) : (
                      <span style={{ color: 'var(--mint)', fontWeight: 700 }}>Active</span>
                    )}
                  </td>
                  <td style={{ padding: 6 }}>
                    <button type="button" className="btn-ghost" style={{ padding: '2px 8px', fontSize: 10.5 }} onClick={() => onToggleSuspendUser(u)}>
                      {u.is_suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
