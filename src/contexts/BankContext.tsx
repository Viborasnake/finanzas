import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './authContextValue';
import { BankContext, type Bank, type DashboardBankScope } from './bankContextValue';

export const BankProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [connectedBanks, setConnectedBanks] = useState<Bank[]>([]);
  const [activeBank, setActiveBankState] = useState<Bank | null>(null);
  const [dashboardScope, setDashboardScopeState] = useState<DashboardBankScope>('all');
  const [mainBank, setMainBankState] = useState<Bank | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBanks = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_settings')
        .select('banks, main_bank')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;

      const banks: Bank[] = data?.banks || [];
      const main: Bank | null = data?.main_bank || null;

      setConnectedBanks(banks);
      setMainBankState(main);
      
      const savedActive = localStorage.getItem(`finanzas_active_bank_${user.id}`) as Bank | null;
      const savedDashboardScope = localStorage.getItem(`finanzas_dashboard_scope_${user.id}`) as DashboardBankScope | null;
      if (savedActive && banks.includes(savedActive)) {
        setActiveBankState(savedActive);
      } else {
        setActiveBankState(main || banks[0] || null);
      }

      if (savedDashboardScope === 'all' && banks.length > 1) {
        setDashboardScopeState('all');
      } else if (savedDashboardScope && banks.includes(savedDashboardScope as Bank)) {
        setDashboardScopeState(savedDashboardScope);
      } else {
        setDashboardScopeState(banks.length > 1 ? 'all' : (main || banks[0] || 'all'));
      }
    } catch (e) {
      console.error('Error loading banks:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadBanks();
      return;
    }

    setConnectedBanks([]);
    setActiveBankState(null);
    setDashboardScopeState('all');
    setMainBankState(null);
    setLoading(false);
  }, [loadBanks, user]);

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
    await saveBanks(updated, newMain);

    setConnectedBanks(updated);
    if (!mainBank) {
      setMainBankState(bank);
      setActiveBankState(bank);
      setDashboardScopeState(bank);
    }
  };

  const removeBank = async (bank: Bank) => {
    const updated = connectedBanks.filter(b => b !== bank);
    const newMain = mainBank === bank ? (updated[0] || null) : mainBank;
    await saveBanks(updated, newMain);

    setConnectedBanks(updated);
    setMainBankState(newMain);
    if (activeBank === bank) setActiveBankState(newMain);
    if (dashboardScope === bank || (dashboardScope === 'all' && updated.length <= 1)) {
      setDashboardScopeState(updated.length > 1 ? 'all' : (newMain || updated[0] || 'all'));
    }
  };

  const setMainBankAndSave = async (bank: Bank) => {
    await saveBanks(connectedBanks, bank);
    setMainBankState(bank);
    setActiveBank(bank);
  };

  const saveBankSetup = async (banks: Bank[], requestedMain: Bank) => {
    const uniqueBanks = Array.from(new Set(banks));
    if (uniqueBanks.length === 0) throw new Error('Debes seleccionar al menos un banco.');

    const selectedMain = uniqueBanks.includes(requestedMain) ? requestedMain : uniqueBanks[0];
    await saveBanks(uniqueBanks, selectedMain);

    const nextScope: DashboardBankScope = uniqueBanks.length > 1 ? 'all' : selectedMain;
    setConnectedBanks(uniqueBanks);
    setMainBankState(selectedMain);
    setActiveBankState(selectedMain);
    setDashboardScopeState(nextScope);

    if (user) {
      localStorage.setItem(`finanzas_active_bank_${user.id}`, selectedMain);
      localStorage.setItem(`finanzas_dashboard_scope_${user.id}`, nextScope);
    }
  };

  const setActiveBank = (bank: Bank) => {
    setActiveBankState(bank);
    if (user) {
      localStorage.setItem(`finanzas_active_bank_${user.id}`, bank);
    }
  };

  const setDashboardScope = (scope: DashboardBankScope) => {
    setDashboardScopeState(scope);
    if (scope !== 'all') setActiveBank(scope);
    if (user) {
      localStorage.setItem(`finanzas_dashboard_scope_${user.id}`, scope);
    }
  };

  return (
    <BankContext.Provider value={{ connectedBanks, activeBank, dashboardScope, mainBank, setActiveBank, setDashboardScope, addBank, removeBank, setMainBankAndSave, saveBankSetup, loading }}>
      {children}
    </BankContext.Provider>
  );
};
