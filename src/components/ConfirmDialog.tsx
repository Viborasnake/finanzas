import { useEffect, useId, useState } from 'react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  confirmationText?: string;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  confirmationText
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTypedConfirmation('');
      setIsConfirming(false);
      setOperationError(null);
    }
  }, [open]);

  const canConfirm = !confirmationText || typedConfirmation.trim() === confirmationText;

  const handleConfirm = async () => {
    if (!canConfirm || isConfirming) return;
    setIsConfirming(true);
    setOperationError(null);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Destructive action failed:', error);
      setOperationError('No pudimos completar la acción. Tus datos no se modificaron; inténtalo nuevamente.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isConfirming) onClose();
      }}
      labelledBy={titleId}
      describedBy={descriptionId}
      closeOnBackdrop={!isConfirming}
      panelStyle={{ width: 'min(92vw, 480px)', padding: 0 }}
    >
      <div style={{ padding: '1.25rem', borderBottom: '2px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ width: 42, height: 42, border: '2px solid var(--border-color)', borderRadius: 6, backgroundColor: 'var(--danger-surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={22} aria-hidden="true" />
          </span>
          <h2 id={titleId} style={{ margin: 0, fontSize: '1.2rem', lineHeight: 1.2 }}>{title}</h2>
        </div>
        <button
          type="button"
          className="btn-icon"
          onClick={onClose}
          disabled={isConfirming}
          aria-label="Cerrar confirmación"
          title="Cerrar"
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: '1.25rem' }}>
        <p id={descriptionId} style={{ margin: 0, color: 'var(--text-secondary)', fontWeight: 650, lineHeight: 1.55 }}>
          {description}
        </p>

        {confirmationText && (
          <div style={{ marginTop: '1.25rem' }}>
            <label htmlFor={inputId} style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem' }}>
              Escribe <strong>{confirmationText}</strong> para confirmar
            </label>
            <input
              id={inputId}
              data-dialog-initial-focus
              className="input"
              type="text"
              value={typedConfirmation}
              onChange={(event) => setTypedConfirmation(event.target.value)}
              autoComplete="off"
              disabled={isConfirming}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {operationError && (
          <p role="alert" style={{ margin: '1rem 0 0', padding: '0.75rem', border: '2px solid var(--danger)', backgroundColor: 'var(--danger-surface)', color: 'var(--danger-text)', fontWeight: 750 }}>
            {operationError}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            data-dialog-initial-focus={!confirmationText ? true : undefined}
            onClick={onClose}
            disabled={isConfirming}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || isConfirming}
            aria-busy={isConfirming}
            style={{ backgroundColor: 'var(--danger-surface)', color: 'var(--danger-text)', borderColor: 'var(--danger)' }}
          >
            {isConfirming ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            {isConfirming ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
