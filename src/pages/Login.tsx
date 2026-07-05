import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBanks, AVAILABLE_BANKS } from '../contexts/BankContext';
import type { Bank } from '../contexts/BankContext';

type Step = 'auth' | 'bank_setup' | 'verify_email';

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
  const { addBank, setMainBankAndSave, connectedBanks, loading: banksLoading } = useBanks();

  // If already logged in and not in setup, redirect or show bank setup
  useEffect(() => {
    if (user && step === 'auth' && !banksLoading) {
      if (connectedBanks.length === 0) {
        setStep('bank_setup');
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [user, step, banksLoading, connectedBanks, navigate]);

  if (user && step === 'auth') {
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
        // Move to verify email step
        setStep('verify_email');
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
                    border: `2px solid ${isSelected ? '#000' : '#e2e8f0'}`,
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

  // --- Verify Email Step ---
  if (step === 'verify_email') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#fdfdfc', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ width: '100%', maxWidth: '420px', textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✉️</div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '1rem', letterSpacing: '-1px' }}>Revisa tu correo</h2>
          <p style={{ color: '#64748b', fontWeight: 600, fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
            Te hemos enviado un enlace de confirmación a <strong>{email}</strong>. 
            Haz clic en él para validar tu cuenta y comenzar a usar MisFinanzas.
          </p>
          <button
            onClick={() => setStep('auth')}
            className="btn btn-outline"
            style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', border: '2px solid black' }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // --- Auth Step ---
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#fdfdfc' }}>
      {/* Left Column (Marketing) */}
      <div 
        className="auth-left-col" 
        style={{ 
          flex: 1, 
          backgroundColor: 'var(--pastel-blue)', 
          borderRight: '2px solid black', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '3rem 4rem',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Background decorative circles typical of neobrutalism/modern design */}
        <div style={{ position: 'absolute', top: '-10%', right: '-10%', width: '400px', height: '400px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
        <div style={{ position: 'absolute', bottom: '-5%', left: '-10%', width: '300px', height: '300px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>

        <div style={{ fontWeight: 900, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 'auto', position: 'relative', zIndex: 10 }}>
          <div style={{ background: 'black', color: 'white', padding: '0.2rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>✨</span>
          </div>
          MisFinanzas
        </div>
        
        <div style={{ marginBottom: 'auto', maxWidth: '500px', position: 'relative', zIndex: 10 }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1.1, marginBottom: '1.5rem', letterSpacing: '-2px' }}>
            Tu dinero bajo<br />tu control.
          </h1>
          <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '3rem', color: 'rgba(0,0,0,0.7)' }}>
            Conectamos todas tus cartolas bancarias en un solo lugar con inteligencia artificial.
          </p>
          
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1rem', fontWeight: 700 }}>
              <div style={{ background: 'transparent', border: '2px solid black', borderRadius: '50%', padding: '0.25rem', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              Categorización masiva en segundos
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1rem', fontWeight: 700 }}>
              <div style={{ background: 'transparent', border: '2px solid black', borderRadius: '50%', padding: '0.25rem', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              Análisis de flujo de caja real
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1rem', fontWeight: 700 }}>
              <div style={{ background: 'transparent', border: '2px solid black', borderRadius: '50%', padding: '0.25rem', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              Identifica gastos hormiga automáticamente
            </li>
          </ul>
        </div>

        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(0,0,0,0.5)', position: 'relative', zIndex: 10 }}>
          © 2026 MisFinanzas · Hecho con ❤️ en Chile
        </div>
      </div>

      {/* Right Column (Auth) */}
      <div 
        style={{ 
          flex: 1, 
          backgroundColor: '#fdfdfc', 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '2rem' 
        }}
      >
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: '2rem', border: '2px solid black', marginBottom: '2.5rem', padding: '0.25rem', boxShadow: '4px 4px 0px black' }}>
            <button 
              onClick={() => { setIsSignUp(false); setError(null); }}
              style={{ flex: 1, padding: '0.75rem', borderRadius: '1.5rem', background: !isSignUp ? 'var(--pastel-blue)' : 'transparent', color: 'black', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.1s', border: !isSignUp ? '2px solid black' : '2px solid transparent' }}
            >
              Iniciar sesión
            </button>
            <button 
              onClick={() => { setIsSignUp(true); setError(null); }}
              style={{ flex: 1, padding: '0.75rem', borderRadius: '1.5rem', background: isSignUp ? 'var(--pastel-blue)' : 'transparent', color: 'black', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.1s', border: isSignUp ? '2px solid black' : '2px solid transparent' }}
            >
              Registrarse
            </button>
          </div>

          {/* Form Card */}
          <div className="card" style={{ width: '100%', padding: '2.5rem 2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 900 }}>
              {isSignUp ? 'Crear cuenta' : 'Bienvenido de nuevo'}
            </h2>
            <p style={{ color: '#64748b', fontWeight: 600, fontSize: '0.875rem', marginBottom: '2rem' }}>
              {isSignUp ? 'Solo toma un minuto.' : 'Ingresa tus credenciales para continuar.'}
            </p>
            
            {error && (
              <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '2px solid black', boxShadow: '2px 2px 0px black', fontWeight: 600, fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Email</label>
                <div style={{ position: 'relative' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                    <rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m2 7 10 7 10-7"></path>
                  </svg>
                  <input 
                    type="email" 
                    className="input" 
                    placeholder="tu@email.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ paddingLeft: '3rem', width: '100%', borderRadius: '8px' }}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.05em' }}>Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input 
                    type="password" 
                    className="input" 
                    placeholder={isSignUp ? "Mínimo 6 caracteres" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '3rem', width: '100%', borderRadius: '8px' }}
                    required
                    minLength={isSignUp ? 6 : undefined}
                  />
                </div>
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.9rem', padding: '0.875rem', backgroundColor: 'var(--pastel-blue)', color: 'black', border: '2px solid black' }}
                disabled={loading}
              >
                {loading ? 'Cargando...' : (isSignUp ? 'Crear cuenta gratis' : 'Entrar a mi cuenta')}
              </button>
            </form>
          </div>

          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.875rem' }}>
              {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
            </span>
            {' '}
            <button 
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              style={{ fontWeight: 800, color: 'var(--success)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
              disabled={loading}
            >
              {isSignUp ? 'Inicia sesión' : 'Regístrate gratis'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
