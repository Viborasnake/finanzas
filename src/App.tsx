import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';
import MigrationAudit from './pages/MigrationAudit';
import AdminDashboard from './pages/AdminDashboard';

import { useEffect } from 'react';
import { supabase } from './services/supabase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isPaused, signOut } = useAuth();
  
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

      // SILENT MIGRATION v4: Fix Itaú transactions saved as Scotiabank
      const migrateV4 = async () => {
        const migrationKey = `migrated_v4_${user.id}`;
        if (localStorage.getItem(migrationKey)) return;
        try {
          // Obtener transacciones de Scotiabank
          const { data: txs } = await supabase.from('transactions').select('id, raw_data').eq('user_id', user.id).eq('bank', 'Scotiabank');
          if (txs && txs.length > 0) {
            const idsToFix = txs.filter(t => t.raw_data && Object.keys(t.raw_data).some(k => k.toLowerCase().includes('movimiento'))).map(t => t.id);
            if (idsToFix.length > 0) {
              await supabase.from('transactions').update({ bank: 'Itaú' }).in('id', idsToFix);
            }
          }
          localStorage.setItem(migrationKey, 'true');
        } catch (e) {
          console.error("Migration v4 error:", e);
        }
      };
      migrateV4();

      const migrateV5 = async () => {
        const migrationKey = `migrated_v5_${user.id}`;
        if (localStorage.getItem(migrationKey)) return;
        try {
          const { data: contacts } = await supabase.from('known_contacts').select('*').eq('user_id', user.id);
          if (contacts && contacts.length > 0) {
            const rules = contacts.map(c => ({
              user_id: user.id,
              bank: 'global',
              condition_type: 'contains',
              condition_value: c.rut || c.name,
              category_tipo: 'Egreso',
              category_principal: 'Transferencias',
              category_secundaria: 'Transferencias a Otras Personas'
            }));
            await supabase.from('classification_rules').insert(rules);
            await supabase.from('known_contacts').delete().eq('user_id', user.id);
          }
          localStorage.setItem(migrationKey, 'true');
        } catch (e) {
          console.error("Migration v5 error:", e);
        }
      };
      migrateV5();
    }
  }, [user]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isPaused) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fdfdfc', padding: '2rem', textAlign: 'center' }}>
        <div className="card animate-fade-in" style={{ maxWidth: '400px', border: '3px solid black', boxShadow: '6px 6px 0px black', padding: '2rem', borderRadius: '12px', backgroundColor: 'white' }}>
          <span style={{ fontSize: '3rem' }}>🔒</span>
          <h2 style={{ fontSize: '1.75rem', margin: '1rem 0', fontWeight: 900 }}>Cuenta Pausada</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontWeight: 600, lineHeight: 1.5 }}>
            Tu acceso a la plataforma ha sido temporalmente suspendido por el administrador. Ponte en contacto con soporte si crees que esto es un error.
          </p>
          <button className="btn btn-outline" style={{ width: '100%', border: '2px solid black' }} onClick={signOut}>
            Cerrar Sesión
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
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit" element={<MigrationAudit />} />
          <Route path="admin" element={<AdminDashboard />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
