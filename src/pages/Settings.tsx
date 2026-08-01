import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/authContextValue';
import { Plus, Trash2, Save, X, Landmark, Tags, Wand2, Activity, CheckCircle2, ChevronRight, Settings as SettingsIcon, FileSpreadsheet, Sparkles, ChevronDown, Wallet, Edit2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import type { ClassificationRule } from '../utils/classificationRules';
import { applyRules } from '../utils/classificationRules';
import { CascadingCategorySelector } from './Transactions';
import { useSettings } from '../contexts/settingsContextValue';
import { useBanks, AVAILABLE_BANKS } from '../contexts/bankContextValue';
import { useLocation, useNavigate } from 'react-router-dom';
import { InitialAdjustmentManager } from '../components/InitialAdjustmentManager';
import { useActionQueue } from '../hooks/useActionQueue';
import { ConfirmDialog } from '../components/ConfirmDialog';

const RULES_PER_PAGE = 12;

const CollapsibleSection = ({ id, icon: Icon, title, subtitle, description, defaultCollapsed = true, className = "card settings-card settings-card-wide", children }: any) => {
  const { hash } = useLocation();
  const [collapsed, setCollapsed] = useState(() => hash === `#${id}` ? false : defaultCollapsed);
  const contentId = `${id}-content`;

  useEffect(() => {
    if (hash !== `#${id}`) return;
    setCollapsed(false);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, id]);

  return (
    <div id={id} className={className} style={{ position: 'relative', zIndex: 9, padding: '1.25rem' }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        style={{ width: '100%', minHeight: 'var(--control-height)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', textAlign: 'left', color: 'inherit' }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Icon size={26} />
          <div>
            <span role="heading" aria-level={2} style={{ display: 'block', margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{title}</span>
            <span style={{ display: 'block', color: '#64748b', fontSize: '0.82rem', fontWeight: 800, marginTop: '0.25rem' }}>{subtitle}</span>
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '0.9rem', color: 'var(--text-primary)', flexShrink: 0 }}>
          {collapsed ? 'Mostrar' : 'Ocultar'}
          <ChevronDown size={18} strokeWidth={3} style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
        </span>
      </button>
      {!collapsed && (
        <div id={contentId} style={{ marginTop: '1.25rem' }}>
          {description && <p className="settings-muted" style={{ marginBottom: '1.25rem' }}>{description}</p>}
          {children}
        </div>
      )}
    </div>
  );
};

interface DestructiveAction {
  title: string;
  description: string;
  confirmLabel: string;
  confirmationText?: string;
  onConfirm: () => Promise<void>;
}

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [destructiveAction, setDestructiveAction] = useState<DestructiveAction | null>(null);
  
  const executeDeleteAccount = async () => {
    if (!user) return;

    try {
      toast.loading('Borrando datos de la cuenta...', { id: 'deleteAccount' });

      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
      
      toast.success('Cuenta eliminada exitosamente', { id: 'deleteAccount' });
      
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (error: any) {
      console.error('Error al borrar cuenta:', error);
      toast.error('Ocurrió un error al intentar borrar tu cuenta. Por favor contacta a soporte.', { id: 'deleteAccount' });
      throw error;
    }
  };

  // Settings
  const [myRut, setMyRut] = useState('');
  const [rutSaving, setRutSaving] = useState(false);
  const { dispatchAction } = useActionQueue();


  const { customCategories, saveCustomCategories, classificationRules, saveClassificationRules, setClassificationRules, saveUserRut } = useSettings();
  const { connectedBanks, mainBank, setMainBankAndSave, addBank, removeBank, activeBank, dashboardScope } = useBanks();
  const connectedBankKey = connectedBanks.join('|');

  const [setupCollapsed, setSetupCollapsed] = useState(() => localStorage.getItem('finanzas_setup_collapsed') === 'true');
  const [setupStats, setSetupStats] = useState({ hasInitialBalance: false, realMovements: 0, unclassified: 0, loading: true });
  const setupEssentialComplete = !setupStats.loading
    && connectedBanks.length > 0
    && setupStats.hasInitialBalance
    && Boolean(myRut)
    && setupStats.realMovements > 0
    && setupStats.unclassified === 0;

  useEffect(() => {
    if (setupStats.loading) return;
    if (localStorage.getItem('finanzas_setup_collapsed') === null) {
      setSetupCollapsed(setupEssentialComplete);
    }
  }, [setupEssentialComplete, setupStats.loading]);

  const toggleSetupCollapsed = () => {
    setSetupCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('finanzas_setup_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    const fetchSetupStats = async () => {
      if (!user) return;
      
      const connectedBankIds = connectedBankKey.split('|').filter(Boolean);
      const dashboardBanks = dashboardScope === 'all' && connectedBankIds.length > 1 ? connectedBankIds : (activeBank ? [activeBank] : []);
      if (dashboardBanks.length === 0) {
        if (!cancelled) setSetupStats({ hasInitialBalance: false, realMovements: 0, unclassified: 0, loading: false });
        return;
      }

      setSetupStats(prev => ({ ...prev, loading: true }));
      
      const { data, error } = await supabase
        .from('transactions')
        .select('description, categoria_principal')
        .eq('user_id', user.id)
        .in('bank', dashboardBanks);

      if (error || !data) {
        if (!cancelled) setSetupStats({ hasInitialBalance: false, realMovements: 0, unclassified: 0, loading: false });
        return;
      }

      const hasInitialBalance = data.some(t => (t.description || '').toLowerCase().includes('saldo inicial'));
      const realMovements = data.filter(t => !(t.description || '').toLowerCase().includes('saldo inicial')).length;
      const unclassified = data.filter(t => !(t.description || '').toLowerCase().includes('saldo inicial') && (!t.categoria_principal || t.categoria_principal === 'Sin Clasificar')).length;

      if (!cancelled) setSetupStats({ hasInitialBalance, realMovements, unclassified, loading: false });
    };

    void fetchSetupStats();
    return () => {
      cancelled = true;
    };
  }, [user, activeBank, dashboardScope, connectedBankKey]);

  const renderSetupMiniDashboard = () => {
    const dashboardBanks = dashboardScope === 'all' && connectedBanks.length > 1 ? connectedBanks : (activeBank ? [activeBank] : []);
    if (dashboardBanks.length === 0 || setupStats.loading) return null;

    const activeBankInfo = AVAILABLE_BANKS.find(b => b.id === activeBank);
    const dashboardBankLabel = (dashboardScope === 'all' && connectedBanks.length > 1) ? 'Todos los bancos' : (activeBankInfo?.label || 'Sin banco');

    const hasRut = Boolean(myRut);
    const items = [
      {
        title: 'Banco activo',
        detail: dashboardBankLabel,
        done: true,
        action: 'Cambiar',
        path: '#bancos',
        icon: <Landmark size={18} strokeWidth={2.5} />
      },
      {
        title: 'Saldo inicial',
        detail: setupStats.hasInitialBalance ? 'Configurado' : 'Pendiente para balance exacto',
        done: setupStats.hasInitialBalance,
        action: setupStats.hasInitialBalance ? 'Revisar' : 'Configurar',
        path: '#ajuste',
        icon: <Wallet size={18} strokeWidth={2.5} />
      },
      {
        title: 'RUT propio',
        detail: hasRut ? 'Listo para detectar transferencias propias' : 'Falta para evitar dobles conteos',
        done: hasRut,
        action: hasRut ? 'Ver' : 'Guardar',
        path: '#deteccion',
        icon: <SettingsIcon size={18} strokeWidth={2.5} />
      },
      {
        title: 'Cartola',
        detail: `${setupStats.realMovements.toLocaleString('es-CL')} movimientos reales`,
        done: setupStats.realMovements > 0,
        action: 'Importar más',
        path: '/import',
        icon: <FileSpreadsheet size={18} strokeWidth={2.5} />
      },
      {
        title: 'Clasificación',
        detail: setupStats.unclassified === 0 ? 'Todo clasificado' : `${setupStats.unclassified} sin clasificar`,
        done: setupStats.unclassified === 0,
        action: setupStats.unclassified === 0 ? 'Revisar' : 'Clasificar',
        path: '/transactions',
        icon: <Tags size={18} strokeWidth={2.5} />
      },
      {
        title: 'Automatización',
        detail: `${classificationRules.length} reglas · opcional`,
        done: classificationRules.length > 0 || setupStats.unclassified === 0,
        action: classificationRules.length > 0 ? 'Revisar' : 'Crear reglas',
        path: '#reglas',
        icon: <Sparkles size={18} strokeWidth={2.5} />
      }
    ];

    const doneCount = items.filter(item => item.done).length;
    const progress = Math.round((doneCount / items.length) * 100);
    const nextItem = items.find(item => !item.done) || items[items.length - 1];

    return (
      <section style={{ border: '2px solid #000', borderRadius: '12px', boxShadow: '4px 4px 0px #000', backgroundColor: '#fff', marginBottom: '2rem', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={toggleSetupCollapsed}
          aria-expanded={!setupCollapsed}
          aria-controls="settings-setup-details"
          style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '1rem', alignItems: 'center', textAlign: 'left', padding: '1rem 1.25rem', backgroundColor: '#f8fafc', border: 'none', borderBottom: setupCollapsed ? 'none' : '2px solid #000', cursor: 'pointer' }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.6rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#dbeafe', boxShadow: '2px 2px 0 #000', fontSize: '0.72rem', fontWeight: 900 }}>
                <Activity size={14} strokeWidth={3} />
                Estado del banco
              </span>
              <strong style={{ fontSize: '1rem' }}>{dashboardBankLabel}</strong>
              <span style={{ color: '#64748b', fontWeight: 800, fontSize: '0.85rem' }}>{doneCount}/{items.length} listo</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div role="progressbar" aria-label="Progreso de configuración" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ flex: 1, maxWidth: '360px', height: '12px', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fff', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', backgroundColor: progress === 100 ? '#86efac' : '#fde047' }} />
              </div>
              <span style={{ fontWeight: 900, fontSize: '0.85rem' }}>{progress}%</span>
              <span style={{ color: '#334155', fontWeight: 700, fontSize: '0.85rem' }}>
                {progress === 100 ? 'Operación lista' : `Sigue: ${nextItem.title}`}
              </span>
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 900, fontSize: '0.85rem' }}>
            {setupCollapsed ? 'Mostrar' : 'Ocultar'}
            <ChevronDown size={18} strokeWidth={3} style={{ transform: setupCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
          </span>
        </button>

        {!setupCollapsed && (
          <div id="settings-setup-details" style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '0.9rem' }}>
            {items.map(item => (
              <button
                key={item.title}
                type="button"
                onClick={() => {
                  if (item.path.startsWith('#')) {
                    document.getElementById(item.path.substring(1))?.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    navigate(item.path);
                  }
                }}
                style={{ textAlign: 'left', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gridTemplateRows: 'auto auto', gap: '0.7rem 0.85rem', alignItems: 'start', minHeight: '116px', padding: '0.9rem', border: '2px solid #000', borderRadius: '10px', backgroundColor: item.done ? '#dcfce7' : '#fff7ed', boxShadow: '2px 2px 0 #000', cursor: 'pointer' }}
              >
                <span style={{ width: '38px', height: '38px', borderRadius: '8px', border: '2px solid #000', backgroundColor: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.done ? <CheckCircle2 size={20} fill="#22c55e" color="#000" strokeWidth={2.5} /> : item.icon}
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>{item.title}</strong>
                  <span style={{ display: 'block', color: '#475569', fontWeight: 700, fontSize: '0.76rem', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                    {item.detail}
                  </span>
                </span>
                <span style={{ gridColumn: '2', justifySelf: 'start', alignSelf: 'end', display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.25rem 0.55rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fff', boxShadow: '1px 1px 0 #000', fontSize: '0.72rem', fontWeight: 900 }}>
                  {item.action}
                  <ChevronRight size={14} strokeWidth={3} />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  };
  
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<{ tipo: string | null, principal: string | null, secundaria: string | null }>({ tipo: null, principal: null, secundaria: null });
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleSearch, setRuleSearch] = useState('');
  const [rulePage, setRulePage] = useState(1);
  const [autoOpenTrigger, setAutoOpenTrigger] = useState<number>(0);
  const [newCatTipo, setNewCatTipo] = useState('Egreso');
  const [newCatPrincipal, setNewCatPrincipal] = useState('');
  const [newCatSecundaria, setNewCatSecundaria] = useState('');
  const [ruleFormErrors, setRuleFormErrors] = useState({ keyword: '', category: '' });
  const [categoryFormErrors, setCategoryFormErrors] = useState({ principal: '', secundaria: '' });
  const ruleKeywordRef = useRef<HTMLInputElement>(null);
  const ruleCategoryRef = useRef<HTMLDivElement>(null);
  const categoryPrincipalRef = useRef<HTMLInputElement>(null);
  const categorySecondaryRef = useRef<HTMLInputElement>(null);

  const filteredRules = useMemo(() => {
    const query = ruleSearch.trim().toLocaleLowerCase('es-CL');
    if (!query) return classificationRules;

    return classificationRules.filter(rule => [
      rule.keyword,
      rule.tipo_movimiento,
      rule.categoria_principal,
      rule.categoria_secundaria
    ].some(value => value?.toLocaleLowerCase('es-CL').includes(query)));
  }, [classificationRules, ruleSearch]);
  const rulePageCount = Math.max(1, Math.ceil(filteredRules.length / RULES_PER_PAGE));
  const safeRulePage = Math.min(rulePage, rulePageCount);
  const rulePageStartIndex = (safeRulePage - 1) * RULES_PER_PAGE;
  const visibleRules = filteredRules.slice(rulePageStartIndex, rulePageStartIndex + RULES_PER_PAGE);
  const ruleResultStart = filteredRules.length === 0 ? 0 : rulePageStartIndex + 1;
  const ruleResultEnd = Math.min(rulePageStartIndex + RULES_PER_PAGE, filteredRules.length);

  useEffect(() => {
    setRulePage(current => Math.min(current, rulePageCount));
  }, [rulePageCount]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const { data: settings, error } = await supabase
          .from('user_settings')
          .select('rut')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setMyRut(settings?.rut || '');
      } catch (error) {
        console.error('Error al cargar configuración:', error);
      }
    };

    void fetchSettings();
    return () => {
      cancelled = true;
    };
  }, [user]);




  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = newRuleKeyword.trim();
    const duplicateRule = classificationRules.some(rule =>
      rule.id !== editingRuleId && rule.keyword.trim().toLocaleLowerCase('es-CL') === keyword.toLocaleLowerCase('es-CL')
    );
    const errors = {
      keyword: !keyword ? 'Escribe la palabra o frase que debe reconocer.' : duplicateRule ? 'Ya existe una regla con esta palabra o frase.' : '',
      category: !newRuleCategory.tipo || !newRuleCategory.principal || !newRuleCategory.secundaria
        ? 'Elige el tipo, la categoría principal y la subcategoría.'
        : ''
    };
    setRuleFormErrors(errors);

    if (errors.keyword || errors.category) {
      if (errors.keyword) {
        ruleKeywordRef.current?.focus();
      } else {
        setAutoOpenTrigger(Date.now());
        window.requestAnimationFrame(() => ruleCategoryRef.current?.querySelector<HTMLElement>('button')?.focus());
      }
      return;
    }

    try {
      if (editingRuleId) {
        const updatedRules = classificationRules.map(r =>
          r.id === editingRuleId ? {
            ...r,
            keyword,
            tipo_movimiento: newRuleCategory.tipo as string,
            categoria_principal: newRuleCategory.principal!,
            categoria_secundaria: newRuleCategory.secundaria!
          } : r
        );
        await saveClassificationRules(updatedRules);
        setEditingRuleId(null);
        toast.success('Regla actualizada');
      } else {
        const newRule: ClassificationRule = {
          id: crypto.randomUUID(),
          keyword,
          tipo_movimiento: newRuleCategory.tipo as string,
          categoria_principal: newRuleCategory.principal!,
          categoria_secundaria: newRuleCategory.secundaria!
        };
        await saveClassificationRules([...classificationRules, newRule]);
        toast.success('Regla agregada');
      }

      setNewRuleKeyword('');
      setNewRuleCategory({ tipo: null, principal: null, secundaria: null });
      setRuleFormErrors({ keyword: '', category: '' });
    } catch (saveError) {
      console.error('Error saving classification rule:', saveError);
      toast.error('No pudimos guardar la regla. Revisa tu conexión e inténtalo nuevamente.');
    }
  };

  const handleSaveRut = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedRut = extractAndNormalizeRUT(myRut);
    if (!normalizedRut) {
      toast.error('Ingresa un RUT válido, incluyendo el dígito verificador.');
      return;
    }

    setRutSaving(true);
    const saved = await saveUserRut(normalizedRut);
    setRutSaving(false);

    if (!saved) {
      toast.error('No pudimos guardar el RUT. Inténtalo nuevamente.');
      return;
    }

    setMyRut(normalizedRut);
    toast.success('RUT actualizado');
  };

  const handleDeleteRule = (rule: ClassificationRule) => {
    setDestructiveAction({
      title: `¿Eliminar la regla “${rule.keyword}”?`,
      description: 'Las transacciones ya clasificadas conservarán su categoría, pero esta regla dejará de aplicarse en futuras importaciones y reescaneos.',
      confirmLabel: 'Eliminar regla',
      onConfirm: async () => {
        const updatedRules = classificationRules.filter(item => item.id !== rule.id);
        await saveClassificationRules(updatedRules);
        toast.success('Regla eliminada');
      }
    });
  };





  const handleAddCustomCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const principalStr = newCatPrincipal.trim();
    const secStr = newCatSecundaria.trim();
    const existingCategory = customCategories.find(category =>
      category.tipo === newCatTipo && category.principal.toLocaleLowerCase('es-CL') === principalStr.toLocaleLowerCase('es-CL')
    );
    const duplicateSecondary = existingCategory?.secundarias.some(secondary =>
      secondary.toLocaleLowerCase('es-CL') === secStr.toLocaleLowerCase('es-CL')
    );
    const errors = {
      principal: principalStr ? '' : 'Escribe un nombre para la categoría principal.',
      secundaria: !secStr ? 'Escribe un nombre para la subcategoría.' : duplicateSecondary ? 'Esta subcategoría ya existe dentro de la categoría principal.' : ''
    };
    setCategoryFormErrors(errors);

    if (errors.principal || errors.secundaria) {
      (errors.principal ? categoryPrincipalRef : categorySecondaryRef).current?.focus();
      return;
    }
    
    const catsCopy = customCategories.map(category => ({
      ...category,
      secundarias: [...category.secundarias]
    }));
    const existingIdx = catsCopy.findIndex(c =>
      c.tipo === newCatTipo && c.principal.toLocaleLowerCase('es-CL') === principalStr.toLocaleLowerCase('es-CL')
    );
    
    if (existingIdx >= 0) {
      catsCopy[existingIdx].secundarias.push(secStr);
    } else {
      catsCopy.push({
        tipo: newCatTipo,
        principal: principalStr,
        secundarias: [secStr]
      });
    }

    try {
      await saveCustomCategories(catsCopy);
      setNewCatPrincipal('');
      setNewCatSecundaria('');
      setCategoryFormErrors({ principal: '', secundaria: '' });
      toast.success('Categoría agregada');
    } catch (saveError) {
      console.error('Error saving custom category:', saveError);
      toast.error('No pudimos guardar la categoría. Revisa tu conexión e inténtalo nuevamente.');
    }
  };

  const handleDeleteCustomSecundaria = (tipo: string, principal: string, secIndex: number) => {
    const secondary = customCategories.find(category => category.tipo === tipo && category.principal === principal)?.secundarias[secIndex];
    if (!secondary) return;

    setDestructiveAction({
      title: `¿Eliminar “${secondary}”?`,
      description: `Se quitará de tus categorías personalizadas bajo ${principal}. Las transacciones existentes conservarán su clasificación actual.`,
      confirmLabel: 'Eliminar categoría',
      onConfirm: async () => {
        const catsCopy = customCategories.map(category => ({
          ...category,
          secundarias: [...category.secundarias]
        }));
        const existingIdx = catsCopy.findIndex(category => category.tipo === tipo && category.principal === principal);
        if (existingIdx < 0) return;

        catsCopy[existingIdx].secundarias.splice(secIndex, 1);
        if (catsCopy[existingIdx].secundarias.length === 0) catsCopy.splice(existingIdx, 1);
        await saveCustomCategories(catsCopy);
        toast.success('Categoría eliminada');
      }
    });
  };


  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <span className="settings-kicker">Centro de control</span>
          <h1>Configuración</h1>
          <p>Define cómo MisFinanzas reconoce bancos, personas, reglas y categorías para clasificar mejor tus movimientos.</p>
        </div>
      </div>

      {renderSetupMiniDashboard()}

      <div className="settings-bento">
        {/* Bank Management */}
        <CollapsibleSection id="bancos" icon={Landmark} title="Mis Bancos" subtitle="Primero elige con qué banco vas a trabajar" description="Administra los bancos que tienes conectados y define cuál es el banco principal para tus reportes globales." defaultCollapsed={true}>
          
          <div className="settings-list compact" style={{ marginBottom: '1.5rem' }}>
            {connectedBanks.map(bankId => {
              const bank = AVAILABLE_BANKS.find(b => b.id === bankId);
              if (!bank) return null;
              const isMain = bank.id === mainBank;
              return (
                <div key={bank.id} className="settings-list-row bank-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{bank.emoji}</span>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{bank.label}</span>
                    {isMain && (
                      <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', backgroundColor: '#fef08a', color: '#854d0e', borderRadius: '999px', fontWeight: 900, border: '2px solid #000' }}>
                        BANCO PRINCIPAL
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {!isMain && (
                      <button 
                        type="button"
                        className="btn btn-outline" 
                        onClick={() => setMainBankAndSave(bank.id)}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                      >
                        Establecer Principal
                      </button>
                    )}
                    {connectedBanks.length > 1 && (
                      <button 
                        type="button"
                        className="btn" 
                        onClick={() => setDestructiveAction({
                          title: `¿Desconectar ${bank.label}?`,
                          description: `${bank.label} dejará de aparecer en tus selectores y reportes${isMain ? ', y otro banco pasará a ser el principal' : ''}. Sus transacciones no se borrarán y podrás volver a conectarlo después.`,
                          confirmLabel: 'Desconectar banco',
                          onConfirm: async () => {
                            await removeBank(bank.id);
                            toast.success(`${bank.label} desconectado`);
                          }
                        })}
                        style={{ padding: '0.5rem', backgroundColor: '#fee2e2', color: 'var(--danger-text)', border: '2px solid var(--danger)' }}
                        title="Desconectar banco"
                        aria-label={`Desconectar ${bank.label}`}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 800 }}>Agregar Nuevo Banco</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {AVAILABLE_BANKS.filter(b => !connectedBanks.includes(b.id)).map(bank => (
              <button
                type="button"
                key={bank.id}
                onClick={() => addBank(bank.id)}
                className="btn btn-outline"
                style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1', minWidth: '150px' }}
              >
                <Plus size={16} />
                {bank.emoji} {bank.label}
              </button>
            ))}
            {AVAILABLE_BANKS.filter(b => !connectedBanks.includes(b.id)).length === 0 && (
              <p style={{ color: 'var(--text-secondary)' }}>Ya tienes todos los bancos disponibles conectados.</p>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          id="deteccion"
          icon={SettingsIcon}
          title="Datos personales y detección"
          subtitle="RUT utilizado para reconocer transferencias entre cuentas propias"
          description="Tu RUT se guarda de forma segura en tu configuración de MisFinanzas. Solo se usa para identificar movimientos entre tus propias cuentas y evitar contarlos como ingresos o egresos reales."
          defaultCollapsed={true}
        >
          <form className="settings-grid-form" onSubmit={handleSaveRut}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="settings-rut" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800, fontSize: '0.85rem' }}>
                RUT propio
              </label>
              <input
                id="settings-rut"
                className="input"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="Ej: 16.424.491-1"
                value={myRut}
                onChange={(event) => setMyRut(event.target.value)}
                aria-describedby="settings-rut-help"
                required
                style={{ width: '100%' }}
              />
              <p id="settings-rut-help" className="settings-muted" style={{ margin: '0.55rem 0 0', fontSize: '0.8rem' }}>
                Puedes corregirlo cuando cambie tu información. La actualización se aplicará a futuras detecciones y reescaneos.
              </p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={rutSaving} aria-busy={rutSaving}>
              <Save size={18} aria-hidden="true" />
              {rutSaving ? 'Guardando...' : 'Guardar RUT'}
            </button>
          </form>
        </CollapsibleSection>

        {/* Ajuste de Inicio */}
        <InitialAdjustmentManager />
        


        {/* Categorías Personalizadas */}
        <CollapsibleSection id="categorias" icon={Tags} title="Mis Categorías" subtitle="Categorías personalizadas compartidas entre todos tus bancos" description="Agrega nuevas categorías para organizar tus movimientos. Estas se sumarán a la lista base que ya trae la aplicación." defaultCollapsed={true}>

          <form className="settings-grid-form" onSubmit={handleAddCustomCategory}>
            <div>
              <label htmlFor="new-category-type" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.85rem' }}>Tipo de Movimiento</label>
              <select id="new-category-type" className="input" value={newCatTipo} onChange={(e) => setNewCatTipo(e.target.value)} style={{ width: '100%', padding: '0.5rem' }}>
                <option value="Egreso">Egreso</option>
                <option value="Ingreso">Ingreso</option>
                <option value="Ahorro/Inversión">Ahorro / Inversión</option>
                <option value="Movimiento Interno">Movimiento Interno</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-category-principal" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.85rem' }}>Categoría Principal</label>
              <input ref={categoryPrincipalRef} id="new-category-principal" type="text" className="input" placeholder="Ej: Mis Mascotas" value={newCatPrincipal} onChange={(e) => { setNewCatPrincipal(e.target.value); setCategoryFormErrors(current => ({ ...current, principal: '' })); }} aria-invalid={Boolean(categoryFormErrors.principal)} aria-describedby={categoryFormErrors.principal ? 'new-category-principal-error' : undefined} style={{ width: '100%' }} />
              {categoryFormErrors.principal && <p id="new-category-principal-error" className="field-error" role="alert">{categoryFormErrors.principal}</p>}
            </div>
            <div>
              <label htmlFor="new-category-secondary" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, fontSize: '0.85rem' }}>Subcategoría (Detalle)</label>
              <input ref={categorySecondaryRef} id="new-category-secondary" type="text" className="input" placeholder="Ej: Juguetes" value={newCatSecundaria} onChange={(e) => { setNewCatSecundaria(e.target.value); setCategoryFormErrors(current => ({ ...current, secundaria: '' })); }} aria-invalid={Boolean(categoryFormErrors.secundaria)} aria-describedby={categoryFormErrors.secundaria ? 'new-category-secondary-error' : undefined} style={{ width: '100%' }} />
              {categoryFormErrors.secundaria && <p id="new-category-secondary-error" className="field-error" role="alert">{categoryFormErrors.secundaria}</p>}
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem' }}>
              <Plus size={20} />
              Añadir
            </button>
          </form>

          {customCategories.length > 0 ? (
            <div className="settings-list">
              {customCategories.map((cat, i) => (
                <div key={i} className="settings-list-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{ backgroundColor: '#000', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '0.25rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                      {cat.tipo}
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{cat.principal}</h3>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {cat.secundarias.map((sec, secIdx) => (
                      <div key={secIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#fff', border: '1.5px solid #cbd5e1', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600 }}>
                        {sec}
                        <button 
                          type="button"
                          onClick={() => handleDeleteCustomSecundaria(cat.tipo, cat.principal, secIdx)} 
                          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--danger-text)', padding: 0 }}
                          title="Eliminar subcategoría"
                          aria-label={`Eliminar subcategoría ${sec}`}
                        >
                          <X size={14} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="settings-empty">
              <p style={{ margin: 0, color: '#64748b', fontWeight: 600 }}>No has creado categorías personalizadas aún.</p>
            </div>
          )}
        </CollapsibleSection>





        {/* Classification Rules */}
        <CollapsibleSection id="reglas" icon={Wand2} title="Reglas de Auto-Clasificación" subtitle="Mapeo persistente por palabra clave" description="Define qué texto debe estar en la glosa (descripción) de una transacción para asignarle automáticamente una categoría. Las reglas se aplican al importar." className="card settings-card settings-card-wide settings-card-tall" defaultCollapsed={true}>
          
          <div className="settings-callout" style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 800 }}>¿Tienes transacciones antiguas sin clasificar?</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 500 }}>
              Puedes aplicar la auto-clasificación a todo tu historial pendiente.
            </p>
            <button type="button" className="btn btn-outline" onClick={async () => {
              if (!user) return;
              toast.loading('Escaneando transacciones...', { id: 'rescan' });
              try {
                // 1. Obtener pendientes
                const { data: txs, error: fetchErr } = await supabase.from('transactions').select('id, raw_data, description').eq('user_id', user.id).is('tipo_movimiento', null);
                if (fetchErr) throw fetchErr;
                if (!txs || txs.length === 0) {
                  toast.success('No hay transacciones pendientes.', { id: 'rescan' });
                  return;
                }

                let updated = 0;
                for (const tx of txs) {
                  const rawDescKey = tx.raw_data ? Object.keys(tx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '' : '';
                  const rawDesc = tx.raw_data && rawDescKey ? tx.raw_data[rawDescKey] : '';
                  const desc = (rawDesc || tx.description || '').toLowerCase();
                  let tipo = null, principal = null, secundaria = null;
                  
                  const rutEx = extractAndNormalizeRUT(desc);
                  const my = myRut ? extractAndNormalizeRUT(myRut) : null;
                  
                  if (rutEx && my && rutEx === my) {
                    tipo = 'Movimiento Interno';
                    principal = desc.includes('fondo') ? 'Traspaso fondo' : 'Transferencia personal';
                    secundaria = principal;
                  }
                  
                  if (!tipo) {
                    const match = applyRules(desc, classificationRules);
                    if (match) {
                      tipo = match.tipo_movimiento;
                      principal = match.categoria_principal;
                      secundaria = match.categoria_secundaria;
                    }
                  }

                  if (tipo) {
                    await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('id', tx.id);
                    updated++;
                  }
                }
                toast.success(`Se auto-clasificaron ${updated} transacciones.`, { id: 'rescan' });
              } catch (e: any) {
                toast.error('Error al escanear: ' + e.message, { id: 'rescan' });
              }
            }}>
              Auto-clasificar pendientes
            </button>
          </div>

          <form className="settings-rule-form" onSubmit={handleAddRule}>
            <div className="settings-field-label">
            <label htmlFor="new-rule-keyword" className="settings-field-title">Palabra o frase</label>
            <input
              ref={ruleKeywordRef}
              id="new-rule-keyword"
              type="text" 
              className="input" 
              placeholder="Palabra clave (ej. SODIMAC)" 
              value={newRuleKeyword}
              onChange={(e) => { setNewRuleKeyword(e.target.value); setRuleFormErrors(current => ({ ...current, keyword: '' })); }}
              aria-required="true"
              aria-invalid={Boolean(ruleFormErrors.keyword)}
              aria-describedby={ruleFormErrors.keyword ? 'new-rule-keyword-error' : undefined}
            />
            {ruleFormErrors.keyword && <p id="new-rule-keyword-error" className="field-error" role="alert">{ruleFormErrors.keyword}</p>}
            </div>
            <div ref={ruleCategoryRef} className="settings-rule-category" role="group" aria-labelledby="new-rule-category-label" aria-describedby={ruleFormErrors.category ? 'new-rule-category-error' : undefined}>
            <span id="new-rule-category-label" className="settings-field-title">Clasificación</span>
            <CascadingCategorySelector 
              initialPrincipal={editingRuleId ? newRuleCategory.principal : null} 
              initialSecundaria={editingRuleId ? newRuleCategory.secundaria : null} 
              onSave={(t: any, p: any, s: any) => {
                setNewRuleCategory({ tipo: t, principal: p, secundaria: s });
                setRuleFormErrors(current => ({ ...current, category: '' }));
                if (editingRuleId && newRuleKeyword.trim()) {
                  const currentRule = classificationRules.find(r => r.id === editingRuleId);
                  const updatedRules = classificationRules.map(r => 
                    r.id === editingRuleId ? {
                      ...r,
                      keyword: newRuleKeyword.trim(),
                      tipo_movimiento: t,
                      categoria_principal: p,
                      categoria_secundaria: s
                    } : r
                  );
                  
                  // Instantly update local state via setClassificationRules
                  setClassificationRules(updatedRules);
                  
                  dispatchAction({
                    id: `rule-update-${editingRuleId}`,
                    message: `Regla actualizada`,
                    execute: async () => {
                      // Execute DB update in background
                      await saveClassificationRules(updatedRules);
                    },
                    onUndo: () => {
                      if (currentRule) {
                        const revertedRules = classificationRules.map(r => r.id === editingRuleId ? currentRule : r);
                        setClassificationRules(revertedRules);
                      }
                    }
                  });
                  
                  setEditingRuleId(null);
                  setNewRuleKeyword('');
                  setNewRuleCategory({ tipo: null, principal: null, secundaria: null });
                }
              }} 
              autoOpenTrigger={autoOpenTrigger}
            />
            {ruleFormErrors.category && <p id="new-rule-category-error" className="field-error" role="alert">{ruleFormErrors.category}</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem', flex: 1 }}>
                {editingRuleId ? <Save size={20} /> : <Plus size={20} />}
                {editingRuleId ? 'Actualizar Regla' : 'Crear Regla'}
              </button>
              {editingRuleId && (
                <button type="button" className="btn btn-outline" style={{ padding: '0.5rem 1rem', flex: 1 }} onClick={() => { setEditingRuleId(null); setNewRuleKeyword(''); setNewRuleCategory({ tipo: null, principal: null, secundaria: null }); setRuleFormErrors({ keyword: '', category: '' }); }}>
                  <X size={20} />
                  Cancelar
                </button>
              )}
            </div>
          </form>

          {classificationRules.length > 0 && (
            <div className="settings-rule-toolbar">
              <div className="settings-rule-search">
                <Search size={18} aria-hidden="true" />
                <input
                  id="rule-search"
                  type="search"
                  value={ruleSearch}
                  onChange={(event) => {
                    setRuleSearch(event.target.value);
                    setRulePage(1);
                  }}
                  placeholder="Buscar por palabra o categoría"
                  aria-label="Buscar reglas de auto-clasificación"
                />
                {ruleSearch && (
                  <button
                    type="button"
                    className="btn-icon settings-rule-search-clear"
                    onClick={() => {
                      setRuleSearch('');
                      setRulePage(1);
                    }}
                    aria-label="Limpiar búsqueda de reglas"
                    title="Limpiar búsqueda"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <p className="settings-rule-count" role="status" aria-live="polite">
                Mostrando {ruleResultStart}-{ruleResultEnd} de {filteredRules.length} {filteredRules.length === 1 ? 'regla' : 'reglas'}
              </p>
            </div>
          )}

          <div className="settings-rule-list">
            {classificationRules.length === 0 ? (
              <p className="settings-rule-empty">No hay reglas de clasificación configuradas.</p>
            ) : filteredRules.length === 0 ? (
              <div className="settings-rule-empty">
                <strong>No encontramos reglas con “{ruleSearch.trim()}”.</strong>
                <span>Prueba con otra palabra o limpia la búsqueda.</span>
              </div>
            ) : (
              visibleRules.map(r => (
                <article key={r.id} className="settings-rule-item">
                  <div className="settings-rule-summary">
                    <strong>Si contiene: “{r.keyword}”</strong>
                    <span>
                      {r.tipo_movimiento} &gt; {r.categoria_principal} &gt; {r.categoria_secundaria}
                    </span>
                  </div>
                  <div className="settings-rule-actions">
                    <button 
                      type="button"
                      className="btn btn-outline" 
                      aria-label={`Editar regla ${r.keyword}`}
                      onClick={() => {
                        setEditingRuleId(r.id);
                        setNewRuleKeyword(r.keyword);
                        setNewRuleCategory({ tipo: r.tipo_movimiento, principal: r.categoria_principal, secundaria: r.categoria_secundaria });
                        setRuleFormErrors({ keyword: '', category: '' });
                        setAutoOpenTrigger(Date.now());
                        window.scrollTo({ top: document.getElementById('reglas')?.offsetTop || 0, behavior: 'smooth' });
                      }}
                    >
                      <Edit2 size={18} />
                      Editar
                    </button>
                    <button 
                      type="button"
                      className="btn settings-rule-delete"
                      title="Eliminar regla"
                      aria-label={`Eliminar regla ${r.keyword}`}
                      onClick={() => handleDeleteRule(r)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          {rulePageCount > 1 && (
            <nav className="settings-rule-pagination" aria-label="Páginas de reglas">
              <button
                type="button"
                className="btn btn-outline"
                disabled={safeRulePage === 1}
                onClick={() => setRulePage(current => Math.max(1, current - 1))}
              >
                Anterior
              </button>
              <span aria-live="polite">Página {safeRulePage} de {rulePageCount}</span>
              <button
                type="button"
                className="btn btn-outline"
                disabled={safeRulePage === rulePageCount}
                onClick={() => setRulePage(current => Math.min(rulePageCount, current + 1))}
              >
                Siguiente
              </button>
            </nav>
          )}
        </CollapsibleSection>

        {/* Danger Zone */}
        <div className="card settings-card settings-card-wide settings-danger" style={{ position: 'relative', zIndex: 10, borderColor: 'var(--danger)' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--danger-text)' }}>Zona Peligrosa</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Borrar tu cuenta eliminará de forma irreversible todas tus transacciones, configuraciones y reglas guardadas. Esta acción no se puede deshacer.
          </p>
          <button 
            type="button"
            className="btn" 
            style={{ backgroundColor: '#fecaca', color: 'var(--danger-text)', borderColor: 'var(--danger)' }}
            onClick={() => setDestructiveAction({
              title: '¿Borrar tu cuenta definitivamente?',
              description: 'Se eliminarán de forma irreversible tus transacciones, bancos, cuentas, categorías y reglas. Esta acción no se puede deshacer.',
              confirmLabel: 'Borrar cuenta definitivamente',
              confirmationText: 'ELIMINAR',
              onConfirm: executeDeleteAccount
            })}
          >
            <Trash2 size={20} />
            Borrar Cuenta Definitivamente
          </button>
        </div>

      </div>
      <ConfirmDialog
        open={Boolean(destructiveAction)}
        title={destructiveAction?.title || ''}
        description={destructiveAction?.description || ''}
        confirmLabel={destructiveAction?.confirmLabel || 'Confirmar'}
        confirmationText={destructiveAction?.confirmationText}
        onConfirm={destructiveAction?.onConfirm || (async () => {})}
        onClose={() => setDestructiveAction(null)}
      />
    </div>
  );
}
