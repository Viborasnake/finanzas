import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CalendarCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Link2, Pencil, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/authContextValue';
import { AVAILABLE_BANKS, useBanks } from '../contexts/bankContextValue';
import { useSettings } from '../contexts/settingsContextValue';
import { CascadingCategorySelector } from './Transactions';
import { FixedExpensesConfigModal } from '../components/FixedExpensesConfigModal';
import { Dialog } from '../components/Dialog';
import { evaluateAccountCandidate, evaluateAccountMatch, getTransactionCategory } from '../utils/fixedExpenseMatching';
import { hasManualPaymentErrors, validateManualPayment } from '../utils/manualPaymentValidation';

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
};

const getTransactionAmount = (tx: any) => Math.abs(Number(tx.amount || 0));

const getAccountCategoryLabel = (item: any) => [
  item.tipo_movimiento || 'Egreso',
  item.categoria_principal,
  item.categoria_secundaria
].filter(Boolean).join(' > ');

const fmtDate = (d: Date | null) => d
  ? d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
  : 'Sin historial';

const toDateInput = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

const monthRange = (base: Date) => ({
  start: new Date(base.getFullYear(), base.getMonth(), 1),
  end: new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59),
  label: base.toLocaleString('es-CL', { month: 'long', year: 'numeric' })
});



