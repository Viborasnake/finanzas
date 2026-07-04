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

import { useEffect } from 'react';
import { supabase } from './services/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  useEffect(() => {
    if (user) {
      // SILENT MIGRATION: Rename 'Gasto Real' to 'Egreso Real'
      const migrate = async () => {
        const migrationKey = `migrated_egreso_${user.id}`;
        if (localStorage.getItem(migrationKey)) return;

        try {
          await supabase.from('transactions')
            .update({ tipo_movimiento: 'Egreso Real' })
            .eq('user_id', user.id)
            .eq('tipo_movimiento', 'Gasto Real');
            
          // Migrate classification rules in user_settings
          const { data: settings } = await supabase.from('user_settings').select('classification_rules').eq('user_id', user.id).single();
          if (settings && settings.classification_rules) {
            const rules = settings.classification_rules;
            let changed = false;
            const newRules = rules.map((r: any) => {
              if (r.tipo_movimiento === 'Gasto Real') {
                changed = true;
                return { ...r, tipo_movimiento: 'Egreso Real' };
              }
              return r;
            });
            if (changed) {
              await supabase.from('user_settings').update({ classification_rules: newRules }).eq('user_id', user.id);
            }
          }
          localStorage.setItem(migrationKey, 'true');
        } catch (e) {
          console.error("Migration error:", e);
        }
      };
      migrate();
    }
  }, [user]);

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
