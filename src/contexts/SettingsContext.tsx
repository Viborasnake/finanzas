import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';
import { useBanks } from './BankContext';

export interface CustomCategory {
  tipo: string;
  principal: string;
  secundarias: string[];
}

export interface ClassificationRule {
  id: string;
  keyword: string;
  tipo_movimiento: string;
  categoria_principal: string;
  categoria_secundaria: string;
}

export interface FixedExpense {
  id: string;
  name: string;
  tipo_movimiento: string | null;
  categoria_principal: string | null;
  categoria_secundaria: string | null;
  keyword?: string;
}

interface SettingsContextType {
  customCategories: CustomCategory[];
  saveCustomCategories: (cats: CustomCategory[], targetBank?: string) => Promise<void>;
  classificationRules: ClassificationRule[];
  saveClassificationRules: (rules: ClassificationRule[], targetBank?: string) => Promise<void>;
  fixedExpenses: FixedExpense[];
  saveFixedExpenses: (items: FixedExpense[]) => Promise<void>;
  loadingSettings: boolean;
  copySettingsFromBank: (sourceBank: string, targetBank: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  customCategories: [],
  saveCustomCategories: async () => {},
  classificationRules: [],
  saveClassificationRules: async () => {},
  fixedExpenses: [],
  saveFixedExpenses: async () => {},
  loadingSettings: true,
  copySettingsFromBank: async () => {},
});

