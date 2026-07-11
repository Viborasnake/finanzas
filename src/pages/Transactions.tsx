import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TransactionTypeBadge } from '../components/TransactionTypeBadge';
import { AVAILABLE_BANKS, useBanks } from '../contexts/BankContext';
import { Search, Edit2, Plus, X, ChevronRight, CheckCircle2, UploadCloud, Scissors, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useActionQueue } from '../hooks/useActionQueue';
import SmartAssistant from '../components/SmartAssistant';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { useSettings } from '../contexts/SettingsContext';
import ImportModal from '../components/ImportModal';
import SplitTransactionModal from '../components/SplitTransactionModal';

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


export function CascadingCategorySelector({ initialPrincipal, initialSecundaria, contextDescription, onSave, autoOpenTrigger }: any) {
  const { taxonomy, allOptions: ALL_OPTIONS } = useTaxonomy();
  const { customCategories, saveCustomCategories, classificationRules } = useSettings();

  const [inputValue, setInputValue] = useState(() => {
    if (initialSecundaria && initialPrincipal) {
      return initialSecundaria === initialPrincipal ? initialPrincipal : `${initialSecundaria} (${initialPrincipal})`;
    }
    return '';
  });
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedTipo, setSelectedTipo] = useState('Egreso');
  const [expandedPrincipal, setExpandedPrincipal] = useState<string | null>(initialPrincipal || null);
  const [newTipo, setNewTipo] = useState('Egreso');
  const [newPrincipal, setNewPrincipal] = useState('');
  const [newSecundaria, setNewSecundaria] = useState('');

  useEffect(() => {
    if (initialSecundaria && initialPrincipal) {
      setInputValue(initialSecundaria === initialPrincipal ? initialPrincipal : `${initialSecundaria} (${initialPrincipal})`);
    } else {
      setInputValue('');
    }
  }, [initialPrincipal, initialSecundaria]);

  useEffect(() => {
    if (autoOpenTrigger) {
      setIsOpen(true);
      setSearchValue('');
      const tipo = ALL_OPTIONS.find(o => o.principal === initialPrincipal && o.secundaria === initialSecundaria)?.tipo || 'Egreso';
      setSelectedTipo(tipo);
      setExpandedPrincipal(initialPrincipal || null);
    }
  }, [autoOpenTrigger]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectOption = (o: any) => {
    setInputValue(o.label);
    setSearchValue('');
    setSelectedTipo(o.tipo);
    setExpandedPrincipal(o.principal);
    onSave(o.tipo, o.principal, o.secundaria);
    setIsOpen(false);
  };

  const isComplete = ALL_OPTIONS.some(o => o.label === inputValue);
  const selectedOption = ALL_OPTIONS.find(o => o.label === inputValue);
  
  const normalizeText = (text: any) => String(text || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filteredOptions = useMemo(() => {
    const query = normalizeText(searchValue);
    if (!query) {
      const context = normalizeText(contextDescription);
      if (!context) return ALL_OPTIONS.slice(0, 8);

      const suggestions: any[] = [];
      classificationRules.forEach(rule => {
        if (rule.keyword && context.includes(normalizeText(rule.keyword))) {
          const match = ALL_OPTIONS.find(o =>
            o.tipo === rule.tipo_movimiento &&
            o.principal === rule.categoria_principal &&
            o.secundaria === rule.categoria_secundaria
          );
          if (match) suggestions.push(match);
        }
      });

      ALL_OPTIONS.forEach(o => {
        const principal = normalizeText(o.principal);
        const secundaria = normalizeText(o.secundaria);
        if ((principal.length > 3 && context.includes(principal)) || (secundaria.length > 3 && context.includes(secundaria))) {
          suggestions.push(o);
        }
      });

      const seen = new Set<string>();
      const uniqueSuggestions = suggestions.filter(o => {
        const key = `${o.tipo}-${o.principal}-${o.secundaria}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return uniqueSuggestions.length > 0 ? uniqueSuggestions.slice(0, 8) : ALL_OPTIONS.slice(0, 8);
    }
    return ALL_OPTIONS
      .filter(o => normalizeText(`${o.label} ${o.tipo} ${o.principal} ${o.secundaria}`).includes(query))
      .slice(0, 10);
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

  const openPicker = () => {
    const current = selectedOption || ALL_OPTIONS.find(o => o.principal === initialPrincipal && o.secundaria === initialSecundaria);
    const tipo = current?.tipo || selectedTipo || 'Egreso';
    setSelectedTipo(tipo);
    setNewTipo(tipo);
    setExpandedPrincipal(current?.principal || initialPrincipal || null);
    setSearchValue(inputValue);
    setIsOpen(true);
  };

  const clearSelection = () => {
    setInputValue('');
    setSearchValue('');
    onSave(null, null, null);
    setIsOpen(false);
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

    await saveCustomCategories(catsCopy);
    const label = secundaria === principal ? principal : `${secundaria} (${principal})`;
    setInputValue(label);
    setSelectedTipo(newTipo);
    setExpandedPrincipal(principal);
    setNewPrincipal('');
    setNewSecundaria('');
    onSave(newTipo, principal, secundaria);
    setIsOpen(false);
    toast.success('Categoría creada y aplicada');
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }}>
      <button
        type="button"
        onClick={openPicker}
        className="input"
        style={{ 
          padding: '0.35rem 0.55rem', 
          fontSize: '0.875rem', 
          width: '280px',
          minHeight: '36px',
          fontWeight: 600,
          textAlign: 'left',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          backgroundColor: isComplete && selectedOption ? getBgColor(selectedOption.tipo) : 'white',
          borderColor: 'black'
        }}
      >
        {inputValue || 'Clasificar...'}
      </button>

      {isOpen && createPortal(
        <div
          className="portal-dropdown"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.38)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onMouseDown={() => setIsOpen(false)}
        >
          <div
            style={{ width: 'min(980px, 100%)', maxHeight: '88vh', overflow: 'hidden', backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', boxShadow: '6px 6px 0px #000', display: 'grid', gridTemplateRows: 'auto 1fr' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', backgroundColor: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>Elegir clasificación</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>Elige una forma de clasificar: usa las sugerencias o navega el árbol. No necesitas hacer ambas.</p>
              </div>
              <button className="btn-icon" onClick={() => setIsOpen(false)} title="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="category-picker-grid">
              <div className="category-picker-left" style={{ padding: '1rem', overflowY: 'auto' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#dbeafe', boxShadow: '3px 3px 0 #000', fontSize: '1rem', fontWeight: 900, marginBottom: '0.75rem' }}>
                  Busca
                </div>
                {contextDescription && (
                  <div style={{ marginBottom: '0.75rem', padding: '0.65rem 0.75rem', border: '2px solid #000', borderRadius: '8px', backgroundColor: '#f1f5f9', boxShadow: '2px 2px 0px #000' }}>
                    <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 900, color: '#64748b', marginBottom: '0.25rem' }}>Transacción</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contextDescription}</div>
                  </div>
                )}
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <Search size={18} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  <input
                    autoFocus
                    className="input"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Ej: sueldo, supermercado, tarjeta..."
                    style={{ paddingLeft: '2.4rem', paddingRight: searchValue ? '2.4rem' : undefined, backgroundColor: '#fff' }}
                  />
                  {searchValue && (
                    <button
                      type="button"
                      onClick={() => setSearchValue('')}
                      title="Limpiar búsqueda"
                      style={{ position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)', width: '28px', height: '28px', border: '2px solid #000', borderRadius: '6px', backgroundColor: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '1px 1px 0 #000' }}
                    >
                      <X size={15} strokeWidth={3} />
                    </button>
                  )}
                </div>

                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 900, color: '#64748b', marginBottom: '0.5rem' }}>
                  {searchValue ? 'Resultados' : 'Sugerencias'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {filteredOptions.map((o) => (
                    <button
                      key={`${o.tipo}-${o.principal}-${o.secundaria}`}
                      onClick={() => selectOption(o)}
                      style={{ textAlign: 'left', padding: '0.75rem', border: '2px solid #000', borderRadius: '8px', backgroundColor: getBgColor(o.tipo), boxShadow: '2px 2px 0px #000', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 900, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.secundaria}</span>
                        <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.principal}</span>
                      </span>
                      <TransactionTypeBadge type={o.tipo} />
                    </button>
                  ))}
                </div>

                {inputValue && (
                  <button className="btn btn-outline" onClick={clearSelection} style={{ width: '100%', backgroundColor: '#fff' }}>
                    Limpiar clasificación
                  </button>
                )}
              </div>

              <div className="category-picker-right" style={{ padding: '1rem', overflowY: 'auto', backgroundColor: '#f8fafc', borderLeft: '2px solid #000' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.8rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: '#fef08a', boxShadow: '3px 3px 0 #000', fontSize: '1.1rem', fontWeight: 900, marginBottom: '1rem' }}>
                  Navega / Crea
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                  {tipoTabs.map(tipo => (
                    <button
                      key={tipo}
                      onClick={() => {
                        setSelectedTipo(tipo);
                        setNewTipo(tipo);
                        setExpandedPrincipal(null);
                      }}
                      style={{ padding: '0.5rem 0.85rem', border: '2px solid #000', borderRadius: '999px', backgroundColor: selectedTipo === tipo ? '#000' : getBgColor(tipo), color: selectedTipo === tipo ? '#fff' : '#000', fontWeight: 900, boxShadow: '2px 2px 0px #000' }}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  {Object.entries(currentTree).map(([principal, secundarias]) => {
                    const isExpanded = expandedPrincipal === principal;
                    return (
                      <div key={principal} style={{ border: '2px solid #000', borderRadius: '10px', boxShadow: '3px 3px 0px #000', overflow: 'hidden', backgroundColor: '#fff' }}>
                        <button
                          onClick={() => setExpandedPrincipal(isExpanded ? null : principal)}
                          style={{ width: '100%', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', backgroundColor: getBgColor(selectedTipo), borderBottom: isExpanded ? '2px solid #000' : 'none', textAlign: 'left' }}
                        >
                          <span style={{ fontSize: '0.9rem', fontWeight: 900 }}>{principal}</span>
                          <ChevronRight size={18} strokeWidth={3} style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
                        </button>
                        {isExpanded && (
                          <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {(secundarias as string[]).map(secundaria => {
                              const active = selectedOption?.tipo === selectedTipo && selectedOption?.principal === principal && selectedOption?.secundaria === secundaria;
                              return (
                                <button
                                  key={`${principal}-${secundaria}`}
                                  onClick={() => selectOption({
                                    tipo: selectedTipo,
                                    principal,
                                    secundaria,
                                    label: secundaria === principal ? principal : `${secundaria} (${principal})`
                                  })}
                                  style={{ padding: '0.55rem 0.65rem', border: '1.5px solid #000', borderRadius: '7px', backgroundColor: active ? '#dcfce7' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', textAlign: 'left', fontWeight: 750 }}
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

                <div style={{ border: '2px solid #000', borderRadius: '10px', boxShadow: '3px 3px 0px #000', padding: '1rem', backgroundColor: '#fef08a' }}>
                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Plus size={18} strokeWidth={3} />
                    Crear categoría aquí
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '0.6rem', alignItems: 'end' }}>
                    <select className="input" value={newTipo} onChange={(e) => setNewTipo(e.target.value)} style={{ backgroundColor: '#fff' }}>
                      {tipoTabs.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                    </select>
                    <input className="input" value={newPrincipal} onChange={(e) => setNewPrincipal(e.target.value)} placeholder="Principal" style={{ backgroundColor: '#fff' }} />
                    <input className="input" value={newSecundaria} onChange={(e) => setNewSecundaria(e.target.value)} placeholder="Subcategoría" style={{ backgroundColor: '#fff' }} />
                    <button className="btn btn-primary" onClick={handleCreateCategory} style={{ height: '44px', whiteSpace: 'nowrap' }}>
                      Crear
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {!isComplete && inputValue !== '' && !isOpen && (
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Pendiente...</span>
      )}
    </div>
  );
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('T')[0].split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
};

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
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
  const [viewMode, setViewMode] = useState<'individual' | 'bulk' | 'assistant'>('individual');
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [bulkFilterMode, setBulkFilterMode] = useState<string>('unclassified');
  const [splittingTx, setSplittingTx] = useState<any>(null);

  const handleSaveSplit = async (parts: any[]) => {
    if (!splittingTx) return;
    const originalAmount = splittingTx.raw_data?.original_amount || splittingTx.amount;
    const splitGroupId = crypto.randomUUID();

    const [firstPart, ...otherParts] = parts;

    const splitPromise = async () => {
      // 1. Update the original transaction
      const { error: updateError } = await supabase.from('transactions').update({
        amount: splittingTx.type === 'egreso' ? -Math.abs(firstPart.amount) : Math.abs(firstPart.amount),
        date: firstPart.date || splittingTx.date,
        tipo_movimiento: firstPart.tipo_movimiento,
        categoria_principal: firstPart.categoria_principal,
        categoria_secundaria: firstPart.categoria_secundaria,
        raw_data: { 
          ...splittingTx.raw_data, 
          original_amount: originalAmount,
          split_group_id: splitGroupId
        }
      }).eq('id', splittingTx.id);

      if (updateError) throw updateError;

      // 2. Insert new parts
      const newRows = otherParts.map(p => ({
        user_id: user!.id,
        date: p.date || splittingTx.date,
        description: splittingTx.description,
        amount: splittingTx.type === 'egreso' ? -Math.abs(p.amount) : Math.abs(p.amount),
        type: splittingTx.type,
        bank: splittingTx.bank,
        is_shared: splittingTx.is_shared,
        tipo_movimiento: p.tipo_movimiento,
        categoria_principal: p.categoria_principal,
        categoria_secundaria: p.categoria_secundaria,
        raw_data: {
          ...splittingTx.raw_data,
          original_amount: originalAmount,
          split_group_id: splitGroupId,
          is_split_child: true
        }
      }));

      const { error: insertError } = await supabase.from('transactions').insert(newRows);
      if (insertError) throw insertError;

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
      // Find all transactions in this split group
      const { data: groupTxs, error: fetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user!.id)
        .contains('raw_data', { split_group_id: splitGroupId });

      if (fetchError) throw fetchError;
      if (!groupTxs || groupTxs.length === 0) return;

      const originalTx = groupTxs.find(t => !t.raw_data?.is_split_child);
      if (!originalTx) throw new Error("No se encontró la transacción original");

      const childIds = groupTxs.filter(t => t.raw_data?.is_split_child).map(t => t.id);

      // 1. Delete all child parts
      if (childIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('transactions')
          .delete()
          .in('id', childIds);
        
        if (deleteError) throw deleteError;
      }

      // 2. Restore original transaction
      const newRawData = { ...originalTx.raw_data };
      const originalAmount = newRawData.original_amount;
      delete newRawData.split_group_id;
      delete newRawData.original_amount;
      delete newRawData.is_split_child;

      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          amount: originalTx.type === 'egreso' ? -Math.abs(originalAmount) : Math.abs(originalAmount),
          raw_data: newRawData
        })
        .eq('id', originalTx.id);

      if (updateError) throw updateError;

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

  useEffect(() => {
    if (user && scopedBanks.length > 0) {
      fetchTransactions();
    } else {
      setTransactions([]);
      setLoading(false);
    }
  }, [user, dashboardScope, activeBank, connectedBanks.join('|')]);

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
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      if (!user || scopedBanks.length === 0) {
        setTransactions([]);
        return;
      }

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
        rows.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
        setTransactions(rows);
      } else {
        const data = await fetchAllForBank(scopedBanks[0]);
        // Sort descending for Transactions
        data.sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
        setTransactions(data);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Error al cargar transacciones');
    } finally {
      setLoading(false);
    }
  };



  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

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
      const cancelCategorize = (toastId: string) => {
        toast.dismiss(toastId);
        setTransactions(prev => prev.map(tx => tx.id === id ? prevTx : tx));
      };

      toast.custom((t) => (
        <div className="confirm-toast">
          <div className="confirm-toast-header">
            <h3>Categorización Múltiple</h3>
            <button className="btn-icon" onClick={() => cancelCategorize(t.id)} title="Cerrar">
              <X size={16} />
            </button>
          </div>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones con el alias "{currentDesc}". ¿Quieres aplicarles esta misma categoría?
          </p>
          <div className="confirm-toast-actions">
            <button 
              className="btn btn-outline" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', backgroundColor: '#fff' }} 
              onClick={() => cancelCategorize(t.id)}
            >
              Cancelar
            </button>
            <button 
              className="btn btn-outline" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
              onClick={() => {
                toast.dismiss(t.id);
                dispatchAction({
                  id: id,
                  message: `1 transacción clasificada`,
                  execute: async () => {
                    const { error } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('id', id);
                    if (error) throw error;
                  },
                  onUndo: () => setTransactions(prev => prev.map(tx => tx.id === id ? prevTx : tx))
                });
              }}
            >
              Solo a esta
            </button>
            <button 
              className="btn btn-primary" 
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
              onClick={() => {
                toast.dismiss(t.id);
                
                const affectedTxs = transactions.filter(tx => tx.id === id || tx.description === currentDesc);
                
                setTransactions(prev => prev.map(tx => {
                  if (tx.description === currentDesc) {
                    return { ...tx, tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria };
                  }
                  return tx;
                }));

                dispatchAction({
                  id: `bulk-cat-${currentDesc}`,
                  message: `${othersCount + 1} transacciones clasificadas`,
                  execute: async () => {
                    const { error: e1 } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('id', id);
                    const sameDescriptionIds = affectedTxs.map(tx => tx.id);
                    const { error: e2 } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).in('id', sameDescriptionIds);
                    if (e1 || e2) throw new Error("Update error");
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
            <button className="btn-icon" onClick={() => cancelRename(t.id)} title="Cerrar">
              <X size={16} />
            </button>
          </div>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones originales iguales. ¿Renombrar todas a "{currentDesc}"?
          </p>
          <div className="confirm-toast-actions">
            <button 
              className="btn btn-outline" 
              onClick={() => cancelRename(t.id)}
              style={{ backgroundColor: '#fff' }}
            >
              Cancelar
            </button>
            <button 
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
      <div style={{ padding: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1.5rem', fontWeight: 900 }}>Clasificador de Transacciones</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
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
            <h1 style={{ margin: '0 0 0.75rem 0', fontSize: '2.5rem' }}>Transacciones</h1>
            {uncatCount > 0 && (
              <div style={{ display: 'inline-block', backgroundColor: '#fef08a', color: '#854d0e', padding: '0.5rem 1rem', borderRadius: '2rem', border: '2px solid black', fontWeight: 800, fontSize: '0.875rem' }}>
                Faltan {uncatCount} transacciones por clasificar
              </div>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem', backgroundColor: '#e2e8f0', color: '#0f172a', fontWeight: 800, border: '2px solid #000', boxShadow: '3px 3px 0 #000' }}
            onClick={() => setIsImportModalOpen(true)}
          >
            <UploadCloud size={20} />
            Importar Cartola
          </button>
        
        <div className="responsive-tabs">
          <button 
            onClick={() => setViewMode('individual')}
            className={viewMode === 'individual' ? 'active' : ''}
          >
            Lista Individual
          </button>
          <button 
            onClick={() => setViewMode('assistant')}
            className={viewMode === 'assistant' ? 'active' : ''}
          >
            Asistente Inteligente 🤖
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
                  <td data-label="Acumulado" style={{ padding: '1rem', fontWeight: 800, color: group.type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
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
          <div className="filter-bar transactions-filter-bar">
            <div className="transactions-search">
              <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input 
                type="text" 
                className="input" 
                placeholder="Buscar por descripción..." 
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSearchParams(e.target.value ? { search: e.target.value } : {});
                }}
                style={{ width: '100%', paddingLeft: '3rem', backgroundColor: 'white' }}
              />
            </div>
            
            <select className="input" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
              <option value="all">Todo el tiempo</option>
              {availablePeriods.years.length > 0 && (
                <optgroup label="Por Año">
                  {availablePeriods.years.map(y => <option key={y} value={y}>{y} completo</option>)}
                </optgroup>
              )}
            </select>

            <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">Ingresos y Egresos</option>
              <option value="expense">Solo Egresos</option>
              <option value="income">Solo Ingresos</option>
            </select>
            
            <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Todas las transacciones</option>
              <option value="classified">Clasificadas</option>
              <option value="unclassified">Por clasificar</option>
              <option value="split">Divididas</option>
            </select>
            
            {connectedBanks.length > 1 && (
              <select className="input" value={filterBank} onChange={e => setFilterBank(e.target.value)}>
                <option value="all">Todos los bancos</option>
                {connectedBanks.map(b => {
                  const meta = getBankMeta(b);
                  return <option key={b} value={b}>{meta.label}</option>;
                })}
              </select>
            )}
          </div>

          <div className="transactions-table-wrap">
            <table className="responsive-table transactions-table">
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>Fecha</th>
                  {connectedBanks.length > 1 && <th style={{ width: '140px' }}>Banco</th>}
                  <th>Descripción (Editable)</th>
                  <th style={{ width: '140px' }}>Monto</th>
                  <th style={{ width: '360px' }}>Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx, i) => {
                  const rawDescKey = tx.raw_data ? Object.keys(tx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '' : '';
                  const rawDesc = tx.raw_data ? tx.raw_data[rawDescKey] : '';
                  const bank = getBankMeta(tx.bank);

                  return (
                    <tr key={tx.id} style={{ backgroundColor: i % 2 === 0 ? 'white' : 'rgba(0,0,0,0.02)' }} className="table-row">
                      <td data-label="Fecha" style={{ padding: '1rem', fontWeight: 600 }}>{tx.date}</td>
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
                            value={tx.description} 
                            onChange={(e) => setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, description: e.target.value } : t))}
                            onBlur={(e) => handleDescriptionBlur(tx.id, e.target.value, rawDesc)}
                            style={{ 
                              border: 'none', background: 'transparent', fontWeight: 700, width: '100%', outline: 'none', fontSize: '1rem'
                            }}
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
                      <td data-label="Monto" style={{ padding: '1rem', fontWeight: 900, color: tx.type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span>{new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(tx.amount)}</span>
                          {tx.raw_data?.split_group_id ? (
                            <button 
                              onClick={() => handleRestoreSplit(tx)}
                              className="btn-icon"
                              title="Restaurar transacción original"
                              style={{ padding: '0.25rem', opacity: 0.6, color: '#ef4444' }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                            >
                              <Undo2 size={14} />
                            </button>
                          ) : (
                            <button 
                              onClick={() => setSplittingTx(tx)}
                              className="btn-icon"
                              title="Dividir transacción"
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
                    </tr>
                  )
                })}
                {paginatedTransactions.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
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

      {isImportModalOpen && (
        <ImportModal onClose={() => {
          setIsImportModalOpen(false);
          fetchTransactions();
        }} />
      )}

      {splittingTx && (
        <SplitTransactionModal 
          transaction={splittingTx}
          onClose={() => setSplittingTx(null)}
          onSave={handleSaveSplit}
        />
      )}
    </div>
  );
}
