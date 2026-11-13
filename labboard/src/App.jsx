import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { BASE } from './lib/paths';
import { DataProvider } from './contexts/DataContext';
import { Layout } from './components/Layout';
import { FullPageSpinner, EmptyState } from './components/ui';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Dashboard from './pages/Dashboard';

// Less-used pages are split into separate chunks so the dashboard loads fast.
const Timeline = lazy(() => import('./pages/Timeline'));
const StartSession = lazy(() => import('./pages/StartSession'));
const MySession = lazy(() => import('./pages/MySession'));
const Bookings = lazy(() => import('./pages/Bookings'));
const History = lazy(() => import('./pages/History'));
const InstrumentDetail = lazy(() => import('./pages/InstrumentDetail'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Stats = lazy(() => import('./pages/Stats'));
const Admin = lazy(() => import('./pages/Admin'));
const BigScreen = lazy(() => import('./pages/BigScreen'));

function Gate({ children }) {
  const { user, loading, isApproved, error } = useAuth();
  if (user === undefined) return <FullPageSpinner label="Starting LabBoard…" />;
  if (!user) return <Login />;
  if (loading && !error) return <FullPageSpinner label="Checking access…" />;
  if (!isApproved) return <Pending />;
  return children;
}

function MemberOnly({ children }) {
  const { isMember } = useAuth();
  return isMember ? children : <EmptyState icon="lock" title="Members only">Guest accounts can view the board but not start sessions or book.</EmptyState>;
}
function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter basename={BASE.replace(/\/$/, '')}>
      <Gate>
        <DataProvider>
          <Suspense fallback={<FullPageSpinner />}>
            <Routes>
              <Route path="/board" element={<BigScreen />} />
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="timeline" element={<Timeline />} />
                <Route path="start" element={<MemberOnly><StartSession /></MemberOnly>} />
                <Route path="my" element={<MemberOnly><MySession /></MemberOnly>} />
                <Route path="bookings" element={<Bookings />} />
                <Route path="history" element={<History />} />
                <Route path="instrument/:id" element={<InstrumentDetail />} />
                <Route path="maintenance" element={<Maintenance />} />
                <Route path="stats" element={<Stats />} />
                <Route path="admin" element={<AdminOnly><Admin /></AdminOnly>} />
                <Route path="*" element={<EmptyState title="Page not found" />} />
              </Route>
            </Routes>
          </Suspense>
        </DataProvider>
      </Gate>
    </BrowserRouter>
  );
}
