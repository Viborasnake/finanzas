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

interface SettingsContextType {
  customCategories: CustomCategory[];
  saveCustomCategories: (cats: CustomCategory[], targetBank?: string) => Promise<void>;
  classificationRules: ClassificationRule[];
  saveClassificationRules: (rules: ClassificationRule[], targetBank?: string) => Promise<void>;
  loadingSettings: boolean;
  copySettingsFromBank: (sourceBank: string, targetBank: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  customCategories: [],
  saveCustomCategories: async () => {},
  classificationRules: [],
  saveClassificationRules: async () => {},
  loadingSettings: true,
  copySettingsFromBank: async () => {},
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { activeBank } = useBanks();
  
  // Guardamos el JSONB completo de user_settings: { [bankName]: CustomCategory[] }
  const [allCustomCategories, setAllCustomCategories] = useState<Record<string, CustomCategory[]>>({});
  
  const [classificationRules, setClassificationRules] = useState<ClassificationRule[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Derivamos las categorías del banco activo
  const customCategories = activeBank ? (allCustomCategories[activeBank] || []) : [];

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
      setAllCustomCategories(cats);

      // 2. Cargar Rules para el banco activo si existe
      if (activeBank) {
        const { data: rulesData } = await supabase
          .from('classification_rules')
          .select('*')
          .eq('user_id', user.id)
          .eq('bank', activeBank);

        if (rulesData) {
          setClassificationRules(rulesData.map(r => ({
            id: r.id,
            keyword: r.condition_value,
            tipo_movimiento: r.category_tipo,
            categoria_principal: r.category_principal,
            categoria_secundaria: r.category_secundaria
          })));
        } else {
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

  const saveCustomCategories = async (cats: CustomCategory[], targetBank?: string) => {
    const bankToSave = targetBank || activeBank;
    if (!user || !bankToSave) return;
    
    const newAllCats = {
      ...allCustomCategories,
      [bankToSave]: cats
    };
    
    setAllCustomCategories(newAllCats);
    
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      custom_categories: newAllCats,
    }, { onConflict: 'user_id' });
    
    if (error) console.error('Error saving custom categories:', error);
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
    
    // 1. Copy categories
    const sourceCats = allCustomCategories[sourceBank] || [];
    await saveCustomCategories(sourceCats, targetBank);

    // 2. Fetch and copy rules
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
      loadingSettings,
      copySettingsFromBank
    }}>
      {children}
    </SettingsContext.Provider>
  );
};
