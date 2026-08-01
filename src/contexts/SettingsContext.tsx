import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './authContextValue';
import {
  SettingsContext,
  type ClassificationRule,
  type CustomCategory,
  type FixedExpense,
} from './settingsContextValue';

const FIXED_EXPENSES_KEY = '__fixed_expenses';

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  
  // Guardamos el JSONB completo de user_settings: { [bankName]: CustomCategory[] }
  const [allCustomCategories, setAllCustomCategories] = useState<Record<string, any[]>>({});
  
  const [classificationRules, setClassificationRules] = useState<ClassificationRule[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [userRut, setUserRut] = useState<string | null>(null);

  // Las categorías ahora son transversales (globales) para todos los bancos
  const customCategories: CustomCategory[] = (allCustomCategories['__global'] || []) as CustomCategory[];

  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingSettings(true);
      // 1. Cargar Custom Categories (JSONB completo) y RUT
      const { data: settingsData } = await supabase
        .from('user_settings')
        .select('custom_categories, rut')
        .eq('user_id', user.id)
        .maybeSingle();

      setUserRut(settingsData?.rut || null);

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

      // 2. Cargar Rules transversales (ignoramos el banco activo para las reglas)
      const { data: rulesData } = await supabase
        .from('classification_rules')
        .select('*')
        .eq('user_id', user.id);

      if (rulesData && rulesData.length > 0) {
        const globalRulesMap = new Map();
        rulesData.forEach(r => {
          const keyword = r.condition_value.toLowerCase();
          if (!globalRulesMap.has(keyword)) {
            globalRulesMap.set(keyword, {
              id: r.id,
              keyword: r.condition_value,
              tipo_movimiento: r.category_tipo,
              categoria_principal: r.category_principal,
              categoria_secundaria: r.category_secundaria
            });
          }
        });
        setClassificationRules(Array.from(globalRulesMap.values()));
      } else {
        // Intentar migrar desde localStorage si no hay reglas en BD
        const localRulesStr = localStorage.getItem('finanzas_classification_rules');
        if (localRulesStr) {
          try {
            const localRules = JSON.parse(localRulesStr);
            if (localRules && localRules.length > 0) {
              const normalizedRules = localRules.map((rule: any) => ({
                ...rule,
                id: crypto.randomUUID()
              }));
              const inserts = normalizedRules.map((r: ClassificationRule) => ({
                id: r.id,
                user_id: user.id,
                bank: 'global',
                condition_type: 'contains',
                condition_value: r.keyword,
                category_tipo: r.tipo_movimiento,
                category_principal: r.categoria_principal,
                category_secundaria: r.categoria_secundaria || ''
              }));
              const { error } = await supabase.from('classification_rules').insert(inserts);
              if (error) throw error;
              setClassificationRules(normalizedRules);
              localStorage.removeItem('finanzas_classification_rules');
            }
          } catch (err) {
            console.error('Failed to parse local rules', err);
          }
        } else {
          setClassificationRules([]);
        }
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoadingSettings(false);
    }
  }, [user]);

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
    
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, custom_categories: newAllCats }, { onConflict: 'user_id' });
    if (error) throw error;

    setAllCustomCategories(newAllCats);
  };

  const saveFixedExpenses = async (items: FixedExpense[]) => {
    if (!user) return;

    const newAllCats = {
      ...allCustomCategories,
      [FIXED_EXPENSES_KEY]: items
    };

    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, custom_categories: newAllCats }, { onConflict: 'user_id' });
    if (error) throw error;

    setFixedExpenses(items);
    setAllCustomCategories(newAllCats);
  };

  const saveClassificationRules = async (rules: ClassificationRule[]) => {
    if (!user) return;

    if (rules.length > 0) {
      const inserts = rules.map(r => ({
        id: r.id,
        user_id: user.id,
        bank: 'global',
        condition_type: 'contains',
        condition_value: r.keyword,
        category_tipo: r.tipo_movimiento,
        category_principal: r.categoria_principal,
        category_secundaria: r.categoria_secundaria
      }));

      const { error } = await supabase
        .from('classification_rules')
        .upsert(inserts, { onConflict: 'id' });
      if (error) throw error;
    }

    const { data: storedRules, error: storedRulesError } = await supabase
      .from('classification_rules')
      .select('id')
      .eq('user_id', user.id);
    if (storedRulesError) throw storedRulesError;

    const ruleIds = new Set(rules.map(rule => rule.id));
    const idsToDelete = (storedRules || [])
      .map(rule => rule.id)
      .filter(id => !ruleIds.has(id));

    if (idsToDelete.length > 0) {
      const { error } = await supabase
        .from('classification_rules')
        .delete()
        .eq('user_id', user.id)
        .in('id', idsToDelete);
      if (error) throw error;
    }

    setClassificationRules(rules);
  };

  const saveUserRut = async (rut: string) => {
    if (!user) return false;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, rut }, { onConflict: 'user_id' });
    if (error) return false;
    setUserRut(rut);
    return true;
  };

  return (
    <SettingsContext.Provider value={{ 
      customCategories, 
      saveCustomCategories, 
      classificationRules,
      setClassificationRules, 
      saveClassificationRules,
      fixedExpenses,
      saveFixedExpenses,
      loadingSettings,
      userRut,
      saveUserRut
    }}>
      {children}
    </SettingsContext.Provider>
  );
};
