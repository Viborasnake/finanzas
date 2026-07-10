import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AVAILABLE_BANKS, useBanks } from '../contexts/BankContext';
import { Edit2, Trash2, Plus, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

export function InitialAdjustmentManager() {
  const { user } = useAuth();
  const { connectedBanks } = useBanks();
  
  const [adjustments, setAdjustments] = useState<Record<string, any>>({});
  const [suggestions, setSuggestions] = useState<Record<string, any>>({});
  const [editingBank, setEditingBank] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form states (reset when editingBank changes)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [desc, setDesc] = useState('Saldo Inicial (Calculado de Cartola)');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'ingreso'|'egreso'>('ingreso');

  const fetchAllData = async () => {
    if (!user || connectedBanks.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    
    // 1. Fetch adjustments
    const { data: adjData } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .in('bank', connectedBanks)
      .ilike('description', '%saldo inicial%');

    const newAdjustments: Record<string, any> = {};
    if (adjData) {
      adjData.forEach(adj => {
        newAdjustments[adj.bank] = adj;
      });
    }
    setAdjustments(newAdjustments);

    // 2. Fetch suggestions for missing adjustments
    const newSuggestions: Record<string, any> = {};
    const missingBanks = connectedBanks.filter(b => !newAdjustments[b]);
    
    if (missingBanks.length > 0) {
      const { data: txData } = await supabase
        .from('transactions')
        .select('bank, date, amount, type, raw_data')
        .eq('user_id', user.id)
        .in('bank', missingBanks)
        .not('raw_data', 'is', null)
        .order('date', { ascending: true });
        
      if (txData) {
        // Only get the first valid one per bank
        for (const tx of txData) {
          if (newSuggestions[tx.bank]) continue;
          if (tx.raw_data) {
            const saldoKey = Object.keys(tx.raw_data).find(k => k.toLowerCase() === 'saldo' || k.toLowerCase().includes('saldo'));
            if (saldoKey) {
              const val = tx.raw_data[saldoKey];
              const cleanStr = String(val).replace(/[^0-9,-]/g, '');
              const num = parseFloat(cleanStr.replace(',', '.'));
              let currentSaldo = isNaN(num) ? 0 : num;
              
              if (!isNaN(currentSaldo)) {
                const saldoAnterior = tx.type === 'ingreso' ? currentSaldo - tx.amount : currentSaldo + tx.amount;
                newSuggestions[tx.bank] = { 
                  amount: Math.abs(saldoAnterior), 
                  type: saldoAnterior >= 0 ? 'ingreso' : 'egreso', 
                  refDate: tx.date 
                };
              }
            }
          }
        }
      }
    }
    
    setSuggestions(newSuggestions);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [user, connectedBanks]);

  const handleEditClick = (bank: string) => {
    const existing = adjustments[bank];
    if (existing) {
      setDate(existing.date.split('T')[0]);
      setDesc(existing.description);
      setAmount(existing.amount.toString());
      setType(existing.type);
    } else {
      setDate(new Date().toISOString().split('T')[0]);
      setDesc('Saldo Inicial (Calculado de Cartola)');
      setAmount('');
      setType('ingreso');
    }
    setEditingBank(bank);
  };

  const applySuggestion = (bank: string) => {
    const sug = suggestions[bank];
    if (!sug) return;
    setAmount(sug.amount.toString());
    setType(sug.type);
    setDesc(`Saldo Inicial (Calculado de Cartola)`);
    
    const d = new Date(sug.refDate);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleDelete = async (bank: string) => {
    const existing = adjustments[bank];
    if (!existing) return;
    if (!window.confirm(`¿Estás seguro de eliminar el Ajuste de Inicio para ${bank}?`)) return;
    
    toast.loading('Eliminando...', { id: 'del-adj' });
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', existing.id);
      
    if (error) {
      toast.error('Error al eliminar', { id: 'del-adj' });
    } else {
      toast.success('Ajuste eliminado', { id: 'del-adj' });
      if (editingBank === bank) setEditingBank(null);
      fetchAllData();
    }
  };

  const handleSubmit = async (e: React.FormEvent, bank: string) => {
    e.preventDefault();
    if (!user || !desc.trim() || !amount) return;
    
    toast.loading('Guardando...', { id: 'save-adj' });
    const payload = {
      user_id: user.id,
      bank,
      date,
      description: desc.trim(),
      amount: Math.abs(parseFloat(amount)),
      type,
      tipo_movimiento: 'Movimiento Interno',
      categoria_principal: 'Ajuste',
      categoria_secundaria: 'Saldo Inicial'
    };

    const existing = adjustments[bank];
    
    if (existing) {
      const { error } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', existing.id);
        
      if (error) {
        toast.error('Error al actualizar', { id: 'save-adj' });
      } else {
        toast.success('Ajuste actualizado', { id: 'save-adj' });
        setEditingBank(null);
        fetchAllData();
      }
    } else {
      const { error } = await supabase
        .from('transactions')
        .insert([payload]);
        
      if (error) {
        toast.error('Error al guardar', { id: 'save-adj' });
      } else {
        toast.success('Ajuste guardado', { id: 'save-adj' });
        setEditingBank(null);
        fetchAllData();
      }
    }
  };

  const getBankLabel = (bankId: string) => {
    const bankInfo = AVAILABLE_BANKS.find(b => b.id === bankId);
    return bankInfo ? bankInfo.label : bankId;
  };

  const [isCollapsed, setIsCollapsed] = useState(false);

  if (connectedBanks.length === 0) return null;

  return (
    <div id="ajuste" className="card settings-card-wide settings-anchor" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>$</span>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Ajuste de Inicio (Saldo Inicial)</h2>
            <span style={{ display: 'block', color: '#64748b', fontSize: '0.82rem', fontWeight: 800 }}>Configura el saldo base para que cuadre todo</span>
          </div>
        </div>
        <button className="btn btn-outline" type="button" style={{ padding: '0.5rem 0.75rem', border: '2px solid black', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isCollapsed ? (
            <>Mostrar <ChevronDown size={16} strokeWidth={3} /></>
          ) : (
            <>Ocultar <ChevronUp size={16} strokeWidth={3} /></>
          )}
        </button>
      </div>
      
      {!isCollapsed && (
        <div style={{ marginTop: '1.25rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 600 }}>
            Configura o edita el saldo base de tus cuentas bancarias para que el balance sea exacto.
          </p>

      {loading ? (
        <p style={{ fontWeight: 600 }}>Cargando información...</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {connectedBanks.map(bank => {
            const adj = adjustments[bank];
            const isEditingThis = editingBank === bank;
            const bankLabel = getBankLabel(bank);

            return (
              <div key={bank} style={{ border: '2px solid black', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ backgroundColor: adj ? '#f8fafc' : '#fefce8', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  
                  <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 900, fontSize: '1.1rem' }}>{bankLabel}</h3>
                    {adj ? (
                      <div>
                        <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: adj.type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                          {adj.type === 'ingreso' ? '+' : '-'}${adj.amount.toLocaleString('es-CL')}
                        </p>
                        <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>Fecha base: {new Date(adj.date).toLocaleDateString('es-CL')}</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#854d0e', fontWeight: 700, fontSize: '0.9rem' }}>
                        <AlertCircle size={16} /> No configurado
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {adj ? (
                      <>
                        <button className="btn" onClick={() => isEditingThis ? setEditingBank(null) : handleEditClick(bank)} style={{ backgroundColor: 'white', border: '2px solid black', boxShadow: '2px 2px 0px black' }}>
                          <Edit2 size={16} /> {isEditingThis ? 'Ocultar' : 'Editar'}
                        </button>
                        <button className="btn" onClick={() => handleDelete(bank)} style={{ backgroundColor: '#fee2e2', color: 'var(--danger)', border: '2px solid black', boxShadow: '2px 2px 0px black' }}>
                          <Trash2 size={16} /> Borrar
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-primary" onClick={() => isEditingThis ? setEditingBank(null) : handleEditClick(bank)}>
                        {isEditingThis ? 'Ocultar' : <><Plus size={16} /> Configurar</>}
                      </button>
                    )}
                  </div>
                </div>

                {/* Form area */}
                {isEditingThis && (
                  <div style={{ padding: '1.5rem', backgroundColor: 'white', borderTop: '2px solid black' }}>
                    <h4 style={{ margin: '0 0 1.25rem 0', fontWeight: 800 }}>{adj ? 'Editar Ajuste' : 'Nuevo Ajuste de Inicio'} para {bankLabel}</h4>
                    
                    {!adj && suggestions[bank] && (
                      <div style={{ backgroundColor: '#f0fdf4', border: '2px dashed #166534', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#166534', fontWeight: 800 }}>💡 Sugerencia del Sistema</p>
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#166534' }}>
                          Basado en tu primera transacción importada, tu saldo inicial debió ser de <strong>${suggestions[bank].amount.toLocaleString('es-CL')}</strong> ({suggestions[bank].type}).
                        </p>
                        <button 
                          type="button"
                          onClick={() => applySuggestion(bank)} 
                          style={{ backgroundColor: '#166534', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
                        >
                          Autocompletar Formulario
                        </button>
                      </div>
                    )}

                    <form onSubmit={(e) => handleSubmit(e, bank)} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>FECHA</label>
                        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} required style={{ width: '100%' }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>DESCRIPCIÓN</label>
                        <input className="input" type="text" value={desc} onChange={e => setDesc(e.target.value)} required style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>MONTO</label>
                        <input className="input" type="number" min="0" step="1" value={amount} onChange={e => setAmount(e.target.value)} required style={{ width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>TIPO</label>
                        <select className="input" value={type} onChange={(e: any) => setType(e.target.value)} style={{ width: '100%' }}>
                          <option value="ingreso">Ingreso (+)</option>
                          <option value="egreso">Egreso (-)</option>
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                          Guardar Ajuste
                        </button>
                        <button type="button" className="btn" onClick={() => setEditingBank(null)} style={{ backgroundColor: '#e2e8f0', color: 'black' }}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </div>
                )}
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
