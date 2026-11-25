// Celebration popup displayed immediately after successful payment with QR code and full GST breakdown.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { inr } from '../../utils/formatters';

export default function BookingConfirmedModal({ booking, movie, onClose, onViewAllBookings }) {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    if (!booking?.reference) return;
    QRCode.toDataURL(booking.reference, {
      width: 160,
      margin: 1,
      color: { dark: '#2b2742', light: '#ffffff' },
    })
      .then(setQrCodeUrl)
      .catch((err) => console.error('QR code generation error', err));
  }, [booking?.reference]);

  if (!booking) return null;

  return (
    <div className="confirmed-modal-backdrop">
      <div className="confirmed-ticket-card">
        <div className="confirmed-header">
          <div className="confetti-badge">🎉</div>
          <h2>Booking Confirmed!</h2>
          <p>Seats are reserved under your reference. Show this ticket at the cinema entry.</p>
        </div>

        <div className="confirmed-body">
          <div className="booking-ref-display">{booking.reference}</div>

          <div className="qr-code-box">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt={`QR Code for ${booking.reference}`} style={{ width: 140, height: 140, display: 'block' }} />
            ) : (
              <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                Generating QR...
              </div>
            )}
          </div>

          <div style={{ fontSize: 13.5, textAlign: 'left', background: 'var(--bg)', padding: '14px 18px', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 20 }}>
            <div style={{ marginBottom: 6 }}>
              <b>Movie: </b><span>{booking.movie_title || movie.title}</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <b>Screening: </b><span>Galaxy Cinema • Hall 1 • {booking.show_date_str || movie.date_str} at {booking.show_time_str || movie.time_str}</span>
            </div>
            <div style={{ marginBottom: 6 }}>
              <b>Seats: </b>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {booking.seats?.map((s) => s.label).join(', ')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)', borderTop: '1px dashed var(--line)', paddingTop: 8, marginTop: 8 }}>
              Tickets: {inr(booking.subtotal)}
              {booking.discount_amount > 0 ? ` • Discount: -${inr(booking.discount_amount)}` : ''}
              {' '}• CGST + SGST: {inr(booking.gst_amount)}
              {' '}• Platform Fee: {inr(booking.convenience_fee)}
            </div>
            <div style={{ marginTop: 6 }}>
              <b>Total Paid: </b>
              <span style={{ color: 'var(--mint)', fontWeight: 800 }}>{inr(booking.total_price)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-print-ticket" onClick={() => window.print()}>🖨️ Print / Save Ticket</button>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={onViewAllBookings}>View in My Bookings</button>
            <button className="btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}
