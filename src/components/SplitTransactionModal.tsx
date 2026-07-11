import { useState, useEffect } from 'react';
import { X, Plus, Scissors, Save } from 'lucide-react';
import { CascadingCategorySelector } from '../pages/Transactions';

interface SplitPart {
  id: string;
  amount: number;
  tipo_movimiento: string;
  categoria_principal: string;
  categoria_secundaria: string;
}

interface SplitTransactionModalProps {
  transaction: any;
  onClose: () => void;
  onSave: (parts: SplitPart[]) => void;
}

export default function SplitTransactionModal({ transaction, onClose, onSave }: SplitTransactionModalProps) {
  const [parts, setParts] = useState<SplitPart[]>([]);
  const totalAmount = Math.abs(transaction.amount);
  
  useEffect(() => {
    // Initialize with 2 parts by default
    setParts([
      {
        id: crypto.randomUUID(),
        amount: Math.round(totalAmount / 2),
        tipo_movimiento: transaction.tipo_movimiento || '',
        categoria_principal: transaction.categoria_principal || '',
        categoria_secundaria: transaction.categoria_secundaria || ''
      },
      {
        id: crypto.randomUUID(),
        amount: totalAmount - Math.round(totalAmount / 2),
        tipo_movimiento: '',
        categoria_principal: '',
        categoria_secundaria: ''
      }
    ]);
  }, [transaction]);

  const addPart = () => {
    const currentSum = parts.reduce((acc, p) => acc + p.amount, 0);
    const remainder = Math.max(0, totalAmount - currentSum);
    
    setParts([
      ...parts,
      {
        id: crypto.randomUUID(),
        amount: remainder,
        tipo_movimiento: '',
        categoria_principal: '',
        categoria_secundaria: ''
      }
    ]);
  };

  const updatePart = (id: string, field: keyof SplitPart, value: any) => {
    setParts(parts.map(p => {
      if (p.id === id) {
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const removePart = (id: string) => {
    if (parts.length <= 2) return; // Minimum 2 parts
    setParts(parts.filter(p => p.id !== id));
  };

  const handleCategorySave = (id: string, tipo: string, principal: string, secundaria: string) => {
    setParts(parts.map(p => {
      if (p.id === id) {
        return { ...p, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria };
      }
      return p;
    }));
  };

  const currentSum = parts.reduce((acc, p) => acc + p.amount, 0);
  const remainder = totalAmount - currentSum;
  const isValid = remainder === 0 && parts.every(p => p.amount > 0 && p.tipo_movimiento);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
      <div style={{ backgroundColor: '#fff', border: '3px solid #000', borderRadius: '12px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '8px 8px 0px #000', display: 'flex', flexDirection: 'column' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '3px solid #000', backgroundColor: '#fef08a' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Scissors size={24} strokeWidth={2.5} />
            Dividir Transacción
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem' }}>
            <X size={24} strokeWidth={3} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ backgroundColor: '#f8fafc', padding: '1rem', border: '2px solid #000', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748b' }}>Monto Original</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>${totalAmount.toLocaleString('es-CL')}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.25rem' }}>{transaction.description || transaction.original_description}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: remainder === 0 ? '#16a34a' : '#dc2626' }}>
                Restante por asignar
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: remainder === 0 ? '#16a34a' : '#dc2626' }}>
                ${Math.abs(remainder).toLocaleString('es-CL')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {parts.map((part, index) => (
              <div key={part.id} style={{ border: '2px solid #000', borderRadius: '8px', padding: '1rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>División {index + 1}</div>
                  {parts.length > 2 && (
                    <button 
                      onClick={() => removePart(part.id)}
                      style={{ background: '#fecaca', border: '2px solid #000', borderRadius: '4px', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}
                      title="Eliminar división"
                    >
                      <X size={14} strokeWidth={3} />
                    </button>
                  )}
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Monto</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 800 }}>$</span>
                      <input 
                        type="number" 
                        value={part.amount || ''}
                        onChange={(e) => updatePart(part.id, 'amount', parseInt(e.target.value) || 0)}
                        style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 1.5rem', border: '2px solid #000', borderRadius: '6px', fontWeight: 700, fontSize: '1rem', backgroundColor: '#fff', outline: 'none' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Categoría</label>
                    <div style={{ border: '2px solid #000', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#fff' }}>
                      <CategoryWrapper 
                        initialTipo={part.tipo_movimiento}
                        initialPrincipal={part.categoria_principal}
                        initialSecundaria={part.categoria_secundaria}
                        onSave={(t: any, p: any, s: any) => handleCategorySave(part.id, t, p, s)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={addPart}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', backgroundColor: '#fff' }}
          >
            <Plus size={18} strokeWidth={3} />
            Añadir otra división
          </button>
        </div>

        {/* Footer */}
        <div style={{ padding: '1.25rem 1.5rem', borderTop: '3px solid #000', backgroundColor: '#f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose} style={{ backgroundColor: '#fff' }}>Cancelar</button>
          <button 
            className="btn btn-primary" 
            onClick={() => onSave(parts)}
            disabled={!isValid}
            style={{ opacity: isValid ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title={!isValid ? 'Asegúrate de asignar el monto completo y categorizar todas las partes' : ''}
          >
            <Save size={18} strokeWidth={2.5} />
            Guardar Divisiones
          </button>
        </div>

      </div>
    </div>
  );
}

function CategoryWrapper({ initialTipo, initialPrincipal, initialSecundaria, onSave }: any) {
  return (
    <div style={{ padding: '0.15rem' }}>
      <CascadingCategorySelector 
        initialTipo={initialTipo}
        initialPrincipal={initialPrincipal}
        initialSecundaria={initialSecundaria}
        onSave={onSave}
      />
    </div>
  );
}
