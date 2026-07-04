import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileSpreadsheet, Receipt, Settings, LogOut, Menu, X, ChevronDown, Plus, Star, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useBanks, AVAILABLE_BANKS } from '../contexts/BankContext';
import './Layout.css'; 

const navItems = [
  { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
  { name: 'Transacciones', path: '/transactions', icon: <Receipt size={20} /> },
  { name: 'Importar CSV', path: '/import', icon: <FileSpreadsheet size={20} /> },
  { name: 'Configuración', path: '/settings', icon: <Settings size={20} /> },
];

function BankIndicator() {
  const { connectedBanks, activeBank, mainBank, setActiveBank, addBank, removeBank, setMainBankAndSave } = useBanks();
  const [open, setOpen] = useState(false);
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
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
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
        <ChevronDown size={12} style={{ color: '#555', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', left: '0.75rem', right: '0.75rem', top: 'calc(100% + 4px)', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', boxShadow: '4px 4px 0px #000', zIndex: 100, overflow: 'hidden' }}>
          
          {/* Connected banks */}
          {connectedBanks.length > 0 && (
            <div style={{ padding: '0.5rem', borderBottom: unconnected.length > 0 ? '2px solid #e2e8f0' : 'none' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '0.25rem 0.5rem', letterSpacing: '0.05em' }}>Conectados</div>
              {connectedBanks.map(bankId => {
                const info = AVAILABLE_BANKS.find(b => b.id === bankId)!;
                const isActive = activeBank === bankId;
                const isMain = mainBank === bankId;
                return (
                  <div
                    key={bankId}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', borderRadius: '8px', backgroundColor: isActive ? '#f1f5f9' : 'transparent', cursor: 'pointer' }}
                  >
                    <button
                      onClick={() => { setActiveBank(bankId); setOpen(false); }}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    >
                      <span style={{ fontSize: '1rem' }}>{info.emoji}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>{info.label}</span>
                      {isMain && <span style={{ fontSize: '0.6rem', backgroundColor: '#fde047', border: '1px solid #000', borderRadius: '4px', padding: '0 4px', fontWeight: 800 }}>MAIN</span>}
                      {isActive && <Check size={12} strokeWidth={3} style={{ marginLeft: 'auto' }} />}
                    </button>
                    {/* Set as main */}
                    {!isMain && (
                      <button
                        onClick={() => setMainBankAndSave(bankId)}
                        title="Establecer como principal"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', borderRadius: '4px', color: '#94a3b8', display: 'flex' }}
                      >
                        <Star size={12} />
                      </button>
                    )}
                    {/* Remove bank */}
                    {connectedBanks.length > 1 && (
                      <button
                        onClick={() => removeBank(bankId)}
                        title="Quitar banco"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', borderRadius: '4px', color: '#ef4444', display: 'flex' }}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add bank */}
          {unconnected.length > 0 && (
            <div style={{ padding: '0.5rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', padding: '0.25rem 0.5rem', letterSpacing: '0.05em' }}>Agregar banco</div>
              {unconnected.map(bank => (
                <button
                  key={bank.id}
                  onClick={() => { addBank(bank.id); setOpen(false); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.5rem', borderRadius: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, textAlign: 'left' }}
                >
                  <Plus size={12} strokeWidth={3} style={{ color: '#22c55e', flexShrink: 0 }} />
                  <span>{bank.emoji}</span>
                  <span>{bank.label}</span>
                </button>
              ))}
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
          borderBottom: '2px solid black',
          background: 'var(--gradient-rainbow)' 
        }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>MisFinanzas</h2>
        </div>

        <BankIndicator />
        
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div style={{ 
              padding: '1rem 1.5rem', 
              borderBottom: '2px solid black', 
              fontWeight: 700, 
              fontSize: '0.85rem', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap', 
              backgroundColor: '#bfdbfe',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1.25rem' }}>👤</span> {user.email}
            </div>
          )}
          <button className="nav-item logout-btn" onClick={handleSignOut} style={{ backgroundColor: '#fecaca', color: 'black', fontWeight: 800 }}>
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
            {navItems.map((item) => (
              <Link 
                key={item.path} 
                to={item.path} 
                className="nav-item"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            ))}
          </nav>
        )}

        <div className="page-container animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