const FIXED_EXPENSES_KEY = '__fixed_expenses';

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { activeBank } = useBanks();
  
  // Guardamos el JSONB completo de user_settings: { [bankName]: CustomCategory[] }
  const [allCustomCategories, setAllCustomCategories] = useState<Record<string, any[]>>({});
  
  const [classificationRules, setClassificationRules] = useState<ClassificationRule[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Las categorías ahora son transversales (globales) para todos los bancos
  const customCategories: CustomCategory[] = (allCustomCategories['__global'] || []) as CustomCategory[];

  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingSettings(true);
      // 1. Cargar Custom Categories (JSONB completo)
      const { data: settingsData } = await supabase
        .from('user_settings')
        .select('custom_categories')
        .eq('user_id', user.id)
        .maybeSingle();

      const cats = settingsData?.custom_categories || {};
      
      // Migrate all existing bank categories into a single transversal list
      const globalCatsMap = new Map();
      Object.keys(cats).forEach(key => {
        if (key !== FIXED_EXPENSES_KEY) {
          (cats[key] || []).forEach((c: CustomCategory) => {
            const id = `${c.tipo}-${c.principal}`;
            if (!globalCatsMap.has(id)) {
              globalCatsMap.set(id, { ...c });
            } else {
              const existing = globalCatsMap.get(id);
              const mergedSecundarias = Array.from(new Set([...existing.secundarias, ...c.secundarias]));
              existing.secundarias = mergedSecundarias;
            }
          });
        }
      });
      
      const newAllCats = {
        [FIXED_EXPENSES_KEY]: Array.isArray(cats[FIXED_EXPENSES_KEY]) ? cats[FIXED_EXPENSES_KEY] : [],
        '__global': Array.from(globalCatsMap.values())
      };

      setAllCustomCategories(newAllCats);
      setFixedExpenses(newAllCats[FIXED_EXPENSES_KEY]);

      // 2. Cargar Rules para el banco activo si existe
      if (activeBank) {
        const { data: rulesData } = await supabase
          .from('classification_rules')
          .select('*')
          .eq('user_id', user.id)
          .eq('bank', activeBank);

        if (rulesData && rulesData.length > 0) {
          setClassificationRules(rulesData.map(r => ({
            id: r.id,
            keyword: r.condition_value,
            tipo_movimiento: r.category_tipo,
            categoria_principal: r.category_principal,
            categoria_secundaria: r.category_secundaria
          })));
        } else {
          // Intentar migrar desde localStorage si no hay reglas en BD
          const localRulesStr = localStorage.getItem('finanzas_classification_rules');
          if (localRulesStr) {
            try {
              const localRules = JSON.parse(localRulesStr);
              if (localRules && localRules.length > 0) {
                const inserts = localRules.map((r: any) => ({
                  user_id: user.id,
                  bank: activeBank,
                  condition_type: 'contains',
                  condition_value: r.keyword,
                  category_tipo: r.tipo_movimiento,
                  category_principal: r.categoria_principal,
                  category_secundaria: r.categoria_secundaria || ''
                }));
                await supabase.from('classification_rules').insert(inserts);
                setClassificationRules(localRules);
                localStorage.removeItem('finanzas_classification_rules');
                return;
              }
            } catch (err) {
              console.error('Failed to parse local rules', err);
            }
          }
          setClassificationRules([]);
        }
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoadingSettings(false);
    }
  }, [user, activeBank]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveCustomCategories = async (cats: CustomCategory[]) => {
    if (!user) return;
    
    // Al guardar, mantenemos los gastos fijos y sobrescribimos todo lo demás en __global
    const newAllCats = {
      [FIXED_EXPENSES_KEY]: allCustomCategories[FIXED_EXPENSES_KEY] || [],
      '__global': cats
    };
    
    setAllCustomCategories(newAllCats);
    
    const { data } = await supabase.from('user_settings').select('user_id').eq('user_id', user.id).maybeSingle();
    
    if (data) {
      const { error } = await supabase.from('user_settings').update({ custom_categories: newAllCats }).eq('user_id', user.id);
      if (error) console.error('Error updating custom categories:', error);
    } else {
      const { error } = await supabase.from('user_settings').insert({ user_id: user.id, custom_categories: newAllCats });
      if (error) console.error('Error inserting custom categories:', error);
    }
  };

  const saveFixedExpenses = async (items: FixedExpense[]) => {
    if (!user) return;

    const newAllCats = {
      ...allCustomCategories,
      [FIXED_EXPENSES_KEY]: items
    };

    setFixedExpenses(items);
    setAllCustomCategories(newAllCats);

    const { data } = await supabase.from('user_settings').select('user_id').eq('user_id', user.id).maybeSingle();

    if (data) {
      const { error } = await supabase.from('user_settings').update({ custom_categories: newAllCats }).eq('user_id', user.id);
      if (error) console.error('Error updating fixed expenses:', error);
    } else {
      const { error } = await supabase.from('user_settings').insert({ user_id: user.id, custom_categories: newAllCats });
      if (error) console.error('Error inserting fixed expenses:', error);
    }
  };

  const saveClassificationRules = async (rules: ClassificationRule[], targetBank?: string) => {
    const bankToSave = targetBank || activeBank;
    if (!user || !bankToSave) return;
    
    if (bankToSave === activeBank) {
      setClassificationRules(rules);
    }

    // Delete existing rules for this bank
    await supabase.from('classification_rules').delete().eq('user_id', user.id).eq('bank', bankToSave);

    if (rules.length > 0) {
      const inserts = rules.map(r => ({
        user_id: user.id,
        bank: bankToSave,
        condition_type: 'contains',
        condition_value: r.keyword,
        category_tipo: r.tipo_movimiento,
        category_principal: r.categoria_principal,
        category_secundaria: r.categoria_secundaria
      }));
      await supabase.from('classification_rules').insert(inserts);
    }
  };

  const copySettingsFromBank = async (sourceBank: string, targetBank: string) => {
    if (!user) return;
    
    // 1. Fetch and copy rules (Categories are now transversal)
    const { data: rulesData } = await supabase
      .from('classification_rules')
      .select('*')
      .eq('user_id', user.id)
      .eq('bank', sourceBank);

    if (rulesData && rulesData.length > 0) {
      const rules = rulesData.map(r => ({
        id: r.id, // ID will be regenerated on insert or ignored by the save function since it deletes first
        keyword: r.condition_value,
        tipo_movimiento: r.category_tipo,
        categoria_principal: r.category_principal,
        categoria_secundaria: r.category_secundaria
      }));
      await saveClassificationRules(rules, targetBank);
    }
  };

  return (
    <SettingsContext.Provider value={{ 
      customCategories, 
      saveCustomCategories, 
      classificationRules, 
      saveClassificationRules,
      fixedExpenses,
      saveFixedExpenses,
      loadingSettings,
      copySettingsFromBank
    }}>
      {children}
    </SettingsContext.Provider>
  );
};
