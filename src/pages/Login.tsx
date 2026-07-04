import { useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBanks, AVAILABLE_BANKS } from '../contexts/BankContext';
import type { Bank } from '../contexts/BankContext';

type Step = 'auth' | 'bank_setup';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('auth');

  // Bank setup step
  const [selectedBanks, setSelectedBanks] = useState<Bank[]>([]);
  const [mainBankChoice, setMainBankChoice] = useState<Bank | null>(null);
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addBank, setMainBankAndSave } = useBanks();

  // If already logged in and not in setup, redirect
  if (user && step === 'auth') {
    navigate('/', { replace: true });
    return null;
  }

  const toggleBankSelection = (bank: Bank) => {
    setSelectedBanks(prev => {
      const next = prev.includes(bank) ? prev.filter(b => b !== bank) : [...prev, bank];
      // Auto-set main if only one selected or none set
      if (next.length === 1) setMainBankChoice(next[0]);
      else if (!next.includes(mainBankChoice!)) setMainBankChoice(next[0] ?? null);
      return next;
    });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Move to bank setup step
        setStep('bank_setup');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error al autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleBankSetup = async () => {
    if (selectedBanks.length === 0) {
      toast.error('Selecciona al menos un banco');
      return;
    }
    setLoading(true);
    try {
      for (const bank of selectedBanks) {
        await addBank(bank);
      }
      if (mainBankChoice) {
        await setMainBankAndSave(mainBankChoice);
      }
      toast.success('¡Configuración guardada!');
      navigate('/');
    } catch (err) {
      toast.error('Error guardando configuración');
    } finally {
      setLoading(false);
    }
  };

  // --- Bank Setup Step ---
  if (step === 'bank_setup') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#fdfdfc' }}>
        <div className="card" style={{ width: '100%', maxWidth: '480px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏦</div>
            <h2 style={{ fontSize: '1.75rem', margin: '0 0 0.5rem 0' }}>¿Con qué banco trabajas?</h2>
            <p style={{ color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>
              Selecciona los bancos que quieres integrar. Podrás agregar más desde el menú lateral.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
            {AVAILABLE_BANKS.map(bank => {
              const isSelected = selectedBanks.includes(bank.id);
              const isMain = mainBankChoice === bank.id;
              return (
                <div
                  key={bank.id}
                  onClick={() => toggleBankSelection(bank.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.25rem',
                    border: `3px solid ${isSelected ? '#000' : '#e2e8f0'}`,
                    borderRadius: '12px',
                    backgroundColor: isSelected ? '#f8fafc' : '#fff',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '4px 4px 0px #000' : 'none',
                    transition: 'all 0.15s',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: '2rem' }}>{bank.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: '1rem' }}>{bank.label}</div>
                    {isSelected && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '0.2rem' }}>
                        Integrado ✓
                      </div>
                    )}
                  </div>
                  {isSelected && selectedBanks.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setMainBankChoice(bank.id); }}
                      style={{
                        fontSize: '0.7rem', fontWeight: 800,
                        padding: '0.3rem 0.6rem',
                        border: '2px solid #000',
                        borderRadius: '2rem',
                        backgroundColor: isMain ? '#fde047' : '#f1f5f9',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {isMain ? '⭐ Principal' : 'Hacer principal'}
                    </button>
                  )}
                  {isSelected && isMain && selectedBanks.length === 1 && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.3rem 0.6rem', backgroundColor: '#fde047', border: '2px solid #000', borderRadius: '2rem' }}>
                      ⭐ Principal
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleBankSetup}
            disabled={loading || selectedBanks.length === 0}
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '1rem', padding: '0.875rem', marginBottom: '0.75rem' }}
          >
            {loading ? 'Guardando...' : `Continuar con ${selectedBanks.length > 0 ? selectedBanks.join(' + ') : '...'}`}
          </button>
          <button
            onClick={() => navigate('/')}
            style={{ width: '100%', fontSize: '0.875rem', fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Omitir por ahora
          </button>
        </div>
      </div>
    );
  }

  // --- Auth Step ---
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '2rem' }}>
          MisFinanzas
        </h2>
        
        {error && (
          <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '2px solid black', boxShadow: '2px 2px 0px black', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label className="label">Correo Electrónico</label>
            <input 
              type="email" 
              className="input" 
              placeholder="tu@email.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input 
              type="password" 
              className="input" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ marginTop: '0.5rem', width: '100%', fontSize: '1.125rem', padding: '0.75rem' }}
            disabled={loading}
          >
            {loading ? 'Cargando...' : (isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión')}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ fontWeight: 600, textDecoration: 'underline' }}
            disabled={loading}
          >
            {isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
          </button>
        </div>
      </div>
    </div>
  );
}
