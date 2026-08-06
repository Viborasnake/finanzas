import { useState, useRef, useEffect, useId } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, Settings, LogOut, Menu, X, ChevronDown, Check, ChevronLeft, ChevronRight, User as UserIcon, Shield, CalendarCheck, FileSpreadsheet, Sparkles, Moon, Sun } from 'lucide-react';
import { useAuth } from '../contexts/authContextValue';
import { useBanks, AVAILABLE_BANKS, type DashboardBankScope } from '../contexts/bankContextValue';
import { useSettings } from '../contexts/settingsContextValue';
import { useTheme } from '../contexts/themeContextValue';
import { RutOnboardingModal } from './RutOnboardingModal';
import { FeedbackWidget } from './FeedbackWidget';
import './Layout.css'; 

const overviewNavItems = [
  { name: 'Mi mes', path: '/light', icon: <Sparkles size={20} /> },
  { name: 'Resumen financiero', path: '/', icon: <LayoutDashboard size={20} /> },
];

const managementNavItems = [
  { name: 'Movimientos', path: '/transactions', icon: <Receipt size={20} /> },
  { name: 'Importar movimientos', path: '/import', icon: <FileSpreadsheet size={20} /> },
  { name: 'Pagos fijos', path: '/accounts', icon: <CalendarCheck size={20} /> },
];

const systemNavItems = [
  { name: 'Ajustes', path: '/settings', icon: <Settings size={20} /> },
];

function ThemeToggle({ isCollapsed }: { isCollapsed?: boolean }) {
  const { isDark, setTheme } = useTheme();

  // Only light/dark in UI. System preference is the silent default until the user chooses.
  if (isCollapsed) {
    return (
      <button
        type="button"
        className="nav-item theme-switch-collapsed"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        aria-pressed={isDark}
      >
        {isDark ? <Moon size={20} strokeWidth={2.4} /> : <Sun size={20} strokeWidth={2.4} />}
      </button>
    );
  }

  return (
    <div className="theme-switch" role="group" aria-label="Tema de la interfaz">
      <button
        type="button"
        className={`theme-switch-option${!isDark ? ' is-active' : ''}`}
        onClick={() => setTheme('light')}
        aria-pressed={!isDark}
      >
        <Sun size={16} strokeWidth={2.5} aria-hidden="true" />
        <span>Claro</span>
      </button>
      <button
        type="button"
        className={`theme-switch-option${isDark ? ' is-active' : ''}`}
        onClick={() => setTheme('dark')}
        aria-pressed={isDark}
      >
        <Moon size={16} strokeWidth={2.5} aria-hidden="true" />
        <span>Oscuro</span>
      </button>
    </div>
  );
}

