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
      // SILENT MIGRATION v2: Rename 'Egreso'->'Egreso', 'Ingreso'->'Ingreso', 'Benja'->'Hijos'
      const migrate = async () => {
        const migrationKey = `migrated_v2_${user.id}`;
        if (localStorage.getItem(migrationKey)) return;

        try {
          // Update Egresos (includes old Gasto Real if it was somehow skipped)
          await supabase.from('transactions').update({ tipo_movimiento: 'Egreso' }).eq('user_id', user.id).in('tipo_movimiento', ['Gasto Real', 'Egreso']);
          // Update Ingresos
          await supabase.from('transactions').update({ tipo_movimiento: 'Ingreso' }).eq('user_id', user.id).eq('tipo_movimiento', 'Ingreso');
          // Update Benja to Hijos
          await supabase.from('transactions').update({ categoria_principal: 'Hijos' }).eq('user_id', user.id).eq('categoria_principal', 'Benja');
            
          // Migrate classification rules in user_settings
          const { data: settings } = await supabase.from('user_settings').select('classification_rules').eq('user_id', user.id).single();
          if (settings && settings.classification_rules) {
            const rules = settings.classification_rules;
            let changed = false;
            const newRules = rules.map((r: any) => {
              let updatedRule = { ...r };
              if (updatedRule.tipo_movimiento === 'Gasto Real' || updatedRule.tipo_movimiento === 'Egreso') {
                updatedRule.tipo_movimiento = 'Egreso';
                changed = true;
              }
              if (updatedRule.tipo_movimiento === 'Ingreso') {
                updatedRule.tipo_movimiento = 'Ingreso';
                changed = true;
              }
              if (updatedRule.categoria_principal === 'Benja') {
                updatedRule.categoria_principal = 'Hijos';
                changed = true;
              }
              return updatedRule;
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
      
      // SILENT MIGRATION v3: Rename 'Transferencias de Otras Personas' -> 'Transferencias'
      const migrateV3 = async () => {
        const migrationKey = `migrated_v3_${user.id}`;
        if (localStorage.getItem(migrationKey)) return;
        try {
          await supabase.from('transactions').update({ 
            categoria_principal: 'Transferencias',
            categoria_secundaria: 'Transferencias de Otras Personas'
          }).eq('user_id', user.id).eq('categoria_principal', 'Transferencias de Otras Personas');
          
          const { data: settings } = await supabase.from('user_settings').select('classification_rules').eq('user_id', user.id).single();
          if (settings && settings.classification_rules) {
            let changed = false;
            const newRules = settings.classification_rules.map((r: any) => {
              if (r.categoria_principal === 'Transferencias de Otras Personas') {
                r.categoria_principal = 'Transferencias';
                r.categoria_secundaria = 'Transferencias de Otras Personas';
                changed = true;
              }
              return r;
            });
            if (changed) {
              await supabase.from('user_settings').update({ classification_rules: newRules }).eq('user_id', user.id);
            }
          }
          localStorage.setItem(migrationKey, 'true');
        } catch (e) {
          console.error("Migration v3 error:", e);
        }
      };
      migrateV3();
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
