import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileSpreadsheet, Receipt, Settings, LogOut, Menu, X, ChevronDown, Check, Copy, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBanks, AVAILABLE_BANKS } from '../contexts/BankContext';
import type { Bank } from '../contexts/BankContext';
import { useSettings } from '../contexts/SettingsContext';
import './Layout.css'; 

const navItems = [
  { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
  { name: 'Transacciones', path: '/transactions', icon: <Receipt size={20} /> },
  { name: 'Importar Cartola', path: '/import', icon: <FileSpreadsheet size={20} /> },
  { 
    name: 'Configuración', 
    path: '/settings', 
    icon: <Settings size={20} />,
    subItems: [
      { name: 'Detección (RUT)', hash: '#deteccion' },
      { name: 'Mis Categorías', hash: '#categorias' },
      { name: 'Contactos', hash: '#contactos' },
      { name: 'Reglas (Mapeo)', hash: '#reglas' },
      { name: 'Mis Bancos', hash: '#bancos' },
    ]
  },
];

function BankIndicator() {
  const { connectedBanks, activeBank, mainBank, setActiveBank, addBank } = useBanks();
  const { copySettingsFromBank } = useSettings();
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
  const unconnected = AVAILABLE_BANKS.filter(b => !connectedBanks.includes(b.id));

  return (
    <div ref={ref} style={{ position: 'relative', padding: '0.75rem 1.5rem', borderBottom: '2px solid black' }}>
      {/* Trigger */}
      <button
        onClick={() => connectedBanks.length > 1 && setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: connectedBanks.length > 1 ? 'pointer' : 'default', padding: 0 }}
      >
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activeBankInfo ? '#22c55e' : '#94a3b8', border: '1.5px solid #000', flexShrink: 0 }} />
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1, textAlign: 'left' }}>
          {activeBankInfo ? activeBankInfo.label : 'Sin banco'}
        </span>
        {connectedBanks.length > 1 && (
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#555', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: '4px', padding: '0 4px' }}>
            {connectedBanks.length}
          </span>
        )}
        {connectedBanks.length > 1 && (
          <ChevronDown size={12} style={{ color: '#555', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', left: '0.75rem', right: '0.75rem', top: 'calc(100% + 4px)', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', boxShadow: '4px 4px 0px #000', zIndex: 100, overflow: 'hidden' }}>
          
          {/* Connected banks */}
          {connectedBanks.length > 0 && (
            <div style={{ padding: '0.5rem', borderBottom: unconnected.length > 0 ? '2px solid #e2e8f0' : 'none' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '0.25rem 0.5rem', letterSpacing: '0.05em' }}>Conectados</div>
              {connectedBanks.map(bankId => {
                const bank = AVAILABLE_BANKS.find(b => b.id === bankId);
                if (!bank) return null;
                const isMain = bank.id === mainBank;
                const isActive = bank.id === activeBank;
                return (
                  <div key={bank.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.5rem', borderRadius: '8px', backgroundColor: isActive ? '#f8fafc' : 'transparent' }}>
                    <button
                      onClick={() => { setActiveBank(bank.id); setOpen(false); }}
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="layout">
      {/* Sidebar Desktop */}
      <aside className="sidebar">
        <div style={{ 
          padding: '2rem 1.5rem 1rem', 
          borderBottom: '2px solid black'
        }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 900 }}>✨ MisFinanzas</h2>
        </div>

        <BankIndicator />
        
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <div key={item.path}>
                <Link 
                  to={item.path} 
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
                {isActive && item.subItems && (
                  <div style={{ paddingLeft: '3rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem', marginTop: '0.25rem' }}>
                    {item.subItems.map(sub => (
                      <a key={sub.hash} href={`${item.path}${sub.hash}`} style={{ fontSize: '0.85rem', color: '#334155', textDecoration: 'none', fontWeight: 700 }}>
                        {sub.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div style={{ 
              padding: '1rem', 
              margin: '0 1rem 0.5rem',
              border: '2px solid black',
              borderRadius: 'var(--radius-md)', 
              fontWeight: 700, 
              fontSize: '0.85rem', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap', 
              backgroundColor: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '4px 4px 0px black'
            }}>
              <span style={{ fontSize: '1.25rem' }}>👤</span> {user.email}
            </div>
          )}
          <button className="nav-item logout-btn" onClick={handleSignOut} style={{ backgroundColor: '#fecaca', color: 'black', fontWeight: 800, border: '2px solid black', boxShadow: '4px 4px 0px black' }}>
            <LogOut size={20} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="mobile-header">
          <h2>MisFinanzas</h2>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>
        
        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav className="mobile-nav">
            <BankIndicator />
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
              <div key={item.path}>
                <Link 
                  to={item.path} 
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => !item.subItems && setIsMobileMenuOpen(false)}
                >
                  {item.icon}
                  <span>{item.name}</span>
                </Link>
                {isActive && item.subItems && (
                  <div style={{ paddingLeft: '3rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem', marginTop: '0.25rem' }}>
                    {item.subItems.map(sub => (
                      <a key={sub.hash} href={`${item.path}${sub.hash}`} onClick={() => setIsMobileMenuOpen(false)} style={{ fontSize: '0.9rem', color: '#334155', textDecoration: 'none', fontWeight: 700 }}>
                        {sub.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )})}
            
            <div style={{ marginTop: 'auto', borderTop: '2px solid black' }}>
              {user && (
                <div style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: '2px solid black', 
                  fontWeight: 700, 
                  fontSize: '0.85rem', 
                  backgroundColor: '#bfdbfe',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.25rem' }}>👤</span> {user.email}
                </div>
              )}
              <button 
                className="nav-item logout-btn" 
                onClick={() => { setIsMobileMenuOpen(false); handleSignOut(); }} 
                style={{ backgroundColor: '#fecaca', color: 'black', fontWeight: 800 }}
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