function BankIndicator() {
  const { connectedBanks, activeBank, dashboardScope, mainBank, setDashboardScope } = useBanks();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const activeBankInfo = AVAILABLE_BANKS.find(b => b.id === activeBank);
  const isConsolidated = dashboardScope === 'all' && connectedBanks.length > 1;
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
        type="button"
        onClick={() => canOpen && setOpen(o => !o)}
        className="bank-switcher-trigger"
        title={displayLabel}
        aria-label={`Vista bancaria: ${displayLabel}`}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        aria-disabled={!canOpen}
      >
        <div className="bank-dot" style={{ backgroundColor: isConsolidated ? 'var(--text-primary)' : (activeBankInfo ? 'var(--success)' : 'var(--text-muted)') }} />
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
        <div className="bank-menu" id={menuId} role="menu" aria-label="Seleccionar vista bancaria">
          
          {/* Connected banks */}
          {connectedBanks.length > 0 && (
            <div style={{ padding: '0.5rem' }}>
              {connectedBanks.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderRadius: '8px', backgroundColor: isConsolidated ? 'var(--surface-subtle)' : 'transparent', marginBottom: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => chooseScope('all')}
                    role="menuitemradio"
                    aria-checked={isConsolidated}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800, textAlign: 'left' }}
                  >
                    <span style={{ 
                      width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block',
                      background: 'linear-gradient(135deg, #e63000 0 33%, #f77f00 33% 66%, #a855f7 66% 100%)',
                      boxShadow: '1px 1px 0px var(--shadow-color)',
                      border: '1px solid var(--border-color)'
                    }} />
                    <span>Todos los bancos</span>
                    <span style={{ fontSize: '0.58rem', padding: '0.1rem 0.35rem', backgroundColor: 'var(--pastel-blue)', color: 'var(--text-primary)', borderRadius: '999px', fontWeight: 900, border: '1px solid var(--border-color)' }}>Vista</span>
                    {isConsolidated && <Check size={14} style={{ marginLeft: 'auto' }} />}
                  </button>
                </div>
              )}
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '0.4rem 0.5rem 0.25rem' }}>Bancos conectados</div>
              {connectedBanks.map(bankId => {
                const bank = AVAILABLE_BANKS.find(b => b.id === bankId);
                if (!bank) return null;
                const isMain = bank.id === mainBank;
                const isActive = dashboardScope === bank.id;
                return (
                  <div key={bank.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderRadius: '8px', backgroundColor: isActive ? 'var(--surface-subtle)' : 'transparent' }}>
                    <button
                      type="button"
                      onClick={() => chooseScope(bank.id)}
                      role="menuitemradio"
                      aria-checked={isActive}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left' }}
                    >
                      <span style={{ 
                        width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block',
                        background: `radial-gradient(circle at 30% 30%, ${bank.color || 'var(--border-muted)'}, var(--border-color))`,
                        boxShadow: '1px 1px 0px var(--shadow-color)'
                      }} />
                      <span>{bank.label}</span>
                      {isMain && (
                        <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', backgroundColor: 'var(--pastel-yellow)', color: 'var(--warning-text)', borderRadius: '999px', fontWeight: 900, border: '1px solid var(--border-color)' }}>Principal</span>
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

    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, isAdmin } = useAuth();
  const { userRut, loadingSettings } = useSettings();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      mobileNavRef.current?.querySelector<HTMLElement>('.mobile-nav-item')?.focus();
    }, 0);

    const handleMenuKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
        window.setTimeout(() => mobileMenuButtonRef.current?.focus(), 0);
        return;
      }

      if (event.key !== 'Tab' || !mobileNavRef.current) return;
      const focusable = Array.from(
        mobileNavRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(element => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleMenuKeyboard);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleMenuKeyboard);
    };
  }, [isMobileMenuOpen]);

  const systemMenuItems = [...systemNavItems];
  if (isAdmin) {
    systemMenuItems.push({
      name: 'Administración',
      path: '/admin',
      icon: <Shield size={20} />
    });
  }
  const navSections = [
    { label: 'Resumen', items: overviewNavItems },
    { label: 'Gestión', items: managementNavItems },
    { label: 'Sistema', items: systemMenuItems },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      {/* Sidebar Desktop */}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        {/* Collapse Button */}
        <button 
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="sidebar-collapse-btn"
          title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={isCollapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
          aria-expanded={!isCollapsed}
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
        
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {navSections.map((section) => (
            <div className="sidebar-nav-section" key={section.label}>
              <div className="sidebar-nav-label">{section.label}</div>
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <div key={item.path}>
                    <Link
                      to={item.path}
                      className={`nav-item ${isActive ? 'active' : ''}`}
                      title={isCollapsed ? item.name : undefined}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {item.icon}
                      <span>{item.name}</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          ))}
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
          <ThemeToggle isCollapsed={isCollapsed} />
          <button type="button" className="nav-item logout-btn" onClick={handleSignOut} title={isCollapsed ? 'Cerrar sesión' : undefined} aria-label="Cerrar sesión">
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-content" tabIndex={-1} className={`main-content ${isCollapsed ? 'collapsed' : ''}`}>
        <header className="mobile-header">
          <h2>MisFinanzas</h2>
          <button
            ref={mobileMenuButtonRef}
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>
        
        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav ref={mobileNavRef} className="mobile-nav animate-fade-in" id="mobile-navigation" aria-label="Navegación principal móvil">
            <div style={{ padding: '0 0.5rem', marginBottom: '1rem' }}>
              <BankIndicator />
            </div>
            {navSections.map((section) => (
              <div className="mobile-nav-section" key={section.label}>
                <div className="mobile-nav-label">{section.label}</div>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <div key={item.path}>
                      <Link
                        to={item.path}
                        className={`mobile-nav-item ${isActive ? 'active' : ''}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <div className="icon-container">{item.icon}</div>
                        <span>{item.name}</span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            ))}
            
            <div className="mobile-nav-footer">
              {user && (
                <div className="mobile-user-profile">
                  <div className="avatar">
                    <UserIcon size={22} strokeWidth={2.5} aria-hidden="true" />
                  </div>
                  <div className="user-info">
                    <span className="email">{user.email}</span>
                  </div>
                </div>
              )}
              <ThemeToggle />
              <button 
                type="button"
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
        <FeedbackWidget />
      </main>
      
      {!loadingSettings && userRut === null && <RutOnboardingModal />}
    </div>
  );
}
