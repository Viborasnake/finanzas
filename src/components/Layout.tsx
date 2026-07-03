import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileSpreadsheet, Receipt, Settings, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css'; 

const navItems = [
  { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
  { name: 'Transacciones', path: '/transactions', icon: <Receipt size={20} /> },
  { name: 'Importar CSV', path: '/import', icon: <FileSpreadsheet size={20} /> },
  { name: 'Configuración', path: '/settings', icon: <Settings size={20} /> },
];

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
          padding: '2rem 1.5rem', 
          borderBottom: '2px solid black',
          background: 'var(--gradient-rainbow)' 
        }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>MisFinanzas</h2>
        </div>
        
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
