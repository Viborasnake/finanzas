import { useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/authContextValue';
import { supabase } from '../services/supabase';
import LaikaPet from '../components/LaikaPet';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setCompleted(true);
    } catch {
      setError('No pudimos actualizar la contraseña. Solicita un nuevo enlace e inténtalo otra vez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '1.5rem', background: 'var(--pastel-blue)' }}>
      <section className="card auth-form-card" style={{ width: '100%', maxWidth: 460, padding: '2rem' }} aria-labelledby="reset-password-title">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <LaikaPet pose={completed ? 'love' : 'welcome'} size={128} title="Laika te acompaña a recuperar tu cuenta" />
        </div>

        {completed ? (
          <div style={{ textAlign: 'center' }} role="status" aria-live="polite">
            <CheckCircle2 size={42} color="var(--success-text)" aria-hidden="true" />
            <h1 id="reset-password-title" style={{ fontSize: '1.65rem', margin: '0.75rem 0' }}>Contraseña actualizada</h1>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.5 }}>
              Tu acceso ya está listo. Puedes continuar con tu información financiera.
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => navigate('/', { replace: true })}>
              Ir al dashboard
            </button>
          </div>
        ) : !session ? (
          <div style={{ textAlign: 'center' }}>
            <KeyRound size={42} aria-hidden="true" />
            <h1 id="reset-password-title" style={{ fontSize: '1.65rem', margin: '0.75rem 0' }}>El enlace ya no es válido</h1>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.5 }}>
              Los enlaces de recuperación vencen por seguridad. Solicita uno nuevo desde el inicio de sesión.
            </p>
            <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => navigate('/login', { replace: true })}>
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <>
            <h1 id="reset-password-title" style={{ fontSize: '1.65rem', marginBottom: '0.35rem' }}>Crea una nueva contraseña</h1>
            <p style={{ color: 'var(--text-secondary)', fontWeight: 600, marginTop: 0, marginBottom: '1.5rem' }}>
              Usa al menos 6 caracteres y evita reutilizar una contraseña anterior.
            </p>

            {error && (
              <div role="alert" style={{ marginBottom: '1rem', padding: '0.8rem', border: '2px solid black', borderRadius: 'var(--radius-md)', background: 'var(--danger-surface)', color: 'var(--danger-text)', fontWeight: 700 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label className="label" htmlFor="new-password">Nueva contraseña</label>
                <input
                  className="input"
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label className="label" htmlFor="confirm-password">Confirmar contraseña</label>
                <input
                  className="input"
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  required
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} aria-busy={loading} style={{ width: '100%' }}>
                {loading ? 'Actualizando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
