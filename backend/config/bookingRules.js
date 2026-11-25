// Central booking rules, seat limits, and Indian GST tax rates.
module.exports = {
  // Maximum tickets one customer account can hold or book per show.
  MAX_SEATS_PER_USER: 4,

  // How long a selected seat stays locked (2 minutes) before auto-releasing.
  HOLD_DURATION_SECONDS: 120,

  // Flat platform convenience fee charged per booking (in INR).
  CONVENIENCE_FEE_INR: 20,

  // Convenience fee always attracts 18% GST (9% CGST + 9% SGST).
  CONVENIENCE_FEE_GST_RATE: 0.18,

  // Indian GST slabs for movie tickets (effective September 22, 2025):
  // - Ticket price up to Rs.100 -> 5% GST (2.5% CGST + 2.5% SGST)
  // - Ticket price above Rs.100 -> 18% GST (9% CGST + 9% SGST)
  GST_LOW_SLAB_MAX_PRICE: 100,
  GST_LOW_SLAB_RATE: 0.05,
  GST_HIGH_SLAB_RATE: 0.18,

  // SQL seat columns: automatically treats expired holds as 'available'.
  SEAT_VIEW_COLUMNS: `id, show_id, row_label, seat_number, tier, price,
    CASE WHEN status='held' AND hold_expires_at <= now() THEN 'available' ELSE status END AS status,
    CASE WHEN status='held' AND hold_expires_at > now() THEN held_by END AS held_by,
    CASE WHEN status='held' AND hold_expires_at > now() THEN hold_expires_at END AS hold_expires_at`,
};
