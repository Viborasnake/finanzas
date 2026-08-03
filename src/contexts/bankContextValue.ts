import { createContext, useContext } from 'react';

export type Bank = 'BancoEstado' | 'Scotiabank' | 'Itaú' | 'Mach' | 'Consorcio';
export type DashboardBankScope = Bank | 'all';

export const AVAILABLE_BANKS: { id: Bank; label: string; color: string; emoji: string }[] = [
  // { id: 'BancoEstado', label: 'BancoEstado', color: '#e63946', emoji: '🏦' },
  { id: 'Scotiabank', label: 'Scotiabank', color: '#e63000', emoji: '🔴' },
  { id: 'Itaú', label: 'Itaú', color: '#f77f00', emoji: '🟠' },
  { id: 'Mach', label: 'Mach', color: '#a855f7', emoji: '🟣' },
  { id: 'Consorcio', label: 'Consorcio', color: '#ff7a00', emoji: '🏦' },
];

export interface BankContextType {
  connectedBanks: Bank[];
  activeBank: Bank | null;
  dashboardScope: DashboardBankScope;
  mainBank: Bank | null;
  setActiveBank: (bank: Bank) => void;
  setDashboardScope: (scope: DashboardBankScope) => void;
  addBank: (bank: Bank) => Promise<void>;
  removeBank: (bank: Bank) => Promise<void>;
  setMainBankAndSave: (bank: Bank) => Promise<void>;
  saveBankSetup: (banks: Bank[], main: Bank) => Promise<void>;
  loading: boolean;
  selectedMonthKey: string;
  setSelectedMonthKey: (key: string) => void;
}

export const BankContext = createContext<BankContextType>({
  connectedBanks: [],
  activeBank: null,
  dashboardScope: 'all',
  mainBank: null,
  setActiveBank: () => {},
  setDashboardScope: () => {},
  addBank: async () => {},
  removeBank: async () => {},
  setMainBankAndSave: async () => {},
  saveBankSetup: async () => {},
  loading: true,
  selectedMonthKey: '',
  setSelectedMonthKey: () => {},
});

export const useBanks = () => useContext(BankContext);
