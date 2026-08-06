import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContextValue';
import { useBanks, AVAILABLE_BANKS, type Bank } from '../contexts/bankContextValue';
import LaikaPet from '../components/LaikaPet';

type Step = 'auth' | 'bank_setup' | 'verify_email';

const getAuthErrorMessage = (message?: string) => {
  const normalized = (message || '').toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'El correo o la contraseña no coinciden.';
  if (normalized.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (normalized.includes('user already registered')) return 'Ya existe una cuenta con este correo.';
  if (normalized.includes('email rate limit')) return 'Espera unos minutos antes de solicitar otro correo.';
  return 'No pudimos completar la solicitud. Inténtalo nuevamente.';
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('auth');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const loginTabRef = useRef<HTMLButtonElement>(null);
  const signupTabRef = useRef<HTMLButtonElement>(null);

  // Bank setup step
  const [selectedBanks, setSelectedBanks] = useState<Bank[]>([]);
  const [mainBankChoice, setMainBankChoice] = useState<Bank | null>(null);
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const { saveBankSetup, connectedBanks, loading: banksLoading } = useBanks();

  const selectAuthMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setError(null);
  };

  const handleAuthTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextIsSignUp: boolean | null = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'End') {
      nextIsSignUp = true;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home') {
      nextIsSignUp = false;
    }

    if (nextIsSignUp === null) return;
    event.preventDefault();
    selectAuthMode(nextIsSignUp);
    window.requestAnimationFrame(() => {
      (nextIsSignUp ? signupTabRef : loginTabRef).current?.focus();
    });
  };

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
      setError(getAuthErrorMessage(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (resetError) throw resetError;
      setRecoverySent(true);
    } catch (err: any) {
      setError(getAuthErrorMessage(err.message));
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
      await saveBankSetup(selectedBanks, mainBankChoice || selectedBanks[0]);
      toast.success('¡Configuración guardada!');
      navigate('/');
    } catch (error) {
      console.error('Error guardando configuración bancaria:', error);
      toast.error('Error guardando configuración');
    } finally {
      setLoading(false);
    }
  };

  // --- Bank Setup Step ---
  if (step === 'bank_setup') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: 'var(--bg-color)' }}>
        <div className="card" style={{ width: '100%', maxWidth: '480px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <LaikaPet pose="pointing" size={128} title="Laika te ayuda a elegir banco" />
            </div>
            <h2 style={{ fontSize: '1.75rem', margin: '0 0 0.5rem 0' }}>¿Con qué banco trabajas?</h2>
            <p style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem' }}>
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
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleBankSelection(bank.id);
                    }
                  }}
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={`Integrar ${bank.label}`}
                  tabIndex={0}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    padding: '1rem 1.25rem',
                    border: `2px solid ${isSelected ? 'var(--border-color)' : 'var(--surface-disabled)'}`,
                    borderRadius: '12px',
                    backgroundColor: isSelected ? 'var(--surface-subtle)' : 'var(--surface-color)',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '4px 4px 0px var(--border-color)' : 'none',
                    transition: 'all 0.15s',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: '2rem' }}>{bank.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: '1rem' }}>{bank.label}</div>
                    {isSelected && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: '0.2rem' }}>
                        Integrado ✓
                      </div>
                    )}
                  </div>
                  {isSelected && selectedBanks.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setMainBankChoice(bank.id); }}
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-pressed={isMain}
                      style={{
                        fontSize: '0.7rem', fontWeight: 800,
                        padding: '0.3rem 0.6rem',
                        border: '2px solid var(--border-color)',
                        borderRadius: '2rem',
                        backgroundColor: isMain ? 'var(--warning-soft)' : 'var(--surface-subtle)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {isMain ? '⭐ Principal' : 'Hacer principal'}
                    </button>
                  )}
                  {isSelected && isMain && selectedBanks.length === 1 && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '0.3rem 0.6rem', backgroundColor: 'var(--warning-soft)', border: '2px solid var(--border-color)', borderRadius: '2rem' }}>
                      ⭐ Principal
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleBankSetup}
            disabled={loading || selectedBanks.length === 0}
            aria-busy={loading}
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '1rem', padding: '0.875rem', marginBottom: '0.75rem' }}
          >
            {loading ? 'Guardando...' : `Continuar con ${selectedBanks.length > 0 ? selectedBanks.join(' + ') : '...'}`}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ width: '100%', minHeight: '44px', fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
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
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-color)', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="card" style={{ width: '100%', maxWidth: '420px', textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <LaikaPet pose="love" size={136} title="Laika celebra tu registro" />
          </div>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '1rem' }}>Revisa tu correo</h2>
          <p style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.6 }}>
            Te hemos enviado un enlace de confirmación a <strong>{email}</strong>. 
            Haz clic en él para validar tu cuenta y comenzar a usar MisFinanzas.
          </p>
          <button
            type="button"
            onClick={() => setStep('auth')}
            className="btn btn-outline"
            style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', border: '2px solid var(--border-color)' }}
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // --- Auth Step ---
  return (
    <div className="auth-shell" style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      {/* Left Column (Marketing) */}
      <div 
        className="auth-left-col" 
        style={{ 
          flex: 1, 
          backgroundColor: 'var(--pastel-blue)', 
          borderRight: '2px solid var(--border-color)', 
          display: 'flex', 
          flexDirection: 'column',
          padding: '3rem 4rem',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ fontWeight: 900, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 'auto', position: 'relative', zIndex: 10 }}>
          <div style={{ background: 'var(--border-color)', color: 'var(--bg-color)', padding: '0.2rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>✨</span>
          </div>
          MisFinanzas
        </div>
        
        <div style={{ marginBottom: 'auto', maxWidth: '500px', position: 'relative', zIndex: 10 }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 900, lineHeight: 1.1, marginBottom: '1.5rem' }}>
            Tu dinero bajo<br />tu control.
          </h1>
          <p style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '3rem', color: 'var(--text-secondary)' }}>
            Conectamos todas tus cartolas bancarias en un solo lugar con inteligencia artificial.
          </p>
          
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1rem', fontWeight: 700 }}>
              <div style={{ background: 'transparent', border: '2px solid var(--border-color)', borderRadius: '50%', padding: '0.25rem', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              Clasificación asistida en segundos
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1rem', fontWeight: 700 }}>
              <div style={{ background: 'transparent', border: '2px solid var(--border-color)', borderRadius: '50%', padding: '0.25rem', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              Análisis de flujo de caja real
            </li>
            <li style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1rem', fontWeight: 700 }}>
              <div style={{ background: 'transparent', border: '2px solid var(--border-color)', borderRadius: '50%', padding: '0.25rem', display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              Identifica gastos hormiga automáticamente
            </li>
          </ul>
        </div>

        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', position: 'relative', zIndex: 10 }}>
          © 2026 MisFinanzas · Hecho en Chile
        </div>
      </div>

      {/* Right Column (Auth) */}
      <div 
        className="auth-form-col"
        style={{ 
          flex: 1, 
          backgroundColor: 'var(--bg-color)', 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '2rem' 
        }}
      >
        <div className="auth-form-inner" style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <LaikaPet pose={isPasswordRecovery ? 'love' : (isSignUp ? 'pointing' : 'welcome')} size={136} title="Laika te da la bienvenida" />
          </div>

          {/* Tabs */}
          {!isPasswordRecovery && (
            <div className="auth-tabs" role="tablist" aria-label="Acceso a MisFinanzas" style={{ display: 'flex', backgroundColor: 'var(--surface-color)', borderRadius: '999px', border: '2px solid var(--border-color)', marginBottom: '2.5rem', padding: '0.25rem', boxShadow: '4px 4px 0px var(--shadow-color)' }}>
              <button
                type="button"
                role="tab"
                id="auth-tab-login"
                ref={loginTabRef}
                aria-selected={!isSignUp}
                aria-controls="auth-panel"
                tabIndex={!isSignUp ? 0 : -1}
                onClick={() => selectAuthMode(false)}
                onKeyDown={handleAuthTabKeyDown}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '1.5rem', background: !isSignUp ? 'var(--pastel-blue)' : 'transparent', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.1s', border: !isSignUp ? '2px solid var(--border-color)' : '2px solid transparent' }}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                role="tab"
                id="auth-tab-signup"
                ref={signupTabRef}
                aria-selected={isSignUp}
                aria-controls="auth-panel"
                tabIndex={isSignUp ? 0 : -1}
                onClick={() => selectAuthMode(true)}
                onKeyDown={handleAuthTabKeyDown}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '1.5rem', background: isSignUp ? 'var(--pastel-blue)' : 'transparent', color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer', transition: 'all 0.1s', border: isSignUp ? '2px solid var(--border-color)' : '2px solid transparent' }}
              >
                Registrarse
              </button>
            </div>
          )}

          {/* Form Card */}
          <div
            id="auth-panel"
            role="tabpanel"
            aria-labelledby={isSignUp ? 'auth-tab-signup' : 'auth-tab-login'}
            className="card auth-form-card"
            style={{ width: '100%', padding: '2.5rem 2rem' }}
          >
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', fontWeight: 900 }}>
              {isPasswordRecovery ? 'Recupera tu acceso' : (isSignUp ? 'Crear cuenta' : 'Bienvenido de nuevo')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem', marginBottom: '2rem' }}>
              {isPasswordRecovery
                ? 'Te enviaremos un enlace seguro para crear una nueva contraseña.'
                : (isSignUp ? 'Solo toma un minuto.' : 'Ingresa tus credenciales para continuar.')}
            </p>
            
            {error && (
              <div role="alert" style={{ backgroundColor: 'var(--danger-surface)', color: 'var(--danger-text)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '2px solid var(--border-color)', boxShadow: '2px 2px 0px var(--shadow-color)', fontWeight: 700, fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            {isPasswordRecovery ? (
              recoverySent ? (
                <div role="status" aria-live="polite">
                  <div style={{ padding: '1rem', background: 'var(--pastel-green)', border: '2px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontWeight: 700, lineHeight: 1.5 }}>
                    Si existe una cuenta asociada a <strong>{email}</strong>, recibirás un correo con el enlace de recuperación.
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ width: '100%', marginTop: '1.25rem' }}
                    onClick={() => { setIsPasswordRecovery(false); setRecoverySent(false); setError(null); }}
                  >
                    Volver a iniciar sesión
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordRecovery} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div>
                    <label htmlFor="recovery-email" className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Email</label>
                    <input
                      type="email"
                      id="recovery-email"
                      name="email"
                      autoComplete="email"
                      className="input"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      style={{ width: '100%', borderRadius: '8px' }}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={loading} aria-busy={loading} style={{ width: '100%' }}>
                    {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => { setIsPasswordRecovery(false); setRecoverySent(false); setError(null); }}
                    disabled={loading}
                    style={{ width: '100%' }}
                  >
                    Cancelar
                  </button>
                </form>
              )
            ) : (
            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label htmlFor="auth-email" className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Email</label>
                <div style={{ position: 'relative' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m2 7 10 7 10-7"></path>
                  </svg>
                  <input 
                    type="email" 
                    id="auth-email"
                    name="email"
                    autoComplete="email"
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
                <label htmlFor="auth-password" className="label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Contraseña</label>
                <div style={{ position: 'relative' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input 
                    type="password" 
                    id="auth-password"
                    name="password"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    className="input" 
                    placeholder={isSignUp ? "Mínimo 6 caracteres" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '3rem', width: '100%', borderRadius: '8px' }}
                    required
                    minLength={isSignUp ? 6 : undefined}
                  />
                </div>
                {!isSignUp && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => { setIsPasswordRecovery(true); setRecoverySent(false); setError(null); }}
                      style={{ minHeight: '44px', padding: '0.4rem 0', background: 'none', border: 0, color: 'var(--text-secondary)', fontWeight: 800, cursor: 'pointer' }}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.9rem', padding: '0.875rem', backgroundColor: 'var(--pastel-blue)', color: 'var(--text-primary)', border: '2px solid var(--border-color)' }}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? 'Cargando...' : (isSignUp ? 'Crear cuenta gratis' : 'Entrar a mi cuenta')}
              </button>
            </form>
            )}
          </div>

          {!isPasswordRecovery && <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.875rem' }}>
              {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
            </span>
            {' '}
            <button 
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              style={{ minHeight: '44px', padding: '0.5rem', fontWeight: 800, color: 'var(--success-text)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
              disabled={loading}
            >
              {isSignUp ? 'Inicia sesión' : 'Regístrate gratis'}
            </button>
          </div>}
        </div>
      </div>
    </div>
  );
}