export default function Accounts() {
  const { user } = useAuth();
  const { fixedExpenses } = useSettings();
  const { activeBank, connectedBanks, dashboardScope } = useBanks();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date());
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedHistoryMonth, setExpandedHistoryMonth] = useState<string | null>(null);

  const isConsolidated = dashboardScope === 'all' && connectedBanks.length > 1;
  const scopedBanks = isConsolidated ? connectedBanks : (activeBank ? [activeBank] : []);
  const scopedBankKey = scopedBanks.join('|');
  const userId = user?.id;
  const fetchRequestRef = useRef(0);
  const bankLabel = isConsolidated
    ? 'Todos los bancos'
    : (AVAILABLE_BANKS.find(bank => bank.id === activeBank)?.label || 'Sin banco');
  const range = useMemo(() => monthRange(month), [month]);

  useEffect(() => {
    const requestId = ++fetchRequestRef.current;
    const bankIds = scopedBankKey.split('|').filter(Boolean);

    const fetchAllForBank = async (bankId: string) => {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId!)
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
      if (!userId || bankIds.length === 0) {
        if (requestId === fetchRequestRef.current) {
          setTransactions([]);
          setLoading(false);
        }
        return;
      }
      try {
        setLoading(true);
        if (bankIds.length > 1) {
          const results = await Promise.all(
            bankIds.map(async bank => {
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
          if (requestId === fetchRequestRef.current) setTransactions(rows);
        } else {
          const data = await fetchAllForBank(bankIds[0]);
          data.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
          if (requestId === fetchRequestRef.current) setTransactions(data);
        }
      } catch (error) {
        if (requestId === fetchRequestRef.current) {
          console.error('Error fetching fixed expenses transactions:', error);
          toast.error('No pudimos actualizar las cuentas del banco seleccionado');
        }
      } finally {
        if (requestId === fetchRequestRef.current) setLoading(false);
      }
    };

    void fetchTransactions();
    return () => {
      if (fetchRequestRef.current === requestId) fetchRequestRef.current += 1;
    };
  }, [scopedBankKey, userId]);

  const statuses = useMemo(() => {
    return fixedExpenses.map(item => {
      const configured = Boolean(item.categoria_principal);
      const matchedRecords = transactions
        .map(tx => ({ tx, ...evaluateAccountMatch(tx, item) }))
        .filter(record => record.matches)
        .sort((a, b) => parseLocalDate(b.tx.date).getTime() - parseLocalDate(a.tx.date).getTime());
      const matching = matchedRecords.map(record => record.tx);
      const matchReasons = new Map(matchedRecords.map(record => [record.tx.id, record.reason]));

      const currentPayments = matching.filter(tx => {
        const d = parseLocalDate(tx.date);
        return d >= range.start && d <= range.end;
      });
      const currentPaymentIds = new Set(currentPayments.map(tx => tx.id));
      const candidates = transactions
        .filter(tx => {
          const d = parseLocalDate(tx.date);
          return d >= range.start && d <= range.end && !currentPaymentIds.has(tx.id);
        })
        .map(tx => evaluateAccountCandidate(tx, item))
        .filter(Boolean)
        .sort((a: any, b: any) => b.score - a.score || parseLocalDate(b.tx.date).getTime() - parseLocalDate(a.tx.date).getTime())
        .slice(0, 8);
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const periodIsPast = range.end.getTime() < today.getTime();
      const statusKind = !configured
        ? 'unconfigured'
        : currentPayments.length > 0
          ? 'paid'
          : periodIsPast
            ? 'missing'
            : estimatedDate && estimatedDate.getTime() < today.getTime()
              ? 'overdue'
              : 'pending';
      const statusLabel = {
        unconfigured: 'Por vincular',
        paid: 'Pagado',
        missing: 'Sin registro',
        overdue: 'Atrasado',
        pending: 'Pendiente'
      }[statusKind];

      return {
        item,
        configured,
        categoryLabel: getAccountCategoryLabel(item),
        statusKind,
        statusLabel,
        paid: currentPayments.length > 0,
        paymentCount: currentPayments.length,
        paidAmount,
        paidDate,
        currentPayments,
        candidates,
        matchReasons,
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
  const unpaidCount = statuses.filter(status => status.configured && !status.paid).length;
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
      return false;
    }

    toast.success('Movimiento corregido');
    setEditingTransactionId(null);
    return true;
  };
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualBank, setManualBank] = useState(activeBank || '');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [linkingTransactionId, setLinkingTransactionId] = useState<string | null>(null);
  const [manualTouched, setManualTouched] = useState({ date: false, amount: false, bank: false });
  const manualDateRef = useRef<HTMLInputElement>(null);
  const manualAmountRef = useRef<HTMLInputElement>(null);
  const manualBankRef = useRef<HTMLSelectElement>(null);
  const manualErrors = validateManualPayment({
    amount: manualAmount,
    date: manualDate,
    bank: manualBank,
    allowedBanks: connectedBanks,
    periodStart: toDateInput(range.start),
    periodEnd: toDateInput(range.end)
  });
  const manualFormIsValid = !hasManualPaymentErrors(manualErrors);

  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualTouched({ date: true, amount: true, bank: true });
    if (!user || !selectedStatusId || !manualFormIsValid) {
      if (manualErrors.date) manualDateRef.current?.focus();
      else if (manualErrors.amount) manualAmountRef.current?.focus();
      else if (manualErrors.bank) manualBankRef.current?.focus();
      return;
    }

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
      setManualTouched({ date: false, amount: false, bank: false });
      
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

  useEffect(() => {
    setEditingTransactionId(null);
    setShowHistory(false);
    setExpandedHistoryMonth(null);
    setShowManualForm(false);
    setManualAmount('');
    setManualDate('');
    setManualTouched({ date: false, amount: false, bank: false });
  }, [selectedStatusId]);

  const openAccountDetail = (id: string) => {
    setSelectedStatusId(id);
  };

  const closeAccountDetail = () => {
    setSelectedStatusId(null);
  };

  const openAccountConfiguration = () => {
    closeAccountDetail();
    setShowConfigModal(true);
  };

  const linkCandidateToSelectedAccount = async (tx: any) => {
    if (!selectedStatus?.configured) return;
    setLinkingTransactionId(tx.id);
    try {
      await handleCategorizeTransaction(
        tx.id,
        selectedStatus.item.tipo_movimiento || 'Egreso',
        selectedStatus.item.categoria_principal,
        selectedStatus.item.categoria_secundaria
      );
    } finally {
      setLinkingTransactionId(null);
    }
  };

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

        <div className="accounts-period-controls">
          <button className="btn btn-outline accounts-period-previous" type="button" onClick={() => shiftMonth(-1)} style={{ padding: '0.65rem' }} aria-label="Ver mes anterior">
            <ChevronLeft size={20} />
          </button>
          <div className="accounts-period-label">
            {range.label}
          </div>
          <button className="btn btn-outline accounts-period-next" type="button" onClick={() => shiftMonth(1)} style={{ padding: '0.65rem' }} aria-label="Ver mes siguiente">
            <ChevronRight size={20} />
          </button>
          <button className="btn btn-primary accounts-period-configure" type="button" onClick={() => setShowConfigModal(true)}>
            <Pencil size={18} />
            Configurar
          </button>
        </div>
      </div>

      <section className="accounts-panel">
        <div className="accounts-status-summary">
          <span style={{ padding: '0.45rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#dcfce7', fontWeight: 900 }}>{paidCount} pagados</span>
          <span style={{ padding: '0.45rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fee2e2', fontWeight: 900 }}>{unpaidCount} sin pago</span>
          {unconfiguredCount > 0 && (
            <span style={{ padding: '0.45rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fef9c3', fontWeight: 900 }}>{unconfiguredCount} por vincular</span>
          )}
        </div>

        <details className="accounts-explanation">
          <summary>
            <CircleAlert size={20} aria-hidden="true" />
            <strong>¿Cómo se determina el estado?</strong>
          </summary>
          <p>Una cuenta aparece pagada solo cuando existe un movimiento del periodo con el mismo tipo, categoría principal y subcategoría configurados.</p>
        </details>

        {loading ? (
          <div className="skeleton" style={{ height: '220px' }} />
        ) : fixedExpenses.length === 0 ? (
          <div className="settings-empty">
            <p style={{ marginTop: 0, fontWeight: 800 }}>Aún no tienes cuentas creadas.</p>
            <button className="btn btn-primary" type="button" onClick={() => setShowConfigModal(true)}>
              Crear cuentas
            </button>
          </div>
        ) : (
          <div className="accounts-grid">
            {statuses.map(status => {
              const visual = {
                unconfigured: { background: '#fefce8', badge: '#fde047' },
                paid: { background: '#f0fdf4', badge: '#86efac' },
                missing: { background: '#fff1f2', badge: '#fecaca' },
                overdue: { background: '#fff1f2', badge: '#fca5a5' },
                pending: { background: '#fff7ed', badge: '#fed7aa' }
              }[status.statusKind] || { background: '#fff', badge: '#e2e8f0' };
              const datePrefix = status.paid ? 'Pagado el' : status.estimatedDate ? 'Fecha estimada' : 'Sin fecha estimada';

              return (
                <button
                  type="button"
                  key={status.item.id}
                  onClick={() => openAccountDetail(status.item.id)}
                  className="interactive-card account-status-card"
                  aria-label={`Ver detalle de ${status.item.name}: ${status.statusLabel}`}
                  title={`Ver detalle de ${status.item.name}`}
                  style={{ backgroundColor: visual.background }}
                >
                  <span className="account-status-icon">
                    {status.paid ? <CheckCircle2 size={22} fill="#22c55e" color="#000" /> : <Calendar size={20} strokeWidth={2.5} />}
                  </span>

                  <div className="account-status-copy">
                    <strong>{status.item.name}</strong>
                    <span>{status.configured ? status.categoryLabel : 'Falta vincular una categoría'}</span>
                    <small>{datePrefix}{status.paid || status.estimatedDate ? `: ${fmtDate(status.paid ? status.paidDate : status.estimatedDate)}` : ''}</small>
                    {!status.paid && status.previousDate && (
                      <small>Pago anterior: {fmtDate(status.previousDate)} · ${status.previousAmount.toLocaleString('es-CL')}</small>
                    )}
                  </div>

                  <div className="account-status-result">
                    {status.paid && (
                      <strong>
                        ${status.paidAmount.toLocaleString('es-CL')}
                      </strong>
                    )}
                    {!status.paid && status.candidates.length > 0 && (
                      <small>{status.candidates.length} posible{status.candidates.length === 1 ? '' : 's'}</small>
                    )}
                    <span style={{ backgroundColor: visual.badge }}>
                      {status.statusLabel}
                    </span>
                  </div>
                </button>
              );
            })}
            
            <button
              type="button"
              onClick={() => setShowConfigModal(true)}
              className="interactive-card"
              aria-label="Crear nueva cuenta"
              style={{ width: '100%', color: 'inherit', textAlign: 'left', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '0.8rem', alignItems: 'center', padding: '0.9rem', border: '2px dashed #94a3b8', borderRadius: '10px', backgroundColor: '#f8fafc', minHeight: '76px' }}
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
            </button>
          </div>
        )}
      </section>

      {selectedStatus && (
        <Dialog
          onClose={closeAccountDetail}
          labelledBy="account-detail-dialog-title"
          describedBy="account-detail-dialog-description"
          panelStyle={{ maxWidth: '820px' }}
        >
          <div className="dialog-header">
            <div>
              <h2 id="account-detail-dialog-title">{selectedStatus.item.name}</h2>
              <p id="account-detail-dialog-description" className="account-detail-subtitle">
                {range.label} · {selectedStatus.configured ? selectedStatus.categoryLabel : 'Sin categoría vinculada'}
              </p>
            </div>
            <button className="dialog-close" type="button" onClick={closeAccountDetail} aria-label={`Cerrar detalle de ${selectedStatus.item.name}`} title="Cerrar">
              <X size={24} />
            </button>
          </div>

          <div className="account-detail-body">
            <div className="account-detail-metrics">
              <div className={`account-detail-metric state-${selectedStatus.statusKind}`}>
                <span>Estado del periodo</span>
                <strong>{selectedStatus.statusLabel}</strong>
              </div>
              <div className="account-detail-metric">
                <span>Pagos vinculados</span>
                <strong>{selectedStatus.currentPayments.length}</strong>
              </div>
              <div className="account-detail-metric">
                <span>Monto del periodo</span>
                <strong>${selectedStatus.paidAmount.toLocaleString('es-CL')}</strong>
              </div>
              <div className="account-detail-metric">
                <span>Pago anterior</span>
                <strong>{selectedStatus.previousDate ? `${fmtDate(selectedStatus.previousDate)} · $${selectedStatus.previousAmount.toLocaleString('es-CL')}` : 'Sin historial'}</strong>
              </div>
            </div>

            <section className="account-detection-rule" aria-labelledby="account-detection-title">
              <div className="account-detection-icon"><Search size={20} aria-hidden="true" /></div>
              <div>
                <h3 id="account-detection-title">Cómo se detecta</h3>
                {selectedStatus.configured ? (
                  <>
                    <p>Se marca pagada cuando encuentra un movimiento con la categoría exacta:</p>
                    <strong>{selectedStatus.categoryLabel}</strong>
                    {selectedStatus.item.keyword && <small>La palabra “{selectedStatus.item.keyword}” se usa para encontrar posibles pagos aún mal clasificados.</small>}
                  </>
                ) : (
                  <p>Esta cuenta todavía no puede detectar pagos porque no tiene una categoría vinculada.</p>
                )}
              </div>
              <button type="button" className="btn btn-outline" onClick={openAccountConfiguration}>
                <Pencil size={16} />
                {selectedStatus.configured ? 'Editar vínculo' : 'Vincular categoría'}
              </button>
            </section>

            {selectedStatus.configured && (
              <section className="account-detail-section" aria-labelledby="current-account-payments-title">
                <div className="account-section-heading">
                  <div>
                    <h3 id="current-account-payments-title">Pagos del periodo</h3>
                    <p>Solo aparecen movimientos cuya categoría coincide exactamente.</p>
                  </div>
                  <span>{selectedStatus.currentPayments.length}</span>
                </div>

                {selectedStatus.currentPayments.length > 0 ? (
                  <div className="account-transaction-list">
                    {selectedStatus.currentPayments.map((tx: any) => (
                      <article key={tx.id} className="account-transaction-row">
                        <div className="account-transaction-main">
                          <div>
                            <strong>{tx.description || tx.original_description || 'Sin descripción'}</strong>
                            <span>{tx.date} · {tx.bank || 'Sin banco'}</span>
                            <small>{selectedStatus.matchReasons.get(tx.id)}</small>
                          </div>
                          <strong className="account-transaction-amount">${getTransactionAmount(tx).toLocaleString('es-CL')}</strong>
                        </div>
                        <button type="button" className="btn btn-outline account-correction-toggle" onClick={() => setEditingTransactionId(editingTransactionId === tx.id ? null : tx.id)} aria-expanded={editingTransactionId === tx.id}>
                          <Pencil size={16} />
                          Cambiar categoría
                        </button>
                        {editingTransactionId === tx.id && (
                          <div className="account-inline-correction">
                            <CascadingCategorySelector
                              initialTipo={tx.tipo_movimiento}
                              initialPrincipal={tx.categoria_principal}
                              initialSecundaria={tx.categoria_secundaria}
                              contextDescription={tx.description || tx.original_description}
                              onSave={(tipo: any, principal: any, secundaria: any) => handleCategorizeTransaction(tx.id, tipo, principal, secundaria)}
                            />
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="account-empty-state">
                    <Calendar size={24} aria-hidden="true" />
                    <div>
                      <strong>No hay pagos vinculados en {range.label}.</strong>
                      <span>Revisa las posibles coincidencias antes de registrar un pago manual.</span>
                    </div>
                  </div>
                )}
              </section>
            )}

            {selectedStatus.configured && !selectedStatus.paid && (
              <section className="account-detail-section" aria-labelledby="candidate-payments-title">
                <div className="account-section-heading">
                  <div>
                    <h3 id="candidate-payments-title">Posibles pagos sin vincular</h3>
                    <p>Son sugerencias. No cambian el estado hasta que confirmes una.</p>
                  </div>
                  <span>{selectedStatus.candidates.length}</span>
                </div>

                {selectedStatus.candidates.length > 0 ? (
                  <div className="account-candidate-list">
                    {selectedStatus.candidates.map((candidate: any) => {
                      const tx = candidate.tx;
                      const currentCategory = getTransactionCategory(tx);
                      const currentCategoryLabel = [currentCategory.tipo, currentCategory.principal, currentCategory.secundaria].filter(Boolean).join(' > ') || 'Sin clasificación';
                      return (
                        <article key={tx.id} className="account-candidate-row">
                          <div className="account-transaction-main">
                            <div>
                              <strong>{tx.description || tx.original_description || 'Sin descripción'}</strong>
                              <span>{tx.date} · {tx.bank || 'Sin banco'} · {currentCategoryLabel}</span>
                              <small>{candidate.reason}</small>
                            </div>
                            <strong className="account-transaction-amount">${getTransactionAmount(tx).toLocaleString('es-CL')}</strong>
                          </div>
                          <div className="account-candidate-actions">
                            <button type="button" className="btn btn-primary" onClick={() => linkCandidateToSelectedAccount(tx)} disabled={linkingTransactionId === tx.id}>
                              <Link2 size={16} />
                              {linkingTransactionId === tx.id ? 'Vinculando...' : 'Usar como pago'}
                            </button>
                            <button type="button" className="btn btn-outline" onClick={() => setEditingTransactionId(editingTransactionId === tx.id ? null : tx.id)} aria-expanded={editingTransactionId === tx.id}>
                              Otra categoría
                            </button>
                          </div>
                          {editingTransactionId === tx.id && (
                            <div className="account-inline-correction">
                              <CascadingCategorySelector
                                initialTipo={tx.tipo_movimiento}
                                initialPrincipal={tx.categoria_principal}
                                initialSecundaria={tx.categoria_secundaria}
                                contextDescription={tx.description || tx.original_description}
                                onSave={(tipo: any, principal: any, secundaria: any) => handleCategorizeTransaction(tx.id, tipo, principal, secundaria)}
                              />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="account-empty-state compact">
                    <CircleAlert size={22} aria-hidden="true" />
                    <div>
                      <strong>No encontré candidatos en este periodo.</strong>
                      <span>Puedes ajustar la categoría o registrar el pago manualmente.</span>
                    </div>
                  </div>
                )}

                {!showManualForm ? (
                  <button
                    type="button"
                    className="btn btn-outline account-manual-toggle"
                    onClick={() => {
                      const now = new Date();
                      const defaultDate = now >= range.start && now <= range.end ? now : range.start;
                      setManualDate(toDateInput(defaultDate));
                      if (!manualBank || !connectedBanks.some(bank => bank === manualBank)) {
                        setManualBank(activeBank || connectedBanks[0] || '');
                      }
                      setManualTouched({ date: false, amount: false, bank: false });
                      setShowManualForm(true);
                    }}
                  >
                    Registrar un pago manual
                  </button>
                ) : (
                  <form onSubmit={handleManualPayment} className="account-manual-form">
                    <div className="account-section-heading">
                      <div>
                        <h3>Registrar pago manual</h3>
                        <p>Úsalo solo si el movimiento no existe en tus cartolas.</p>
                      </div>
                    </div>
                    <label>
                      <span>Fecha</span>
                      <input ref={manualDateRef} type="date" className="input" value={manualDate} onChange={event => setManualDate(event.target.value)} onBlur={() => setManualTouched(current => ({ ...current, date: true }))} aria-invalid={manualTouched.date && Boolean(manualErrors.date)} aria-describedby={manualTouched.date && manualErrors.date ? 'manual-payment-date-error' : undefined} required min={toDateInput(range.start)} max={toDateInput(range.end)} />
                      {manualTouched.date && manualErrors.date && <small id="manual-payment-date-error" className="field-error" role="alert">{manualErrors.date}</small>}
                    </label>
                    <label>
                      <span>Monto</span>
                      <input ref={manualAmountRef} type="number" className="input" value={manualAmount} onChange={event => setManualAmount(event.target.value)} onBlur={() => setManualTouched(current => ({ ...current, amount: true }))} aria-invalid={manualTouched.amount && Boolean(manualErrors.amount)} aria-describedby={manualTouched.amount && manualErrors.amount ? 'manual-payment-amount-error' : undefined} required min="1" step="1" inputMode="numeric" placeholder="Ej: 15000" />
                      {manualTouched.amount && manualErrors.amount && <small id="manual-payment-amount-error" className="field-error" role="alert">{manualErrors.amount}</small>}
                    </label>
                    <label>
                      <span>Banco</span>
                      <select ref={manualBankRef} className="input" value={manualBank} onChange={event => setManualBank(event.target.value)} onBlur={() => setManualTouched(current => ({ ...current, bank: true }))} aria-invalid={manualTouched.bank && Boolean(manualErrors.bank)} aria-describedby={manualTouched.bank && manualErrors.bank ? 'manual-payment-bank-error' : undefined} required>
                        <option value="">Selecciona un banco</option>
                        {connectedBanks.map(bank => (
                          <option key={bank} value={bank}>{AVAILABLE_BANKS.find(item => item.id === bank)?.label || bank}</option>
                        ))}
                      </select>
                      {manualTouched.bank && manualErrors.bank && <small id="manual-payment-bank-error" className="field-error" role="alert">{manualErrors.bank}</small>}
                    </label>
                    <div className="account-manual-actions">
                      <button type="submit" className="btn btn-primary" disabled={isSubmittingManual || !manualFormIsValid}>{isSubmittingManual ? 'Guardando...' : 'Guardar pago'}</button>
                      <button type="button" className="btn btn-outline" onClick={() => { setShowManualForm(false); setManualTouched({ date: false, amount: false, bank: false }); }}>Cancelar</button>
                    </div>
                  </form>
                )}
              </section>
            )}

            {selectedStatus.configured && (
              <section className="account-history-section" aria-labelledby="account-history-title">
                <button type="button" className="account-history-toggle" onClick={() => setShowHistory(value => !value)} aria-expanded={showHistory}>
                  <div>
                    <h3 id="account-history-title">Historial de pagos</h3>
                    <span>Revisa los 7 meses anteriores y corrige asociaciones.</span>
                  </div>
                  <span>{showHistory ? 'Ocultar' : 'Mostrar'} <ChevronDown size={18} style={{ transform: showHistory ? 'rotate(180deg)' : 'none' }} /></span>
                </button>

                {showHistory && (
                  <div className="account-history-list">
                    {selectedStatus.monthlyTrace.slice(1).map((historyMonth: any) => {
                      const expanded = expandedHistoryMonth === historyMonth.key;
                      return (
                        <div key={historyMonth.key} className={`account-history-month ${historyMonth.payments.length > 0 ? 'has-payments' : ''}`}>
                          <button type="button" onClick={() => historyMonth.payments.length > 0 && setExpandedHistoryMonth(expanded ? null : historyMonth.key)} aria-expanded={historyMonth.payments.length > 0 ? expanded : undefined} disabled={historyMonth.payments.length === 0}>
                            <div>
                              <strong>{historyMonth.label}</strong>
                              <span>{historyMonth.payments.length > 0 ? `${historyMonth.payments.length} pago${historyMonth.payments.length === 1 ? '' : 's'}` : 'Sin pago detectado'}</span>
                            </div>
                            <strong>{historyMonth.payments.length > 0 ? `$${historyMonth.total.toLocaleString('es-CL')}` : 'Sin registro'}</strong>
                          </button>

                          {expanded && (
                            <div className="account-history-payments">
                              {historyMonth.payments.map((tx: any) => (
                                <div key={tx.id} className="account-history-payment">
                                  <div>
                                    <strong>{tx.description || tx.original_description || 'Sin descripción'}</strong>
                                    <span>{tx.date} · {tx.bank || 'Sin banco'}</span>
                                  </div>
                                  <button type="button" className="btn btn-outline" onClick={() => setEditingTransactionId(editingTransactionId === tx.id ? null : tx.id)} aria-expanded={editingTransactionId === tx.id}>
                                    <Pencil size={15} /> Corregir
                                  </button>
                                  {editingTransactionId === tx.id && (
                                    <div className="account-inline-correction">
                                      <CascadingCategorySelector
                                        initialTipo={tx.tipo_movimiento}
                                        initialPrincipal={tx.categoria_principal}
                                        initialSecundaria={tx.categoria_secundaria}
                                        contextDescription={tx.description || tx.original_description}
                                        onSave={(tipo: any, principal: any, secundaria: any) => handleCategorizeTransaction(tx.id, tipo, principal, secundaria)}
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
