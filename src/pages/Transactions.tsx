import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/authContextValue';
import { AVAILABLE_BANKS, useBanks } from '../contexts/bankContextValue';
import { Search, Edit2, Plus, X, ChevronRight, CheckCircle2, UploadCloud, Scissors, Undo2, Trash2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useActionQueue } from '../hooks/useActionQueue';
import SmartAssistant from '../components/SmartAssistant';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { useSettings } from '../contexts/settingsContextValue';
import SplitTransactionModal from '../components/SplitTransactionModal';
import { Dialog } from '../components/Dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { buildTransactionCandidateFingerprint } from '../utils/transactionIdentity';
import { buildDuplicateReviewGroups, getBatchDuplicateDeleteIds } from '../utils/transactionDuplicates';

const normalizeBankName = (value: any) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

const getCanonicalBankId = (bankName: any) => {
  const normalized = normalizeBankName(bankName);
  return AVAILABLE_BANKS.find(bank => normalizeBankName(bank.id) === normalized || normalizeBankName(bank.label) === normalized)?.id || String(bankName || 'Sin banco');
};

const getBankMeta = (bankName: any) => {
  const bankId = getCanonicalBankId(bankName);
  const bankInfo = AVAILABLE_BANKS.find(bank => bank.id === bankId);
  return {
    id: bankId,
    label: bankInfo?.label || bankId,
    color: bankInfo?.color || '#94a3b8'
  };
};


type CategoryPickerMode = 'suggestions' | 'tree' | 'create';

