import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileSpreadsheet, Receipt, Settings, LogOut, Menu, X, ChevronDown, Check, Copy, Plus, ChevronLeft, ChevronRight, User as UserIcon, Shield, CalendarCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBanks, AVAILABLE_BANKS } from '../contexts/BankContext';
import type { Bank, DashboardBankScope } from '../contexts/BankContext';
import { useSettings } from '../contexts/SettingsContext';
import './Layout.css'; 

const navItems = [
  { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
  { name: 'Transacciones', path: '/transactions', icon: <Receipt size={20} /> },
  { name: 'Cuentas', path: '/accounts', icon: <CalendarCheck size={20} /> },
  { name: 'Importar Cartola', path: '/import', icon: <FileSpreadsheet size={20} /> },
  { name: 'Configuración', path: '/settings', icon: <Settings size={20} /> },
];

function BankIndicator() {
  const { connectedBanks, activeBank, dashboardScope, mainBank, setDashboardScope, addBank } = useBanks();
  const { copySettingsFromBank } = useSettings();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [pendingBank, setPendingBank] = useState<Bank | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeBankInfo = AVAILABLE_BANKS.find(b => b.id === activeBank);
  const supportsConsolidatedScope = location.pathname === '/' || location.pathname.startsWith('/transactions') || location.pathname.startsWith('/accounts');
  const isConsolidated = supportsConsolidatedScope && dashboardScope === 'all' && connectedBanks.length > 1;
  const unconnected = AVAILABLE_BANKS.filter(b => !connectedBanks.includes(b.id));
  const displayLabel = isConsolidated ? 'Todos los bancos' : (activeBankInfo ? activeBankInfo.label : 'Sin banco');
  const canOpen = connectedBanks.length > 1;

  const chooseScope = (scope: DashboardBankScope) => {
    setDashboardScope(scope);
    setOpen(false);
  };

  return (
    <div ref={ref} className="bank-switcher">
      {/* Trigger */}
      <button
        onClick={() => canOpen && setOpen(o => !o)}
        className="bank-switcher-trigger"
        title={displayLabel}
      >
        <div className="bank-dot" style={{ backgroundColor: isConsolidated ? '#0f172a' : (activeBankInfo ? '#22c55e' : '#94a3b8') }} />
        <span className="bank-indicator-text">
          {displayLabel}
        </span>
        {canOpen && (
          <span className="bank-count bank-indicator-text">
            {connectedBanks.length}
          </span>
        )}
        {canOpen && (
          <ChevronDown size={12} className="bank-indicator-text" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="bank-menu">
          
          {/* Connected banks */}
          {connectedBanks.length > 0 && (
            <div style={{ padding: '0.5rem', borderBottom: unconnected.length > 0 ? '2px solid #e2e8f0' : 'none' }}>
              {supportsConsolidatedScope && connectedBanks.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderRadius: '8px', backgroundColor: isConsolidated ? '#f8fafc' : 'transparent', marginBottom: '0.25rem' }}>
                  <button
                    onClick={() => chooseScope('all')}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, textAlign: 'left' }}
                  >
                    <span style={{ 
                      width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block',
                      background: 'linear-gradient(135deg, #e63000 0 33%, #f77f00 33% 66%, #a855f7 66% 100%)',
                      boxShadow: '1px 1px 0px #000',
                      border: '1px solid #000'
                    }} />
                    <span>Todos los bancos</span>
                    <span style={{ fontSize: '0.58rem', padding: '0.1rem 0.35rem', backgroundColor: '#dbeafe', color: '#0f172a', borderRadius: '999px', fontWeight: 900, border: '1px solid #000' }}>DASH</span>
                    {isConsolidated && <Check size={14} style={{ marginLeft: 'auto' }} />}
                  </button>
                </div>
              )}
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '0.25rem 0.5rem', letterSpacing: '0.05em' }}>Conectados</div>
              {connectedBanks.map(bankId => {
                const bank = AVAILABLE_BANKS.find(b => b.id === bankId);
                if (!bank) return null;
                const isMain = bank.id === mainBank;
                const isActive = supportsConsolidatedScope ? dashboardScope === bank.id : bank.id === activeBank;
                return (
                  <div key={bank.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderRadius: '8px', backgroundColor: isActive ? '#f8fafc' : 'transparent' }}>
                    <button
                      onClick={() => chooseScope(bank.id)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left' }}
                    >
                      <span style={{ 
                        width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block',
                        background: `radial-gradient(circle at 30% 30%, ${bank.color || '#ccc'}, #000)`,
                        boxShadow: '1px 1px 0px #000'
                      }} />
                      <span>{bank.label}</span>
                      {isMain && (
                        <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', backgroundColor: '#fef08a', color: '#854d0e', borderRadius: '999px', fontWeight: 900, border: '1px solid #000' }}>MAIN</span>
                      )}
                      {isActive && <Check size={14} style={{ marginLeft: 'auto' }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Onboarding Modal */}
      {pendingBank && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '400px', boxShadow: '4px 4px 0px #000' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: '1rem', borderBottom: '2px solid #000', paddingBottom: '0.5rem' }}>Configurar {AVAILABLE_BANKS.find(b => b.id === pendingBank)?.label}</h3>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1.5rem', color: '#334155' }}>
              Estás agregando un nuevo banco. ¿Deseas importar tus categorías y reglas de clasificación desde tu banco principal o prefieres empezar desde cero?
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                onClick={async () => {
                   if (mainBank) {
                     await copySettingsFromBank(mainBank, pendingBank);
                   }
                   addBank(pendingBank);
                   setPendingBank(null);
                }}
                className="btn" style={{ backgroundColor: '#fef08a' }}
              >
                <Copy size={18} />
                Importar desde {AVAILABLE_BANKS.find(b => b.id === mainBank)?.label || 'banco principal'}
              </button>
              <button 
                onClick={() => {
                   addBank(pendingBank);
                   setPendingBank(null);
                }}
                className="btn btn-outline" style={{ border: '2px solid #000', backgroundColor: '#f8fafc' }}
              >
                <Plus size={18} />
                Empezar desde cero
              </button>
              <button 
                onClick={() => setPendingBank(null)}
                style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'none', border: 'none', fontWeight: 700, color: '#64748b', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItems = [...navItems];
  if (user && user.email === 'viborasnake@gmail.com') {
    menuItems.push({
      name: 'Administración',
      path: '/admin',
      icon: <Shield size={20} />
    });
  }

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="layout">
      {/* Sidebar Desktop */}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        {/* Collapse Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="sidebar-collapse-btn"
          title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {isCollapsed ? <ChevronRight size={16} strokeWidth={3} /> : <ChevronLeft size={16} strokeWidth={3} />}
        </button>

        <div className="sidebar-brand">
          {!isCollapsed && (
            <div className="brand-lockup">
              <div className="brand-mark">✨</div>
              MisFinanzas
            </div>
          )}
          {isCollapsed && (
            <div className="brand-mark" title="MisFinanzas">✨</div>
          )}
        </div>

        <BankIndicator />
        
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <div key={item.path}>
                <Link 
                  to={item.path} 
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  title={isCollapsed ? item.name : undefined}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          {user && !isCollapsed && (
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                <UserIcon size={14} strokeWidth={2.5} />
              </div>
              <span>{user.email}</span>
            </div>
          )}
          <button className="nav-item logout-btn" onClick={handleSignOut} title={isCollapsed ? 'Cerrar sesión' : undefined}>
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${isCollapsed ? 'collapsed' : ''}`}>
        <header className="mobile-header">
          <h2>MisFinanzas</h2>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>
        
        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav className="mobile-nav animate-fade-in">
            <div style={{ padding: '0 0.5rem', marginBottom: '1rem' }}>
              <BankIndicator />
            </div>
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
              <div key={item.path}>
                <Link 
                  to={item.path} 
                  className={`mobile-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <div className="icon-container">{item.icon}</div>
                  <span>{item.name}</span>
                </Link>
              </div>
            )})}
            
            <div className="mobile-nav-footer">
              {user && (
                <div className="mobile-user-profile">
                  <div className="avatar">
                    <span style={{ fontSize: '1.2rem' }}>👤</span>
                  </div>
                  <div className="user-info">
                    <span className="email">{user.email}</span>
                  </div>
                </div>
              )}
              <button 
                className="mobile-logout-btn" 
                onClick={() => { setIsMobileMenuOpen(false); handleSignOut(); }} 
              >
                <LogOut size={20} />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </nav>
        )}

        <div className="page-container animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
