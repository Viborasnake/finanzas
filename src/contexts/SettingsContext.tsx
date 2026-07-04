import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

export interface CustomCategory {
  tipo: string;
  principal: string;
  secundarias: string[];
}

interface SettingsContextType {
  customCategories: CustomCategory[];
  saveCustomCategories: (cats: CustomCategory[]) => Promise<void>;
  loadingSettings: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  customCategories: [],
  saveCustomCategories: async () => {},
  loadingSettings: true,
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('custom_categories')
        .eq('user_id', user!.id)
        .maybeSingle();

      setCustomCategories(data?.custom_categories || []);
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoadingSettings(false);
    }
  };

  const saveCustomCategories = async (cats: CustomCategory[]) => {
    setCustomCategories(cats);
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user!.id,
      custom_categories: cats,
    }, { onConflict: 'user_id' });
    if (error) console.error('Error saving custom categories:', error);
  };

  return (
    <SettingsContext.Provider value={{ customCategories, saveCustomCategories, loadingSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
