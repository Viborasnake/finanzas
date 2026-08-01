import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useAuth } from './contexts/authContextValue';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import { AlertTriangle, LockKeyhole, RefreshCw } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ImportRoute = lazy(() => import('./pages/ImportRoute'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RouteLoadingFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Cargando pantalla</span>
      <div className="skeleton route-loading-title" />
      <div className="route-loading-grid" aria-hidden="true">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <div className="skeleton route-loading-content" aria-hidden="true" />
    </div>
  );
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route loading error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="route-error" role="alert">
          <AlertTriangle size={30} strokeWidth={2.5} aria-hidden="true" />
          <div>
            <h2>No pudimos abrir esta pantalla</h2>
            <p>Puede haber una versión nueva disponible. Recarga para continuar.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={18} />
            Recargar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isPaused, signOut } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isPaused) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', backgroundColor: '#fdfdfc', padding: '2rem', textAlign: 'center' }}>
        <div className="card animate-fade-in" style={{ maxWidth: '400px', border: '3px solid black', boxShadow: '6px 6px 0px black', padding: '2rem', borderRadius: '12px', backgroundColor: 'white' }}>
          <LockKeyhole size={46} strokeWidth={2.4} aria-hidden="true" />
          <h2 style={{ fontSize: '1.75rem', margin: '1rem 0', fontWeight: 900 }}>Cuenta pausada</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontWeight: 600, lineHeight: 1.5 }}>
            Tu acceso a la plataforma ha sido temporalmente suspendido por el administrador. Ponte en contacto con soporte si crees que esto es un error.
          </p>
          <button type="button" className="btn btn-outline" style={{ width: '100%', border: '2px solid black' }} onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <Router>
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            border: '2px solid black',
            boxShadow: '4px 4px 0px black',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            color: 'black'
          },
          success: {
            style: {
              backgroundColor: 'var(--pastel-green)',
            },
          },
          error: {
            style: {
              backgroundColor: '#fecaca',
            },
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LazyPage><Login /></LazyPage>} />
        <Route path="/reset-password" element={<LazyPage><ResetPassword /></LazyPage>} />
        {import.meta.env.DEV && <Route path="/dev/import" element={<LazyPage><ImportRoute /></LazyPage>} />}
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<LazyPage><Dashboard /></LazyPage>} />
          <Route path="transactions" element={<LazyPage><Transactions /></LazyPage>} />
          <Route path="accounts" element={<LazyPage><Accounts /></LazyPage>} />
          <Route path="import" element={<LazyPage><ImportRoute /></LazyPage>} />
          <Route path="settings" element={<LazyPage><Settings /></LazyPage>} />
          <Route path="admin" element={<LazyPage><AdminDashboard /></LazyPage>} />
        </Route>
        <Route path="*" element={<LazyPage><NotFound /></LazyPage>} />
      </Routes>
    </Router>
  );
}

export default App;
