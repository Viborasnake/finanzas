import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { Shield, Search, Power, Trash2, Edit, Key, Users, Receipt, Landmark, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { cleanRut } from '../utils/rutParser';
import { AVAILABLE_BANKS } from '../contexts/BankContext';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  status: 'active' | 'paused';
  rut: string | null;
  tx_count: number;
  banks: string[] | null;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals / Edit states
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editRut, setEditRut] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Double confirmation delete state
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Guard: ONLY viborasnake@gmail.com
  if (!user || user.email !== 'viborasnake@gmail.com') {
    return <Navigate to="/" replace />;
  }

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_dashboard_data');
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al cargar datos del panel: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleStatus = async (targetUser: AdminUser) => {
    const newStatus = targetUser.status === 'paused' ? 'active' : 'paused';
    const actionName = newStatus === 'paused' ? 'pausar' : 'activar';
    
    if (!window.confirm(`¿Estás seguro de que deseas ${actionName} la cuenta de ${targetUser.email}?`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc('admin_update_user_status', {
        target_user_id: targetUser.id,
        new_status: newStatus
      });
      if (error) throw error;

      toast.success(`Cuenta ${newStatus === 'paused' ? 'pausada' : 'activada'} con éxito`);
      setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, status: newStatus } : u));
    } catch (err: any) {
      toast.error(`Error al ${actionName} cuenta: ${err.message}`);
    }
  };

  const handleEditDetails = (targetUser: AdminUser) => {
    setEditingUser(targetUser);
    setEditName(targetUser.full_name || '');
    setEditRut(targetUser.rut || '');
  };

  const handleSaveDetails = async () => {
    if (!editingUser) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('admin_update_user_details', {
        target_user_id: editingUser.id,
        new_name: editName.trim(),
        new_rut: cleanRut(editRut.trim())
      });
      if (error) throw error;

      toast.success('Detalles de usuario actualizados');
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, full_name: editName.trim(), rut: cleanRut(editRut.trim()) } : u));
      setEditingUser(null);
    } catch (err: any) {
      toast.error('Error al actualizar detalles: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendPasswordReset = async (email: string) => {
    if (!window.confirm(`¿Reenviar correo de restablecimiento de contraseña a ${email}?`)) {
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`
      });
      if (error) throw error;
      toast.success('Correo de restablecimiento enviado con éxito');
    } catch (err: any) {
      toast.error('Error al enviar correo: ' + err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    if (deleteConfirmText.toLowerCase() !== 'eliminar') {
      toast.error('Por favor escribe ELIMINAR para confirmar');
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('admin_delete_user', {
        target_user_id: deletingUser.id
      });
      if (error) throw error;

      toast.success(`Usuario ${deletingUser.email} eliminado definitivamente`);
      setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
      setDeletingUser(null);
      setDeleteConfirmText('');
    } catch (err: any) {
      toast.error('Error al eliminar usuario: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const search = searchTerm.toLowerCase();
    return (
      u.email.toLowerCase().includes(search) ||
      (u.full_name && u.full_name.toLowerCase().includes(search)) ||
      (u.rut && u.rut.toLowerCase().includes(search))
    );
  });

  // Calculate global summary stats
  const totalUsers = users.length;
  const pausedUsers = users.filter(u => u.status === 'paused').length;
  const totalTransactions = users.reduce((sum, u) => sum + u.tx_count, 0);
  const activeBanksCount = Array.from(
    new Set(users.flatMap(u => u.banks || []).filter(Boolean))
  ).length;

  return (
    <div>
      <div className="header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Shield size={36} /> Panel de Administración
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginTop: '0.25rem' }}>
            Acceso exclusivo para viborasnake@gmail.com
          </p>
        </div>
        <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '2px solid black' }} onClick={loadData} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Actualizar datos
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'var(--pastel-blue)', border: '2px solid black', borderRadius: '8px', display: 'flex' }}>
            <Users size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Cuentas Creadas</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900 }}>{totalUsers} <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--danger)' }}>({pausedUsers} pausadas)</span></div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'var(--pastel-green)', border: '2px solid black', borderRadius: '8px', display: 'flex' }}>
            <Receipt size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Total Transacciones</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900 }}>{totalTransactions.toLocaleString('es-CL')}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'var(--pastel-yellow)', border: '2px solid black', borderRadius: '8px', display: 'flex' }}>
            <Landmark size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Bancos Integrados</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900 }}>{activeBanksCount}</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input 
              type="text" 
              className="input" 
              placeholder="Buscar por email, nombre o RUT..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '3rem', backgroundColor: 'white' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="skeleton" style={{ height: '50px' }}></div>
            <div className="skeleton" style={{ height: '300px' }}></div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="responsive-table" style={{ width: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Email / Usuario</th>
                  <th style={{ width: '130px' }}>Detalles Cuenta</th>
                  <th style={{ width: '120px' }}>Transacciones</th>
                  <th>Bancos Integrados</th>
                  <th style={{ width: '100px' }}>Estado</th>
                  <th style={{ width: '190px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const createdDate = new Date(u.created_at).toLocaleDateString('es-CL', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  });

                  return (
                    <tr key={u.id} style={{ backgroundColor: u.status === 'paused' ? '#fee2e2' : 'white' }}>
                      <td data-label="Usuario" style={{ fontWeight: 700 }}>
                        <div style={{ fontSize: '0.95rem' }}>{u.email}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>Registrado: {createdDate}</div>
                      </td>
                      <td data-label="Detalles">
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{u.full_name || 'Sin nombre'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>RUT: {u.rut || 'No registra'}</div>
                      </td>
                      <td data-label="Transacciones" style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                        {u.tx_count}
                      </td>
                      <td data-label="Bancos">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {u.banks && u.banks.length > 0 ? (
                            u.banks.map(bankId => {
                              const bank = AVAILABLE_BANKS.find(b => b.id === bankId);
                              return (
                                <span 
                                  key={bankId} 
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                    fontSize: '0.7rem', fontWeight: 800,
                                    padding: '0.15rem 0.5rem', borderRadius: '4px',
                                    border: '1.5px solid black',
                                    backgroundColor: bank?.color ? `${bank.color}22` : '#f1f5f9',
                                    boxShadow: '1px 1px 0px black'
                                  }}
                                >
                                  {bank?.emoji || '🏦'} {bank?.label || bankId}
                                </span>
                              );
                            })
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Sin integraciones</span>
                          )}
                        </div>
                      </td>
                      <td data-label="Estado">
                        <span 
                          className={u.status === 'active' ? 'badge badge-success' : 'badge badge-danger'}
                          style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}
                        >
                          {u.status === 'active' ? 'Activa' : 'Pausada'}
                        </span>
                      </td>
                      <td data-label="Acciones" style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button 
                            className="btn-icon" 
                            title={u.status === 'active' ? 'Pausar accesos' : 'Reactivar accesos'}
                            onClick={() => handleToggleStatus(u)}
                            style={{ backgroundColor: u.status === 'active' ? '#ffedd5' : '#dcfce7' }}
                          >
                            <Power size={14} style={{ color: u.status === 'active' ? '#d97706' : '#16a34a' }} />
                          </button>
                          <button 
                            className="btn-icon" 
                            title="Editar info de usuario"
                            onClick={() => handleEditDetails(u)}
                            style={{ backgroundColor: '#e0f2fe' }}
                          >
                            <Edit size={14} style={{ color: '#0284c7' }} />
                          </button>
                          <button 
                            className="btn-icon" 
                            title="Reenviar correo cambiar password"
                            onClick={() => handleResendPasswordReset(u.email)}
                            style={{ backgroundColor: '#f3e8ff' }}
                          >
                            <Key size={14} style={{ color: '#7c3aed' }} />
                          </button>
                          <button 
                            className="btn-icon" 
                            title="Eliminar cuenta para siempre"
                            onClick={() => setDeletingUser(u)}
                            style={{ backgroundColor: '#fee2e2' }}
                          >
                            <Trash2 size={14} style={{ color: '#dc2626' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      No se encontraron usuarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '90%', maxWidth: '400px', padding: '2rem', border: '3px solid black', boxShadow: '6px 6px 0px black', backgroundColor: 'white', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '1.5rem', fontWeight: 900 }}>Editar Cuenta</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
              <div>
                <label className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Usuario (Email)</label>
                <input 
                  type="text" 
                  className="input" 
                  value={editingUser.email}
                  disabled
                  style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', fontWeight: 700 }}
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>Nombre Completo</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ej: Cristian Pizarro" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ backgroundColor: 'white' }}
                />
              </div>

              <div>
                <label className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b' }}>RUT Asociado</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ej: 17.673.553-9" 
                  value={editRut}
                  onChange={(e) => setEditRut(e.target.value)}
                  style={{ backgroundColor: 'white' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setEditingUser(null)}
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveDetails}
                disabled={actionLoading}
              >
                {actionLoading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '90%', maxWidth: '400px', padding: '2rem', border: '3px solid black', boxShadow: '6px 6px 0px #dc2626', backgroundColor: 'white', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '1rem', fontWeight: 900, color: '#dc2626' }}>¡Advertencia Crítica!</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: '1.5', fontWeight: 600 }}>
              Estás a punto de eliminar definitivamente la cuenta de <strong>{deletingUser.email}</strong>. 
              Esta acción es irreversible y borrará:
            </p>
            <ul style={{ fontSize: '0.85rem', margin: '0 0 1.5rem 1rem', padding: 0, color: '#64748b', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li>• Todos sus datos de inicio de sesión</li>
              <li>• Sus transacciones importadas ({deletingUser.tx_count} registros)</li>
              <li>• Sus configuraciones, RUT y reglas de clasificación</li>
              <li>• Sus contactos conocidos registrados</li>
            </ul>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem', fontWeight: 700 }}>
              Para confirmar, escribe la palabra <span style={{ color: '#dc2626' }}>ELIMINAR</span> abajo:
            </p>
            <input 
              type="text" 
              className="input" 
              placeholder="Escribe ELIMINAR" 
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              style={{ width: '100%', marginBottom: '1.5rem', border: '2px solid #dc2626', fontWeight: 800, textTransform: 'uppercase' }}
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => { setDeletingUser(null); setDeleteConfirmText(''); }}
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleDeleteUser}
                disabled={actionLoading || deleteConfirmText.toLowerCase() !== 'eliminar'}
                style={{ backgroundColor: '#dc2626', color: 'white', border: '2px solid black' }}
              >
                {actionLoading ? 'Eliminando...' : 'Eliminar Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
