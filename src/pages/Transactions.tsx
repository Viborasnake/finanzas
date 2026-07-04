import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { TransactionTypeBadge } from '../components/TransactionTypeBadge';
import { useBanks } from '../contexts/BankContext';
import { Search, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useActionQueue } from '../hooks/useActionQueue';
import SmartAssistant from '../components/SmartAssistant';
import { useTaxonomy } from '../hooks/useTaxonomy';

export function CascadingCategorySelector({ initialPrincipal, initialSecundaria, onSave }: any) {
  const { allOptions: ALL_OPTIONS } = useTaxonomy();

  const [inputValue, setInputValue] = useState(() => {
    if (initialSecundaria && initialPrincipal) {
      return initialSecundaria === initialPrincipal ? initialPrincipal : `${initialSecundaria} (${initialPrincipal})`;
    }
    return '';
  });
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialSecundaria && initialPrincipal) {
      setInputValue(initialSecundaria === initialPrincipal ? initialPrincipal : `${initialSecundaria} (${initialPrincipal})`);
    } else {
      setInputValue('');
    }
  }, [initialPrincipal, initialSecundaria]);

  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const updatePosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // If clicking inside the portal, ignore
      if ((event.target as Element).closest('.portal-dropdown')) return;
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setIsOpen(true);
    
    if (val === '') {
      onSave(null, null, null);
      return;
    }

    const match = ALL_OPTIONS.find(o => o.label === val);
    if (match) {
      onSave(match.tipo, match.principal, match.secundaria);
      setIsOpen(false);
    }
  };

  const selectOption = (o: any) => {
    setInputValue(o.label);
    onSave(o.tipo, o.principal, o.secundaria);
    setIsOpen(false);
  };

  const isComplete = ALL_OPTIONS.some(o => o.label === inputValue);
  const selectedOption = ALL_OPTIONS.find(o => o.label === inputValue);
  
  const normalizeText = (text: any) => String(text || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const filteredOptions = ALL_OPTIONS.filter(o => normalizeText(o.label).includes(normalizeText(inputValue)));

  const getBgColor = (tipo: string | undefined | null) => {
    if (tipo === 'Ingreso') return '#dcfce7'; // pastel green
    if (tipo === 'Egreso') return '#fee2e2'; // pastel red
    if (tipo === 'Movimiento Interno') return '#f1f5f9'; // pastel slate
    if (tipo === 'Ahorro/Inversión') return '#f3e8ff'; // pastel purple
    return '#f3f4f6';
  };

  return (
    <div ref={wrapperRef} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }}>
      <input 
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => {
          updatePosition();
          setIsOpen(true);
        }}
        className="input"
        placeholder="Escribe para clasificar..."
        style={{ 
          padding: '0.25rem 0.5rem', 
          fontSize: '0.875rem', 
          width: '280px',
          fontWeight: 600,
          backgroundColor: isComplete && selectedOption ? getBgColor(selectedOption.tipo) : 'white',
          borderColor: 'black'
        }}
      />
      {isOpen && filteredOptions.length > 0 && createPortal(
        <ul className="portal-dropdown" style={{
          position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999,
          backgroundColor: 'white', border: '2px solid black', borderRadius: '4px',
          boxShadow: '4px 4px 0px black', maxHeight: '200px', overflowY: 'auto',
          listStyle: 'none', padding: 0, margin: 0
        }}>
          {filteredOptions.map((o, i) => (
            <li 
              key={i} 
              onClick={() => selectOption(o)}
              style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', fontSize: '0.875rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span>{o.label}</span>
              <TransactionTypeBadge type={o.tipo} />
            </li>
          ))}
        </ul>,
        document.body
      )}
      {!isComplete && inputValue !== '' && !isOpen && (
        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Pendiente...</span>
      )}
    </div>
  );
}

