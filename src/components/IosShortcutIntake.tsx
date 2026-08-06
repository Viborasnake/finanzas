import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Smartphone, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/authContextValue';
import {
  buildShortcutSetupText,
  generateIntakeTokenSecret,
  getIntakeUploadUrl,
  sha256Hex,
  type IntakeJobRow,
  type IntakeTokenRow,
} from '../utils/intakeTokens';

export function IosShortcutIntake() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<IntakeTokenRow[]>([]);
  const [jobs, setJobs] = useState<IntakeJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [plainTokenOnce, setPlainTokenOnce] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const uploadUrl = getIntakeUploadUrl();
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://finanzas.frontbook.cl';

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [tokensRes, jobsRes] = await Promise.all([
        supabase
          .from('intake_tokens')
          .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
          .is('revoked_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('intake_jobs')
          .select('id, filename, content_type, byte_size, storage_path, source, status, error_message, created_at')
          .in('status', ['received', 'ready', 'error'])
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (tokensRes.error) throw tokensRes.error;
      if (jobsRes.error && !String(jobsRes.error.message || '').includes('intake_jobs')) {
        throw jobsRes.error;
      }

      setTokens((tokensRes.data || []) as IntakeTokenRow[]);
      setJobs((jobsRes.data || []) as IntakeJobRow[]);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error al cargar intake';
      if (msg.includes('intake_tokens') || msg.includes('relation') || msg.includes('schema cache')) {
        toast.error('Falta aplicar la migración de intake en Supabase.');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      toast.success('Copiado');
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleCreateToken = async () => {
    if (!user) return;
    setCreating(true);
    try {
      const secret = generateIntakeTokenSecret();
      const hash = await sha256Hex(secret);
      const { error } = await supabase.from('intake_tokens').insert({
        user_id: user.id,
        name: 'iPhone',
        token_prefix: secret.slice(0, 12),
        token_hash: hash,
      });
      if (error) throw error;
      setPlainTokenOnce(secret);
      toast.success('Token creado. Cópialo ahora: solo se muestra una vez.');
      await load();
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el token');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (!window.confirm('¿Revocar este token? El atajo dejará de funcionar hasta que crees uno nuevo.')) return;
    try {
      const { error } = await supabase
        .from('intake_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenId);
      if (error) throw error;
      toast.success('Token revocado');
      if (plainTokenOnce) setPlainTokenOnce(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo revocar');
    }
  };

  const handleDiscardJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('intake_jobs')
        .update({ status: 'discarded', updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (error) throw error;
      setJobs((rows) => rows.filter((j) => j.id !== jobId));
      toast.success('Archivo descartado');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'No se pudo descartar');
    }
  };

  const setupGuide = plainTokenOnce
    ? buildShortcutSetupText({ uploadUrl, token: plainTokenOnce, appOrigin })
    : null;

  return (
    <div className="ios-intake-panel">
      <div className="ios-intake-intro">
        <p>
          Crea un atajo en el iPhone que envía la cartola (PDF/CSV/Excel) a MisFinanzas con un toque desde
          <strong> Compartir</strong>. Luego la revisas en Importar.
        </p>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 100 }} />
      ) : (
        <>
          <div className="ios-intake-actions">
            <button type="button" className="btn btn-primary" onClick={handleCreateToken} disabled={creating}>
              <Smartphone size={18} />
              {creating ? 'Creando…' : tokens.length ? 'Crear otro token' : 'Generar token para iPhone'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => load()}>
              <RefreshCw size={16} />
              Actualizar
            </button>
          </div>

          {plainTokenOnce && (
            <div className="ios-intake-secret" role="status">
              <strong>Tu token (cópialo ahora — no se vuelve a mostrar)</strong>
              <code className="ios-intake-code">{plainTokenOnce}</code>
              <div className="ios-intake-secret-actions">
                <button type="button" className="btn btn-outline" onClick={() => copyText('token', plainTokenOnce)}>
                  {copied === 'token' ? <Check size={16} /> : <Copy size={16} />}
                  Copiar token
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => copyText('url', uploadUrl)}
                >
                  {copied === 'url' ? <Check size={16} /> : <Copy size={16} />}
                  Copiar URL de subida
                </button>
                {setupGuide && (
                  <button type="button" className="btn btn-outline" onClick={() => copyText('guide', setupGuide)}>
                    {copied === 'guide' ? <Check size={16} /> : <Copy size={16} />}
                    Copiar guía del atajo
                  </button>
                )}
              </div>
              <ol className="ios-intake-steps">
                <li>Abre <strong>Atajos</strong> → <strong>+</strong> → Nueva atajo.</li>
                <li>Acción: <strong>Recibir Archivos de la hoja de compartir</strong>.</li>
                <li>
                  Acción: <strong>Obtener contenido de URL</strong> → POST → Formulario, campo <code>file</code> =
                  archivo compartido.
                </li>
                <li>
                  Cabecera <code>x-intake-token</code> = el token de arriba.
                </li>
                <li>
                  URL: <code className="ios-intake-inline-url">{uploadUrl}</code>
                </li>
                <li>
                  Guarda como <strong>Enviar a MisFinanzas</strong>. Luego: cartola → Compartir → ese atajo.
                </li>
              </ol>
            </div>
          )}

          {tokens.length > 0 && (
            <div className="ios-intake-token-list">
              <h3>Tokens activos</h3>
              <ul>
                {tokens.map((t) => (
                  <li key={t.id}>
                    <div>
                      <strong>{t.name}</strong>
                      <span>
                        {t.token_prefix}… · creado{' '}
                        {new Date(t.created_at).toLocaleDateString('es-CL')}
                        {t.last_used_at
                          ? ` · último uso ${new Date(t.last_used_at).toLocaleString('es-CL')}`
                          : ' · sin uso aún'}
                      </span>
                    </div>
                    <button type="button" className="btn-icon" title="Revocar token" onClick={() => handleRevoke(t.id)}>
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ios-intake-jobs">
            <div className="ios-intake-jobs-head">
              <h3>Archivos recibidos (pendientes)</h3>
              <a className="ios-intake-import-link" href="/import">
                Ir a Importar <ExternalLink size={14} />
              </a>
            </div>
            {jobs.length === 0 ? (
              <p className="ios-intake-empty">Aún no llega ninguna cartola por atajo.</p>
            ) : (
              <ul className="ios-intake-job-list">
                {jobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>{job.filename}</strong>
                      <span>
                        {job.source} · {job.status} ·{' '}
                        {new Date(job.created_at).toLocaleString('es-CL')}
                        {job.byte_size != null ? ` · ${(job.byte_size / 1024).toFixed(0)} KB` : ''}
                      </span>
                      {job.error_message && <em>{job.error_message}</em>}
                    </div>
                    <button type="button" className="btn btn-outline" onClick={() => handleDiscardJob(job.id)}>
                      Descartar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="ios-intake-note">
            Nota: Apple no permite instalar un atajo sin confirmación. La plataforma te da el <strong>token + URL + guía</strong>;
            tú lo armas una vez en Atajos (2 minutos) y después solo usas Compartir.
          </p>
        </>
      )}
    </div>
  );
}
