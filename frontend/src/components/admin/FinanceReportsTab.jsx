// Tab 5 of Admin Dashboard: revenue totals, promo discounts, convenience fees, GST collected (5%/18%), and CSV export.
import { inr } from '../../utils/formatters';

export default function FinanceReportsTab({ financeSummary, onDownloadCsv }) {
  return (
    <div>
      {financeSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{inr(financeSummary.totals?.gross_revenue || 0)}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Gross Ticket Revenue</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--mint)' }}>{inr(financeSummary.totals?.total_discounts || 0)}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Promo Discounts</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{inr(financeSummary.totals?.total_convenience_fees || 0)}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>Platform Fees</div>
          </div>
          <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{inr(financeSummary.totals?.total_gst || 0)}</div>
            <div style={{ fontSize: 12, color: 'var(--mute)' }}>CGST + SGST Collected</div>
          </div>
        </div>
      )}

      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ fontSize: 16 }}>Financial Reconciliation & CSV Export</h3>
          <button type="button" className="btn-primary" style={{ padding: '8px 18px', fontSize: 13 }} onClick={onDownloadCsv}>
            📥 Download CSV Export for Accountants
          </button>
        </div>
        <p style={{ color: 'var(--mute)', fontSize: 13 }}>
          Generate complete accounting ledgers with reference IDs, movie titles, subtotal, discount, GST (5% up to ₹100; 18% above ₹100), and gateway timestamps.
        </p>
      </div>
    </div>
  );
}
