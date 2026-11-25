// Calculates ticket subtotal, promo discount, Indian GST slabs (5% <= Rs.100, 18% > Rs.100), and convenience fee.
const {
  CONVENIENCE_FEE_INR,
  CONVENIENCE_FEE_GST_RATE,
  GST_LOW_SLAB_MAX_PRICE,
  GST_LOW_SLAB_RATE,
  GST_HIGH_SLAB_RATE,
} = require('../config/bookingRules');

/**
 * Determines GST rate and CGST/SGST split for one ticket based on its price.
 * Rule (effective Sept 22, 2025):
 * - Ticket price <= Rs.100: 5% GST (2.5% CGST + 2.5% SGST)
 * - Ticket price > Rs.100: 18% GST (9% CGST + 9% SGST)
 */
function getTicketGstSlab(ticketPrice) {
  const isLowSlab = Number(ticketPrice) <= GST_LOW_SLAB_MAX_PRICE;
  const rate = isLowSlab ? GST_LOW_SLAB_RATE : GST_HIGH_SLAB_RATE;
  const halfRate = rate / 2;
  return {
    isLowSlab,
    rate,
    gstExact: ticketPrice * rate,
    cgstExact: ticketPrice * halfRate,
    sgstExact: ticketPrice * halfRate,
  };
}

/**
 * Computes full itemized pricing and GST breakdown for a list of selected seats.
 */
function calculateBookingPricing(seats = [], discountAmount = 0) {
  const subtotal = seats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discountAmount || 0)), subtotal);
  const convenienceFee = seats.length > 0 ? CONVENIENCE_FEE_INR : 0;

  let ticketGstExact = 0;
  let ticketCgstExact = 0;
  let ticketSgstExact = 0;
  let hasLowSlab = false;
  let hasHighSlab = false;

  for (const seat of seats) {
    const slab = getTicketGstSlab(seat.price);
    if (slab.isLowSlab) hasLowSlab = true;
    else hasHighSlab = true;
    ticketGstExact += slab.gstExact;
    ticketCgstExact += slab.cgstExact;
    ticketSgstExact += slab.sgstExact;
  }

  // Ticket GST uses the 5%/18% slabs; Convenience fee (service) attracts 18% GST.
  const ticketGst = Math.round(ticketGstExact);
  const convenienceFeeGst = Math.round(convenienceFee * CONVENIENCE_FEE_GST_RATE);
  const gstAmount = ticketGst + convenienceFeeGst;

  const cgstAmount = Number((ticketCgstExact + convenienceFee * (CONVENIENCE_FEE_GST_RATE / 2)).toFixed(2));
  const sgstAmount = Number((ticketSgstExact + convenienceFee * (CONVENIENCE_FEE_GST_RATE / 2)).toFixed(2));
  const totalPrice = Math.max(0, subtotal - appliedDiscount + convenienceFee + gstAmount);

  return {
    subtotal,
    discountAmount: appliedDiscount,
    convenienceFee,
    ticketGst,
    ticketCgstExact: Number(ticketCgstExact.toFixed(2)),
    ticketSgstExact: Number(ticketSgstExact.toFixed(2)),
    convenienceFeeGst,
    gstAmount,
    cgstAmount,
    sgstAmount,
    hasLowSlab,
    hasHighSlab,
    totalPrice,
  };
}

module.exports = { getTicketGstSlab, calculateBookingPricing };
