import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

async function api(path, { method = 'GET', body, key } = {}) {
  const token = localStorage.getItem('token');
  let r;
  try {
    r = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }), ...(key && { 'Idempotency-Key': key }) },
      body: body && JSON.stringify(body),
    });
  } catch { throw Object.assign(new Error('Network problem. Check your connection and try again.'), { code: 'NETWORK' }); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error?.message || 'Something went wrong'), { code: data.error?.code });
  return data;
}
const inr = (n) => '₹' + n;
const rows = 'ABCDEFGHIJ'.split('');

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [tab, setTab] = useState('book');
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(0);
  const timer = useRef();
  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 3800);
  }, []);
  const logout = useCallback(() => { localStorage.clear(); setUser(null); setTab('book'); }, []);

  useEffect(() => {
    if (!user) return;
    const s = io({ auth: { token: localStorage.getItem('token') } });
    s.on('presence', setOnline);
    setSocket(s);
    return () => { s.close(); setSocket(null); };
  }, [user]);

  if (!user) return <><Auth onAuth={(d) => { localStorage.setItem('token', d.token); localStorage.setItem('user', JSON.stringify(d.user)); setUser(d.user); }} notify={notify} /><Toast t={toast} /></>;
  return (
    <>
      <header className="top">
        <div className="brand"><i />TheTicketRoom</div>
        <nav className="tabs">
          {[['book', 'Book seats'], ['mine', 'My bookings'], ...(user.role === 'admin' ? [['admin', 'Admin']] : [])].map(([k, l]) =>
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </nav>
        <div className="who">{user.name}<button className="link" onClick={logout}>Sign out</button></div>
      </header>
      <main className="wrap">
        {socket && tab === 'book' && <Book user={user} socket={socket} notify={notify} logout={logout} online={online} goTickets={() => setTab('mine')} />}
        {tab === 'mine' && <Mine notify={notify} />}
        {socket && tab === 'admin' && <Admin socket={socket} />}
      </main>
      <Toast t={toast} />
    </>
  );
}

const Toast = ({ t }) => t && <div className={'toast ' + t.type} role="status">{t.msg}</div>;

function Auth({ onAuth, notify }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { onAuth(await api(`/auth/${mode}`, { method: 'POST', body: f })); }
    catch (err) { notify(err.message, 'err'); } finally { setBusy(false); }
  };
  const field = (k, label, type = 'text') => (
    <><label htmlFor={k}>{label}</label><input id={k} type={type} required value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} autoComplete={k === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : k} /></>);
  return (
    <form className="card auth" onSubmit={submit}>
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="hint" style={{ marginBottom: 18 }}>Tonight at 10:00 PM, Hall 1. Hold seats for two minutes while you decide.</p>
      {mode === 'register' && field('name', 'Full name')}
      {field('email', 'Email', 'email')}
      {field('password', 'Password', 'password')}
      <button className="btn" disabled={busy}>{busy ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>
        {mode === 'login' ? 'New here? ' : 'Already registered? '}
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button>
      </p>
    </form>
  );
}

