// Frontend pricing & CGST/SGST breakdown matching backend/services/gstAndPricingService.js exactly.
// Effective Sept 22, 2025:
// - Ticket price <= Rs.100 -> 5% (2.5% CGST + 2.5% SGST)
// - Ticket price > Rs.100 -> 18% (9% CGST + 9% SGST)
// - Platform Fee (Rs.20 flat, no extra GST)

export function calculateClientPricing(seats = [], discountAmount = 0) {
  const subtotal = seats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discountAmount || 0)), subtotal);
  const platformFee = seats.length > 0 ? 20 : 0;

  let ticketGstExact = 0;
  let ticketCgstExact = 0;
  let ticketSgstExact = 0;
  let hasLowSlab = false;
  let hasHighSlab = false;

  for (const seat of seats) {
    const isLow = Number(seat.price) <= 100;
    const rate = isLow ? 0.05 : 0.18;
    if (isLow) hasLowSlab = true;
    else hasHighSlab = true;
    ticketGstExact += seat.price * rate;
    ticketCgstExact += seat.price * (rate / 2);
    ticketSgstExact += seat.price * (rate / 2);
  }

  const gstAmount = Math.round(ticketGstExact);
  const cgstAmount = Number(ticketCgstExact.toFixed(2));
  const sgstAmount = Number(ticketSgstExact.toFixed(2));
  const total = Math.max(0, subtotal - appliedDiscount + platformFee + gstAmount);

  let taxLabel = 'CGST (9%) + SGST (9%)';
  if (hasLowSlab && !hasHighSlab) taxLabel = 'CGST (2.5%) + SGST (2.5%)';
  else if (hasLowSlab && hasHighSlab) taxLabel = 'CGST + SGST (2.5% / 9%)';

  return {
    subtotal,
    discountAmount: appliedDiscount,
    platformFee,
    gstAmount,
    cgstAmount,
    sgstAmount,
    hasLowSlab,
    hasHighSlab,
    taxLabel,
    total,
  };
}
