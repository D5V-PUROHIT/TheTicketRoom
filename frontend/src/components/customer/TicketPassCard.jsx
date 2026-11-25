// Individual e-ticket boarding-pass card rendered in My Bookings with QR code, GST info, print, and cancel actions.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { inr } from '../../utils/formatters';

export default function TicketPassCard({ booking, movie, onCancel }) {
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(booking.reference, {
      width: 90,
      margin: 1,
      color: { dark: '#2b2742', light: '#ffffff' },
    })
      .then(setQrUrl)
      .catch(() => {});
  }, [booking.reference]);

  return (
    <article className="e-pass-card">
      <div className="e-pass-header">
        <div>
          <h3>{booking.movie_title || movie.title}</h3>
          <span>Galaxy Cinema • Hall 1 • {booking.show_date_str || movie.date_str} {booking.show_time_str || movie.time_str}</span>
        </div>
        <div className="e-pass-ref">{booking.reference}</div>
      </div>

      <div className="e-pass-notch-row">
        <div className="e-pass-dash"></div>
      </div>

      <div className="e-pass-body">
        <div className="e-pass-info">
          <div style={{ fontSize: 13, marginBottom: 4 }}>
            <b>Seats: </b><span>{booking.seats?.map((s) => s.label).join(', ')}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mute)', marginBottom: 6 }}>
            Tickets {inr(booking.subtotal || 0)} + CGST & SGST {inr(booking.gst_amount || 0)} + Platform Fee {inr(booking.convenience_fee || 0)}
            {booking.discount_amount > 0 ? ` - Disc ${inr(booking.discount_amount)}` : ''}
          </div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            <b>Total Paid: </b>
            <span style={{ color: 'var(--mint)', fontWeight: 700 }}>{inr(booking.total_price)}</span>
          </div>

          <div className="e-pass-actions">
            <button className="btn-print-ticket" onClick={() => window.print()}>🖨️ Print</button>
            <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12, color: '#dc2626', borderColor: '#fca5a5' }} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>

        <div className="e-pass-qr">
          {qrUrl ? (
            <img src={qrUrl} alt="Ticket QR" style={{ width: 80, height: 80, borderRadius: 6, border: '1px solid var(--line)' }} />
          ) : (
            <div style={{ width: 80, height: 80, background: '#eee', borderRadius: 6 }} />
          )}
        </div>
      </div>
    </article>
  );
}
