// Calculates ticket subtotal, promo discount, Indian GST slabs (CGST + SGST only), and platform fee.
const {
  PLATFORM_FEE_INR,
  GST_LOW_SLAB_MAX_PRICE,
  GST_LOW_SLAB_RATE,
  GST_HIGH_SLAB_RATE,
} = require('../config/bookingRules');

/**
 * Determines CGST and SGST rates/amounts for one ticket based on its price:
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
 * Computes full itemized pricing with CGST + SGST on tickets only, plus flat Platform Fee.
 */
function calculateBookingPricing(seats = [], discountAmount = 0) {
  const subtotal = seats.reduce((sum, seat) => sum + Number(seat.price || 0), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discountAmount || 0)), subtotal);
  const platformFee = seats.length > 0 ? PLATFORM_FEE_INR : 0;

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

  // Tax consists strictly of ticket CGST + SGST (no extra tax on Platform Fee).
  const gstAmount = Math.round(ticketGstExact);
  const cgstAmount = Number(ticketCgstExact.toFixed(2));
  const sgstAmount = Number(ticketSgstExact.toFixed(2));
  const totalPrice = Math.max(0, subtotal - appliedDiscount + platformFee + gstAmount);

  return {
    subtotal,
    discountAmount: appliedDiscount,
    platformFee,
    convenienceFee: platformFee,
    gstAmount,
    cgstAmount,
    sgstAmount,
    hasLowSlab,
    hasHighSlab,
    totalPrice,
  };
}

module.exports = { getTicketGstSlab, calculateBookingPricing };
