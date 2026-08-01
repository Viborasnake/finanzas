import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';

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

export interface SettingsContextType {
  customCategories: CustomCategory[];
  saveCustomCategories: (cats: CustomCategory[], targetBank?: string) => Promise<void>;
  classificationRules: ClassificationRule[];
  setClassificationRules: Dispatch<SetStateAction<ClassificationRule[]>>;
  saveClassificationRules: (rules: ClassificationRule[], targetBank?: string) => Promise<void>;
  fixedExpenses: FixedExpense[];
  saveFixedExpenses: (items: FixedExpense[]) => Promise<void>;
  loadingSettings: boolean;
  userRut: string | null;
  saveUserRut: (rut: string) => Promise<boolean>;
}

export const SettingsContext = createContext<SettingsContextType>({
  customCategories: [],
  saveCustomCategories: async () => {},
  classificationRules: [],
  setClassificationRules: () => {},
  saveClassificationRules: async () => {},
  fixedExpenses: [],
  saveFixedExpenses: async () => {},
  loadingSettings: true,
  userRut: null,
  saveUserRut: async () => false,
});

export const useSettings = () => useContext(SettingsContext);
