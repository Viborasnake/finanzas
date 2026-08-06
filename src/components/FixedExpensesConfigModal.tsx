import React, { useState } from 'react';
import { Plus, Settings, X, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings, type FixedExpense } from '../contexts/settingsContextValue';
import { CascadingCategorySelector } from '../pages/Transactions';
import { Dialog } from './Dialog';

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
    toast.success('Cuenta agregada');
  };

  const handleDeleteFixedExpense = async (id: string) => {
    await saveFixedExpenses(fixedExpenses.filter(item => item.id !== id));
    toast.success('Cuenta eliminada');
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
    toast.success('Cuenta actualizada');
  };

  const handleLoadSuggestedFixedExpenses = async () => {
    const suggested: FixedExpense[] = [
      { id: generateId(), name: 'Luz', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas Básicas', categoria_secundaria: 'Luz', keyword: 'enel' },
      { id: generateId(), name: 'Agua', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas Básicas', categoria_secundaria: 'Agua', keyword: 'pac agua' },
      { id: generateId(), name: 'Gas', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas Básicas', categoria_secundaria: 'Gas', keyword: 'pac gas' },
      { id: generateId(), name: 'Internet Hogar', tipo_movimiento: 'Egreso', categoria_principal: 'Cuentas Básicas', categoria_secundaria: 'Internet Hogar', keyword: 'internet' },
      { id: generateId(), name: 'GPT', tipo_movimiento: 'Egreso', categoria_principal: 'Suscripciones', categoria_secundaria: 'Chat GPT', keyword: 'openai' },
      { id: generateId(), name: 'HBO Max', tipo_movimiento: 'Egreso', categoria_principal: 'Suscripciones', categoria_secundaria: 'HBO MAX', keyword: 'hbo' },
      { id: generateId(), name: 'Dividendo', tipo_movimiento: 'Egreso', categoria_principal: 'Vivienda', categoria_secundaria: 'Dividendo' },
      { id: generateId(), name: 'Seguro Auto', tipo_movimiento: 'Egreso', categoria_principal: 'Transporte', categoria_secundaria: 'Seguro Auto', keyword: 'falabella' },
      { id: generateId(), name: 'CAE', tipo_movimiento: 'Egreso', categoria_principal: null, categoria_secundaria: null, keyword: 'credito aval' },
      { id: generateId(), name: 'Apple Music', tipo_movimiento: 'Egreso', categoria_principal: null, categoria_secundaria: null, keyword: 'apple music' },
      { id: generateId(), name: 'iCloud', tipo_movimiento: 'Egreso', categoria_principal: null, categoria_secundaria: null, keyword: 'icloud' },
      { id: generateId(), name: 'Gemini', tipo_movimiento: 'Egreso', categoria_principal: null, categoria_secundaria: null, keyword: 'gemini' }
    ];

    const existingNames = new Set(fixedExpenses.map(item => item.name.trim().toLocaleLowerCase('es')));
    const next = [...fixedExpenses, ...suggested.filter(item => !existingNames.has(item.name.trim().toLocaleLowerCase('es')))];
    if (next.length === fixedExpenses.length) {
      toast('Las cuentas sugeridas ya están creadas');
      return;
    }
    await saveFixedExpenses(next);
    toast.success('Cuentas sugeridas cargadas');
  };

  return (
    <Dialog
      onClose={onClose}
      labelledBy="fixed-expenses-dialog-title"
      describedBy="fixed-expenses-dialog-description"
      panelStyle={{ maxWidth: '750px' }}
    >
        <div className="dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Settings size={26} strokeWidth={2.5} />
            <div>
              <h2 id="fixed-expenses-dialog-title" style={{ margin: 0, fontSize: '1.25rem' }}>Configurar cuentas</h2>
              <p id="fixed-expenses-dialog-description" style={{ margin: '0.2rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>
                Crea una cuenta y vincúlala con la categoría que detectará sus pagos.
              </p>
            </div>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="Cerrar configuración de cuentas" title="Cerrar">
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
            <label className="settings-field-label">
              <span>Nombre de la cuenta</span>
              <input
                type="text"
                className="input"
                data-dialog-initial-focus
                placeholder="Ej: Luz, CAE, HBO Max"
                value={newFixedName}
                onChange={(e) => setNewFixedName(e.target.value)}
                required
              />
            </label>
            <label className="settings-field-label">
              <span>Palabra de búsqueda <small>(opcional)</small></span>
              <input
                type="text"
                className="input"
                placeholder="Ej: Enel, PAC Agua"
                value={newFixedKeyword}
                onChange={(e) => setNewFixedKeyword(e.target.value)}
              />
            </label>
            <div className="settings-rule-category">
              <span className="settings-field-title">Categoría que confirma el pago</span>
              <CascadingCategorySelector
                initialTipo={newFixedCategory.tipo}
                initialPrincipal={null}
                initialSecundaria={null}
                onSave={(t: any, p: any, s: any) => setNewFixedCategory({ tipo: t, principal: p, secundaria: s })}
              />
            </div>
            <button type="submit" className="btn" style={{ backgroundColor: 'var(--pastel-green)', color: 'var(--text-primary)', border: '2px solid var(--border-color)', padding: '0.75rem 1.5rem', fontSize: '1rem', marginTop: '0.5rem', alignSelf: 'flex-start' }}>
              <Plus size={18} strokeWidth={2.5} />
              Agregar cuenta
            </button>
          </form>

          <div className="settings-list compact">
            {fixedExpenses.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Aún no tienes cuentas configuradas.</p>
            ) : (
              fixedExpenses.map(item => (
                <div key={item.id} className="settings-list-row" style={{ backgroundColor: 'var(--surface-color)', boxShadow: '4px 4px 0px var(--shadow-color)', marginBottom: '0.75rem', padding: '0.6rem 1rem' }}>
                  {editingFixedId === item.id ? (
                    <div className="settings-fixed-expense-edit">
                      <input
                        type="text"
                        className="input"
                        aria-label={`Nombre de ${item.name}`}
                        value={editFixedName}
                        onChange={(e) => setEditFixedName(e.target.value)}
                        placeholder="Nombre"
                      />
                      <input
                        type="text"
                        className="input"
                        aria-label={`Palabra de búsqueda para ${item.name}`}
                        value={editFixedKeyword}
                        onChange={(e) => setEditFixedKeyword(e.target.value)}
                        placeholder="Keyword"
                      />
                      <div style={{ flex: 2 }}>
                        <CascadingCategorySelector
                          initialTipo={editFixedCategory.tipo}
                          initialPrincipal={editFixedCategory.principal}
                          initialSecundaria={editFixedCategory.secundaria}
                          onSave={(t: any, p: any, s: any) => setEditFixedCategory({ tipo: t, principal: p, secundaria: s })}
                        />
                      </div>
                        <button type="button" className="btn btn-primary" onClick={() => handleSaveFixedExpense(item.id)}>Guardar</button>
                        <button type="button" className="btn btn-outline" onClick={cancelEditFixedExpense}>Cancelar</button>
                    </div>
                  ) : (
                    <div className="settings-rule-view" style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div className="settings-rule-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '1.1rem' }}>{item.name}</strong>
                        {item.categoria_principal && (
                          <div style={{ padding: '0.1rem 0.5rem', backgroundColor: 'var(--surface-subtle)', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {item.categoria_secundaria || item.categoria_principal}
                          </div>
                        )}
                        {item.keyword && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>(Clave: "{item.keyword}")</span>}
                      </div>
                      <div className="settings-rule-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="btn btn-outline" style={{ backgroundColor: 'var(--surface-color)', border: '2px solid var(--border-color)', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }} onClick={() => startEditFixedExpense(item)} aria-label={`Editar ${item.name}`} title="Editar">
                          <Edit size={14} /> Editar
                        </button>
                        <button type="button" className="btn-icon" style={{ backgroundColor: 'var(--danger-text)', border: '2px solid var(--border-color)' }} onClick={() => handleDeleteFixedExpense(item.id)} aria-label={`Eliminar ${item.name}`} title="Eliminar"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

    </Dialog>
  );
}