function Book({ user, socket, notify, logout, online, goTickets }) {
  const [seats, setSeats] = useState({});
  const [cfg, setCfg] = useState({ maxSeats: 4, holdSeconds: 120 });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const key = useRef(crypto.randomUUID());

  const merge = (list) => setSeats((p) => { const n = { ...p }; list.forEach((s) => (n[s.id] = s)); return n; });
  const load = useCallback(() => api('/seats').then((d) => { setSeats(Object.fromEntries(d.seats.map((s) => [s.id, s]))); setCfg(d); })
    .catch((e) => (e.code === 'UNAUTHENTICATED' ? logout() : notify(e.message, 'err'))), [logout, notify]);
  useEffect(() => { load(); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    socket.on('seats:update', merge); socket.on('connect', load);
    return () => { socket.off('seats:update', merge); socket.off('connect', load); };
  }, [socket, load]);

  const all = Object.values(seats).sort((a, b) => a.id - b.id);
  const mine = all.filter((s) => s.status === 'held' && s.held_by === user.id);
  const expiry = mine.length ? Math.min(...mine.map((s) => +new Date(s.hold_expires_at))) : 0;
  const left = Math.max(0, Math.ceil((expiry - now) / 1000));
  useEffect(() => { if (mine.length && left === 0) load(); }, [left]); // eslint-disable-line
  const total = mine.reduce((t, s) => t + s.price, 0);
  const count = (st) => all.filter((s) => s.status === st).length;

  const pick = async (s) => {
    if (busy) return;
    const ids = mine.map((m) => m.id);
    const next = ids.includes(s.id) ? ids.filter((i) => i !== s.id) : [...ids, s.id];
    if (next.length > cfg.maxSeats) return notify(`You can select up to ${cfg.maxSeats} seats`, 'err');
    setBusy(true);
    try { merge((await api('/holds', { method: 'POST', body: { seatIds: next } })).seats); }
    catch (e) { notify(e.message, 'err'); load(); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      await api('/bookings', { method: 'POST', key: key.current });
      key.current = crypto.randomUUID(); notify('Booking confirmed. Enjoy the show!'); goTickets();
    } catch (e) {
      if (e.code !== 'NETWORK') key.current = crypto.randomUUID(); // a network retry reuses the same key
      notify(e.message, 'err'); load();
    } finally { setBusy(false); }
  };
  const release = async () => { setBusy(true); try { merge((await api('/holds', { method: 'POST', body: { seatIds: [] } })).seats); } catch (e) { notify(e.message, 'err'); } finally { setBusy(false); } };

  return (
    <>
      <div className="movie">
        <div><h1>Midnight at the Observatory</h1><p>Tonight, 10:00 PM · Hall 1 · 100 seats</p></div>
        <span className="pill"><span className="dot" /><b>{online}</b> watching live</span>
      </div>
      <div className="grid">
        <section className="card" aria-label="Seat map">
          <div className="screen">Screen</div>
          {rows.map((r) => (
            <div className="row" key={r}>
              <span className="rl">{r}</span>
              <div className="seats">
                {all.filter((s) => s.row_label === r).map((s) => {
                  const isMine = s.status === 'held' && s.held_by === user.id;
                  const st = isMine ? 'mine' : s.status;
                  return <button key={s.id} className={`seat t${s.price} ${st}`} disabled={st === 'booked' || (st === 'held')}
                    onClick={() => pick(s)} aria-label={`Seat ${r}${s.seat_number}, ${inr(s.price)}, ${isMine ? 'selected by you' : s.status}`}
                    title={`${r}${s.seat_number} · ${inr(s.price)}`}>{s.seat_number}</button>;
                })}
              </div>
            </div>
          ))}
          <div className="legend"><span>Available ({count('available')})</span><span className="m">Yours</span><span className="h">Held by others ({count('held')})</span><span className="b">Booked ({count('booked')})</span></div>
          <div className="tiers"><span>Rows A–B Recliner {inr(350)}</span><span>C–F Prime {inr(250)}</span><span>G–J Classic {inr(180)}</span></div>
        </section>
        <aside className="card side">
          <h3>Your selection</h3>
          <div className="chips">{mine.length ? mine.map((s) => <span className="chip" key={s.id}>{s.row_label}{s.seat_number}</span>) : <span className="hint">Pick up to {cfg.maxSeats} seats from the map.</span>}</div>
          {mine.length > 0 && <>
            <div className="line"><span>{mine.length} seat{mine.length > 1 ? 's' : ''}</span><b>{inr(total)}</b></div>
            <div className="timer"><i style={{ width: `${(left / cfg.holdSeconds) * 100}%` }} /></div>
            <p className="hint">Held for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}. Seats are released after that.</p>
            <button className="btn" disabled={busy || left === 0} onClick={confirm}>Confirm booking</button>
            <button className="btn ghost" disabled={busy} onClick={release}>Release seats</button>
          </>}
        </aside>
      </div>
    </>
  );
}

function Mine({ notify }) {
  const [list, setList] = useState(null);
  const load = () => api('/bookings').then((d) => setList(d.bookings)).catch((e) => notify(e.message, 'err'));
  useEffect(() => { load(); }, []); // eslint-disable-line
  const cancel = async (b) => {
    if (!window.confirm(`Cancel booking ${b.reference}? The seats will be released.`)) return;
    try { await api(`/bookings/${b.id}`, { method: 'DELETE' }); notify('Booking cancelled'); load(); } catch (e) { notify(e.message, 'err'); }
  };
  if (!list) return null;
  if (!list.length) return <div className="card empty">No bookings yet. Pick your seats on the Book seats tab.</div>;
  return (
    <div className="tickets">
      {list.map((b) => (
        <article className="ticket" key={b.id}>
          <h3>Midnight at the Observatory</h3>
          <div className="ref">{b.reference}</div>
          <p className="hint">Tonight, 10:00 PM · Hall 1</p>
          <div className="chips" style={{ marginTop: 12 }}>{b.seats.map((s) => <span className="chip" key={s.id}>{s.label}</span>)}</div>
          <div className="line"><span>Total paid</span><b>{inr(b.total_price)}</b></div>
          <button className="btn ghost" onClick={() => cancel(b)}>Cancel booking</button>
        </article>
      ))}
    </div>
  );
}

function Admin({ socket }) {
  const [s, setS] = useState(null);
  const load = useCallback(() => api('/admin/stats').then(setS).catch(() => {}), []);
  useEffect(() => {
    load(); let t;
    const h = () => { clearTimeout(t); t = setTimeout(load, 300); };
    socket.on('seats:update', h);
    return () => { socket.off('seats:update', h); clearTimeout(t); };
  }, [socket, load]);
  if (!s) return null;
  const pct = (n) => `${(n / s.total) * 100}%`;
  return (
    <>
      <div className="stats">
        {[['Available', s.available], ['Held', s.held], ['Booked', s.booked], ['Revenue', inr(s.revenue)]].map(([l, v]) =>
          <div className="card stat" key={l}><b>{v}</b><span>{l}</span></div>)}
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h3>Hall occupancy</h3>
        <div className="bar"><i style={{ width: pct(s.booked), background: '#7c6cf0' }} /><i style={{ width: pct(s.held), background: '#ffb592' }} /></div>
        <p className="hint">{s.booked} booked, {s.held} held, {s.available} available of {s.total}. Updates live.</p>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Latest bookings</h3>
        {s.recent.length ? <table><thead><tr><th>Reference</th><th>User</th><th>Seats</th><th>Total</th></tr></thead>
          <tbody>{s.recent.map((r) => <tr key={r.reference}><td>{r.reference}</td><td>{r.email}</td><td>{r.seats}</td><td>{inr(r.total_price)}</td></tr>)}</tbody></table>
          : <p className="hint">No bookings yet.</p>}
      </div>
    </>
  );
}