export default function Transactions() {
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
  const [filterCategory, setFilterCategory] = useState('all');
  
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [viewMode, setViewMode] = useState<'individual' | 'bulk' | 'assistant'>('individual');
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [bulkFilterMode, setBulkFilterMode] = useState<string>('unclassified');

  const { user } = useAuth();
  const { activeBank } = useBanks();
  const { dispatchAction } = useActionQueue();

  useEffect(() => {
    if (user && activeBank) {
      fetchTransactions();
    } else if (!activeBank) {
      setTransactions([]);
      setLoading(false);
    }
  }, [user, activeBank]);

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user?.id)
        .eq('bank', activeBank)
        .neq('amount', 0)
        .order('date', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Error al cargar transacciones');
    } finally {
      setLoading(false);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => new Date(t.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
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
    
    const date = new Date(t.date);
    const matchesYear = filterYear === 'all' || date.getFullYear().toString() === filterYear;
    const matchesMonth = filterMonth === 'all' || (date.getMonth() + 1).toString() === filterMonth;

    const matchesType = filterType === 'all' || (filterType === 'expense' ? t.type === 'egreso' : t.type === 'ingreso');
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'classified' ? !!t.tipo_movimiento : !t.tipo_movimiento);
    const matchesCat = filterCategory === 'all' || t.tipo_movimiento === filterCategory;

    return matchesSearch && matchesYear && matchesMonth && matchesType && matchesStatus && matchesCat;
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
      toast.custom((t) => (
        <div className="card" style={{ padding: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', background: 'white', maxWidth: '400px' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.125rem' }}>Categorización Múltiple</h3>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones con el alias "{currentDesc}". ¿Quieres aplicarles esta misma categoría?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
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
                    const { error: e2 } = await supabase.from('transactions').update({ tipo_movimiento: tipo, categoria_principal: principal, categoria_secundaria: secundaria }).eq('description', currentDesc).eq('bank', activeBank);
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
      toast.custom((t) => (
        <div className="card" style={{ padding: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', background: 'white', maxWidth: '400px' }}>
          <h3 style={{ marginTop: 0, fontSize: '1.125rem' }}>Renombrado Múltiple</h3>
          <p style={{ margin: '0.5rem 0 1.5rem' }}>
            Hay otras {othersCount} transacciones originales iguales. ¿Renombrar todas a "{currentDesc}"?
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 1rem 0', fontSize: '2.5rem' }}>Transacciones</h1>
          {uncatCount > 0 && (
            <div style={{ display: 'inline-block', backgroundColor: '#fef08a', color: '#854d0e', padding: '0.5rem 1rem', borderRadius: '2rem', border: '2px solid black', fontWeight: 800, fontSize: '0.875rem' }}>
              Faltan {uncatCount} transacciones por clasificar
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', backgroundColor: 'white', border: '2px solid black', borderRadius: '2rem', overflow: 'hidden', boxShadow: '4px 4px 0px black' }}>
          <button 
            onClick={() => setViewMode('individual')}
            style={{ padding: '0.75rem 1.5rem', border: 'none', background: viewMode === 'individual' ? 'black' : 'transparent', color: viewMode === 'individual' ? 'white' : 'black', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.1s' }}
          >
            Lista Individual
          </button>
          <button 
            onClick={() => setViewMode('bulk')}
            style={{ padding: '0.75rem 1.5rem', border: 'none', background: viewMode === 'bulk' ? 'black' : 'transparent', color: viewMode === 'bulk' ? 'white' : 'black', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.1s', borderLeft: '2px solid black' }}
          >
            Categorización Masiva ✨
          </button>
          <button 
            onClick={() => setViewMode('assistant')}
            style={{ padding: '0.75rem 1.5rem', border: 'none', background: viewMode === 'assistant' ? 'black' : 'transparent', color: viewMode === 'assistant' ? 'white' : 'black', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', transition: 'all 0.1s', borderLeft: '2px solid black' }}
          >
            Asistente Inteligente 🤖
          </button>
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

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '250px', maxWidth: '400px' }}>
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
              style={{ backgroundColor: 'white', width: 'auto', fontWeight: 600 }}
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

          <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', backgroundColor: 'white', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
            <thead style={{ backgroundColor: 'black', color: 'white' }}>
              <tr>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Descripción Base</th>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Cant.</th>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Monto Acumulado</th>
                <th style={{ padding: '1rem', fontWeight: 800 }}>Clasificar como...</th>
              </tr>
            </thead>
            <tbody>
              {bulkGroups.map((group) => (
                <tr key={`${group.name}-${group.type}`} style={{ borderBottom: '2px solid black' }}>
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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header filtros */}
          <div style={{ padding: '1.5rem', backgroundColor: '#f1f5f9', borderBottom: '2px solid black', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '150px', position: 'relative' }}>
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
                style={{ width: '100%', paddingLeft: '3rem' }}
              />
            </div>
            
            <select className="input" style={{ width: 'auto' }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="all">Todos los años</option>
              {availableYears.map(y => <option key={y} value={y.toString()}>{y}</option>)}
            </select>
            
            <select className="input" style={{ width: 'auto' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="all">Todos los meses</option>
              {Array.from({length: 12}, (_, i) => <option key={i+1} value={(i+1).toString()}>{new Date(2000, i, 1).toLocaleString('es-CL', { month: 'long' })}</option>)}
            </select>

            <select className="input" style={{ width: 'auto' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">Ingresos y Egresos</option>
              <option value="expense">Solo Egresos</option>
              <option value="income">Solo Ingresos</option>
            </select>
            
            <select className="input" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">Todas las transacciones</option>
              <option value="classified">Clasificadas</option>
              <option value="unclassified">Por clasificar</option>
            </select>

            <select className="input" style={{ width: 'auto' }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="all">Todas las categorías</option>
              <option disabled>──────────</option>
              <option value="Egreso">Egreso</option>
              <option value="Ingreso">Ingreso</option>
              <option value="Movimiento Interno">Mov. Interno</option>
              <option value="Ahorro/Inversión">Ahorro/Inversión</option>
            </select>
          </div>

          <div style={{ overflowX: 'hidden' }}>
            <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '100%' }}>
              <thead style={{ backgroundColor: 'black', color: 'white' }}>
                <tr>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Fecha</th>
                  <th style={{ padding: '1rem', fontWeight: 800, width: '30%' }}>Descripción (Editable)</th>
                  <th style={{ padding: '1rem', fontWeight: 800 }}>Monto</th>
                  <th style={{ padding: '1rem', fontWeight: 800, width: '40%' }}>Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx, i) => {
                  const rawDescKey = tx.raw_data ? Object.keys(tx.raw_data).find(k => k.toLowerCase().includes('descripc')) || '' : '';
                  const rawDesc = tx.raw_data ? tx.raw_data[rawDescKey] : '';

                  return (
                    <tr key={tx.id} style={{ borderBottom: '2px solid black', backgroundColor: i % 2 === 0 ? 'white' : 'rgba(0,0,0,0.02)' }} className="table-row">
                      <td data-label="Fecha" style={{ padding: '1rem', fontWeight: 600 }}>{tx.date}</td>
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
                        {rawDesc && tx.description !== rawDesc && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                            Orig: {rawDesc}
                          </div>
                        )}
                      </td>
                      <td data-label="Monto" style={{ padding: '1rem', fontWeight: 800, color: tx.type === 'ingreso' ? 'var(--success)' : 'var(--danger)' }}>
                        {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(tx.amount)}
                      </td>
                      <td data-label="Clasificación" style={{ padding: '1rem' }}>
                        <CascadingCategorySelector 
                          initialTipo={tx.tipo_movimiento}
                          initialPrincipal={tx.categoria_principal}
                          initialSecundaria={tx.categoria_secundaria}
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
            <div style={{ padding: '1rem', borderTop: '2px solid black', display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
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
    </div>
  );
}
