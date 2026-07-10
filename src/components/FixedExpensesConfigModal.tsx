import React, { useState } from 'react';
import { Plus, Settings, X, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../contexts/SettingsContext';
import type { FixedExpense } from '../contexts/SettingsContext';
import { CascadingCategorySelector } from '../pages/Transactions';

interface Props {
  onClose: () => void;
}

export function FixedExpensesConfigModal({ onClose }: Props) {
  const { fixedExpenses, saveFixedExpenses } = useSettings();

  const [newFixedName, setNewFixedName] = useState('');
  const [newFixedKeyword, setNewFixedKeyword] = useState('');
  const [newFixedCategory, setNewFixedCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });
  
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [editFixedName, setEditFixedName] = useState('');
  const [editFixedKeyword, setEditFixedKeyword] = useState('');
  const [editFixedCategory, setEditFixedCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleAddFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixedName.trim()) {
      toast.error('Ingresa un nombre para la cuenta');
      return;
    }

    const item: FixedExpense = {
      id: generateId(),
      name: newFixedName.trim(),
      tipo_movimiento: newFixedCategory.tipo || 'Egreso',
      categoria_principal: newFixedCategory.principal,
      categoria_secundaria: newFixedCategory.secundaria,
      keyword: newFixedKeyword.trim() || undefined
    };

    await saveFixedExpenses([...fixedExpenses, item]);
    setNewFixedName('');
    setNewFixedKeyword('');
    setNewFixedCategory({ tipo: null, principal: null, secundaria: null });
    toast.success('Gasto fijo agregado');
  };

  const handleDeleteFixedExpense = async (id: string) => {
    await saveFixedExpenses(fixedExpenses.filter(item => item.id !== id));
    toast.success('Gasto fijo eliminado');
  };

  const startEditFixedExpense = (item: FixedExpense) => {
    setEditingFixedId(item.id);
    setEditFixedName(item.name);
    setEditFixedKeyword(item.keyword || '');
    setEditFixedCategory({
      tipo: item.tipo_movimiento || null,
      principal: item.categoria_principal || null,
      secundaria: item.categoria_secundaria || null
    });
  };

  const cancelEditFixedExpense = () => {
    setEditingFixedId(null);
    setEditFixedName('');
    setEditFixedKeyword('');
    setEditFixedCategory({ tipo: null, principal: null, secundaria: null });
  };

  const handleSaveFixedExpense = async (id: string) => {
    if (!editFixedName.trim()) {
      toast.error('El nombre no puede estar vacío');
      return;
    }

    const next = fixedExpenses.map(item => {
      if (item.id === id) {
        return {
          ...item,
          name: editFixedName.trim(),
          tipo_movimiento: editFixedCategory.tipo || 'Egreso',
          categoria_principal: editFixedCategory.principal,
          categoria_secundaria: editFixedCategory.secundaria,
          keyword: editFixedKeyword.trim() || undefined
        };
      }
      return item;
    });

    await saveFixedExpenses(next);
    cancelEditFixedExpense();
    toast.success('Gasto fijo actualizado');
  };

  const handleLoadSuggestedFixedExpenses = async () => {
    const suggested: FixedExpense[] = [
      { id: generateId(), name: 'Luz', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas y Servicios', categoria_secundaria: 'Luz', keyword: 'enel' },
      { id: generateId(), name: 'Agua', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas y Servicios', categoria_secundaria: 'Agua', keyword: 'aguas andinas' },
      { id: generateId(), name: 'Gas', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas y Servicios', categoria_secundaria: 'Gas', keyword: 'metrogas' },
      { id: generateId(), name: 'Internet Hogar', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas y Servicios', categoria_secundaria: 'Internet y TV', keyword: 'vtr' },
      { id: generateId(), name: 'Netflix', tipo_movimiento: 'Egreso', categoria_principal: 'Suscripciones', categoria_secundaria: 'Streaming', keyword: 'netflix' },
      { id: generateId(), name: 'Spotify', tipo_movimiento: 'Egreso', categoria_principal: 'Suscripciones', categoria_secundaria: 'Música', keyword: 'spotify' },
      { id: generateId(), name: 'Dividendo / Arriendo', tipo_movimiento: 'Egreso', categoria_principal: 'Hogar', categoria_secundaria: 'Arriendo / Dividendo' },
      { id: generateId(), name: 'CAE', tipo_movimiento: 'Egreso', categoria_principal: 'Educación', categoria_secundaria: 'Crédito Estudiantil' },
      { id: generateId(), name: 'Seguro Auto', tipo_movimiento: 'Egreso', categoria_principal: 'Transporte', categoria_secundaria: 'Seguro Vehículo', keyword: 'seguro' }
    ];

    const next = [...fixedExpenses, ...suggested];
    await saveFixedExpenses(next);
    toast.success('Gastos fijos sugeridos cargados');
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'rgba(241, 245, 249, 0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="card" style={{ width: '100%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#fff', padding: 0 }}>
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '3px solid #000', backgroundColor: '#f8fafc', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Settings size={26} strokeWidth={2.5} />
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Configurar Cuentas</h2>
          </div>
          <button className="btn" type="button" onClick={onClose} style={{ padding: '0.45rem', border: 'none', boxShadow: 'none', background: 'transparent' }} title="Cerrar">
            <X size={24} />
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {fixedExpenses.length === 0 && (
            <div className="settings-callout" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0, marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem', fontWeight: 900 }}>Partir rápido con tus cuentas</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
                Carga Luz, Agua, Gas, Internet hogar, suscripciones, Dividendo, CAE y Seguro Auto. Luego ajustas el vínculo de categoría de cada una.
              </p>
              <button className="btn btn-outline" onClick={handleLoadSuggestedFixedExpenses} type="button">
                <Plus size={18} />
                Cargar sugeridos
              </button>
            </div>
          )}

          <form className="settings-fixed-expense-form" onSubmit={handleAddFixedExpense} style={{ marginBottom: '2rem' }}>
            <input
              type="text"
              className="input"
              placeholder="Nombre (ej. Luz, CAE, HBO Max)"
              value={newFixedName}
              onChange={(e) => setNewFixedName(e.target.value)}
              required
            />
            <input
              type="text"
              className="input"
              placeholder="Palabra opcional (ej. Enel, Falabella)"
              value={newFixedKeyword}
              onChange={(e) => setNewFixedKeyword(e.target.value)}
            />
            <div className="settings-rule-category">
              <CascadingCategorySelector
                initialPrincipal={null}
                initialSecundaria={null}
                onSave={(t: any, p: any, s: any) => setNewFixedCategory({ tipo: t, principal: p, secundaria: s })}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              <Plus size={20} />
              Agregar
            </button>
          </form>

          <div className="settings-list compact">
            {fixedExpenses.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Aún no tienes cuentas configuradas.</p>
            ) : (
              fixedExpenses.map(item => (
                <div key={item.id} className="settings-list-row">
                  {editingFixedId === item.id ? (
                    <div className="settings-fixed-expense-edit">
                      <input
                        type="text"
                        className="input"
                        value={editFixedName}
                        onChange={(e) => setEditFixedName(e.target.value)}
                        placeholder="Nombre"
                      />
                      <input
                        type="text"
                        className="input"
                        value={editFixedKeyword}
                        onChange={(e) => setEditFixedKeyword(e.target.value)}
                        placeholder="Keyword"
                      />
                      <div style={{ flex: 2 }}>
                        <CascadingCategorySelector
                          initialPrincipal={editFixedCategory.principal}
                          initialSecundaria={editFixedCategory.secundaria}
                          onSave={(t: any, p: any, s: any) => setEditFixedCategory({ tipo: t, principal: p, secundaria: s })}
                        />
                      </div>
                      <button className="btn btn-primary" onClick={() => handleSaveFixedExpense(item.id)}>Guardar</button>
                      <button className="btn btn-outline" onClick={cancelEditFixedExpense}>Cancelar</button>
                    </div>
                  ) : (
                    <div className="settings-rule-view">
                      <div className="settings-rule-info">
                        <strong>{item.name}</strong>
                        {item.keyword && <span>(Clave: "{item.keyword}")</span>}
                        {item.categoria_principal && (
                          <div className="settings-rule-badge">
                            {item.categoria_principal} {item.categoria_secundaria ? ` > ${item.categoria_secundaria}` : ''}
                          </div>
                        )}
                      </div>
                      <div className="settings-rule-actions">
                        <button className="btn btn-icon" onClick={() => startEditFixedExpense(item)} title="Editar"><Edit size={16} /></button>
                        <button className="btn btn-icon danger" onClick={() => handleDeleteFixedExpense(item.id)} title="Eliminar"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
