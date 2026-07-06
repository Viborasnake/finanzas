import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './AuthContext';

export type Bank = 'BancoEstado' | 'Scotiabank' | 'Itaú' | 'Mach';

export const AVAILABLE_BANKS: { id: Bank; label: string; color: string; emoji: string }[] = [
  // { id: 'BancoEstado', label: 'BancoEstado', color: '#e63946', emoji: '🏦' },
  { id: 'Scotiabank', label: 'Scotiabank', color: '#e63000', emoji: '🔴' },
  { id: 'Itaú',       label: 'Itaú',       color: '#f77f00', emoji: '🟠' },
  { id: 'Mach',       label: 'Mach',       color: '#a855f7', emoji: '🟣' },
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
      const currentUser = user || (await supabase.auth.getUser()).data.user;
      if (!currentUser) return;

      const { data } = await supabase
        .from('user_settings')
        .select('banks, main_bank')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      const banks: Bank[] = data?.banks || [];
      const main: Bank | null = data?.main_bank || null;

      setConnectedBanks(banks);
      setMainBankState(main);
      
      const savedActive = localStorage.getItem(`finanzas_active_bank_${currentUser.id}`) as Bank | null;
      if (savedActive && banks.includes(savedActive)) {
        setActiveBankState(savedActive);
      } else {
        setActiveBankState(main || banks[0] || null);
      }
    } catch (e) {
      console.error('Error loading banks:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveBanks = async (banks: Bank[], main: Bank | null) => {
    const currentUser = user || (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      console.error('No user found');
      return;
    }
    const { data } = await supabase.from('user_settings').select('user_id').eq('user_id', currentUser.id).maybeSingle();
    if (data) {
      const { error } = await supabase.from('user_settings').update({ banks, main_bank: main }).eq('user_id', currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('user_settings').insert({ user_id: currentUser.id, banks, main_bank: main });
      if (error) throw error;
    }
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
    setActiveBank(bank);
    await saveBanks(connectedBanks, bank);
  };

  const setActiveBank = (bank: Bank) => {
    setActiveBankState(bank);
    if (user) {
      localStorage.setItem(`finanzas_active_bank_${user.id}`, bank);
    }
  };

  return (
    <BankContext.Provider value={{ connectedBanks, activeBank, mainBank, setActiveBank, addBank, removeBank, setMainBankAndSave, loading }}>
      {children}
    </BankContext.Provider>
  );
};
