import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useBanks } from '../contexts/BankContext';
import { Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export function InitialAdjustmentManager() {
  const { user } = useAuth();
  const { connectedBanks, mainBank } = useBanks();
  const [selectedBank, setSelectedBank] = useState<string>(mainBank || (connectedBanks.length > 0 ? connectedBanks[0] : ''));
  
  const [existingAdjustment, setExistingAdjustment] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [desc, setDesc] = useState('Saldo Inicial (Calculado de Cartola)');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'ingreso'|'egreso'>('ingreso');
  const [suggestion, setSuggestion] = useState<{ amount: number, type: 'ingreso'|'egreso', refDate: string } | null>(null);

  useEffect(() => {
    if (connectedBanks.length > 0 && !selectedBank) {
      setSelectedBank(mainBank || connectedBanks[0]);
    }
  }, [connectedBanks, mainBank, selectedBank]);

  useEffect(() => {
    async function checkExisting() {
      if (!user || !selectedBank) return;
      setLoading(true);
      
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('bank', selectedBank)
        .ilike('description', '%saldo inicial%')
        .limit(1);

      if (data && data.length > 0) {
        setExistingAdjustment(data[0]);
        setSuggestion(null);
      } else {
        setExistingAdjustment(null);
        fetchSuggestion();
      }
      setLoading(false);
    }
    checkExisting();
  }, [user, selectedBank]);

  async function fetchSuggestion() {
    if (!user || !selectedBank) return;
    const { data } = await supabase
      .from('transactions')
      .select('date, amount, type, raw_data')
      .eq('user_id', user.id)
      .eq('bank', selectedBank)
      .not('raw_data', 'is', null)
      .order('date', { ascending: true })
      .limit(1);

    if (data && data.length > 0) {
      const tx = data[0];
      if (tx.raw_data) {
        const saldoKey = Object.keys(tx.raw_data).find(k => k.toLowerCase() === 'saldo' || k.toLowerCase().includes('saldo'));
        if (saldoKey) {
          const val = tx.raw_data[saldoKey];
          const cleanStr = String(val).replace(/[^0-9,-]/g, '');
          const num = parseFloat(cleanStr.replace(',', '.'));
          let currentSaldo = isNaN(num) ? 0 : num;
          
          if (!isNaN(currentSaldo)) {
            const saldoAnterior = tx.type === 'ingreso' ? currentSaldo - tx.amount : currentSaldo + tx.amount;
            setSuggestion({ 
              amount: Math.abs(saldoAnterior), 
              type: saldoAnterior >= 0 ? 'ingreso' : 'egreso', 
              refDate: tx.date 
            });
          }
        }
      }
    }
  }

  const applySuggestion = () => {
    if (!suggestion) return;
    setAmount(suggestion.amount.toString());
    setType(suggestion.type);
    setDesc(`Saldo Inicial (Calculado de Cartola)`);
    
    const d = new Date(suggestion.refDate);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleEditClick = () => {
    if (!existingAdjustment) return;
    setDate(existingAdjustment.date);
    setDesc(existingAdjustment.description);
    setAmount(existingAdjustment.amount.toString());
    setType(existingAdjustment.type);
    setIsEditing(true);
  };

  const handleDelete = async () => {
    if (!existingAdjustment) return;
    if (!window.confirm("¿Estás seguro de eliminar el Ajuste de Inicio para este banco?")) return;
    
    toast.loading('Eliminando...', { id: 'del-adj' });
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', existingAdjustment.id);
      
    if (error) {
      toast.error('Error al eliminar', { id: 'del-adj' });
    } else {
      toast.success('Ajuste eliminado', { id: 'del-adj' });
      setExistingAdjustment(null);
      fetchSuggestion();
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!user || !selectedBank) return;
    if (!desc.trim() || !amount) return;
    
    toast.loading('Guardando...', { id: 'save-adj' });
    const payload = {
      user_id: user.id,
      bank: selectedBank,
      date,
      description: desc.trim(),
      amount: Math.abs(parseFloat(amount)),
      type,
      tipo_movimiento: 'Movimiento Interno',
      categoria_principal: 'Ajuste',
      categoria_secundaria: 'Saldo Inicial'
    };

    if (existingAdjustment) {
      const { error, data } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', existingAdjustment.id)
        .select();
        
      if (error) {
        toast.error('Error al actualizar', { id: 'save-adj' });
      } else {
        toast.success('Ajuste actualizado', { id: 'save-adj' });
        setExistingAdjustment(data[0]);
        setIsEditing(false);
      }
    } else {
      const { error, data } = await supabase
        .from('transactions')
        .insert([payload])
        .select();
        
      if (error) {
        toast.error('Error al guardar', { id: 'save-adj' });
      } else {
        toast.success('Ajuste guardado', { id: 'save-adj' });
        setExistingAdjustment(data[0]);
        setIsEditing(false);
      }
    }
  };

  if (connectedBanks.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Ajuste de Inicio (Saldo Inicial)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
        Configura o edita el saldo base de tus cuentas bancarias para que el balance sea exacto.
      </p>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>SELECCIONA UN BANCO</label>
        <select 
          className="input" 
          value={selectedBank} 
          onChange={(e) => {
            setSelectedBank(e.target.value);
            setIsEditing(false);
          }}
          style={{ maxWidth: '300px' }}
        >
          {connectedBanks.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ fontWeight: 600 }}>Cargando información...</p>
      ) : existingAdjustment && !isEditing ? (
        <div style={{ backgroundColor: '#f8fafc', border: '2px solid black', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <p style={{ margin: '0 0 0.5rem 0', fontWeight: 800, fontSize: '1.1rem' }}>Saldo Inicial Configurado</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, color: existingAdjustment.type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                {existingAdjustment.type === 'ingreso' ? '+' : '-'}${existingAdjustment.amount.toLocaleString('es-CL')}
              </p>
              <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>Fecha base: {new Date(existingAdjustment.date).toLocaleDateString('es-CL')}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn" onClick={handleEditClick} style={{ backgroundColor: 'white', border: '2px solid black', boxShadow: '2px 2px 0px black' }}>
                <Edit2 size={16} /> Editar
              </button>
              <button className="btn" onClick={handleDelete} style={{ backgroundColor: '#fee2e2', color: 'var(--danger)', border: '2px solid black', boxShadow: '2px 2px 0px black' }}>
                <Trash2 size={16} /> Borrar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '2px solid black', boxShadow: '4px 4px 0px black' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', fontWeight: 800 }}>{isEditing ? 'Editar Ajuste' : 'Nuevo Ajuste de Inicio'}</h3>
          
          {!isEditing && suggestion && (
            <div style={{ backgroundColor: '#f0fdf4', border: '2px dashed #166534', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#166534', fontWeight: 800 }}>💡 Sugerencia del Sistema</p>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#166534' }}>
                Basado en tu primera transacción importada, tu saldo inicial debió ser de <strong>${suggestion.amount.toLocaleString('es-CL')}</strong> ({suggestion.type}).
              </p>
              <button 
                type="button"
                onClick={applySuggestion} 
                style={{ backgroundColor: '#166534', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Autocompletar Formulario
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
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
              {isEditing && (
                <button type="button" className="btn" onClick={() => setIsEditing(false)} style={{ backgroundColor: '#e2e8f0', color: 'black' }}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
