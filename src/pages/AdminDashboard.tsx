import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/authContextValue';
import { Navigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { Shield, Search, Power, Trash2, Edit, Key, Users, Receipt, Landmark, RefreshCw, X, MessageSquareHeart } from 'lucide-react';
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

interface ProductFeedbackRow {
  id: string;
  user_id: string;
  screen_key: string;
  screen_label: string;
  path: string;
  category: string;
  rating: number | null;
  message: string;
  feature: string | null;
  status: 'new' | 'reviewed' | 'done';
  created_at: string;
  viewport: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Error',
  idea: 'Idea',
  confusion: 'Confuso',
  praise: 'Me gustó',
  other: 'Otro',
};

export default function AdminDashboard() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [feedback, setFeedback] = useState<ProductFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'feedback'>('overview');
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'new' | 'reviewed' | 'done'>('new');
  
  // Modals / Edit states
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editRut, setEditRut] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Double confirmation delete state
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const loadFeedback = useCallback(async () => {
    if (!isAdmin) return;
    setFeedbackLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_feedback')
        .select('id, user_id, screen_key, screen_label, path, category, rating, message, feature, status, created_at, viewport')
        .order('created_at', { ascending: false })
        .limit(150);

      if (error) throw error;
      setFeedback((data || []) as ProductFeedbackRow[]);
    } catch (err: any) {
      console.error(err);
      // Table may not exist until migration is applied remotely.
      setFeedback([]);
    } finally {
      setFeedbackLoading(false);
    }
  }, [isAdmin]);

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

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  const handleFeedbackStatus = async (item: ProductFeedbackRow, status: ProductFeedbackRow['status']) => {
    try {
      const { error } = await supabase
        .from('product_feedback')
        .update({ status })
        .eq('id', item.id);
      if (error) throw error;
      setFeedback((current) => current.map((row) => (row.id === item.id ? { ...row, status } : row)));
      toast.success('Estado de feedback actualizado');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo actualizar el feedback');
    }
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const filteredFeedback = feedback.filter((item) =>
    feedbackFilter === 'all' ? true : item.status === feedbackFilter
  );
  const newFeedbackCount = feedback.filter((item) => item.status === 'new').length;

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
    <div className="admin-page">
      <header className="admin-page-header">
        <div className="admin-page-heading">
          <h1 className="app-page-title">
            <Shield size={32} aria-hidden="true" />
            Administración
          </h1>
          <p>Usuarios, métricas y feedback del producto.</p>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => { loadData(); loadFeedback(); }}
          disabled={loading || feedbackLoading}
        >
          <RefreshCw size={18} className={loading || feedbackLoading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </header>

      <section className="admin-kpi-grid" aria-label="Resumen del sistema">
        <button type="button" className="admin-kpi-card" onClick={() => setActiveTab('users')}>
          <span className="admin-kpi-icon is-blue"><Users size={22} /></span>
          <span className="admin-kpi-label">Cuentas</span>
          <strong className="admin-kpi-value">{totalUsers}</strong>
          <span className="admin-kpi-meta">{pausedUsers} pausadas</span>
        </button>
        <div className="admin-kpi-card is-static">
          <span className="admin-kpi-icon is-green"><Receipt size={22} /></span>
          <span className="admin-kpi-label">Transacciones</span>
          <strong className="admin-kpi-value">{totalTransactions.toLocaleString('es-CL')}</strong>
          <span className="admin-kpi-meta">en toda la plataforma</span>
        </div>
        <div className="admin-kpi-card is-static">
          <span className="admin-kpi-icon is-yellow"><Landmark size={22} /></span>
          <span className="admin-kpi-label">Bancos</span>
          <strong className="admin-kpi-value">{activeBanksCount}</strong>
          <span className="admin-kpi-meta">tipos integrados</span>
        </div>
        <button type="button" className="admin-kpi-card" onClick={() => setActiveTab('feedback')}>
          <span className="admin-kpi-icon is-purple"><MessageSquareHeart size={22} /></span>
          <span className="admin-kpi-label">Feedback nuevo</span>
          <strong className="admin-kpi-value">{newFeedbackCount}</strong>
          <span className="admin-kpi-meta">por revisar</span>
        </button>
      </section>

      <div className="admin-tabs" role="tablist" aria-label="Secciones de administración">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={`admin-tab${activeTab === 'overview' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Resumen
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'users'}
          className={`admin-tab${activeTab === 'users' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Usuarios
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'feedback'}
          className={`admin-tab${activeTab === 'feedback' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('feedback')}
        >
          Feedback
          {newFeedbackCount > 0 && <span className="admin-tab-badge">{newFeedbackCount}</span>}
        </button>
      </div>

      {activeTab === 'overview' && (
        <section className="admin-panel" aria-label="Resumen operativo">
          <div className="admin-overview-grid">
            <article className="card admin-overview-card">
              <h2>Usuarios</h2>
              <p>{totalUsers} cuentas · {pausedUsers} pausadas · {totalTransactions.toLocaleString('es-CL')} movimientos totales.</p>
              <button type="button" className="btn btn-outline" onClick={() => setActiveTab('users')}>
                Gestionar usuarios
              </button>
            </article>
            <article className="card admin-overview-card">
              <h2>Feedback</h2>
              <p>
                {newFeedbackCount > 0
                  ? `Hay ${newFeedbackCount} comentario${newFeedbackCount === 1 ? '' : 's'} nuevo${newFeedbackCount === 1 ? '' : 's'} por revisar.`
                  : 'No hay feedback nuevo pendiente.'}
              </p>
              <button type="button" className="btn btn-outline" onClick={() => setActiveTab('feedback')}>
                Ver inbox
              </button>
            </article>
          </div>
        </section>
      )}

      {activeTab === 'users' && (
        <section className="admin-panel card admin-users-card" aria-label="Usuarios">
          <div className="admin-panel-toolbar">
            <div>
              <h2>Usuarios</h2>
              <p>Busca, pausa, edita o elimina cuentas.</p>
            </div>
            <div className="admin-search">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                className="input"
                aria-label="Buscar usuarios por email, nombre o RUT"
                placeholder="Buscar por email, nombre o RUT…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="admin-loading">
              <div className="skeleton" style={{ height: 48 }} />
              <div className="skeleton" style={{ height: 280 }} />
            </div>
          ) : (
            <div className="admin-users-scroll">
              <table className="responsive-table admin-users-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Detalle</th>
                    <th>Tx</th>
                    <th>Bancos</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const createdDate = new Date(u.created_at).toLocaleDateString('es-CL', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    });
                    const isCurrentUser = u.id === user?.id;

                    return (
                      <tr key={u.id} className={u.status === 'paused' ? 'is-paused' : undefined}>
                        <td data-label="Usuario">
                          <div className="admin-user-email">{u.email}</div>
                          <div className="admin-user-sub">Registrado: {createdDate}</div>
                        </td>
                        <td data-label="Detalle">
                          <div className="admin-user-name">{u.full_name || 'Sin nombre'}</div>
                          <div className="admin-user-sub">RUT: {u.rut || 'No registra'}</div>
                        </td>
                        <td data-label="Tx" className="admin-user-tx">{u.tx_count}</td>
                        <td data-label="Bancos">
                          <div className="admin-bank-chips">
                            {u.banks && u.banks.length > 0 ? (
                              u.banks.map((bankId) => {
                                const bank = AVAILABLE_BANKS.find((b) => b.id === bankId);
                                return (
                                  <span key={bankId} className="admin-bank-chip" style={{ backgroundColor: bank?.color ? `${bank.color}22` : 'var(--surface-subtle)' }}>
                                    {bank?.emoji || '🏦'} {bank?.label || bankId}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="admin-user-sub">Sin bancos</span>
                            )}
                          </div>
                        </td>
                        <td data-label="Estado">
                          <span className={u.status === 'active' ? 'badge badge-success' : 'badge badge-danger'}>
                            {u.status === 'active' ? 'Activa' : 'Pausada'}
                          </span>
                        </td>
                        <td data-label="Acciones">
                          <div className="admin-row-actions">
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
                      <td colSpan={6} className="admin-empty-cell">
                        No se encontraron usuarios registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'feedback' && (
        <section className="admin-panel card" aria-label="Feedback por pantalla">
          <div className="admin-panel-toolbar">
            <div>
              <h2>Feedback por pantalla</h2>
              <p>Comentarios etiquetados por ruta y función.</p>
            </div>
            <div className="admin-filter-pills" role="group" aria-label="Filtrar feedback por estado">
              {([
                ['new', 'Nuevos'],
                ['reviewed', 'Revisados'],
                ['done', 'Hechos'],
                ['all', 'Todos'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`admin-filter-pill${feedbackFilter === value ? ' is-active' : ''}`}
                  onClick={() => setFeedbackFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {feedbackLoading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : filteredFeedback.length === 0 ? (
            <p className="admin-empty-copy">
              No hay feedback en este filtro.
            </p>
          ) : (
            <div className="admin-feedback-list">
              {filteredFeedback.map((item) => (
                <article key={item.id} className="admin-feedback-item">
                  <header>
                    <h3>
                      {item.screen_label}
                      {item.feature ? ` · ${item.feature}` : ''}
                    </h3>
                    <span className="feedback-chip">{CATEGORY_LABELS[item.category] || item.category}</span>
                  </header>
                  <p>{item.message}</p>
                  <div className="admin-feedback-meta">
                    <span>{new Date(item.created_at).toLocaleString('es-CL')}</span>
                    <span>·</span>
                    <span>{item.path}</span>
                    {item.rating != null && (
                      <>
                        <span>·</span>
                        <span>{item.rating}/5 ⭐</span>
                      </>
                    )}
                    {item.viewport && (
                      <>
                        <span>·</span>
                        <span>{item.viewport}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>{item.status}</span>
                  </div>
                  <div className="admin-feedback-actions">
                    {item.status !== 'reviewed' && (
                      <button type="button" className="btn btn-outline admin-mini-btn" onClick={() => handleFeedbackStatus(item, 'reviewed')}>
                        Revisado
                      </button>
                    )}
                    {item.status !== 'done' && (
                      <button type="button" className="btn btn-outline admin-mini-btn" onClick={() => handleFeedbackStatus(item, 'done')}>
                        Hecho
                      </button>
                    )}
                    {item.status !== 'new' && (
                      <button type="button" className="btn btn-outline admin-mini-btn" onClick={() => handleFeedbackStatus(item, 'new')}>
                        Reabrir
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

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
