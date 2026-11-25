// Frontend pricing & GST breakdown matching backend/services/gstAndPricingService.js exactly.
// Effective Sept 22, 2025:
// - Ticket price <= Rs.100 -> 5% GST (2.5% CGST + 2.5% SGST)
// - Ticket price > Rs.100 -> 18% GST (9% CGST + 9% SGST)
// - Convenience fee (Rs.20) -> 18% GST

export function calculateClientPricing(seats = [], discountAmount = 0) {
  const subtotal = seats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discountAmount || 0)), subtotal);
  const convenienceFee = seats.length > 0 ? 20 : 0;

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

  const ticketGst = Math.round(ticketGstExact);
  const convenienceFeeGst = Math.round(convenienceFee * 0.18);
  const gstAmount = ticketGst + convenienceFeeGst;

  const cgstAmount = Number((ticketCgstExact + convenienceFee * 0.09).toFixed(2));
  const sgstAmount = Number((ticketSgstExact + convenienceFee * 0.09).toFixed(2));
  const total = Math.max(0, subtotal - appliedDiscount + convenienceFee + gstAmount);

  let ticketGstLabel = '18% GST';
  if (hasLowSlab && !hasHighSlab) ticketGstLabel = '5% (2.5% CGST + 2.5% SGST)';
  else if (hasLowSlab && hasHighSlab) ticketGstLabel = '5% & 18% Slabs';
  else if (hasHighSlab) ticketGstLabel = '18% (9% CGST + 9% SGST)';

  return {
    subtotal,
    discountAmount: appliedDiscount,
    convenienceFee,
    ticketGst,
    convenienceFeeGst,
    gstAmount,
    cgstAmount,
    sgstAmount,
    hasLowSlab,
    hasHighSlab,
    ticketGstLabel,
    total,
  };
}
