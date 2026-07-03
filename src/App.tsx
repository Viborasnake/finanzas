import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import CSVImport from './pages/CSVImport';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import MigrationAudit from './pages/MigrationAudit';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" replace />;
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
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="import" element={<CSVImport />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit" element={<MigrationAudit />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
