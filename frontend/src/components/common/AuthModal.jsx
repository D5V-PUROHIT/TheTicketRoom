// Sign In and Register popup modal with Google Sign-In, email/password form, and demo login helpers.
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../services/apiClient';

export default function AuthModal({ defaultMode = 'login', onClose, onAuth, notify }) {
  const [mode, setMode] = useState(defaultMode);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState(() => import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
  const googleBtnRef = useRef(null);
  const onAuthRef = useRef(onAuth);
  const notifyRef = useRef(notify);

  useEffect(() => {
    onAuthRef.current = onAuth;
    notifyRef.current = notify;
  }, [onAuth, notify]);

  // Fetch Google Client ID from backend runtime config if not injected at Vite build time.
  useEffect(() => {
    if (googleClientId) return;
    apiRequest('/auth/google-config')
      .then((d) => { if (d?.clientId) setGoogleClientId(d.clientId); })
      .catch(() => {});
  }, [googleClientId]);

  // Render Google Identity Services button once clientId and GSI script are both ready.
  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return;
    let cancelled = false;

    const initGoogleBtn = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return false;
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          if (!response?.credential) return;
          setBusy(true);
          try {
            const data = await apiRequest('/auth/google', {
              method: 'POST',
              body: { credential: response.credential },
            });
            onAuthRef.current(data);
          } catch (err) {
            notifyRef.current(err.message, 'err');
          } finally {
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 372,
        text: 'continue_with',
        shape: 'pill',
      });
      return true;
    };

    if (initGoogleBtn()) return;
    const poll = setInterval(() => {
      if (initGoogleBtn()) clearInterval(poll);
    }, 150);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [googleClientId]);

  const fillDemo = (email, password) => {
    setMode('login');
    setForm({ name: '', email, password });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await apiRequest(`/auth/${mode}`, { method: 'POST', body: form });
      onAuth(data);
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(30, 25, 50, 0.65)', backdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#ffffff', borderRadius: 16, maxWidth: 420, width: '100%', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 18 }}>{mode === 'login' ? 'Sign In to TheTicketRoom' : 'Create an Account'}</h3>
          <button onClick={onClose} style={{ fontSize: 18, color: 'var(--mute)' }}>✕</button>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Quick Demo Buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button type="button" className="btn-ghost" style={{ flex: 1, fontSize: 12, padding: '7px 8px' }} onClick={() => fillDemo('user1@test.com', 'Test@1234')}>
              ⚡ User 1 (Demo)
            </button>
            <button type="button" className="btn-ghost" style={{ flex: 1, fontSize: 12, padding: '7px 8px' }} onClick={() => fillDemo('admin@test.com', 'Admin@123')}>
              👑 Admin Dashboard
            </button>
          </div>

          {/* Google Identity Sign-In Button */}
          {googleClientId && (
            <>
              <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 44 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: 'var(--mute)', fontSize: 12 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span>or continue with email</span>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Full Name</label>
                <input
                  type="text" required
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Email Address</label>
              <input
                type="email" required
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Password</label>
              <input
                type="password" required
                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '11px', fontSize: 14 }} disabled={busy}>
              {busy ? 'Please wait...' : mode === 'login' ? 'Sign In & Continue' : 'Register Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5, color: 'var(--mute)' }}>
            {mode === 'login' ? 'New here? ' : 'Already registered? '}
            <button type="button" style={{ color: 'var(--accent)', fontWeight: 700 }} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
