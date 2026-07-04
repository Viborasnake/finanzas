import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

export type Bank = 'BancoEstado' | 'Scotiabank' | 'Itaú';

export const AVAILABLE_BANKS: { id: Bank; label: string; color: string; emoji: string }[] = [
  { id: 'BancoEstado', label: 'BancoEstado', color: '#e63946', emoji: '🏦' },
  { id: 'Scotiabank', label: 'Scotiabank', color: '#e63000', emoji: '🔴' },
  { id: 'Itaú',       label: 'Itaú',       color: '#f77f00', emoji: '🟠' },
];

interface BankContextType {
  connectedBanks: Bank[];
  activeBank: Bank | null;
  mainBank: Bank | null;
  setActiveBank: (bank: Bank) => void;
  addBank: (bank: Bank) => Promise<void>;
  removeBank: (bank: Bank) => Promise<void>;
  setMainBankAndSave: (bank: Bank) => Promise<void>;
  loading: boolean;
}

const BankContext = createContext<BankContextType>({
  connectedBanks: [],
  activeBank: null,
  mainBank: null,
  setActiveBank: () => {},
  addBank: async () => {},
  removeBank: async () => {},
  setMainBankAndSave: async () => {},
  loading: true,
});

export const useBanks = () => useContext(BankContext);

export const BankProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [connectedBanks, setConnectedBanks] = useState<Bank[]>([]);
  const [activeBank, setActiveBankState] = useState<Bank | null>(null);
  const [mainBank, setMainBankState] = useState<Bank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadBanks();
    }
  }, [user]);

  const loadBanks = async () => {
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('banks, main_bank')
        .eq('user_id', user!.id)
        .maybeSingle();

      const banks: Bank[] = data?.banks || [];
      const main: Bank | null = data?.main_bank || null;

      setConnectedBanks(banks);
      setMainBankState(main);
      setActiveBankState(main || banks[0] || null);
    } catch (e) {
      console.error('Error loading banks:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveBanks = async (banks: Bank[], main: Bank | null) => {
    await supabase.from('user_settings').upsert({
      user_id: user!.id,
      banks,
      main_bank: main,
    }, { onConflict: 'user_id' });
  };

  const addBank = async (bank: Bank) => {
    if (connectedBanks.includes(bank)) return;
    const updated = [...connectedBanks, bank];
    const newMain = mainBank || bank;
    setConnectedBanks(updated);
    if (!mainBank) {
      setMainBankState(bank);
      setActiveBankState(bank);
    }
    await saveBanks(updated, newMain);
  };

  const removeBank = async (bank: Bank) => {
    const updated = connectedBanks.filter(b => b !== bank);
    const newMain = mainBank === bank ? (updated[0] || null) : mainBank;
    setConnectedBanks(updated);
    setMainBankState(newMain);
    if (activeBank === bank) setActiveBankState(newMain);
    await saveBanks(updated, newMain);
  };

  const setMainBankAndSave = async (bank: Bank) => {
    setMainBankState(bank);
    setActiveBankState(bank);
    await saveBanks(connectedBanks, bank);
  };

  const setActiveBank = (bank: Bank) => {
    setActiveBankState(bank);
  };

  return (
    <BankContext.Provider value={{ connectedBanks, activeBank, mainBank, setActiveBank, addBank, removeBank, setMainBankAndSave, loading }}>
      {children}
    </BankContext.Provider>
  );
};
