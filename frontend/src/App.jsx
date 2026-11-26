// Root application shell managing auth state, Socket.IO real-time updates, and page navigation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiRequest } from './services/apiClient';
import { isStaffRole } from './utils/formatters';
import { INITIAL_MOVIE, UPCOMING_MOVIES } from './constants/moviesData';

import Navbar from './components/common/Navbar';
import Footer from './components/common/Footer';
import ToastAlert from './components/common/ToastAlert';
import AuthModal from './components/common/AuthModal';
import TrustPolicyModal from './components/common/TrustPolicyModal';

import HomeMoviePortal from './components/customer/HomeMoviePortal';
import UpcomingMovieNoticeModal from './components/customer/UpcomingMovieNoticeModal';
import MovieDetailsPage from './components/customer/MovieDetailsPage';
import SeatMapBookingPage from './components/customer/SeatMapBookingPage';
import BookingConfirmedModal from './components/customer/BookingConfirmedModal';
import MyBookingsPage from './components/customer/MyBookingsPage';

import AdminDashboard from './components/admin/AdminDashboard';

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [view, setView] = useState(() => (isStaffRole(JSON.parse(localStorage.getItem('user') || 'null')?.role) ? 'admin' : 'portal'));
  const [activeMovie, setActiveMovie] = useState(INITIAL_MOVIE);
  const [openShows, setOpenShows] = useState([{ id: 1, date_str: INITIAL_MOVIE.date_str, time_str: INITIAL_MOVIE.time_str, status: 'open' }]);
  const [selectedShowId, setSelectedShowId] = useState(1);
  const [upcomingList, setUpcomingList] = useState(UPCOMING_MOVIES);
  const [upcomingModalMovie, setUpcomingModalMovie] = useState(null);
  const [lastConfirmedBooking, setLastConfirmedBooking] = useState(null);
  const [toast, setToast] = useState(null);
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(1);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [trustPolicy, setTrustPolicy] = useState(null);
  const toastTimer = useRef();

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
    setView('portal');
    notify('Signed out successfully', 'ok');
  }, [notify]);

  const onAuthSuccess = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    setView(isStaffRole(data.user?.role) ? 'admin' : 'portal');
    setShowAuthModal(false);
    notify(`Welcome back, ${data.user.name}!`, 'ok');
  };

  const openAuth = (mode = 'login') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const loadActiveMovie = useCallback(() => {
    apiRequest('/movie')
      .then((d) => { if (d.movie) setActiveMovie({ ...INITIAL_MOVIE, ...d.movie }); })
      .catch(() => {});

    apiRequest('/shows')
      .then((d) => {
        const onlyOpen = (d.shows || []).filter((s) => s.status === 'open');
        setOpenShows(onlyOpen);
        setSelectedShowId((prev) => (onlyOpen.some((s) => s.id === prev) ? prev : onlyOpen[0]?.id || null));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadActiveMovie();
  }, [loadActiveMovie]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const s = io({ auth: { token } });
    s.on('presence', (count) => setOnline(count || 1));
    s.on('movie:update', (updated) => {
      setActiveMovie((prev) => ({ ...prev, ...updated }));
      loadActiveMovie();
      notify(`Cinema schedule updated: ${updated.title}`, 'ok');
    });
    s.on('shows:update', () => loadActiveMovie());
    setSocket(s);
    return () => { s.close(); setSocket(null); };
  }, [notify, loadActiveMovie]);

  const isStaff = Boolean(user && isStaffRole(user.role));

  useEffect(() => {
    if (isStaff && view !== 'admin') setView('admin');
  }, [isStaff, view]);

  return (
    <>
      <Navbar
        user={user}
        isStaff={isStaff}
        view={view}
        setView={setView}
        activeMovie={activeMovie}
        online={online}
        onOpenAuth={openAuth}
        onLogout={logout}
        notify={notify}
      />

      <main>
        {isStaff ? (
          <AdminDashboard
            user={user}
            socket={socket}
            movie={activeMovie}
            setMovie={setActiveMovie}
            onAddUpcoming={(m) => setUpcomingList((prev) => [m, ...prev])}
            notify={notify}
          />
        ) : (
          <>
            {view === 'portal' && (
              <HomeMoviePortal
                movie={activeMovie}
                openShows={openShows}
                upcoming={upcomingList}
                onBook={() => { setUpcomingModalMovie(null); setView('book'); }}
                onSelectMovie={() => setView('movie-details')}
                onSelectUpcoming={(item) => {
                  notify(`🗓️ "${item.title}" is an upcoming release (${item.date_str}). Bookings are not open yet!`, 'warn');
                  setUpcomingModalMovie(item);
                }}
              />
            )}

            {view === 'movie-details' && (
              <MovieDetailsPage
                movie={activeMovie}
                openShows={openShows}
                selectedShowId={selectedShowId}
                onSelectShow={setSelectedShowId}
                onBook={() => { setUpcomingModalMovie(null); setView('book'); }}
                onBack={() => setView('portal')}
              />
            )}

            {view === 'book' && (
              <SeatMapBookingPage
                user={user}
                movie={activeMovie}
                openShows={openShows}
                selectedShowId={selectedShowId}
                onSelectShow={setSelectedShowId}
                socket={socket}
                online={online}
                notify={notify}
                onOpenAuth={() => openAuth('login')}
                onRefreshShows={loadActiveMovie}
                onBack={() => setView('portal')}
                onGoMyBookings={() => setView('mine')}
                onSuccess={(booking) => { setLastConfirmedBooking(booking); setView('confirmed'); }}
              />
            )}

            {view === 'confirmed' && (
              <BookingConfirmedModal
                booking={lastConfirmedBooking}
                movie={activeMovie}
                onClose={() => setView('portal')}
                onViewAllBookings={() => setView('mine')}
              />
            )}

            {view === 'mine' && (
              <MyBookingsPage movie={activeMovie} notify={notify} onGoBook={() => setView('book')} />
            )}
          </>
        )}
      </main>

      {!isStaff && upcomingModalMovie && (
        <UpcomingMovieNoticeModal
          upcomingMovie={upcomingModalMovie}
          currentMovie={activeMovie}
          onBookCurrent={() => { setUpcomingModalMovie(null); setView('book'); }}
          onClose={() => setUpcomingModalMovie(null)}
        />
      )}

      {!isStaff && <Footer onOpenPolicy={setTrustPolicy} />}
      {trustPolicy && <TrustPolicyModal policy={trustPolicy} onClose={() => setTrustPolicy(null)} />}
      {showAuthModal && <AuthModal defaultMode={authMode} onClose={() => setShowAuthModal(false)} onAuth={onAuthSuccess} notify={notify} />}
      <ToastAlert toast={toast} />
    </>
  );
}
