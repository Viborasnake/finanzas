import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Calendar, CalendarCheck, CheckCircle2, ChevronLeft, ChevronRight, X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AVAILABLE_BANKS, useBanks } from '../contexts/BankContext';
import { useSettings } from '../contexts/SettingsContext';
import { CascadingCategorySelector } from './Transactions';
import { FixedExpensesConfigModal } from '../components/FixedExpensesConfigModal';

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
};

const normalizeText = (value: any) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const getTransactionAmount = (tx: any) => Math.abs(Number(tx.amount || 0));

const fmtDate = (d: Date | null) => d
  ? d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
  : 'Sin historial';

const monthRange = (base: Date) => ({
  start: new Date(base.getFullYear(), base.getMonth(), 1),
  end: new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59),
  label: base.toLocaleString('es-CL', { month: 'long', year: 'numeric' })
});



export default function Accounts() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { fixedExpenses } = useSettings();
  const { activeBank, connectedBanks, dashboardScope } = useBanks();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);

  const isConsolidated = dashboardScope === 'all' && connectedBanks.length > 1;
  const scopedBanks = isConsolidated ? connectedBanks : (activeBank ? [activeBank] : []);
  const bankLabel = isConsolidated
    ? 'Todos los bancos'
    : (AVAILABLE_BANKS.find(bank => bank.id === activeBank)?.label || 'Sin banco');
  const range = useMemo(() => monthRange(month), [month]);

  useEffect(() => {
    const fetchAllForBank = async (bankId: string) => {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user!.id)
          .eq('bank', bankId)
          .order('date', { ascending: false })
          .range(from, from + step - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = [...allData, ...data];
        if (data.length < step) break;
        from += step;
      }
      return allData;
    };

    const fetchTransactions = async () => {
      if (!user || scopedBanks.length === 0) {
        setTransactions([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        if (isConsolidated) {
          const results = await Promise.all(
            scopedBanks.map(async bank => {
              try {
                const data = await fetchAllForBank(bank);
                return { data, bank, error: null };
              } catch (error) {
                return { data: null, bank, error };
              }
            })
          );
          const firstError = results.find(result => result.error)?.error;
          if (firstError) throw firstError;

          const rows = results.flatMap(result =>
            (result.data || []).map(tx => ({
              ...tx,
              bank: tx.bank || result.bank
            }))
          );
          rows.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
          setTransactions(rows);
        } else {
          const data = await fetchAllForBank(scopedBanks[0]);
          data.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
          setTransactions(data);
        }
      } catch (error) {
        console.error('Error fetching fixed expenses transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [user, activeBank, dashboardScope, connectedBanks.join('|')]);

  const statuses = useMemo(() => {
    const descriptionText = (tx: any) => normalizeText([
      tx.description,
      tx.original_description,
      tx.raw_data ? Object.values(tx.raw_data).join(' ') : ''
    ].filter(Boolean).join(' '));

    const categoryTokenMatches = (categoryPath: string, itemValue: any) => {
      const itemNorm = normalizeText(itemValue);
      if (!itemNorm) return true; // empty secundaria = wildcard
      if (!categoryPath) return false; // no category on tx = no match
      return categoryPath.split('|').some(part => {
        const partNorm = normalizeText(part);
        if (!partNorm) return false;
        return partNorm === itemNorm || partNorm.includes(itemNorm) || itemNorm.includes(partNorm);
      });
    };

    const matchesLinkedCategory = (tx: any, item: any) => {
      if (!item.categoria_principal) return false;
      const categoryPath = [
        tx.tipo_movimiento,
        tx.categoria_principal,
        tx.categoria_secundaria,
        tx.category_tipo,
        tx.category_principal,
        tx.category_secundaria
      ].filter(Boolean).join('|');

      // Primary match: the transaction's category matches the fixed expense's configured category
      const linkedCategoryMatches = categoryTokenMatches(categoryPath, item.categoria_principal)
        && categoryTokenMatches(categoryPath, item.categoria_secundaria);
      if (linkedCategoryMatches) return true;

      // Fallback: only use name/keyword match if the tx has NO category assigned yet
      // This avoids matching categorized transactions of another type
      if (categoryPath) return false;

      const desc = descriptionText(tx);
      const descTokens = desc.split(/[^a-z0-9]+/).filter(Boolean);
      const nameTokens = normalizeText(item.name).split(/[^a-z0-9]+/).filter(token => token.length >= 4);
      const nameMatches = nameTokens.length > 0 && nameTokens.some(token => descTokens.includes(token));
      const keywordMatches = normalizeText(item.keyword) && desc.includes(normalizeText(item.keyword));
      return Boolean(nameMatches || keywordMatches);
    };

    return fixedExpenses.map(item => {
      const configured = Boolean(item.categoria_principal);
      const matching = transactions
        .filter(tx => matchesLinkedCategory(tx, item))
        .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());

      const currentPayments = matching.filter(tx => {
        const d = parseLocalDate(tx.date);
        return d >= range.start && d <= range.end;
      });
      const previousPayment = matching.find(tx => parseLocalDate(tx.date) < range.start);
      const previousPayments = matching
        .filter(tx => parseLocalDate(tx.date) < range.start)
        .slice(0, 8);
      const monthlyTrace = Array.from({ length: 8 }, (_, index) => {
        const monthStart = new Date(range.start.getFullYear(), range.start.getMonth() - index, 1);
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59);
        const payments = matching.filter(tx => {
          const d = parseLocalDate(tx.date);
          return d >= monthStart && d <= monthEnd;
        });

        return {
          key: `${monthStart.getFullYear()}-${monthStart.getMonth()}`,
          label: monthStart.toLocaleString('es-CL', { month: 'long', year: 'numeric' }),
          payments,
          total: payments.reduce((acc, tx) => acc + getTransactionAmount(tx), 0)
        };
      });

      const paidAmount = currentPayments.reduce((acc, tx) => acc + getTransactionAmount(tx), 0);
      const paidDate = currentPayments[0] ? parseLocalDate(currentPayments[0].date) : null;
      const previousDate = previousPayment ? parseLocalDate(previousPayment.date) : null;
      const previousAmount = previousPayment ? getTransactionAmount(previousPayment) : 0;
      const referenceDate = paidDate || previousDate;
      const estimatedDate = referenceDate
        ? new Date(range.start.getFullYear(), range.start.getMonth(), Math.min(referenceDate.getDate(), new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0).getDate()), 12, 0, 0)
        : null;

      return {
        item,
        configured,
        paid: currentPayments.length > 0,
        paymentCount: currentPayments.length,
        paidAmount,
        paidDate,
        currentPayments,
        previousPayments,
        monthlyTrace,
        previousDate,
        previousAmount,
        estimatedDate
      };
    });
  }, [fixedExpenses, transactions, range.start, range.end]);

  const paidCount = statuses.filter(status => status.paid).length;
  const unconfiguredCount = statuses.filter(status => !status.configured).length;
  const pendingCount = statuses.filter(status => status.configured && !status.paid).length;
  const selectedStatus = selectedStatusId ? statuses.find(status => status.item.id === selectedStatusId) : null;

  const shiftMonth = (delta: number) => {
    setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const handleCategorizeTransaction = async (txId: string, tipo: string | null, principal: string | null, secundaria: string | null) => {
    const prev = transactions;
    setTransactions(current => current.map(tx => tx.id === txId
      ? { ...tx, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }
      : tx
    ));

    const { error } = await supabase
      .from('transactions')
      .update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria })
      .eq('id', txId);

    if (error) {
      setTransactions(prev);
      toast.error('No pude actualizar la categoría');
      return;
    }

    toast.success('Movimiento corregido');
  };
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualBank, setManualBank] = useState(activeBank || '');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedStatusId || !manualAmount || !manualDate || !manualBank) return;

    const selectedExpense = fixedExpenses.find(f => f.id === selectedStatusId);
    if (!selectedExpense) return;

    try {
      setIsSubmittingManual(true);
      
      const newTransaction = {
        user_id: user.id,
        date: manualDate,
        amount: -Math.abs(Number(manualAmount)),
        type: 'egreso',
        description: `Pago manual - ${selectedExpense.name}`,
        original_description: `Pago manual - ${selectedExpense.name}`,
        bank: manualBank,
        tipo_movimiento: 'Egreso',
        categoria_principal: selectedExpense.categoria_principal,
        categoria_secundaria: selectedExpense.categoria_secundaria,
        raw_data: { is_manual: true }
      };

      const { data, error } = await supabase.from('transactions').insert([newTransaction]).select('*').single();
      
      if (error) throw error;
      
      toast.success('Pago manual registrado');
      setShowManualForm(false);
      setManualAmount('');
      setManualDate('');
      
      // Update local state to reflect the new transaction immediately
      setTransactions(prev => [...prev, data]);
      
    } catch (err: any) {
      console.error(err);
      toast.error('Error al registrar pago manual');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const [showConfigModal, setShowConfigModal] = useState(false);

  return (
    <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '2rem 1rem 4rem' }}>
      {showConfigModal && <FixedExpensesConfigModal onClose={() => setShowConfigModal(false)} />}
      
      <div className="header-container" style={{ marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.45rem' }}>
            <CalendarCheck size={34} strokeWidth={2.7} />
            Cuentas
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontWeight: 750, fontSize: '1.05rem' }}>
            Control de gastos fijos por categoría vinculada para {bankLabel}.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-outline" type="button" onClick={() => shiftMonth(-1)} style={{ padding: '0.65rem' }}>
            <ChevronLeft size={20} />
          </button>
          <div style={{ border: '2px solid #000', borderRadius: '999px', boxShadow: '3px 3px 0 #000', padding: '0.65rem 1rem', fontWeight: 900, minWidth: '170px', textAlign: 'center', textTransform: 'capitalize' }}>
            {range.label}
          </div>
          <button className="btn btn-outline" type="button" onClick={() => shiftMonth(1)} style={{ padding: '0.65rem' }}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <section style={{ border: '2px solid #000', borderRadius: '12px', boxShadow: '4px 4px 0 #000', backgroundColor: '#fff', padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <span style={{ padding: '0.45rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#dcfce7', fontWeight: 900 }}>{paidCount} pagados</span>
          <span style={{ padding: '0.45rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fee2e2', fontWeight: 900 }}>{pendingCount} pendientes</span>
          {unconfiguredCount > 0 && (
            <span style={{ padding: '0.45rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fef9c3', fontWeight: 900 }}>{unconfiguredCount} por vincular</span>
          )}
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: '220px' }} />
        ) : fixedExpenses.length === 0 ? (
          <div className="settings-empty">
            <p style={{ marginTop: 0, fontWeight: 800 }}>Aún no tienes cuentas creadas.</p>
            <button className="btn btn-primary" type="button" onClick={() => navigate('/settings#gastos-fijos')}>
              Crear cuentas
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '0.85rem' }}>
            {statuses.map(status => {
              const bg = !status.configured ? '#fefce8' : status.paid ? '#f0fdf4' : '#fff1f2';
              const label = !status.configured ? 'Vincular' : status.paid ? 'Pagado' : 'Pendiente';
              const labelBg = !status.configured ? '#fde047' : status.paid ? '#86efac' : '#fca5a5';

              return (
                <article
                  key={status.item.id}
                  onClick={() => setSelectedStatusId(status.item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedStatusId(status.item.id);
                  }}
                  title={`Ver detalle de ${status.item.name}`}
                  style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '0.8rem', alignItems: 'center', padding: '0.9rem', border: '2px solid #000', borderRadius: '10px', backgroundColor: bg, boxShadow: '2px 2px 0 #000', cursor: 'pointer', transition: 'transform 0.1s, box-shadow 0.1s' }}
                >
                  <span style={{ width: '38px', height: '38px', border: '2px solid #000', borderRadius: '8px', backgroundColor: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {status.paid ? <CheckCircle2 size={22} fill="#22c55e" color="#000" /> : <Calendar size={20} strokeWidth={2.5} />}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '0.95rem', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status.item.name}</strong>
                    <div style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 800, marginTop: '0.15rem' }}>
                      {fmtDate(status.paid ? status.paidDate : status.estimatedDate)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {status.paid && (
                      <div style={{ color: '#15803d', fontWeight: 900, fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                        ${status.paidAmount.toLocaleString('es-CL')}
                      </div>
                    )}
                    <span style={{ display: 'inline-block', padding: '0.2rem 0.5rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: labelBg, fontWeight: 900, fontSize: '0.7rem' }}>
                      {label}
                    </span>
                  </div>
                </article>
              );
            })}
            
            <article
              onClick={() => setShowConfigModal(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setShowConfigModal(true);
              }}
              style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '0.8rem', alignItems: 'center', padding: '0.9rem', border: '2px dashed #94a3b8', borderRadius: '10px', backgroundColor: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s', minHeight: '76px' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#000';
                e.currentTarget.style.backgroundColor = '#f1f5f9';
                e.currentTarget.style.boxShadow = '3px 3px 0 #000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#94a3b8';
                e.currentTarget.style.backgroundColor = '#f8fafc';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ width: '38px', height: '38px', border: '2px solid #94a3b8', borderRadius: '8px', backgroundColor: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={22} color="#64748b" />
              </span>
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem', color: '#334155' }}>Crear nueva cuenta</strong>
                <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 600, marginTop: '0.15rem' }}>
                  Añadir nuevo gasto mensual
                </div>
              </div>
            </article>
          </div>
        )}
      </section>

      {selectedStatus && createPortal(
        <div
          onClick={() => setSelectedStatusId(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ width: '100%', maxWidth: '760px', maxHeight: '86vh', overflow: 'auto', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', boxShadow: '5px 5px 0 #000' }}
          >
            <div style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', borderBottom: '2px solid #000', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', zIndex: 1 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Detalle: {selectedStatus.item.name}</h2>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontWeight: 800, textTransform: 'capitalize' }}>
                  {range.label} · {selectedStatus.item.categoria_principal
                    ? `${selectedStatus.item.categoria_principal}${selectedStatus.item.categoria_secundaria ? ` > ${selectedStatus.item.categoria_secundaria}` : ''}`
                    : 'Sin categoria vinculada'}
                </p>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => setSelectedStatusId(null)}
                style={{ padding: '0.45rem', border: 'none', boxShadow: 'none', background: 'transparent' }}
                title="Cerrar"
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '1.2rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ border: '2px solid #000', borderRadius: '9px', padding: '0.85rem', backgroundColor: selectedStatus.paid ? '#f0fdf4' : '#fff1f2' }}>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase' }}>Estado periodo</div>
                  <strong>{selectedStatus.paid ? 'Pagado' : 'Pendiente'}</strong>
                </div>
                <div style={{ border: '2px solid #000', borderRadius: '9px', padding: '0.85rem', backgroundColor: '#f8fafc' }}>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase' }}>Pagos encontrados</div>
                  <strong>{selectedStatus.currentPayments.length}</strong>
                </div>
                <div style={{ border: '2px solid #000', borderRadius: '9px', padding: '0.85rem', backgroundColor: '#f8fafc' }}>
                  <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase' }}>Monto periodo</div>
                  <strong>${selectedStatus.paidAmount.toLocaleString('es-CL')}</strong>
                </div>
              </div>

              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Pagos asociados del periodo</h3>
              {selectedStatus.currentPayments.length === 0 ? (
                <div style={{ border: '2px dashed #cbd5e1', borderRadius: '9px', padding: '1rem', backgroundColor: '#f8fafc', color: '#64748b', fontWeight: 800, marginBottom: '1.2rem' }}>
                  <p style={{ margin: '0 0 1rem' }}>No encontré movimientos asociados a esta cuenta en el periodo seleccionado.</p>
                  
                  {!showManualForm ? (
                    <button className="btn btn-primary" onClick={() => setShowManualForm(true)}>
                      Registrar Pago Manual
                    </button>
                  ) : (
                    <form onSubmit={handleManualPayment} style={{ display: 'grid', gap: '0.75rem', backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: 0 }}>Registrar Pago Manual</h4>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>Fecha</label>
                        <input type="date" className="input" style={{ width: '100%' }} value={manualDate} onChange={e => setManualDate(e.target.value)} required min={range.start.toISOString().split('T')[0]} max={range.end.toISOString().split('T')[0]} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>Monto</label>
                        <input type="number" className="input" style={{ width: '100%' }} value={manualAmount} onChange={e => setManualAmount(e.target.value)} required min="0" placeholder="Ej: 15000" />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '0.3rem' }}>Medio de Pago (Banco)</label>
                        <select className="input" style={{ width: '100%' }} value={manualBank} onChange={e => setManualBank(e.target.value)} required>
                          <option value="">Selecciona un banco...</option>
                          {connectedBanks.map(b => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button type="submit" className="btn btn-primary" disabled={isSubmittingManual} style={{ flex: 1 }}>
                          {isSubmittingManual ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button type="button" className="btn" onClick={() => setShowManualForm(false)} style={{ backgroundColor: '#e2e8f0', color: 'black' }}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: 'auto', marginBottom: '1.2rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Fecha</th>
                        <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Banco</th>
                        <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Descripcion</th>
                        <th style={{ padding: '0.7rem', textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Monto</th>
                        <th style={{ padding: '0.7rem', textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Corregir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStatus.currentPayments.map((tx: any) => (
                        <tr key={tx.id}>
                          <td style={{ padding: '0.7rem', borderBottom: '1px solid #e2e8f0', fontWeight: 800 }}>{tx.date}</td>
                          <td style={{ padding: '0.7rem', borderBottom: '1px solid #e2e8f0', fontWeight: 800 }}>{tx.bank || 'Sin banco'}</td>
                          <td style={{ padding: '0.7rem', borderBottom: '1px solid #e2e8f0' }}>{tx.description || tx.original_description || 'Sin descripcion'}</td>
                          <td style={{ padding: '0.7rem', borderBottom: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 900, color: '#dc2626' }}>${getTransactionAmount(tx).toLocaleString('es-CL')}</td>
                          <td style={{ padding: '0.7rem', borderBottom: '1px solid #e2e8f0', minWidth: '220px' }}>
                            <CascadingCategorySelector
                              initialPrincipal={tx.categoria_principal}
                              initialSecundaria={tx.categoria_secundaria}
                              contextDescription={tx.description || tx.original_description}
                              onSave={(tipo: any, principal: any, secundaria: any) => handleCategorizeTransaction(tx.id, tipo, principal, secundaria)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Revision mensual</h3>
              <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '1.2rem' }}>
                {selectedStatus.monthlyTrace.map((month: any) => (
                  <div
                    key={month.key}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) auto', gap: '0.75rem', alignItems: 'center', border: '2px solid #000', borderRadius: '9px', padding: '0.65rem 0.75rem', backgroundColor: month.payments.length > 0 ? '#f0fdf4' : '#fff1f2' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ textTransform: 'capitalize' }}>{month.label}</strong>
                      <div style={{ color: '#64748b', fontWeight: 750, fontSize: '0.78rem' }}>
                        {month.payments.length > 0
                          ? month.payments.map((tx: any) => `${tx.date} · ${tx.description || 'Sin descripcion'}`).join(' / ')
                          : 'Sin movimiento detectado'}
                      </div>
                      {month.payments.length > 0 && (
                        <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.5rem' }}>
                          {month.payments.map((tx: any) => (
                            <div key={tx.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(210px, auto)', gap: '0.5rem', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.76rem', color: '#334155', fontWeight: 800, overflowWrap: 'anywhere' }}>
                                {tx.date} · {tx.description || tx.original_description || 'Sin descripcion'}
                              </span>
                              <CascadingCategorySelector
                                initialPrincipal={tx.categoria_principal}
                                initialSecundaria={tx.categoria_secundaria}
                                contextDescription={tx.description || tx.original_description}
                                onSave={(tipo: any, principal: any, secundaria: any) => handleCategorizeTransaction(tx.id, tipo, principal, secundaria)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span style={{ fontWeight: 950, color: month.payments.length > 0 ? '#15803d' : '#dc2626' }}>
                      {month.payments.length > 0 ? `$${month.total.toLocaleString('es-CL')}` : 'Pendiente'}
                    </span>
                  </div>
                ))}
              </div>


            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
