import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog } from './Dialog';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/authContextValue';
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategoryId,
  resolveFeedbackScreen,
} from '../utils/feedbackScreens';

export function FeedbackWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const screen = resolveFeedbackScreen(location.pathname);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<FeedbackCategoryId>('confusion');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [feature, setFeature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    // Reset soft fields when the screen changes so feedback stays contextual.
    setFeature('');
  }, [screen.key]);

  useEffect(() => {
    if (!expanded) return;
    const collapse = () => setExpanded(false);
    const timer = window.setTimeout(collapse, 2500);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  if (!user) return null;

  const resetForm = () => {
    setCategory('confusion');
    setRating(null);
    setMessage('');
    setFeature('');
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length < 3) {
      toast.error('Escribe al menos unas palabras de feedback.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('product_feedback').insert({
        user_id: user.id,
        screen_key: screen.key,
        screen_label: screen.label,
        path: location.pathname + location.search,
        category,
        rating,
        message: trimmed,
        feature: feature.trim() || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : null,
        viewport:
          typeof window !== 'undefined'
            ? `${window.innerWidth}x${window.innerHeight}`
            : null,
      });

      if (error) {
        throw Object.assign(new Error(error.message || 'Error al guardar feedback'), {
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      }

      toast.success('¡Gracias! Tu feedback quedó registrado.');
      resetForm();
      setOpen(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'No se pudo enviar el feedback';
      console.error(err);
      const lower = msg.toLowerCase();
      toast.error(
        lower.includes('product_feedback') || lower.includes('relation') || lower.includes('schema cache')
          ? 'Falta aplicar la migración de feedback en Supabase (tabla product_feedback).'
          : lower.includes('row-level security') || lower.includes('rls')
            ? 'No tienes permiso para enviar feedback. Vuelve a iniciar sesión e intenta de nuevo.'
            : `No se pudo enviar: ${msg}`
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`feedback-fab${expanded ? ' is-expanded' : ''}`}
        onClick={() => setOpen(true)}
        onPointerEnter={() => setExpanded(true)}
        onPointerLeave={() => setExpanded(false)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onTouchStart={() => setExpanded(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Enviar feedback de esta pantalla"
        title="Feedback"
      >
        <MessageSquarePlus size={20} strokeWidth={2.4} aria-hidden="true" />
        <span className="feedback-fab-label" aria-hidden="true">Feedback</span>
      </button>

      <Dialog
        open={open}
        onClose={handleClose}
        labelledBy={titleId}
        describedBy={descId}
        panelClassName="feedback-dialog"
        returnFocusRef={triggerRef}
      >
        <form className="feedback-form" onSubmit={handleSubmit}>
          <div className="feedback-dialog-header">
            <div>
              <p className="feedback-eyebrow">Feedback de pantalla</p>
              <h2 id={titleId}>{screen.label}</h2>
              <p id={descId} className="feedback-subtitle">
                Cuéntanos qué tal funcionó esta pantalla o función. Se envía con el contexto de la ruta actual.
              </p>
            </div>
            <button type="button" className="btn-icon" onClick={handleClose} aria-label="Cerrar">
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="feedback-meta">
            <span className="feedback-chip">{screen.key}</span>
            <span className="feedback-path">{location.pathname}</span>
          </div>

          <fieldset className="feedback-fieldset">
            <legend>Tipo</legend>
            <div className="feedback-categories" role="radiogroup" aria-label="Tipo de feedback">
              {FEEDBACK_CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={category === item.id}
                  className={`feedback-category${category === item.id ? ' is-active' : ''}`}
                  onClick={() => setCategory(item.id)}
                  title={item.hint}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="feedback-fieldset">
            <legend>Valoración (opcional)</legend>
            <div className="feedback-rating" role="group" aria-label="Valoración de 1 a 5">
              {[1, 2, 3, 4, 5].map((value) => {
                const active = rating !== null && value <= rating;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`feedback-star${active ? ' is-active' : ''}`}
                    onClick={() => setRating(value === rating ? null : value)}
                    aria-label={`${value} estrella${value === 1 ? '' : 's'}`}
                    aria-pressed={rating === value}
                  >
                    <Star size={22} strokeWidth={2.4} fill={active ? 'currentColor' : 'none'} />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="feedback-label" htmlFor="feedback-feature">
            Función concreta (opcional)
          </label>
          <input
            id="feedback-feature"
            className="input"
            value={feature}
            onChange={(e) => setFeature(e.target.value)}
            placeholder="Ej: importar PDF, clasificar, pagos fijos…"
            maxLength={120}
            data-dialog-initial-focus
          />

          <label className="feedback-label" htmlFor="feedback-message">
            Tu comentario
          </label>
          <textarea
            id="feedback-message"
            className="input feedback-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="¿Qué pasó? ¿Qué esperabas? ¿Qué mejorarías?"
            rows={4}
            maxLength={2000}
            required
          />

          <div className="feedback-actions">
            <button type="button" className="btn btn-outline" onClick={handleClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar feedback'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
