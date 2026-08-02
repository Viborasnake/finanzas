import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck, Check, ChevronLeft, ChevronRight, CircleAlert, Gauge, Landmark, ReceiptText, Sparkles, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/authContextValue';
import { AVAILABLE_BANKS, useBanks } from '../contexts/bankContextValue';
import { useSettings } from '../contexts/settingsContextValue';
import { supabase } from '../services/supabase';
import { buildMonthlyLightSummary, getMonthRange, getRecentMonthOptions, type LightTransaction } from '../utils/monthlyLightView';

const formatMoney = (value: number) => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0
}).format(value);

const formatShortDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' }).format(new Date(`${value.split('T')[0]}T12:00:00`))
  : '';

export default function LightDashboard() {
  const { user } = useAuth();
  const { fixedExpenses, loadingSettings } = useSettings();
  const { activeBank, connectedBanks, dashboardScope } = useBanks();
  const [transactions, setTransactions] = useState<LightTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const monthOptions = useMemo(() => getRecentMonthOptions(new Date(), 6), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => getRecentMonthOptions(new Date(), 6)[0].key);
  const selectedMonth = useMemo(
    () => monthOptions.find(option => option.key === selectedMonthKey) || monthOptions[0],
    [monthOptions, selectedMonthKey]
  );
  const selectedMonthIndex = Math.max(0, monthOptions.findIndex(option => option.key === selectedMonthKey));
  const shiftSelectedMonth = (offset: number) => {
    const nextOption = monthOptions[selectedMonthIndex + offset];
    if (!nextOption) return;
    setSelectedMonthKey(nextOption.key);
    setShowAllPayments(false);
  };
  const monthRange = useMemo(() => getMonthRange(selectedMonth.date), [selectedMonth.date]);
  const isCurrentMonth = selectedMonthKey === monthOptions[0].key;
  const isConsolidated = dashboardScope === 'all' && connectedBanks.length > 1;
  const scopedBanks = isConsolidated ? connectedBanks : (activeBank ? [activeBank] : []);
  const scopedBankKey = scopedBanks.join('|');
  const scopeLabel = isConsolidated
    ? 'Todos los bancos'
    : AVAILABLE_BANKS.find(bank => bank.id === activeBank)?.label || 'Sin banco';

  const fetchTransactions = useCallback(async () => {
    const bankIds = scopedBankKey.split('|').filter(Boolean);
    if (!user || bankIds.length === 0) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const results = await Promise.all(bankIds.map(async bank => {
        const [monthResult, priorResult] = await Promise.all([
          supabase
            .from('transactions')
            .select('id,date,created_at,description,amount,type,bank,tipo_movimiento,categoria_principal,categoria_secundaria,raw_data')
            .eq('user_id', user.id)
            .eq('bank', bank)
            .gte('date', monthRange.startInput)
            .lte('date', monthRange.endInput)
            .order('date', { ascending: false }),
          supabase
            .from('transactions')
            .select('id,date,created_at,description,amount,type,bank,tipo_movimiento,categoria_principal,categoria_secundaria,raw_data')
            .eq('user_id', user.id)
            .eq('bank', bank)
            .lt('date', monthRange.startInput)
            .not('raw_data', 'is', null)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100)
        ]);
        if (monthResult.error) throw monthResult.error;
        if (priorResult.error) throw priorResult.error;
        return [...(monthResult.data || []), ...(priorResult.data || [])] as LightTransaction[];
      }));
      setTransactions(results.flat());
    } catch (error) {
      console.error('Error loading Light view:', error);
      setTransactions([]);
      setLoadError('No pudimos resumir este mes. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [monthRange.endInput, monthRange.startInput, scopedBankKey, user]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  const summary = useMemo(
    () => buildMonthlyLightSummary(transactions, fixedExpenses, selectedMonth.date, scopedBankKey.split('|').filter(Boolean)),
    [fixedExpenses, scopedBankKey, selectedMonth.date, transactions]
  );
  const commitmentTotal = summary.fixedExpenseStatuses.length;
  const commitmentProgress = commitmentTotal > 0
    ? Math.round((summary.paidCommitmentCount / commitmentTotal) * 100)
    : 0;
  const leadingCategory = summary.categories[0];
  const prioritizedCommitments = useMemo(() => (
    [...summary.fixedExpenseStatuses].sort((first, second) => {
      const priority = { pending: 0, unconfigured: 1, paid: 2 };
      return priority[first.state] - priority[second.state];
    })
  ), [summary.fixedExpenseStatuses]);
  const visibleCommitments = showAllPayments
    ? prioritizedCommitments
    : prioritizedCommitments.slice(0, 6);

  if (loading || (user && loadingSettings)) {
    return (
      <div className="light-dashboard" aria-busy="true" aria-live="polite">
        <div className="light-skeleton light-skeleton-hero" />
        <div className="light-skeleton-grid">
          <div className="light-skeleton" />
          <div className="light-skeleton" />
        </div>
      </div>
    );
  }

  return (
    <div className="light-dashboard">
      <header className="light-header">
        <div>
          <span className="light-eyebrow"><Sparkles size={16} aria-hidden="true" /> Vista Light</span>
          <h1>Tu mes, sin ruido</h1>
          <p>Solo lo esencial de {summary.range.label}: pagos importantes y panorama general de gastos.</p>
        </div>
        <div className="dashboard-month-navigation light-month-navigation">
          <button type="button" className="dashboard-month-arrow" onClick={() => shiftSelectedMonth(1)} disabled={selectedMonthIndex >= monthOptions.length - 1} aria-label="Mes anterior" title="Mes anterior">
            <ChevronLeft size={19} strokeWidth={3} />
          </button>
          <label className="dashboard-period-trigger light-period-trigger" htmlFor="light-month-selector">
            <CalendarCheck size={18} aria-hidden="true" />
            <span className="sr-only">Mes de la Vista Light</span>
            <select
              id="light-month-selector"
              value={selectedMonthKey}
              onChange={event => {
                setSelectedMonthKey(event.target.value);
                setShowAllPayments(false);
              }}
            >
              {monthOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <span aria-hidden="true">·</span>
            <span className="light-period-scope">{scopeLabel}</span>
          </label>
          <button type="button" className="dashboard-month-arrow" onClick={() => shiftSelectedMonth(-1)} disabled={selectedMonthIndex === 0} aria-label="Mes siguiente" title="Mes siguiente">
            <ChevronRight size={19} strokeWidth={3} />
          </button>
        </div>
      </header>

      {loadError && (
        <div className="light-error" role="alert">
          <CircleAlert size={20} aria-hidden="true" />
          <span>{loadError}</span>
          <button type="button" className="btn btn-outline" onClick={() => void fetchTransactions()}>Reintentar</button>
        </div>
      )}

      <section className={`light-balance-card ${summary.balance < 0 ? 'is-negative' : ''}`} aria-labelledby="light-balance-title">
        <div>
          <span className="light-card-label" id="light-balance-title">Resultado de {summary.range.label}</span>
          <strong>{formatMoney(summary.balance)}</strong>
          <p>{summary.transactionCount === 0
            ? `No hay movimientos registrados en ${summary.range.label}.`
            : summary.balance < 0
              ? `Gastaste ${formatMoney(Math.abs(summary.balance))} más de lo que recibiste.`
              : summary.balance > 0
                ? `Recibiste ${formatMoney(summary.balance)} más de lo que gastaste.`
                : 'Recibiste y gastaste el mismo monto.'}</p>
          {summary.transactionCount > 0 && (
            <small className="light-opening-balance">Entradas: {formatMoney(summary.totalAvailable)} · Gastos: {formatMoney(summary.totalExpenses)}</small>
          )}
        </div>
        <Gauge size={58} strokeWidth={1.8} aria-hidden="true" />
      </section>

      <section className="light-kpis" aria-label="Resumen financiero del mes">
        <article className="light-kpi light-kpi-income">
          <span><TrendingUp size={18} aria-hidden="true" /> Entradas disponibles</span>
          <strong>{formatMoney(summary.totalAvailable)}</strong>
          {summary.receivedTransferAmount > 0 && (
            <small>{formatMoney(summary.totalIncome)} ingresos + {formatMoney(summary.receivedTransferAmount)} transferencias</small>
          )}
        </article>
        <article className="light-kpi light-kpi-expense">
          <span><TrendingDown size={18} aria-hidden="true" /> Gastos</span>
          <strong>{formatMoney(summary.totalExpenses)}</strong>
        </article>
        <article className="light-kpi">
          <span><ReceiptText size={18} aria-hidden="true" /> Movimientos</span>
          <strong>{summary.transactionCount}</strong>
        </article>
      </section>

      <p className="light-accounting-note">
        El resultado muestra el consumo del mes. Pagos de tarjeta por deuda anterior, transferencias propias y capital de inversiones se registran aparte para no duplicar gastos.
        {summary.debtSettlementAmount > 0 && (
          <small>Pago de deuda anterior: {formatMoney(summary.debtSettlementAmount)}.</small>
        )}
        {(summary.investmentRedemptionAmount > 0 || summary.investmentPlacementAmount > 0) && (
          <small>
            Inversiones del mes: {formatMoney(summary.investmentPlacementAmount)} colocados · {formatMoney(summary.investmentRedemptionAmount)} rescatados.
          </small>
        )}
      </p>

      <div className="light-main-grid">
        <section className="light-section light-commitments" aria-labelledby="light-payments-title">
          <div className="light-section-heading">
            <div>
              <span className="light-card-label">Pagos importantes</span>
              <h2 id="light-payments-title">¿Cómo va el mes?</h2>
            </div>
            {commitmentTotal > 0 && <strong>{summary.paidCommitmentCount}/{commitmentTotal}</strong>}
          </div>

          {commitmentTotal > 0 ? (
            <>
              <div className="light-progress" aria-label={`${commitmentProgress}% de pagos importantes registrados`}>
                <span style={{ width: `${commitmentProgress}%` }} />
              </div>
              <div className="light-payment-list">
                {visibleCommitments.map(status => (
                  <article className="light-payment-row" key={status.item.id}>
                    <span className={`light-status-icon is-${status.state}`}>
                      {status.state === 'paid' ? <Check size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}
                    </span>
                    <div>
                      <strong>{status.item.name}</strong>
                      <small>{status.state === 'paid'
                        ? `Registrado ${formatShortDate(status.lastPaymentDate)}`
                        : status.state === 'pending' ? (isCurrentMonth ? 'Aún no aparece este mes' : 'Sin registro en este mes') : 'Falta vincular una categoría'}</small>
                    </div>
                    <b>{status.state === 'paid' ? formatMoney(status.paidAmount) : status.state === 'pending' ? 'Pendiente' : 'Configurar'}</b>
                  </article>
                ))}
              </div>
              {commitmentTotal > 6 && (
                <button type="button" className="light-more-button" onClick={() => setShowAllPayments(value => !value)}>
                  {showAllPayments ? 'Mostrar solo prioridades' : `Ver los ${commitmentTotal} pagos`}
                </button>
              )}
            </>
          ) : (
            <div className="light-empty">
              <Landmark size={30} aria-hidden="true" />
              <strong>Aún no definiste pagos importantes</strong>
              <p>Agrega dividendo, arriendo, suscripciones o servicios para verlos aquí cada mes.</p>
            </div>
          )}
          <Link className="light-link" to="/accounts">Gestionar pagos del mes <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>

        <section className="light-section" aria-labelledby="light-macro-title">
          <div className="light-section-heading">
            <div>
              <span className="light-card-label">Gasto macro</span>
              <h2 id="light-macro-title">¿En qué se fue?</h2>
            </div>
            <WalletCards size={25} aria-hidden="true" />
          </div>
          {summary.categories.length > 0 ? (
            <div className="light-category-list">
              {summary.categories.slice(0, 5).map(category => (
                <article key={category.name} className="light-category-row">
                  <div><strong>{category.name}</strong><span>{formatMoney(category.amount)}</span></div>
                  <div className="light-category-track"><span style={{ width: `${Math.max(category.percentage, 3)}%` }} /></div>
                  <small>{Math.round(category.percentage)}% del gasto</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="light-empty"><ReceiptText size={30} aria-hidden="true" /><strong>No hay gastos registrados en {summary.range.label}</strong></div>
          )}
          <Link className="light-link" to="/">Abrir análisis completo <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>
      </div>

      <section className="light-insight" aria-label="Lectura rápida del mes">
        <Sparkles size={23} aria-hidden="true" />
        <div>
          <strong>Lectura rápida</strong>
          <p>{leadingCategory
            ? `${leadingCategory.name} concentra ${Math.round(leadingCategory.percentage)}% de tus gastos del mes.`
            : 'Cuando registres gastos, aquí verás el dato más importante del mes.'}
            {summary.pendingCommitmentCount > 0
              ? isCurrentMonth
                ? ` Te quedan ${summary.pendingCommitmentCount} pago${summary.pendingCommitmentCount === 1 ? '' : 's'} importante${summary.pendingCommitmentCount === 1 ? '' : 's'} por registrar.`
                : ` Hubo ${summary.pendingCommitmentCount} pago${summary.pendingCommitmentCount === 1 ? '' : 's'} importante${summary.pendingCommitmentCount === 1 ? '' : 's'} sin registro en ese mes.`
              : ''}
          </p>
        </div>
      </section>
    </div>
  );
}
