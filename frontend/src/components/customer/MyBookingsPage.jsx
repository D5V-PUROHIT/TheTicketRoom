// Displays all confirmed customer bookings and lets users cancel reservations cleanly.
import { useEffect, useState } from 'react';
import { apiRequest } from '../../services/apiClient';
import TicketPassCard from './TicketPassCard';

export default function MyBookingsPage({ movie, notify, onGoBook }) {
  const [bookings, setBookings] = useState(null);

  const loadBookings = () =>
    apiRequest('/bookings')
      .then((d) => setBookings(d.bookings))
      .catch((e) => notify(e.message, 'err'));

  useEffect(() => {
    loadBookings();
  }, []);

  const handleCancelBooking = async (booking) => {
    if (!window.confirm(`Cancel reservation ${booking.reference}? Released seats will immediately become available.`)) return;
    try {
      await apiRequest(`/bookings/${booking.id}`, { method: 'DELETE' });
      notify('Booking cancelled and refund processed', 'ok');
      loadBookings();
    } catch (e) {
      notify(e.message, 'err');
    }
  };

  if (!bookings) {
    return <div className="tickets-wrap"><p style={{ textAlign: 'center', padding: 40 }}>Loading tickets...</p></div>;
  }

  if (!bookings.length) {
    return (
      <div className="tickets-wrap" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h2>No bookings found</h2>
        <p style={{ color: 'var(--mute)', margin: '8px 0 20px' }}>You haven't reserved any tickets yet.</p>
        <button className="btn-primary" onClick={onGoBook}>Book Seats Now</button>
      </div>
    );
  }

  return (
    <div className="tickets-wrap">
      <h2>My Confirmed Bookings ({bookings.length})</h2>
      <div className="tickets-grid">
        {bookings.map((b) => (
          <TicketPassCard key={b.id} booking={b} movie={movie} onCancel={() => handleCancelBooking(b)} />
        ))}
      </div>
    </div>
  );
}
