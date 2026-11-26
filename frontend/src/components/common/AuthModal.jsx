// Sign In and Register popup modal with Google Sign-In, email/password form, and demo login helpers.
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../services/apiClient';
import { evaluatePassword, PASSWORD_MAX_LENGTH } from '../../../../shared/passwordPolicy.mjs';

const STRENGTH_LEVELS = [
  { label: 'Very weak', color: '#dc2626' },
  { label: 'Weak', color: '#ea580c' },
  { label: 'Fair', color: '#d97706' },
  { label: 'Good', color: '#2563eb' },
  { label: 'Strong', color: '#2a9d72' },
];

export default function AuthModal({ defaultMode = 'login', onClose, onAuth, notify }) {
  const [mode, setMode] = useState(defaultMode);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
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

  const pwStatus = evaluatePassword(form.password);
  const strength = STRENGTH_LEVELS[Math.max(0, pwStatus.passedCount - 1)];

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setAttemptedSubmit(false);
    setShowPassword(false);
  };

  const fillDemo = (email, password) => {
    switchMode('login');
    setForm({ name: '', email, password });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (mode === 'register' && !pwStatus.valid) {
      setAttemptedSubmit(true);
      notify(pwStatus.errorMessage, 'err');
      return;
    }
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
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  maxLength={mode === 'register' ? PASSWORD_MAX_LENGTH : undefined}
                  style={{
                    width: '100%',
                    padding: '9px 56px 9px 12px',
                    border: `1px solid ${mode === 'register' && attemptedSubmit && !pwStatus.valid ? '#dc2626' : 'var(--line)'}`,
                    borderRadius: 8,
                  }}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--accent)',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {mode === 'register' && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11.5 }}>
                    <span style={{ color: 'var(--mute)', fontWeight: 600 }}>Password strength</span>
                    <span style={{ fontWeight: 700, color: form.password ? strength.color : 'var(--mute)' }}>
                      {form.password ? strength.label : 'Required'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {STRENGTH_LEVELS.map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 99,
                          background: form.password && idx < pwStatus.passedCount ? strength.color : 'var(--line)',
                          transition: 'background 0.15s ease',
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: 11.5 }}>
                    {pwStatus.checks.map((rule) => {
                      const color = rule.passed
                        ? 'var(--avail-text)'
                        : attemptedSubmit
                          ? '#dc2626'
                          : 'var(--mute)';
                      const icon = rule.passed ? '✓' : attemptedSubmit ? '✕' : '○';
                      return (
                        <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 5, color, fontWeight: rule.passed ? 600 : 400 }}>
                          <span style={{ fontSize: 11 }}>{icon}</span>
                          <span>{rule.label}</span>
                        </div>
                      );
                    })}
                  </div>

                  {attemptedSubmit && !pwStatus.valid && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: '#dc2626', fontWeight: 500 }}>
                      {pwStatus.errorMessage}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '11px', fontSize: 14 }} disabled={busy}>
              {busy ? 'Please wait...' : mode === 'login' ? 'Sign In & Continue' : 'Register Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5, color: 'var(--mute)' }}>
            {mode === 'login' ? 'New here? ' : 'Already registered? '}
            <button
              type="button"
              style={{ color: 'var(--accent)', fontWeight: 700 }}
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
