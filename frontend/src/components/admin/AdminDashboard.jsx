// Unified 6-tab Admin Dashboard coordinator managing admin API calls and WebSocket updates.
import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/apiClient';
import { dateStrToIso, formatDateWithDay, formatTime12h, timeStrTo24h } from '../../utils/formatters';
import MonitoringOverviewTab from './MonitoringOverviewTab';
import ShowsScheduleTab from './ShowsScheduleTab';
import MovieCatalogueTab from './MovieCatalogueTab';
import CustomerSupportTab from './CustomerSupportTab';
import FinanceReportsTab from './FinanceReportsTab';
import AuditAndUsersTab from './AuditAndUsersTab';

export default function AdminDashboard({ user, socket, movie, setMovie, onAddUpcoming, notify }) {
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [showsList, setShowsList] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState(1);
  const [moviesHistory, setMoviesHistory] = useState([]);
  const [supportBookings, setSupportBookings] = useState([]);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [busy, setBusy] = useState(false);

  const [calDate, setCalDate] = useState(() => dateStrToIso(movie.date_str));
  const [calTime, setCalTime] = useState(() => timeStrTo24h(movie.time_str));
  const [schedForm, setSchedForm] = useState({
    date_str: movie.date_str || 'Friday, 27 November, 2026',
    time_str: movie.time_str || '10:00 PM',
  });

  const [newShowCalDate, setNewShowCalDate] = useState('2026-11-27');
  const [newShowCalTime, setNewShowCalTime] = useState('13:00');
  const [newShowForm, setNewShowForm] = useState({
    date_str: 'Friday, 27 November, 2026',
    time_str: '01:00 PM',
    price_recliner: 350,
    price_club: 250,
    price_premium: 180,
  });

  const activeShows = showsList.filter((sh) => sh.movie_id === 1 && sh.status !== 'cancelled');
  const currentShow = activeShows.find((sh) => sh.id === selectedShowId) || activeShows[0];
  const currentBookedCount = currentShow ? currentShow.booked_count : (stats?.booked || 0);
  const isShowLocked = currentBookedCount > 0;

  useEffect(() => {
    const targetDate = currentShow?.date_str || movie.date_str;
    const targetTime = currentShow?.time_str || movie.time_str || '10:00 PM';
    if (targetDate) {
      setSchedForm({ date_str: targetDate, time_str: targetTime });
      setCalDate(dateStrToIso(targetDate));
      setCalTime(timeStrTo24h(targetTime));
    }
  }, [currentShow?.id, currentShow?.date_str, currentShow?.time_str, movie.date_str, movie.time_str]);

  const onCalendarDateChange = (val) => {
    setCalDate(val);
    setSchedForm((prev) => ({ ...prev, date_str: formatDateWithDay(val) }));
  };

  const onTimePickerChange = (val) => {
    setCalTime(val);
    setSchedForm((prev) => ({ ...prev, time_str: formatTime12h(val) }));
  };

  const [newMovieCalDate, setNewMovieCalDate] = useState('2026-12-04');
  const [newMovieCalTime, setNewMovieCalTime] = useState('20:00');
  const [newMovieForm, setNewMovieForm] = useState({
    title: '', synopsis: '', poster_url: '/poster-ramayana.svg',
    genres: 'Action • Epic • Drama', language: 'Hindi, Telugu', certificate: 'U/A 13+',
    runtime_mins: 159, cast_members: 'Lead Cast', date_str: 'Friday, 4 December, 2026', time_str: '08:00 PM',
  });

  const loadStats = useCallback(() => {
    const targetId = currentShow?.id || selectedShowId || 1;
    apiRequest(`/admin/stats?showId=${targetId}`).then(setStats).catch((e) => notify(e.message, 'err'));
    apiRequest('/admin/shows').then((d) => setShowsList(d.shows || [])).catch(() => {});
  }, [notify, currentShow?.id, selectedShowId]);

  const loadHistory = useCallback(() => {
    apiRequest('/admin/movies').then((d) => setMoviesHistory(d.movies || [])).catch(() => {});
  }, []);

  const loadSupportBookings = useCallback((q = '') => {
    apiRequest(`/admin/bookings${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then((d) => setSupportBookings(d.bookings || []))
      .catch((e) => notify(e.message, 'err'));
  }, [notify]);

  const loadFinance = useCallback(() => {
    apiRequest('/admin/finance/summary').then(setFinanceSummary).catch((e) => notify(e.message, 'err'));
  }, [notify]);

  const loadAudit = useCallback(() => {
    apiRequest('/admin/audit-logs').then((d) => setAuditLogs(d.logs || [])).catch((e) => notify(e.message, 'err'));
    apiRequest('/admin/users').then((d) => setUsersList(d.users || [])).catch(() => {});
  }, [notify]);

  useEffect(() => {
    loadStats();
    loadHistory();
    if (tab === 'support') loadSupportBookings(searchQ);
    if (tab === 'finance') loadFinance();
    if (tab === 'audit') loadAudit();

    if (!socket) return;
    let t;
    const onLiveChange = () => { clearTimeout(t); t = setTimeout(loadStats, 300); };
    socket.on('seats:update', onLiveChange);
    socket.on('shows:update', onLiveChange);
    return () => {
      socket.off('seats:update', onLiveChange);
      socket.off('shows:update', onLiveChange);
      clearTimeout(t);
    };
  }, [socket, tab, searchQ, loadStats, loadHistory, loadSupportBookings, loadFinance, loadAudit]);

  const handleSupportCancel = async (bookingId) => {
    const reason = window.prompt('Enter mandatory cancellation reason for audit log:');
    if (!reason || !reason.trim()) return notify('Cancellation aborted: reason is required', 'warn');
    setBusy(true);
    try {
      await apiRequest(`/admin/bookings/${bookingId}/cancel`, { method: 'POST', body: { reason: reason.trim() } });
      notify('Booking cancelled and refund issued via support', 'ok');
      loadSupportBookings(searchQ);
      loadStats();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleSuspendUser = async (targetUser) => {
    setBusy(true);
    try {
      await apiRequest(`/admin/users/${targetUser.id}/suspend`, {
        method: 'PUT',
        body: { suspended: !targetUser.is_suspended, reason: 'Abuse protection / policy violation' },
      });
      notify(`User ${targetUser.email} ${!targetUser.is_suspended ? 'suspended' : 're-activated'}`, 'ok');
      loadAudit();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadFinanceCsv = async () => {
    try {
      const token = localStorage.getItem('token');
      const r = await fetch('/api/admin/finance/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error('Unable to download CSV export');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'theticketroom-finance-report.csv';
      a.click();
      URL.revokeObjectURL(url);
      notify('Finance CSV downloaded', 'ok');
    } catch (err) {
      notify(err.message, 'err');
    }
  };

  const handleUpdateSchedule = async (e) => {
    e.preventDefault();
    if (isShowLocked) {
      return notify(`Cannot change time: ${currentBookedCount} ticket(s) already booked. Add a new showtime instead.`, 'err');
    }
    setBusy(true);
    try {
      const targetId = currentShow?.id || selectedShowId || 1;
      const res = await apiRequest('/admin/movies/schedule', { method: 'PUT', body: { showId: targetId, ...schedForm } });
      if (targetId === 1 && res.movie) setMovie(res.movie);
      notify(`Updated showtime #${targetId} to ${schedForm.date_str} at ${schedForm.time_str}`, 'ok');
      loadStats();
      loadHistory();
    } catch (err) {
      notify(err.message, 'err');
      loadStats();
    } finally {
      setBusy(false);
    }
  };

  const handleCancelUnbookedShow = async () => {
    const targetId = currentShow?.id || selectedShowId;
    if (!targetId) return;
    if (isShowLocked) return notify(`Cannot cancel show while ${currentBookedCount} ticket(s) are booked.`, 'err');
    if (!window.confirm(`Cancel the unbooked ${currentShow?.time_str || ''} show on ${currentShow?.date_str || ''}?`)) return;
    setBusy(true);
    try {
      await apiRequest(`/admin/shows/${targetId}`, { method: 'PUT', body: { status: 'cancelled' } });
      notify(`Cancelled empty show (${currentShow?.time_str}).`, 'ok');
      setSelectedShowId(1);
      loadStats();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNewShowtime = async (e) => {
    e.preventDefault();
    if (!newShowForm.date_str || !newShowForm.time_str) return notify('Both date and showtime are required', 'err');
    setBusy(true);
    try {
      const res = await apiRequest('/admin/shows', {
        method: 'POST',
        body: {
          movie_id: 1,
          hall_id: 1,
          date_str: newShowForm.date_str,
          time_str: newShowForm.time_str,
          price_recliner: Number(newShowForm.price_recliner) || 350,
          price_club: Number(newShowForm.price_club) || 250,
          price_premium: Number(newShowForm.price_premium) || 180,
        },
      });
      notify(`Added new open showtime: ${res.show.date_str} at ${res.show.time_str} (100 seats ready)!`, 'ok');
      setSelectedShowId(res.show.id);
      loadStats();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const handleAddNewMovie = async (e) => {
    e.preventDefault();
    if (!newMovieForm.title.trim()) return notify('Movie title is required', 'err');
    setBusy(true);
    try {
      const res = await apiRequest('/admin/movies', { method: 'POST', body: newMovieForm });
      if (onAddUpcoming) {
        onAddUpcoming({
          id: `custom-${res.movie.id}`,
          isUpcoming: true,
          title: res.movie.title,
          genre: res.movie.genres || newMovieForm.genres,
          language: res.movie.language || newMovieForm.language,
          rating: '9.0',
          poster_url: res.movie.poster_url || newMovieForm.poster_url,
          date_str: newMovieForm.date_str,
          time_str: newMovieForm.time_str,
          synopsis: res.movie.synopsis || newMovieForm.synopsis || 'Upcoming theatrical release at Galaxy Cinema.',
        });
      }
      notify(`Added "${res.movie.title}" to Upcoming Releases!`, 'ok');
      setNewMovieForm((prev) => ({ ...prev, title: '', synopsis: '' }));
      loadHistory();
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const scheduleProps = {
    movie, activeShows, currentShow, selectedShowId, setSelectedShowId, isShowLocked, currentBookedCount,
    calDate, calTime, schedForm, setSchedForm, onCalendarDateChange, onTimePickerChange, setCalTime,
    handleUpdateSchedule, handleCancelUnbookedShow,
    newShowCalDate, setNewShowCalDate, newShowCalTime, setNewShowCalTime, newShowForm, setNewShowForm,
    handleCreateNewShowtime, busy,
  };

  const tabs = [
    { id: 'overview', label: '📊 Live Monitoring & KPIs' },
    { id: 'shows', label: '🎬 Shows & Schedule' },
    { id: 'catalogue', label: '🎞️ Movie Catalogue' },
    { id: 'support', label: '🎧 Customer Support' },
    { id: 'finance', label: '💼 Finance & Reports' },
    { id: 'audit', label: '🛡️ Audit Log & Moderation' },
  ];

  return (
    <div className="admin-wrap" style={{ maxWidth: 1140, margin: '24px auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>Admin Dashboard</h2>
        <p style={{ color: 'var(--mute)', fontSize: 13, margin: 0 }}>Active session: <b>{user.email}</b></p>
      </div>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 12, marginBottom: 24, overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 13, padding: '7px 16px', whiteSpace: 'nowrap' }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <MonitoringOverviewTab stats={stats} scheduleProps={scheduleProps} />}
      {tab === 'shows' && <ShowsScheduleTab showsList={showsList} scheduleProps={scheduleProps} />}
      {tab === 'catalogue' && (
        <MovieCatalogueTab
          newMovieForm={newMovieForm} setNewMovieForm={setNewMovieForm}
          newMovieCalDate={newMovieCalDate} setNewMovieCalDate={setNewMovieCalDate}
          newMovieCalTime={newMovieCalTime} setNewMovieCalTime={setNewMovieCalTime}
          handleAddNewMovie={handleAddNewMovie} moviesHistory={moviesHistory} busy={busy}
        />
      )}
      {tab === 'support' && (
        <CustomerSupportTab
          searchQ={searchQ}
          onSearchChange={(val) => { setSearchQ(val); loadSupportBookings(val); }}
          supportBookings={supportBookings}
          onSupportCancel={handleSupportCancel}
        />
      )}
      {tab === 'finance' && <FinanceReportsTab financeSummary={financeSummary} onDownloadCsv={handleDownloadFinanceCsv} />}
      {tab === 'audit' && <AuditAndUsersTab auditLogs={auditLogs} usersList={usersList} onToggleSuspendUser={handleToggleSuspendUser} />}
    </div>
  );
}
