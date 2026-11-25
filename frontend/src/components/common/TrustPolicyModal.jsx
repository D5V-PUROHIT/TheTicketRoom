// Legal terms, privacy policy, refund policy, and GST/licensing information popup.
export default function TrustPolicyModal({ policy, onClose }) {
  const titles = {
    terms: 'Terms of Service',
    privacy: 'Privacy & Data Protection Policy',
    refund: 'Cancellation & Statutory Refund Policy',
    licensing: 'Exhibitor Licensing & Legal Compliance Notice',
    contact: 'Contact & Grievance Redressal',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(30, 25, 50, 0.65)', backdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#ffffff', borderRadius: 16, maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 10 }}>
          <h3 style={{ fontSize: 18 }}>{titles[policy] || 'Legal Policy'}</h3>
          <button onClick={onClose} style={{ fontSize: 20, color: 'var(--mute)' }}>✕</button>
        </div>

        <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#374151' }}>
          {policy === 'terms' && (
            <div>
              <p style={{ marginBottom: 10 }}>1. <b>Ticket Validity:</b> E-tickets reserved via TheTicketRoom are non-transferable and admit one person per seat entry. Real-time hold duration is strictly 2 minutes prior to payment capture.</p>
              <p style={{ marginBottom: 10 }}>2. <b>Fair Access Policy:</b> Each registered account is limited to booking a maximum of 4 seats per screening to prevent unauthorized bot scalping and ticket hoarding.</p>
              <p style={{ marginBottom: 10 }}>3. <b>Admission Rights:</b> The cinema exhibitor reserves right of admission. Patrons must present valid government photo identification matching the booking name for Adult-rated (A) screenings.</p>
            </div>
          )}
          {policy === 'privacy' && (
            <div>
              <p style={{ marginBottom: 10 }}>1. <b>Data We Collect:</b> Account identity (name, email address), cryptographic transaction records, and masked payment tokens. We do not store raw cardholder numbers or CVVs.</p>
              <p style={{ marginBottom: 10 }}>2. <b>Audit Trails:</b> Administrative actions (show scheduling, refunds, seat blocks) are logged in append-only system registers with timestamps for compliance.</p>
              <p>3. <b>Your Rights:</b> Customers may request account data export or permanent deletion by emailing support@theticketroom.com.</p>
            </div>
          )}
          {policy === 'refund' && (
            <div>
              <p style={{ marginBottom: 10 }}>1. <b>Cancellation Window:</b> Bookings may be cancelled online up to 20 minutes before scheduled showtime directly through the "My Bookings" interface.</p>
              <p style={{ marginBottom: 10 }}>2. <b>Refund Issuance:</b> Refunds are initiated immediately back to the original payment source. Depending on the issuing bank, funds credit within 3 to 5 business days.</p>
              <p>3. <b>GST & Convenience Fee:</b> Ticket GST follows Indian GST slabs (5% up to ₹100 [2.5% CGST + 2.5% SGST], 18% above ₹100). Convenience fees and applicable 18% GST are statutory service charges.</p>
            </div>
          )}
          {policy === 'licensing' && (
            <div style={{ background: 'var(--bg)', padding: 16, borderRadius: 8, border: '1px solid var(--line)' }}>
              <h4 style={{ fontSize: 14, marginBottom: 8, color: 'var(--ink)' }}>⚠️ Mandatory Commercial Ticketing Notice</h4>
              <p style={{ marginBottom: 10 }}>Commercial deployment of online cinema ticketing platforms requires:</p>
              <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
                <li>Executed Master Service Agreements (MSA) with individual theatre exhibitors or multiplex chains.</li>
                <li>Licensed high-resolution movie poster, stills, and trailer rights from authorized film distributors and producers.</li>
                <li>Valid GSTIN registration with slab-compliant GST invoicing (5% up to ₹100; 18% above ₹100).</li>
                <li>Full compliance with Central Board of Film Certification (CBFC) age ratings and local municipal licensing.</li>
              </ul>
            </div>
          )}
          {policy === 'contact' && (
            <div>
              <p style={{ marginBottom: 8 }}><b>Support Desk:</b> support@theticketroom.com</p>
              <p style={{ marginBottom: 8 }}><b>Exhibitor Partnership Inquiries:</b> partners@theticketroom.com</p>
              <p style={{ marginBottom: 8 }}><b>Grievance Officer:</b> Compliance Dept, TheTicketRoom Technologies Pvt. Ltd., Mumbai, India.</p>
              <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 12 }}>Response time: within 24 hours.</p>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button className="btn-primary" onClick={onClose} style={{ padding: '8px 20px', fontSize: 13 }}>Understood</button>
        </div>
      </div>
    </div>
  );
}
