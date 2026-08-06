import { useState, useEffect } from 'react';
import { X, Plus, Scissors, Save } from 'lucide-react';
import { CascadingCategorySelector } from '../pages/Transactions';
import { Dialog } from './Dialog';
import { isLoanInstallment } from '../utils/transactionSemantics';

interface SplitPart {
  id: string;
  amount: number;
  date?: string;
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
  const isDebtInstallment = isLoanInstallment(transaction);
  
  useEffect(() => {
    // Initialize with 2 parts by default
    setParts(isDebtInstallment ? [
      {
        id: crypto.randomUUID(),
        amount: totalAmount,
        date: transaction.date,
        tipo_movimiento: 'Egreso',
        categoria_principal: 'Servicio de Deuda',
        categoria_secundaria: 'Capital de Crédito'
      },
      {
        id: crypto.randomUUID(),
        amount: 0,
        date: transaction.date,
        tipo_movimiento: 'Egreso',
        categoria_principal: 'Servicio de Deuda',
        categoria_secundaria: 'Intereses de Crédito'
      }
    ] : [
      {
        id: crypto.randomUUID(),
        amount: Math.round(totalAmount / 2),
        date: transaction.date,
        tipo_movimiento: transaction.tipo_movimiento || '',
        categoria_principal: transaction.categoria_principal || '',
        categoria_secundaria: transaction.categoria_secundaria || ''
      },
      {
        id: crypto.randomUUID(),
        amount: totalAmount - Math.round(totalAmount / 2),
        date: transaction.date,
        tipo_movimiento: '',
        categoria_principal: '',
        categoria_secundaria: ''
      }
    ]);
  }, [transaction, totalAmount, isDebtInstallment]);

  const addPart = () => {
    const currentSum = parts.reduce((acc, p) => acc + p.amount, 0);
    const remainder = Math.max(0, totalAmount - currentSum);
    
    setParts([
      ...parts,
      {
        id: crypto.randomUUID(),
        amount: remainder,
        date: transaction.date,
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
    <Dialog
      onClose={onClose}
      labelledBy="split-dialog-title"
      describedBy="split-dialog-summary"
      panelClassName="split-dialog"
      panelStyle={{ maxWidth: '700px', maxHeight: '90dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
        
        {/* Header */}
        <div className="split-dialog-header">
          <h2 id="split-dialog-title">
            <Scissors size={24} strokeWidth={2.5} />
            Dividir transacción
          </h2>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Cerrar división de transacción">
            <X size={24} strokeWidth={3} />
          </button>
        </div>

        {/* Content */}
        <div className="split-dialog-body">
          
          <div id="split-dialog-summary" className="split-dialog-summary">
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Monto Original</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>${totalAmount.toLocaleString('es-CL')}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.25rem' }}>{transaction.description || transaction.original_description}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: remainder === 0 ? 'var(--success)' : 'var(--danger)' }}>
                Restante por asignar
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: remainder === 0 ? 'var(--success)' : 'var(--danger)' }}>
                ${Math.abs(remainder).toLocaleString('es-CL')}
              </div>
            </div>
          </div>

          {isDebtInstallment && (
            <div className="split-debt-guidance" role="note">
              <strong>Desglosa esta cuota con la información del banco</strong>
              <p>El capital reduce tu deuda y no cuenta como consumo. Los intereses, seguros y comisiones sí son gasto. No estimaremos estos montos automáticamente.</p>
              <small>Si la cuota incluye seguros o comisiones, agrega una tercera división y usa “Servicio de Deuda → Seguros y Comisiones”.</small>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {parts.map((part, index) => (
              <div key={part.id} style={{ border: '2px solid var(--border-color)', borderRadius: '8px', padding: '1rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>División {index + 1}</div>
                  {parts.length > 2 && (
                    <button 
                      type="button"
                      onClick={() => removePart(part.id)}
                      style={{ background: 'var(--danger-surface)', border: '2px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}
                      title="Eliminar división"
                      aria-label={`Eliminar división ${index + 1}`}
                    >
                      <X size={14} strokeWidth={3} />
                    </button>
                  )}
                </div>
                
                <div className="split-part-fields">
                  <div>
                    <label htmlFor={`split-date-${part.id}`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Fecha</label>
                    <input 
                      id={`split-date-${part.id}`}
                      type="date" 
                      value={part.date || transaction.date}
                      onChange={(e) => updatePart(part.id, 'date', e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor={`split-amount-${part.id}`} style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Monto</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 800 }}>$</span>
                      <input 
                        id={`split-amount-${part.id}`}
                        type="number" 
                        value={part.amount || ''}
                        onChange={(e) => updatePart(part.id, 'amount', parseInt(e.target.value) || 0)}
                        className="input"
                        style={{ paddingLeft: '1.25rem' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.25rem' }}>Categoría</label>
                    <div>
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
            type="button"
            onClick={addPart}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', backgroundColor: 'var(--surface-color)' }}
          >
            <Plus size={18} strokeWidth={3} />
            Añadir otra división
          </button>
        </div>

        {/* Footer */}
        <div className="split-dialog-footer">
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ backgroundColor: 'var(--surface-color)' }}>Cancelar</button>
          <button 
            type="button"
            className="btn btn-primary" 
            onClick={() => onSave(parts)}
            disabled={!isValid}
            style={{ opacity: isValid ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title={!isValid ? 'Asegúrate de asignar el monto completo y categorizar todas las partes' : ''}
          >
            <Save size={18} strokeWidth={2.5} />
            Guardar divisiones
          </button>
        </div>

    </Dialog>
  );
}

function CategoryWrapper({ initialTipo, initialPrincipal, initialSecundaria, onSave }: any) {
  return (
    <div>
      <CascadingCategorySelector 
        initialTipo={initialTipo}
        initialPrincipal={initialPrincipal}
        initialSecundaria={initialSecundaria}
        onSave={onSave}
      />
    </div>
  );
}