const normalizeCategoryText = (text: any) => String(text || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const getCategoryOptionKey = (option: any) => `${option.tipo}-${option.principal}-${option.secundaria}`;

const CATEGORY_PREDICTION_HINTS = [
  { keywords: ['pac agua', 'aguas andinas', 'essbio', 'nuevosur'], principal: 'Cuentas Básicas', secundaria: 'Agua', reason: 'Patrón reconocido como cuenta de agua' },
  { keywords: ['enel', 'chilquinta', 'cge electricidad'], principal: 'Cuentas Básicas', secundaria: 'Luz', reason: 'Proveedor reconocido de electricidad' },
  { keywords: ['metrogas', 'gasvalpo'], principal: 'Cuentas Básicas', secundaria: 'Gas', reason: 'Proveedor reconocido de gas' },
  { keywords: ['lider', 'jumbo', 'unimarc', 'tottus', 'acuenta', 'santa isabel', 'alvi', 'mayorista 10'], principal: 'Alimentación', secundaria: 'Supermercado', reason: 'Comercio reconocido como supermercado' },
  { keywords: ['abarrot', 'minimarket', 'almacen '], principal: 'Alimentación', secundaria: 'Abarrotes', reason: 'Comercio asociado a abarrotes' },
  { keywords: ['copec', 'shell', 'petrobras', 'aramco'], principal: 'Transporte', secundaria: 'Bencina', reason: 'Comercio reconocido como estación de servicio' },
  { keywords: ['autopista', 'costanera norte', 'vespucio', 'tag '], principal: 'Transporte', secundaria: 'Autopista', reason: 'Cobro asociado a autopista' },
  { keywords: ['openai', 'chatgpt', 'chat gpt'], principal: 'Suscripciones', secundaria: 'Chat GPT', reason: 'Servicio reconocido como suscripción' },
  { keywords: ['hbo max', 'hbomax'], principal: 'Suscripciones', secundaria: 'HBO MAX', reason: 'Servicio reconocido como suscripción' },
  { keywords: ['netflix'], principal: 'Suscripciones', secundaria: 'Netflix', reason: 'Servicio reconocido como suscripción' },
  { keywords: ['spotify'], principal: 'Suscripciones', secundaria: 'Spotify', reason: 'Servicio reconocido como suscripción' }
];

export function CascadingCategorySelector({ initialTipo, initialPrincipal, initialSecundaria, contextDescription, onSave, autoOpenTrigger }: any) {
  const { taxonomy, allOptions: ALL_OPTIONS } = useTaxonomy();
  const { customCategories, saveCustomCategories, classificationRules } = useSettings();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [inputValue, setInputValue] = useState(() => {
    if (initialSecundaria && initialPrincipal) {
      return initialSecundaria === initialPrincipal ? initialPrincipal : `${initialSecundaria} (${initialPrincipal})`;
    }
    return '';
  });
  const [isOpen, setIsOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<CategoryPickerMode>('suggestions');
  const [searchValue, setSearchValue] = useState('');
  const [selectedTipo, setSelectedTipo] = useState(initialTipo || 'Egreso');
  const [expandedPrincipal, setExpandedPrincipal] = useState<string | null>(initialPrincipal || null);
  const [newTipo, setNewTipo] = useState('Egreso');
  const [newPrincipal, setNewPrincipal] = useState('');
  const [newSecundaria, setNewSecundaria] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialSecundaria && initialPrincipal) {
      setInputValue(initialSecundaria === initialPrincipal ? initialPrincipal : `${initialSecundaria} (${initialPrincipal})`);
      if (initialTipo) setSelectedTipo(initialTipo);
    } else {
      setInputValue('');
    }
  }, [initialPrincipal, initialSecundaria, initialTipo]);

  useEffect(() => {
    if (autoOpenTrigger) {
      setIsOpen(true);
      setPickerMode('suggestions');
      setSearchValue('');
      const tipo = initialTipo || ALL_OPTIONS.find(o => o.principal === initialPrincipal && o.secundaria === initialSecundaria)?.tipo || 'Egreso';
      setSelectedTipo(tipo);
      setNewTipo(tipo);
      setExpandedPrincipal(initialPrincipal || null);
    }
  }, [ALL_OPTIONS, autoOpenTrigger, initialPrincipal, initialSecundaria, initialTipo]);

  const selectOption = async (option: any) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await Promise.resolve(onSave(option.tipo, option.principal, option.secundaria));
      setInputValue(option.label);
      setSearchValue('');
      setSelectedTipo(option.tipo);
      setExpandedPrincipal(option.principal);
      setIsOpen(false);
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('No pudimos guardar la clasificación. Intenta nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedOption = ALL_OPTIONS.find(o => o.label === inputValue && o.tipo === selectedTipo)
    || ALL_OPTIONS.find(o => o.label === inputValue);
  const isComplete = Boolean(selectedOption);
  
  const suggestionItems = useMemo(() => {
    const query = normalizeCategoryText(searchValue.trim());
    const context = normalizeCategoryText(contextDescription);

    if (query) {
      return ALL_OPTIONS
        .filter(option => normalizeCategoryText(`${option.label} ${option.tipo} ${option.principal} ${option.secundaria}`).includes(query))
        .slice(0, 12)
        .map(option => ({
          option,
          reason: `Coincide con "${searchValue.trim()}"`,
          source: 'search'
        }));
    }

    if (!context) return [];

    const ranked = new Map<string, { option: any; score: number; reason: string; source: string }>();
    const addSuggestion = (option: any, score: number, reason: string, source: string) => {
      const key = getCategoryOptionKey(option);
      const current = ranked.get(key);
      if (!current || current.score < score) ranked.set(key, { option, score, reason, source });
    };

    classificationRules.forEach(rule => {
      const keyword = normalizeCategoryText(rule.keyword);
      if (!keyword || !context.includes(keyword)) return;

      const match = ALL_OPTIONS.find(option =>
        option.tipo === rule.tipo_movimiento &&
        option.principal === rule.categoria_principal &&
        option.secundaria === rule.categoria_secundaria
      );
      if (match) addSuggestion(match, 120, `Regla guardada: "${rule.keyword}"`, 'rule');
    });

    CATEGORY_PREDICTION_HINTS.forEach(hint => {
      if (!hint.keywords.some(keyword => context.includes(normalizeCategoryText(keyword)))) return;
      const match = ALL_OPTIONS.find(option =>
        option.tipo === 'Egreso' &&
        option.principal === hint.principal &&
        option.secundaria === hint.secundaria
      );
      if (match) addSuggestion(match, 105, hint.reason, 'pattern');
    });

    ALL_OPTIONS.forEach(option => {
      const secondary = normalizeCategoryText(option.secundaria);
      const principal = normalizeCategoryText(option.principal);
      const secondaryTokens = secondary.split(/[^a-z0-9]+/).filter(token => token.length >= 3 && !['otros', 'otra', 'para', 'con'].includes(token));
      const principalTokens = principal.split(/[^a-z0-9]+/).filter(token => token.length >= 4 && !['otros', 'otra', 'para', 'basicas'].includes(token));
      const matchingSecondary = secondaryTokens.find(token => context.includes(token));
      const matchingPrincipal = principalTokens.find(token => context.includes(token));

      if (secondary.length >= 3 && context.includes(secondary)) {
        addSuggestion(option, 90, `Coincide con "${option.secundaria}" en la descripción`, 'description');
      } else if (matchingSecondary) {
        addSuggestion(option, 72, `Coincide con "${matchingSecondary}" en la descripción`, 'description');
      } else if (matchingPrincipal) {
        addSuggestion(option, 58, `Coincide con la categoría ${option.principal}`, 'description');
      }
    });

    return Array.from(ranked.values())
      .sort((a, b) => b.score - a.score || a.option.label.localeCompare(b.option.label, 'es'))
      .slice(0, 8);
  }, [ALL_OPTIONS, classificationRules, contextDescription, searchValue]);

  const tipoTabs = useMemo(() => {
    const preferred = ['Egreso', 'Ingreso', 'Movimiento Interno', 'Ahorro/Inversión'];
    const allTipos = Object.keys(taxonomy);
    return [...preferred.filter(t => allTipos.includes(t)), ...allTipos.filter(t => !preferred.includes(t))];
  }, [taxonomy]);

  const currentTree = taxonomy[selectedTipo] || {};

  const getBgColor = (tipo: string | undefined | null) => {
    if (tipo === 'Ingreso') return '#dcfce7'; // pastel green
    if (tipo === 'Egreso') return '#fee2e2'; // pastel red
    if (tipo === 'Movimiento Interno') return '#f1f5f9'; // pastel slate
    if (tipo === 'Ahorro/Inversión') return '#f3e8ff'; // pastel purple
    return '#f3f4f6';
  };

  const getAccountingHint = (tipo: string, principal: string) => {
    if (tipo === 'Ingreso' && principal === 'Transferencias') {
      return 'Se suma a tus entradas disponibles. Si es una transferencia propia, el sistema la separa de tus ingresos reales.';
    }
    if (tipo === 'Egreso' && principal === 'Transferencias Propias') {
      return 'Queda registrada para trazabilidad, pero el sistema no la suma a tus gastos reales.';
    }
    return null;
  };

  const openPicker = () => {
    const current = selectedOption || ALL_OPTIONS.find(o => o.tipo === initialTipo && o.principal === initialPrincipal && o.secundaria === initialSecundaria);
    const tipo = current?.tipo || selectedTipo || 'Egreso';
    setSelectedTipo(tipo);
    setNewTipo(tipo);
    setExpandedPrincipal(current?.principal || initialPrincipal || null);
    setSearchValue('');
    setPickerMode('suggestions');
    setIsOpen(true);
  };

  const clearSelection = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await Promise.resolve(onSave(null, null, null));
      setInputValue('');
      setSearchValue('');
      setIsOpen(false);
    } catch (error) {
      console.error('Error clearing category:', error);
      toast.error('No pudimos limpiar la clasificación.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    const principal = newPrincipal.trim();
    const secundaria = newSecundaria.trim();
    if (!principal || !secundaria) {
      toast.error('Completa categoría principal y subcategoría.');
      return;
    }

    const catsCopy = [...customCategories];
    const existingIdx = catsCopy.findIndex(c => c.tipo === newTipo && c.principal === principal);
    if (existingIdx >= 0) {
      if (catsCopy[existingIdx].secundarias.includes(secundaria)) {
        toast.error('Esa subcategoría ya existe.');
        return;
      }
      catsCopy[existingIdx] = {
        ...catsCopy[existingIdx],
        secundarias: [...catsCopy[existingIdx].secundarias, secundaria]
      };
    } else {
      catsCopy.push({ tipo: newTipo, principal, secundarias: [secundaria] });
    }

    setIsSaving(true);
    try {
      await saveCustomCategories(catsCopy);
      await Promise.resolve(onSave(newTipo, principal, secundaria));
      const label = secundaria === principal ? principal : `${secundaria} (${principal})`;
      setInputValue(label);
      setSelectedTipo(newTipo);
      setExpandedPrincipal(principal);
      setNewPrincipal('');
      setNewSecundaria('');
      setIsOpen(false);
      toast.success('Categoría creada y aplicada');
    } catch (error) {
      console.error('Error creating category:', error);
      toast.error('No pudimos crear la categoría.');
    } finally {
      setIsSaving(false);
    }
  };

  const pickerModes: { id: CategoryPickerMode; label: string; icon: ReactNode }[] = [
    { id: 'suggestions', label: 'Sugerencias', icon: <Search size={17} /> },
    { id: 'tree', label: 'Explorar', icon: <ChevronRight size={17} /> },
    { id: 'create', label: 'Crear nueva', icon: <Plus size={17} /> }
  ];

  return (
    <div className="category-selector">
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        disabled={isSaving}
        className="input category-selector-trigger"
        aria-label={inputValue ? `Cambiar clasificación: ${inputValue}` : 'Clasificar transacción'}
        style={{ 
          backgroundColor: isComplete && selectedOption ? getBgColor(selectedOption.tipo) : 'white',
          borderColor: 'black'
        }}
      >
        {isSaving ? 'Guardando...' : (inputValue || 'Clasificar...')}
      </button>

      {isOpen && (
        <Dialog
          onClose={() => setIsOpen(false)}
          returnFocusRef={triggerRef}
          labelledBy="category-picker-title"
          describedBy="category-picker-description"
          backdropStyle={{ zIndex: 999999 }}
          panelStyle={{ maxWidth: '820px', maxHeight: '88vh', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}
        >
            <div className="dialog-header">
              <div>
                <h3 id="category-picker-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>Elegir clasificación</h3>
                <p id="category-picker-description" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>Elige una sugerencia, explora las categorías o crea una nueva.</p>
              </div>
              <button type="button" className="dialog-close" onClick={() => setIsOpen(false)} aria-label="Cerrar selector de clasificación" title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="category-picker-body">
              <div className="category-picker-context">
                <div>
                  <span>Transacción</span>
                  <strong>{contextDescription || 'Sin descripción'}</strong>
                </div>
                <div>
                  <span>Clasificación actual</span>
                  <strong>{inputValue || 'Sin clasificación'}</strong>
                </div>
              </div>

              <div className="category-picker-modes" role="group" aria-label="Forma de elegir categoría">
                {pickerModes.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={pickerMode === mode.id}
                    className={pickerMode === mode.id ? 'active' : ''}
                    onClick={() => setPickerMode(mode.id)}
                  >
                    {mode.icon}
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="category-picker-panel">
                {pickerMode === 'suggestions' && (
                  <section aria-label="Sugerencias de clasificación">
                    <div className="category-picker-panel-heading">
                      <div>
                        <h4>{searchValue ? 'Resultados de búsqueda' : 'Sugerencias para esta transacción'}</h4>
                        <p>{searchValue ? 'Busca por categoría principal o detalle.' : 'Usamos tus reglas guardadas y las palabras de la descripción.'}</p>
                      </div>
                    </div>

                    <div className="category-picker-search">
                      <Search size={18} aria-hidden="true" />
                      <input
                        autoFocus
                        data-dialog-initial-focus
                        aria-label="Buscar categoría"
                        className="input"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        placeholder="Ej: sueldo, agua, supermercado..."
                      />
                      {searchValue && (
                        <button type="button" onClick={() => setSearchValue('')} title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                          <X size={16} strokeWidth={3} />
                        </button>
                      )}
                    </div>

                    {suggestionItems.length > 0 ? (
                      <div className="category-suggestion-list">
                        {suggestionItems.map(({ option, reason, source }) => (
                          <button
                            type="button"
                            key={getCategoryOptionKey(option)}
                            onClick={() => selectOption(option)}
                            disabled={isSaving}
                            className="category-suggestion"
                            style={{ backgroundColor: getBgColor(option.tipo) }}
                          >
                            <span className="category-suggestion-copy">
                              <strong>{option.secundaria}</strong>
                              <span>{option.tipo} &gt; {option.principal}</span>
                              <small className={`category-suggestion-reason source-${source}`}>{reason}</small>
                            </span>
                            <span className="category-suggestion-action">Elegir <ChevronRight size={16} /></span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="category-picker-empty">
                        <strong>{searchValue ? 'No hay resultados para esa búsqueda.' : 'No encontré una coincidencia clara todavía.'}</strong>
                        <span>{searchValue ? 'Prueba con una palabra más corta o explora las categorías.' : 'Puedes explorar el árbol completo o crear una categoría propia.'}</span>
                        <button type="button" className="btn btn-outline" onClick={() => setPickerMode('tree')}>Explorar categorías</button>
                      </div>
                    )}
                  </section>
                )}

                {pickerMode === 'tree' && (
                  <section aria-label="Árbol de categorías">
                    <div className="category-picker-panel-heading">
                      <div>
                        <h4>Explorar categorías</h4>
                        <p>Primero elige el tipo de movimiento y luego una categoría.</p>
                      </div>
                    </div>
                    <div className="category-type-tabs" role="group" aria-label="Tipo de movimiento">
                  {tipoTabs.map(tipo => (
                    <button
                      type="button"
                      key={tipo}
                      aria-pressed={selectedTipo === tipo}
                      onClick={() => {
                        setSelectedTipo(tipo);
                        setNewTipo(tipo);
                        setExpandedPrincipal(null);
                      }}
                      className={selectedTipo === tipo ? 'active' : ''}
                      style={{ backgroundColor: selectedTipo === tipo ? '#000' : getBgColor(tipo) }}
                    >
                      {tipo}
                    </button>
                  ))}
                    </div>

                    <div className="category-tree-grid">
                  {Object.entries(currentTree).map(([principal, secundarias]) => {
                    const isExpanded = expandedPrincipal === principal;
                    return (
                      <div key={principal} className="category-tree-branch">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedPrincipal(isExpanded ? null : principal)}
                          style={{ backgroundColor: getBgColor(selectedTipo), borderBottom: isExpanded ? '2px solid #000' : 'none' }}
                        >
                          <span>{principal}</span>
                          <ChevronRight size={18} strokeWidth={3} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
                        </button>
                        {isExpanded && (
                          <div className="category-tree-options">
                            {getAccountingHint(selectedTipo, principal) && (
                              <p style={{ margin: 0, padding: '0.75rem', backgroundColor: '#f8fafc', borderBottom: '2px solid #000', color: '#475569', fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.4 }}>
                                {getAccountingHint(selectedTipo, principal)}
                              </p>
                            )}
                            {(secundarias as string[]).map(secundaria => {
                              const active = selectedOption?.tipo === selectedTipo && selectedOption?.principal === principal && selectedOption?.secundaria === secundaria;
                              return (
                                <button
                                  type="button"
                                  key={`${principal}-${secundaria}`}
                                  disabled={isSaving}
                                  onClick={() => selectOption({
                                    tipo: selectedTipo,
                                    principal,
                                    secundaria,
                                    label: secundaria === principal ? principal : `${secundaria} (${principal})`
                                  })}
                                  className={active ? 'active' : ''}
                                >
                                  <span>{secundaria}</span>
                                  {active && <CheckCircle2 size={17} color="#16a34a" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                    </div>
                  </section>
                )}

                {pickerMode === 'create' && (
                  <section aria-label="Crear nueva categoría">
                    <div className="category-picker-panel-heading">
                      <div>
                        <h4>Crear y aplicar una categoría</h4>
                        <p>La nueva categoría quedará disponible para próximas transacciones.</p>
                      </div>
                    </div>
                    <form className="category-create-form" onSubmit={(event) => { event.preventDefault(); handleCreateCategory(); }}>
                      <label>
                        <span>Tipo de movimiento</span>
                        <select className="input" value={newTipo} onChange={(e) => setNewTipo(e.target.value)}>
                          {tipoTabs.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Categoría principal</span>
                        <input className="input" value={newPrincipal} onChange={(e) => setNewPrincipal(e.target.value)} placeholder="Ej: Mascotas" />
                      </label>
                      <label>
                        <span>Subcategoría o detalle</span>
                        <input className="input" value={newSecundaria} onChange={(e) => setNewSecundaria(e.target.value)} placeholder="Ej: Veterinario" />
                      </label>
                      <div className="category-create-preview">
                        <span>Se guardará como</span>
                        <strong>{newTipo} &gt; {newPrincipal.trim() || 'Categoría'} &gt; {newSecundaria.trim() || 'Detalle'}</strong>
                      </div>
                      <button className="btn btn-primary" type="submit" disabled={isSaving || !newPrincipal.trim() || !newSecundaria.trim()}>
                        <Plus size={18} />
                        {isSaving ? 'Creando...' : 'Crear y aplicar'}
                      </button>
                    </form>
                  </section>
                )}
              </div>

              {inputValue && (
                <div className="category-picker-footer">
                  <span>¿Esta transacción no debe tener categoría?</span>
                  <button type="button" className="btn btn-outline" onClick={clearSelection} disabled={isSaving}>Limpiar clasificación</button>
                </div>
              )}
            </div>
        </Dialog>
      )}
      {!isComplete && inputValue !== '' && !isOpen && (
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Pendiente...</span>
      )}
    </div>
  );
}

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
};

const formatPeriodLabel = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
    .replace(/^./, value => value.toUpperCase());
};

interface PendingCategoryConfirmation {
  id: string;
  currentDesc: string;
  tipo: string;
  principal: string | null;
  secundaria: string | null;
  previousTransaction: any;
  affectedTransactions: any[];
  othersCount: number;
}

export default function Transactions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  
  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) {
      setSearchTerm(q);
    }
  }, [searchParams]);

  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterBank, setFilterBank] = useState('all');
  
  const [filterPeriod, setFilterPeriod] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'individual' | 'bulk' | 'assistant' | 'duplicates'>('individual');
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [bulkFilterMode, setBulkFilterMode] = useState<string>('unclassified');
  const [splittingTx, setSplittingTx] = useState<any>(null);
  const [pendingCategoryConfirmation, setPendingCategoryConfirmation] = useState<PendingCategoryConfirmation | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<null | {
    ids: string[];
    title: string;
    description: string;
    confirmationText?: string;
  }>(null);

  const handleSaveSplit = async (parts: any[]) => {
    if (!splittingTx) return;

    const splitPromise = async () => {
      const candidateFingerprint = splittingTx.candidate_fingerprint
        || splittingTx.raw_data?._source?.candidate_fingerprint
        || buildTransactionCandidateFingerprint({
          bank: splittingTx.bank,
          date: splittingTx.raw_data?.original_date || splittingTx.date,
          amount: splittingTx.raw_data?.original_amount ?? splittingTx.amount,
          type: splittingTx.type,
          originalDescription: splittingTx.raw_data?.original_description || splittingTx.description
        });
      const sourceOriginKey = splittingTx.source_origin_key
        || splittingTx.raw_data?._source?.origin_key
        || `${candidateFingerprint}|OCC|1`;

      const { error } = await supabase.rpc('split_transaction', {
        p_transaction_id: splittingTx.id,
        p_candidate_fingerprint: candidateFingerprint,
        p_source_origin_key: sourceOriginKey,
        p_parts: parts.map(part => ({
          amount: Math.abs(part.amount),
          date: part.date || splittingTx.date,
          tipo_movimiento: part.tipo_movimiento,
          categoria_principal: part.categoria_principal,
          categoria_secundaria: part.categoria_secundaria
        }))
      });
      if (error) throw error;

      await fetchTransactions();
      setSplittingTx(null);
    };

    toast.promise(splitPromise(), {
      loading: 'Dividiendo transacción...',
      success: '¡Transacción dividida exitosamente!',
      error: (err) => `Error al dividir: ${err?.message || err?.details || 'Error desconocido'}`
    });
  };

  const handleRestoreSplit = async (tx: any) => {
    const splitGroupId = tx.raw_data?.split_group_id;
    if (!splitGroupId) return;

    const restorePromise = async () => {
      const { error } = await supabase.rpc('restore_split_transaction', {
        p_split_group_id: splitGroupId
      });
      if (error) throw error;

      await fetchTransactions();
    };

    toast.promise(restorePromise(), {
      loading: 'Restaurando transacción original...',
      success: '¡Transacción restaurada exitosamente!',
      error: (err) => `Error al restaurar: ${err?.message || err?.details || 'Error desconocido'}`
    });
  };

  const { user } = useAuth();
  const { activeBank, connectedBanks, dashboardScope } = useBanks();
  const { dispatchAction } = useActionQueue();
  const isConsolidated = dashboardScope === 'all' && connectedBanks.length > 1;
  const scopedBanks = isConsolidated ? connectedBanks : (activeBank ? [activeBank] : []);
  const scopedBankKey = scopedBanks.join('|');
  const userId = user?.id;
  const fetchRequestRef = useRef(0);

  const fetchAllForBank = useCallback(async (bankId: string) => {
    if (!userId) return [];
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('bank', bankId)
        .neq('amount', 0)
        .order('date', { ascending: false })
        .range(from, from + step - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      allData = [...allData, ...data];
      if (data.length < step) break;
      from += step;
    }
    return allData;
  }, [userId]);

  const fetchTransactions = useCallback(async () => {
    const requestId = ++fetchRequestRef.current;
    const bankIds = scopedBankKey.split('|').filter(Boolean);

    try {
      setLoading(true);
      if (!userId || bankIds.length === 0) {
        if (requestId === fetchRequestRef.current) setTransactions([]);
        return;
      }

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
        rows.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
        if (requestId === fetchRequestRef.current) setTransactions(rows);
      } else {
        const data = await fetchAllForBank(bankIds[0]);
        // Sort descending for Transactions
        data.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
        if (requestId === fetchRequestRef.current) setTransactions(data);
      }
    } catch (error) {
      if (requestId === fetchRequestRef.current) {
        console.error('Error fetching transactions:', error);
        toast.error('Error al cargar transacciones');
      }
    } finally {
      if (requestId === fetchRequestRef.current) setLoading(false);
    }
  }, [fetchAllForBank, scopedBankKey, userId]);

  useEffect(() => {
    void fetchTransactions();
    return () => {
      fetchRequestRef.current += 1;
    };
  }, [fetchTransactions]);

  const duplicateGroups = useMemo(
    () => buildDuplicateReviewGroups(transactions),
    [transactions]
  );

  const duplicateTransactionCount = useMemo(() => (
    new Set(duplicateGroups.flatMap(group => group.recommendedDeleteIds)).size
  ), [duplicateGroups]);

  const batchDuplicateDeleteIds = useMemo(
    () => getBatchDuplicateDeleteIds(duplicateGroups),
    [duplicateGroups]
  );

  const handleDateChange = async (transactionId: string, nextDate: string) => {
    const previous = transactions.find(transaction => transaction.id === transactionId);
    if (!previous || !nextDate || previous.date === nextDate) return;

    setTransactions(current => current.map(transaction => (
      transaction.id === transactionId ? { ...transaction, date: nextDate } : transaction
    )));

    const { error } = await supabase
      .from('transactions')
      .update({ date: nextDate })
      .eq('id', transactionId);

    if (error) {
      setTransactions(current => current.map(transaction => (
        transaction.id === transactionId ? { ...transaction, date: previous.date } : transaction
      )));
      toast.error('No pudimos cambiar la fecha del movimiento.');
      return;
    }

    toast.success('Fecha actualizada. El pago se asignará al periodo correspondiente.');
  };

  const confirmDeleteTransactions = async () => {
    if (!pendingDeletion || pendingDeletion.ids.length === 0) return;

    const { data: deletedRows, error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user!.id)
      .in('id', pendingDeletion.ids)
      .select('id');
    if (error) throw error;

    const deletedIds = new Set((deletedRows || []).map(row => row.id));
    if (deletedIds.size === 0) throw new Error('No se eliminaron movimientos');
    setTransactions(current => current.filter(transaction => !deletedIds.has(transaction.id)));
    toast.success(`${deletedIds.size} movimiento${deletedIds.size === 1 ? '' : 's'} eliminado${deletedIds.size === 1 ? '' : 's'}.`);
  };

  const requestTransactionDeletion = (transaction: any) => {
    const splitGroupId = transaction.raw_data?.split_group_id;
    const ids = splitGroupId
      ? transactions.filter(item => item.raw_data?.split_group_id === splitGroupId).map(item => item.id)
      : [transaction.id];
    setPendingDeletion({
      ids,
      title: splitGroupId ? 'Eliminar división completa' : 'Eliminar transacción',
      description: splitGroupId
        ? `Se eliminarán las ${ids.length} partes de “${transaction.description}”. Esta acción corregirá los totales y reportes.`
        : `Se eliminará “${transaction.description}” por ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(transaction.amount)}. Esta acción no se puede deshacer.`
    });
  };



  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterBank, filterPeriod, filterStatus, filterType, searchTerm]);

  const availablePeriods = useMemo(() => {
    const periods = new Set<string>();
    const years = new Set<string>();
    transactions.forEach(t => {
      const d = parseLocalDate(t.date);
      years.add(d.getFullYear().toString());
      periods.add(`${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}`);
    });
    return {
      years: Array.from(years).sort().reverse(),
      months: Array.from(periods).sort().reverse()
    };
  }, [transactions]);

  const filteredTransactions = transactions.filter(t => {
    const normalizeText = (text: any) => String(text || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const searchLower = normalizeText(searchTerm);
    const desc = t.description || '';
    const origDesc = t.original_description || '';
    const catSearchStr = `${t.tipo_movimiento || ''} ${t.categoria_principal || ''} ${t.categoria_secundaria || ''}`;
    
    const matchesSearch = 
      normalizeText(desc).includes(searchLower) || 
      normalizeText(origDesc).includes(searchLower) ||
      normalizeText(catSearchStr).includes(searchLower);
    
    const date = parseLocalDate(t.date);
    const yStr = date.getFullYear().toString();
    const mStr = `${yStr}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const matchesPeriod = filterPeriod === 'all' || 
                          (filterPeriod.length === 4 ? yStr === filterPeriod : mStr === filterPeriod);

    const matchesType = filterType === 'all' || (filterType === 'expense' ? t.type === 'egreso' : t.type === 'ingreso');
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'classified' ? !!t.tipo_movimiento : 
                           filterStatus === 'split' ? !!t.raw_data?.split_group_id : 
                           !t.tipo_movimiento);
    const matchesBank = filterBank === 'all' || t.bank === filterBank;
    return matchesSearch && matchesPeriod && matchesType && matchesStatus && matchesBank;
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const activeFilterCount = [filterPeriod, filterType, filterStatus, filterBank].filter(value => value !== 'all').length;
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  const bulkGroups = useMemo(() => {
    if (viewMode !== 'bulk') return [];
    
    let targetTransactions = transactions;
    if (bulkFilterMode === 'unclassified') {
      targetTransactions = transactions.filter(t => !t.tipo_movimiento);
    } else if (bulkFilterMode !== 'all') {
      targetTransactions = transactions.filter(t => t.tipo_movimiento === bulkFilterMode);
    }

    const groups: { [key: string]: { name: string, type: string, count: number, total: number, ids: string[], currentCategory?: string, currentPrincipal?: string, currentSecundaria?: string } } = {};
    
    targetTransactions.forEach(t => {
      const desc = (t.original_description || t.description || '').trim();
      if (!desc) return;
      if (bulkSearchTerm && !desc.toLowerCase().includes(bulkSearchTerm.toLowerCase())) return;

      const key = `${desc}___${t.type}`;

      if (!groups[key]) {
        groups[key] = { name: desc, type: t.type, count: 0, total: 0, ids: [], currentCategory: t.tipo_movimiento || undefined, currentPrincipal: t.categoria_principal || undefined, currentSecundaria: t.categoria_secundaria || undefined };
      }
      // If categories diverge within the same group, we could clear it, but let's just show the first one found
      if (groups[key].currentCategory && t.tipo_movimiento && groups[key].currentCategory !== t.tipo_movimiento) {
        groups[key].currentCategory = 'Múltiples categorías';
        groups[key].currentPrincipal = undefined;
        groups[key].currentSecundaria = undefined;
      }
      groups[key].count += 1;
      groups[key].total += Math.abs(t.amount); 
      groups[key].ids.push(t.id);
    });

    return Object.values(groups)
      .filter(g => g.total > 0)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'ingreso' ? -1 : 1;
        if (b.count !== a.count) return b.count - a.count;
        return b.total - a.total;
      });
  }, [transactions, viewMode, bulkSearchTerm, bulkFilterMode]);

  const handleCategorize = async (id: string, currentDesc: string, tipo: string | null, principal: string | null, secundaria: string | null) => {
    const prevTx = transactions.find(t => t.id === id);
    if (!prevTx) return;

    setTransactions(prev => prev.map(t => t.id === id ? { ...t, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria } : t));

    const othersCount = transactions.filter(t => t.id !== id && t.description === currentDesc).length;

    if (othersCount > 0 && tipo) {
      setPendingCategoryConfirmation({
        id,
        currentDesc,
        tipo,
        principal,
        secundaria,
        previousTransaction: prevTx,
        affectedTransactions: transactions.filter(tx => tx.id === id || tx.description === currentDesc),
        othersCount
      });
    } else {
      dispatchAction({
        id: id,
        message: `1 transacción clasificada`,
        execute: async () => {
          const { error } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('id', id);
          if (error) throw error;
        },
        onUndo: () => setTransactions(prev => prev.map(tx => tx.id === id ? prevTx : tx))
      });
    }
  };

  const cancelCategoryConfirmation = () => {
    if (!pendingCategoryConfirmation) return;
    const { id, previousTransaction } = pendingCategoryConfirmation;
    setTransactions(prev => prev.map(tx => tx.id === id ? previousTransaction : tx));
    setPendingCategoryConfirmation(null);
  };

  const confirmCategoryForOne = () => {
    if (!pendingCategoryConfirmation) return;
    const confirmation = pendingCategoryConfirmation;
    setPendingCategoryConfirmation(null);
    dispatchAction({
      id: confirmation.id,
      message: '1 transacción clasificada',
      execute: async () => {
        const { error } = await supabase
          .from('transactions')
          .update({
            tipo_movimiento: confirmation.tipo,
            categoria_principal: confirmation.principal,
            categoria_secundaria: confirmation.secundaria
          })
          .eq('id', confirmation.id);
        if (error) throw error;
      },
      onUndo: () => setTransactions(prev => prev.map(tx => (
        tx.id === confirmation.id ? confirmation.previousTransaction : tx
      )))
    });
  };

  const confirmCategoryForAll = () => {
    if (!pendingCategoryConfirmation) return;
    const confirmation = pendingCategoryConfirmation;
    const affectedIds = new Set(confirmation.affectedTransactions.map(tx => tx.id));
    setPendingCategoryConfirmation(null);
    setTransactions(prev => prev.map(tx => affectedIds.has(tx.id) ? {
      ...tx,
      tipo_movimiento: confirmation.tipo,
      categoria_principal: confirmation.principal,
      categoria_secundaria: confirmation.secundaria
    } : tx));

    dispatchAction({
      id: `bulk-cat-${confirmation.currentDesc}`,
      message: `${confirmation.othersCount + 1} transacciones clasificadas`,
      execute: async () => {
        const { error } = await supabase
          .from('transactions')
          .update({
            tipo_movimiento: confirmation.tipo,
            categoria_principal: confirmation.principal,
            categoria_secundaria: confirmation.secundaria
          })
          .eq('user_id', user!.id)
          .in('id', Array.from(affectedIds));
        if (error) throw error;
      },
      onUndo: () => {
        setTransactions(prev => prev.map(tx => {
          const oldTx = confirmation.affectedTransactions.find(old => old.id === tx.id);
          return oldTx || tx;
        }));
      }
    });
  };

  const handleDescriptionBlur = async (id: string, currentDesc: string, rawDesc: string) => {
    const originalTx = transactions.find(t => t.id === id);
    if (!originalTx || originalTx.description.trim() === '') return;

    const descKey = Object.keys(originalTx.raw_data || {}).find(k => k.toLowerCase().includes('descripc')) || '';
    const othersCount = transactions.filter(t => t.id !== id && t.raw_data && t.raw_data[descKey] === rawDesc && t.description !== currentDesc).length;

    if (othersCount > 0) {
      const cancelRename = (toastId: string) => {
        toast.dismiss(toastId);
        setTransactions(prev => prev.map(tx => tx.id === id ? originalTx : tx));
      };

      toast.custom((t) => (
        <div className="confirm-toast">
          <div className="confirm-toast-header">
            <h3>Renombrado Múltiple</h3>
            <button type="button" className="btn-icon" onClick={() => cancelRename(t.id)} title="Cerrar" aria-label="Cerrar confirmación de nombre">
              <X size={16} />
            </button>
          </div>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones originales iguales. ¿Renombrar todas a "{currentDesc}"?
          </p>
          <div className="confirm-toast-actions">
            <button
              type="button"
              className="btn btn-outline" 
              onClick={() => cancelRename(t.id)}
              style={{ backgroundColor: '#fff' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-outline" 
              onClick={() => {
                toast.dismiss(t.id);
                dispatchAction({
                  id: `desc-${id}`,
                  message: `Transacción renombrada a "${currentDesc}"`,
                  execute: async () => {
                    const { error } = await supabase.from('transactions').update({ description: currentDesc }).eq('id', id);
                    if (error) throw error;
                  },
                  onUndo: () => setTransactions(prev => prev.map(tx => tx.id === id ? originalTx : tx))
                });
              }}
            >
              Solo a esta
            </button>
            <button 
              type="button"
              className="btn btn-primary" 
              onClick={() => {
                toast.dismiss(t.id);
                
                const affectedTxs = transactions.filter(tx => tx.id === id || (tx.raw_data && tx.raw_data[descKey] === rawDesc));

                setTransactions(prev => prev.map(tx => {
                  if (tx.raw_data && tx.raw_data[descKey] === rawDesc) return { ...tx, description: currentDesc };
                  return tx;
                }));

                dispatchAction({
                  id: `bulk-desc-${id}`,
                  message: `${othersCount + 1} transacciones renombradas a "${currentDesc}"`,
                  execute: async () => {
                    const { error } = await supabase.from('transactions').update({ description: currentDesc }).eq('user_id', user?.id).contains('raw_data', { [descKey]: rawDesc });
                    if (error) throw error;
                  },
                  onUndo: () => {
                    setTransactions(prev => prev.map(tx => {
                      const oldTx = affectedTxs.find(old => old.id === tx.id);
                      return oldTx ? oldTx : tx;
                    }));
                  }
                });
              }}
            >
              Sí, a todas
            </button>
          </div>
        </div>
      ), { duration: Infinity });
    } else {
      dispatchAction({
        id: `desc-${id}`,
        message: `Transacción renombrada a "${currentDesc}"`,
        execute: async () => {
          const { error } = await supabase.from('transactions').update({ description: currentDesc }).eq('id', id);
          if (error) throw error;
        },
        onUndo: () => setTransactions(prev => prev.map(tx => tx.id === id ? originalTx : tx))
      });
    }
  };

  if (loading) {
    return (
      <div className="transactions-loading" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Cargando transacciones</span>
        <h1 className="app-page-title">Clasificador de transacciones</h1>
        <div className="transactions-loading-grid" aria-hidden="true">
          <div className="skeleton" style={{ height: '100px' }}></div>
          <div className="skeleton" style={{ height: '100px' }}></div>
          <div className="skeleton" style={{ height: '100px' }}></div>
          <div className="skeleton" style={{ height: '100px' }}></div>
        </div>
        <div className="skeleton" style={{ height: '600px' }}></div>
      </div>
    );
  }

  const uncatCount = transactions.filter(t => !t.tipo_movimiento).length;

  return (
    <div className="transactions-page">
      <div className="header-container transactions-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div>
            <h1 className="app-page-title">Transacciones</h1>
            {uncatCount > 0 && (
              <div style={{ display: 'inline-block', backgroundColor: '#fef08a', color: '#854d0e', padding: '0.5rem 1rem', borderRadius: '2rem', border: '2px solid black', fontWeight: 800, fontSize: '0.875rem' }}>
                Faltan {uncatCount} transacciones por clasificar
              </div>
            )}
            {searchParams.get('review') === 'recent' && (
              <div role="status" style={{ marginTop: '0.75rem', maxWidth: 620, padding: '0.75rem 1rem', border: '2px solid #000', borderRadius: 8, background: '#dcfce7', boxShadow: '2px 2px 0 #000', fontWeight: 750 }}>
                Importación completada. Tus movimientos ya están disponibles aquí; revisa las coincidencias si el sistema detectó posibles duplicados.
              </div>
            )}
          </div>
        </div>
        
        <div className="transactions-actions">
          <div className="responsive-tabs" aria-label="Acciones de transacciones">
            <button
              type="button"
              className="transactions-import-tab"
              onClick={() => navigate('/import')}
              aria-label="Importar una cartola bancaria"
            >
              <UploadCloud size={18} aria-hidden="true" />
              Importar Cartola
            </button>
            <button
              type="button"
              onClick={() => setViewMode('individual')}
              className={viewMode === 'individual' ? 'active' : ''}
              aria-pressed={viewMode === 'individual'}
            >
              Lista Individual
            </button>
            <button
              type="button"
              onClick={() => setViewMode('assistant')}
              className={viewMode === 'assistant' ? 'active' : ''}
              aria-pressed={viewMode === 'assistant'}
            >
              Asistente Inteligente
            </button>
            <button
              type="button"
              onClick={() => setViewMode('duplicates')}
              className={viewMode === 'duplicates' ? 'active' : ''}
              aria-pressed={viewMode === 'duplicates'}
            >
              Posibles duplicados{duplicateGroups.length > 0 ? ` (${duplicateGroups.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'assistant' && (
        <SmartAssistant transactions={transactions} onRefresh={fetchTransactions} />
      )}

      {viewMode === 'bulk' && (
        <div className="card" style={{ backgroundColor: 'var(--pastel-yellow)' }}>
          <h2 style={{ marginTop: 0 }}>Categorización Masiva</h2>
          <p style={{ fontWeight: 500, marginBottom: '2rem' }}>
            Agrupamos las transacciones que tienen la misma descripción original para que las categorices todas con un solo clic.
          </p>

          <div className="filter-bar" style={{ marginBottom: '1.5rem' }}>
            <div style={{ position: 'relative', flex: 1, width: '100%' }}>
              <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input 
                type="text" 
                className="input" 
                placeholder="Filtrar por descripción..." 
                value={bulkSearchTerm}
                onChange={(e) => setBulkSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '3rem', backgroundColor: 'white' }}
              />
            </div>
            <select 
              value={bulkFilterMode} 
              onChange={e => setBulkFilterMode(e.target.value)}
              className="input" 
              style={{ backgroundColor: 'white', width: '100%', flex: 1, fontWeight: 600 }}
            >
              <option value="unclassified">Solo Sin Clasificar</option>
              <option value="all">Todas las transacciones</option>
              <option disabled>──────────</option>
              <option value="Egreso">Egreso</option>
              <option value="Ingreso">Ingreso</option>
              <option value="Movimiento Interno">Mov. Interno</option>
              <option value="Ahorro/Inversión">Ahorro/Inversión</option>
            </select>
          </div>

          <table className="responsive-table">
            <thead>
              <tr>
                <th>Descripción Base</th>
                <th>Cant.</th>
                <th>Monto Acumulado</th>
                <th>Clasificar como...</th>
              </tr>
            </thead>
            <tbody>
              {bulkGroups.map((group) => (
                <tr key={`${group.name}-${group.type}`}>
                  <td data-label="Descripción" style={{ padding: '1rem', fontWeight: 700 }}>
                    {group.name}
                    <span style={{ 
                      display: 'inline-block', 
                      marginLeft: '0.5rem', 
                      padding: '0.1rem 0.5rem', 
                      borderRadius: '1rem', 
                      fontSize: '0.75rem', 
                      fontWeight: 800,
                      backgroundColor: group.type === 'ingreso' ? '#dcfce7' : '#fee2e2',
                      color: group.type === 'ingreso' ? '#166534' : '#991b1b'
                    }}>
                      {group.type === 'ingreso' ? 'Ingreso' : 'Egreso'}
                    </span>
                  </td>
                  <td data-label="Cant." style={{ padding: '1rem', fontWeight: 800, fontSize: '1.25rem' }}>{group.count}</td>
                  <td data-label="Acumulado" style={{ padding: '1rem', fontWeight: 800, color: group.type === 'ingreso' ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    {group.type === 'ingreso' ? '+' : '-'}${group.total.toLocaleString('es-CL')}
                  </td>
                  <td data-label="Clasificar" style={{ padding: '1rem' }}>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                      Actual: {group.currentCategory || 'Ninguna'}
                      {group.currentPrincipal && ` > ${group.currentPrincipal}`}
                      {group.currentSecundaria && ` > ${group.currentSecundaria}`}
                    </div>
                    <CascadingCategorySelector 
                      contextDescription={group.name}
                      onSave={async (tipo: any, principal: any, secundaria: any) => {
                        if (!tipo) return;
                        
                        const affectedTxs = transactions.filter(t => group.ids.includes(t.id));
                        
                        // Optimistic UI update
                        setTransactions(prev => prev.map(t => group.ids.includes(t.id) ? { ...t, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria } : t));
                        
                        dispatchAction({
                          id: `bulk-${group.name}-${group.type}`,
                          message: `${group.count} transacciones clasificadas`,
                          execute: async () => {
                            const { error } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).in('id', group.ids);
                            if (error) throw error;
                          },
                          onUndo: () => {
                            setTransactions(prev => prev.map(tx => {
                              const oldTx = affectedTxs.find(old => old.id === tx.id);
                              return oldTx ? oldTx : tx;
                            }));
                          }
                        });
                      }}
                    />
                  </td>
                </tr>
              ))}
              {bulkGroups.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', fontWeight: 600 }}>
                    ¡No hay transacciones para mostrar en esta vista!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'duplicates' && (
        <div className="card transactions-card">
          <div className="transactions-card-header">
            <div>
              <h2 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ShieldAlert size={24} aria-hidden="true" /> Revisión automatizada de duplicados
              </h2>
              <p style={{ fontWeight: 600, color: '#475569', margin: 0, maxWidth: 760 }}>
                El sistema agrupa coincidencias por banco, fecha original, monto, tipo y descripción. No elimina nada sin tu confirmación y trata una división completa como un solo movimiento lógico.
              </p>
            </div>
            <div style={{ display: 'grid', gap: '0.7rem', justifyItems: 'end' }}>
              <div className="transactions-summary">
                <span>{duplicateGroups.length} grupo{duplicateGroups.length === 1 ? '' : 's'} para revisar</span>
                <span>{batchDuplicateDeleteIds.length} movimiento{batchDuplicateDeleteIds.length === 1 ? '' : 's'} repetido{batchDuplicateDeleteIds.length === 1 ? '' : 's'}</span>
              </div>
              <button
                type="button"
                className="btn"
                disabled={batchDuplicateDeleteIds.length === 0}
                style={{ background: '#fecaca', color: '#991b1b' }}
                onClick={() => setPendingDeletion({
                  ids: batchDuplicateDeleteIds,
                  title: 'Resolver lote completo de duplicados',
                  description: `Se conservará un movimiento por cada uno de los ${duplicateGroups.length} grupos y se eliminarán ${batchDuplicateDeleteIds.length} registros restantes. En coincidencias sin división se conserva el registro más antiguo. Revisa que no sean compras legítimas repetidas antes de continuar.`,
                  confirmationText: 'ELIMINAR LOTE'
                })}
              >
                <Trash2 size={17} aria-hidden="true" /> Resolver lote completo
              </button>
              {duplicateTransactionCount > 0 && (
                <small style={{ color: '#475569', fontWeight: 750 }}>{duplicateTransactionCount} corrección{duplicateTransactionCount === 1 ? '' : 'es'} de reimportación con división</small>
              )}
            </div>
          </div>

          {duplicateGroups.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', fontWeight: 750, color: '#475569' }}>
              No encontramos coincidencias que requieran revisión.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {duplicateGroups.map((group, groupIndex) => (
                <section key={group.key} style={{ border: '2px solid #000', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                  <div style={{ padding: '0.9rem 1rem', borderBottom: '2px solid #000', background: group.containsSplit ? '#fef3c7' : '#f8fafc', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <strong>Coincidencia {groupIndex + 1}</strong>
                      <div style={{ marginTop: '0.2rem', fontSize: '0.85rem', color: '#475569', fontWeight: 650 }}>{group.reason}</div>
                    </div>
                    {group.recommendedDeleteIds.length > 0 && (
                      <button
                        type="button"
                        className="btn"
                        style={{ background: '#fecaca', color: '#991b1b' }}
                        onClick={() => setPendingDeletion({
                          ids: group.recommendedDeleteIds,
                          title: 'Eliminar original reimportada',
                          description: 'Se conservará la transacción dividida y se eliminará el movimiento completo reimportado. Los totales volverán a considerar solamente las partes procesadas.'
                        })}
                      >
                        <Trash2 size={17} aria-hidden="true" /> Corregir reimportación
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid' }}>
                    {group.entries.map(entry => {
                      const keep = entry.key === group.keepEntryKey;
                      return (
                        <div key={entry.key} className="duplicate-review-entry" style={{ padding: '1rem', borderBottom: '1px solid #cbd5e1', display: 'grid', gridTemplateColumns: 'minmax(180px, 1.7fr) repeat(3, minmax(110px, auto)) auto', gap: '1rem', alignItems: 'center' }}>
                          <div>
                            <strong>{entry.description}</strong>
                            <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {keep && group.containsSplit && <span style={{ padding: '0.15rem 0.45rem', border: '1px solid #166534', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: '0.72rem', fontWeight: 850 }}>Conservar división</span>}
                              {entry.isSplit && <span style={{ padding: '0.15rem 0.45rem', border: '1px solid #a16207', borderRadius: 999, background: '#fef3c7', color: '#854d0e', fontSize: '0.72rem', fontWeight: 850 }}>Dividida · {entry.transactionIds.length} partes</span>}
                            </div>
                          </div>
                          <span style={{ fontWeight: 700 }}>{entry.bank}</span>
                          <span style={{ fontWeight: 700 }}>{entry.date}</span>
                          <span style={{ fontWeight: 900 }}>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(entry.amount)}</span>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => setPendingDeletion({
                              ids: entry.transactionIds,
                              title: entry.isSplit ? 'Eliminar división completa' : 'Eliminar movimiento candidato',
                              description: entry.isSplit
                                ? `Se eliminarán las ${entry.transactionIds.length} partes de “${entry.description}”.`
                                : `Se eliminará “${entry.description}” del ${entry.date}. Verifica antes que sea realmente el duplicado.`
                            })}
                            title="Eliminar este registro"
                            aria-label={`Eliminar ${entry.description} del ${entry.date}`}
                            style={{ color: '#b91c1c' }}
                          >
                            <Trash2 size={17} aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
      
      {viewMode === 'individual' && (
        <div className="card transactions-card">
          <div className="transactions-card-header">
            <div>
              <h2 style={{ marginTop: 0 }}>Lista de Transacciones</h2>
              <p style={{ fontWeight: 600, color: '#475569', margin: 0 }}>
                Edita alias, filtra rápido y abre el selector visual para clasificar.
              </p>
            </div>
            <div className="transactions-summary">
              <span>{filteredTransactions.length.toLocaleString('es-CL')} visibles</span>
              <span>{transactions.length.toLocaleString('es-CL')} total</span>
            </div>
          </div>

          {/* Header filtros */}
          <div className="filter-bar transactions-filter-bar" role="search" aria-label="Filtrar transacciones">
            <div className="transactions-search">
              <Search size={20} aria-hidden="true" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input 
                type="text" 
                className="input" 
                aria-label="Buscar transacciones"
                placeholder="Buscar por descripción..." 
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSearchParams(e.target.value ? { search: e.target.value } : {});
                }}
                style={{ width: '100%', paddingLeft: '3rem', paddingRight: searchTerm ? '3rem' : undefined, backgroundColor: 'white' }}
              />
              {searchTerm && (
                <button
                  type="button"
                  className="transactions-search-clear"
                  onClick={() => {
                    setSearchTerm('');
                    setSearchParams({});
                  }}
                  aria-label="Limpiar búsqueda"
                  title="Limpiar búsqueda"
                >
                  <X size={16} strokeWidth={3} />
                </button>
              )}
            </div>

            <button
              type="button"
              className="btn btn-outline transactions-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls="transaction-filter-controls"
              onClick={() => setFiltersOpen(value => !value)}
            >
              Filtros
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
              <ChevronRight size={18} style={{ transform: filtersOpen ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
            </button>

            <div id="transaction-filter-controls" className={`transactions-filter-controls ${filtersOpen ? 'open' : ''}`}>
              <select aria-label="Filtrar por periodo" className="input" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
                <option value="all">Todo el tiempo</option>
                {availablePeriods.months.length > 0 && (
                  <optgroup label="Por mes">
                    {availablePeriods.months.map(period => <option key={period} value={period}>{formatPeriodLabel(period)}</option>)}
                  </optgroup>
                )}
                {availablePeriods.years.length > 0 && (
                  <optgroup label="Por año">
                    {availablePeriods.years.map(y => <option key={y} value={y}>{y} completo</option>) }
                  </optgroup>
                )}
              </select>

              <select aria-label="Filtrar por tipo de movimiento" className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="all">Ingresos y Egresos</option>
                <option value="expense">Solo Egresos</option>
                <option value="income">Solo Ingresos</option>
              </select>

              <select aria-label="Filtrar por estado de clasificación" className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">Todas las transacciones</option>
                <option value="classified">Clasificadas</option>
                <option value="unclassified">Por clasificar</option>
                <option value="split">Divididas</option>
              </select>

              {connectedBanks.length > 1 && (
                <select aria-label="Filtrar por banco" className="input" value={filterBank} onChange={e => setFilterBank(e.target.value)}>
                  <option value="all">Todos los bancos</option>
                  {connectedBanks.map(b => {
                    const meta = getBankMeta(b);
                    return <option key={b} value={b}>{meta.label}</option>;
                  })}
                </select>
              )}

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="btn btn-outline transactions-filter-reset"
                  onClick={() => {
                    setFilterPeriod('all');
                    setFilterType('all');
                    setFilterStatus('all');
                    setFilterBank('all');
                    setFiltersOpen(false);
                  }}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          <div className="transactions-table-wrap">
            <table className="responsive-table transactions-table">
              <thead>
                <tr>
                  <th style={{ width: '145px' }}>Fecha / periodo</th>
                  {connectedBanks.length > 1 && <th style={{ width: '140px' }}>Banco</th>}
                  <th>Descripción (Editable)</th>
                  <th style={{ width: '140px' }}>Monto</th>
                  <th style={{ width: '360px' }}>Clasificación</th>
                  <th style={{ width: '72px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx, i) => {
                  const rawDescKey = tx.raw_data ? Object.keys(tx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '' : '';
                  const rawDesc = tx.raw_data ? tx.raw_data[rawDescKey] : '';
                  const bank = getBankMeta(tx.bank);

                  return (
                    <tr key={tx.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : 'rgba(0,0,0,0.02)' }} className="table-row">
                      <td data-label="Fecha" style={{ padding: '1rem', fontWeight: 600 }}>
                        <input
                          type="date"
                          className="input"
                          value={String(tx.date).split('T')[0]}
                          aria-label={`Cambiar fecha de ${tx.description}`}
                          title="Cambia esta fecha para asignar el pago al mes correcto"
                          onChange={event => void handleDateChange(tx.id, event.target.value)}
                          style={{ minWidth: 132, padding: '0.45rem', fontSize: '0.82rem', fontWeight: 750 }}
                        />
                      </td>
                      {connectedBanks.length > 1 && (
                        <td data-label="Banco" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.55rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fff', boxShadow: '1px 1px 0 #000', fontSize: '0.72rem', fontWeight: 900 }}>
                            <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: bank.color, border: '1.5px solid #000', flexShrink: 0 }} />
                            {bank.label}
                          </span>
                        </td>
                      )}
                      <td data-label="Descripción" style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'transparent', border: '1px solid transparent' }} className="editable-cell">
                          <input 
                            type="text" 
                            className="transaction-description-input"
                            aria-label={`Editar descripción de la transacción del ${tx.date}`}
                            value={tx.description} 
                            onChange={(e) => setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, description: e.target.value } : t))}
                            onBlur={(e) => handleDescriptionBlur(tx.id, e.target.value, rawDesc)}
                            style={{ border: 'none', background: 'transparent', fontWeight: 700, width: '100%', fontSize: '1rem' }}
                          />
                          <Edit2 size={16} color="#94a3b8" />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                          {rawDesc && tx.description !== rawDesc && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Orig: {rawDesc}
                            </div>
                          )}
                          {tx.raw_data?.split_group_id && (
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, backgroundColor: '#fef08a', color: '#854d0e', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #ca8a04', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Scissors size={10} /> Dividida
                            </div>
                          )}
                        </div>
                      </td>
                      <td data-label="Monto" style={{ padding: '1rem', fontWeight: 900, color: tx.type === 'ingreso' ? 'var(--success-text)' : 'var(--danger-text)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(tx.amount)}</span>
                          {tx.raw_data?.split_group_id ? (
                            <button 
                              type="button"
                              onClick={() => handleRestoreSplit(tx)}
                              className="btn-icon"
                              title="Restaurar transacción original"
                              aria-label={`Restaurar transacción original: ${tx.description}`}
                              style={{ padding: '0.25rem', opacity: 0.75, color: 'var(--danger-text)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                            >
                              <Undo2 size={14} />
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onClick={() => setSplittingTx(tx)}
                              className="btn-icon"
                              title="Dividir transacción"
                              aria-label={`Dividir transacción: ${tx.description}`}
                              style={{ padding: '0.25rem', opacity: 0.6 }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                            >
                              <Scissors size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td data-label="Clasificación" style={{ padding: '1rem' }}>
                        <CascadingCategorySelector 
                          initialTipo={tx.tipo_movimiento}
                          initialPrincipal={tx.categoria_principal}
                          initialSecundaria={tx.categoria_secundaria}
                          contextDescription={tx.description || tx.original_description}
                          onSave={(t: any, p: any, s: any) => handleCategorize(tx.id, tx.description, t, p, s)}
                        />
                      </td>
                      <td data-label="Acciones" style={{ padding: '1rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => requestTransactionDeletion(tx)}
                          title={tx.raw_data?.split_group_id ? 'Eliminar división completa' : 'Eliminar transacción'}
                          aria-label={tx.raw_data?.split_group_id ? `Eliminar división completa de ${tx.description}` : `Eliminar ${tx.description}`}
                          style={{ color: '#b91c1c' }}
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {paginatedTransactions.length === 0 && (
                  <tr>
                    <td colSpan={connectedBanks.length > 1 ? 6 : 5} style={{ padding: '3rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      No se encontraron transacciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
              <button 
                type="button"
                className="btn btn-outline" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Anterior
              </button>
              <span style={{ fontWeight: 700 }}>
                Página {currentPage} de {totalPages}
              </span>
              <button 
                type="button"
                className="btn btn-outline" 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}

      {splittingTx && (
        <SplitTransactionModal 
          transaction={splittingTx}
          onClose={() => setSplittingTx(null)}
          onSave={handleSaveSplit}
        />
      )}

      <Dialog
        open={Boolean(pendingCategoryConfirmation)}
        onClose={cancelCategoryConfirmation}
        labelledBy="multiple-category-title"
        describedBy="multiple-category-description"
        panelStyle={{ width: 'min(94vw, 620px)' }}
      >
        <div className="dialog-header">
          <h3 id="multiple-category-title">Categorización múltiple</h3>
          <button type="button" className="dialog-close" onClick={cancelCategoryConfirmation} title="Cerrar" aria-label="Cerrar confirmación de categoría">
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <p id="multiple-category-description" style={{ margin: 0, fontWeight: 650, lineHeight: 1.55 }}>
            Hay otras {pendingCategoryConfirmation?.othersCount || 0} transacciones con el alias “{pendingCategoryConfirmation?.currentDesc}”. ¿Quieres aplicarles esta misma categoría?
          </p>
          <div className="confirm-toast-actions" style={{ marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={cancelCategoryConfirmation}>Cancelar</button>
            <button type="button" className="btn btn-outline" onClick={confirmCategoryForOne}>Solo a esta</button>
            <button type="button" className="btn btn-primary" onClick={confirmCategoryForAll}>Sí, a todas</button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDeletion)}
        title={pendingDeletion?.title || 'Eliminar transacción'}
        description={pendingDeletion?.description || ''}
        confirmLabel="Eliminar definitivamente"
        confirmationText={pendingDeletion?.confirmationText || 'ELIMINAR'}
        onClose={() => setPendingDeletion(null)}
        onConfirm={confirmDeleteTransactions}
      />
    </div>
  );
}
