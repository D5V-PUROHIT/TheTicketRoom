// Bottom website footer with legal/policy links (hidden inside the Admin Dashboard).
export default function Footer({ onOpenPolicy }) {
  return (
    <footer style={{ borderTop: '1px solid var(--line)', background: '#ffffff', padding: '36px 24px 28px', marginTop: 50, textAlign: 'center' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
          <button className="cat-item" onClick={() => onOpenPolicy('terms')}>Terms of Service</button>
          <button className="cat-item" onClick={() => onOpenPolicy('privacy')}>Privacy Policy</button>
          <button className="cat-item" onClick={() => onOpenPolicy('refund')}>Cancellation & Refund Policy</button>
          <button className="cat-item" onClick={() => onOpenPolicy('licensing')}>Exhibitor Licensing Notice</button>
          <button className="cat-item" onClick={() => onOpenPolicy('contact')}>Contact & Grievance</button>
        </div>
        <p style={{ color: 'var(--mute)', fontSize: 12, lineHeight: 1.6, maxWidth: 740, margin: '0 auto' }}>
          © 2026 TheTicketRoom Cinema Technologies Pvt. Ltd. All rights reserved. GSTIN: 27AABCT1234F1Z8.
          Commercial ticketing requires direct exhibitor agreements, CBFC licensed content, and compliance with statutory refund regulations.
        </p>
      </div>
    </footer>
  );
}
