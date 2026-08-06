import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/authContextValue';
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { Shield, Search, Power, Trash2, Edit, Key, Users, Receipt, Landmark, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cleanRut } from '../utils/rutParser';
import { AVAILABLE_BANKS } from '../contexts/bankContextValue';
import { Dialog } from '../components/Dialog';

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
  const { user, isAdmin } = useAuth();
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

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
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
  }, [isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const handleToggleStatus = async (targetUser: AdminUser) => {
    if (targetUser.id === user?.id) {
      toast.error('No puedes pausar tu propia cuenta administradora.');
      return;
    }

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
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      toast.success('Correo de restablecimiento enviado con éxito');
    } catch (err: any) {
      toast.error('Error al enviar correo: ' + err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    if (deletingUser.id === user?.id) {
      toast.error('No puedes eliminar tu propia cuenta desde el panel administrativo.');
      setDeletingUser(null);
      setDeleteConfirmText('');
      return;
    }
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
            Acceso protegido según el rol asignado a tu cuenta.
          </p>
        </div>
        <button type="button" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '2px solid var(--border-color)' }} onClick={loadData} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Actualizar datos
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'var(--pastel-blue)', border: '2px solid var(--border-color)', borderRadius: '8px', display: 'flex' }}>
            <Users size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Cuentas Creadas</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900 }}>{totalUsers} <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--danger-text)' }}>({pausedUsers} pausadas)</span></div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'var(--pastel-green)', border: '2px solid var(--border-color)', borderRadius: '8px', display: 'flex' }}>
            <Receipt size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Total Transacciones</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900 }}>{totalTransactions.toLocaleString('es-CL')}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'var(--pastel-yellow)', border: '2px solid var(--border-color)', borderRadius: '8px', display: 'flex' }}>
            <Landmark size={28} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Bancos Integrados</div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900 }}>{activeBanksCount}</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card admin-users-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="input" 
              aria-label="Buscar usuarios por email, nombre o RUT"
              placeholder="Buscar por email, nombre o RUT..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '3rem', backgroundColor: 'var(--surface-color)' }}
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
            <table className="responsive-table admin-users-table" style={{ width: '100%', minWidth: '950px', tableLayout: 'fixed' }}>
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
                  const isCurrentUser = u.id === user?.id;

                  return (
                    <tr key={u.id} style={{ backgroundColor: u.status === 'paused' ? 'var(--danger-surface)' : 'var(--surface-color)' }}>
                      <td data-label="Usuario" style={{ fontWeight: 700 }}>
                        <div style={{ fontSize: '0.95rem' }}>{u.email}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Registrado: {createdDate}</div>
                      </td>
                      <td data-label="Detalles">
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{u.full_name || 'Sin nombre'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>RUT: {u.rut || 'No registra'}</div>
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
                                    border: '1.5px solid var(--border-color)',
                                    backgroundColor: bank?.color ? `${bank.color}22` : 'var(--surface-subtle)',
                                    boxShadow: '1px 1px 0px var(--shadow-color)'
                                  }}
                                >
                                  {bank?.emoji || '🏦'} {bank?.label || bankId}
                                </span>
                              );
                            })
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sin integraciones</span>
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
                            type="button"
                            className="btn-icon" 
                            title={isCurrentUser ? 'No puedes pausar tu propia cuenta' : (u.status === 'active' ? 'Pausar accesos' : 'Reactivar accesos')}
                            aria-label={isCurrentUser ? 'No puedes pausar tu propia cuenta administradora' : `${u.status === 'active' ? 'Pausar accesos' : 'Reactivar accesos'} de ${u.email}`}
                            disabled={isCurrentUser}
                            onClick={() => handleToggleStatus(u)}
                            style={{ backgroundColor: u.status === 'active' ? 'var(--account-card-pending)' : 'var(--pastel-green)' }}
                          >
                            <Power size={14} style={{ color: u.status === 'active' ? 'var(--warning)' : 'var(--success)' }} />
                          </button>
                          <button 
                            type="button"
                            className="btn-icon" 
                            title="Editar info de usuario"
                            aria-label={`Editar información de ${u.email}`}
                            onClick={() => handleEditDetails(u)}
                            style={{ backgroundColor: 'var(--surface-color)' }}
                          >
                            <Edit size={14} style={{ color: 'var(--info-accent)' }} />
                          </button>
                          <button 
                            type="button"
                            className="btn-icon" 
                            title="Reenviar correo cambiar password"
                            aria-label={`Reenviar cambio de contraseña a ${u.email}`}
                            onClick={() => handleResendPasswordReset(u.email)}
                            style={{ backgroundColor: 'var(--pastel-purple)' }}
                          >
                            <Key size={14} style={{ color: 'var(--purple-accent)' }} />
                          </button>
                          <button 
                            type="button"
                            className="btn-icon" 
                            title={isCurrentUser ? 'No puedes eliminar tu propia cuenta' : 'Eliminar cuenta para siempre'}
                            aria-label={isCurrentUser ? 'No puedes eliminar tu propia cuenta administradora' : `Eliminar cuenta de ${u.email}`}
                            disabled={isCurrentUser}
                            onClick={() => setDeletingUser(u)}
                            style={{ backgroundColor: 'var(--danger-surface)' }}
                          >
                            <Trash2 size={14} style={{ color: 'var(--danger)' }} />
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
        <Dialog
          onClose={() => setEditingUser(null)}
          labelledBy="admin-edit-title"
          panelClassName="admin-dialog"
          panelStyle={{ maxWidth: '440px' }}
        >
          <div className="dialog-header">
            <h3 id="admin-edit-title" style={{ fontSize: '1.35rem', fontWeight: 900 }}>Editar cuenta</h3>
            <button
              type="button"
              className="dialog-close"
              onClick={() => setEditingUser(null)}
              aria-label="Cerrar edición de cuenta"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="admin-dialog-body">
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
              <div>
                <label htmlFor="admin-user-email" className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Usuario (Email)</label>
                <input 
                  id="admin-user-email"
                  type="text" 
                  className="input" 
                  value={editingUser.email}
                  disabled
                  style={{ backgroundColor: 'var(--surface-subtle)', cursor: 'not-allowed', fontWeight: 700 }}
                />
              </div>

              <div>
                <label htmlFor="admin-user-name" className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Nombre completo</label>
                <input 
                  id="admin-user-name"
                  type="text" 
                  className="input" 
                  placeholder="Ej: Cristian Pizarro" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ backgroundColor: 'var(--surface-color)' }}
                />
              </div>

              <div>
                <label htmlFor="admin-user-rut" className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>RUT asociado</label>
                <input 
                  id="admin-user-rut"
                  type="text" 
                  className="input" 
                  placeholder="Ej: 17.673.553-9" 
                  value={editRut}
                  onChange={(e) => setEditRut(e.target.value)}
                  style={{ backgroundColor: 'var(--surface-color)' }}
                />
              </div>
            </div>

            <div className="admin-dialog-actions">
              <button 
                type="button"
                className="btn btn-outline" 
                onClick={() => setEditingUser(null)}
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                type="button"
                className="btn btn-primary" 
                onClick={handleSaveDetails}
                disabled={actionLoading}
              >
                {actionLoading ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <Dialog
          onClose={() => { setDeletingUser(null); setDeleteConfirmText(''); }}
          labelledBy="admin-delete-title"
          describedBy="admin-delete-description"
          panelClassName="admin-dialog admin-dialog-danger"
          panelStyle={{ maxWidth: '440px' }}
        >
          <div className="dialog-header">
            <h3 id="admin-delete-title" style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--danger)' }}>Eliminar cuenta</h3>
            <button
              type="button"
              className="dialog-close"
              onClick={() => { setDeletingUser(null); setDeleteConfirmText(''); }}
              aria-label="Cerrar confirmación de eliminación"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="admin-dialog-body">
            <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: '1.5', fontWeight: 600 }}>
              <span id="admin-delete-description">
              Estás a punto de eliminar definitivamente la cuenta de <strong>{deletingUser.email}</strong>. 
              Esta acción es irreversible y borrará:
              </span>
            </p>
            <ul style={{ fontSize: '0.85rem', margin: '0 0 1.5rem 1rem', paddingLeft: '1rem', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <li>Todos sus datos de inicio de sesión</li>
              <li>Sus transacciones importadas ({deletingUser.tx_count} registros)</li>
              <li>Sus configuraciones, RUT y reglas de clasificación</li>
              <li>Sus contactos conocidos registrados</li>
            </ul>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem', fontWeight: 700 }}>
              Para confirmar, escribe la palabra <span style={{ color: 'var(--danger)' }}>ELIMINAR</span> abajo:
            </p>
            <input 
              id="admin-delete-confirm"
              type="text" 
              className="input" 
              placeholder="Escribe ELIMINAR" 
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              style={{ width: '100%', marginBottom: '1.5rem', border: '2px solid var(--danger)', fontWeight: 800, textTransform: 'uppercase' }}
            />
            <div className="admin-dialog-actions">
              <button 
                type="button"
                className="btn btn-outline" 
                onClick={() => { setDeletingUser(null); setDeleteConfirmText(''); }}
                disabled={actionLoading}
              >
                Cancelar
              </button>
              <button 
                type="button"
                className="btn btn-primary" 
                onClick={handleDeleteUser}
                disabled={actionLoading || deleteConfirmText.toLowerCase() !== 'eliminar'}
                style={{ backgroundColor: 'var(--danger)', color: 'var(--surface-color)', border: '2px solid var(--border-color)' }}
              >
                {actionLoading ? 'Eliminando...' : 'Eliminar cuenta'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
