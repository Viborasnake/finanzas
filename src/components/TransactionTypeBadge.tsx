import { ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';

export interface TransactionTypeBadgeProps {
  type: string | null | undefined;
}

export function TransactionTypeBadge({ type }: TransactionTypeBadgeProps) {
  // Normalize legacy values
  const normalizedType = type === 'Gasto Real' ? 'Egreso' : type;

  if (normalizedType === 'Ingreso') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        backgroundColor: 'var(--pastel-green)', color: 'var(--success)',
        padding: '0.25rem 0.5rem', borderRadius: '9999px',
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid var(--success)',
        boxShadow: '2px 2px 0px var(--success)'
      }}>
        <ArrowDownCircle size={16} strokeWidth={3} />
      </div>
    );
  }

  if (normalizedType === 'Egreso') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        backgroundColor: 'var(--danger-surface)', color: 'var(--danger)',
        padding: '0.25rem 0.5rem', borderRadius: '9999px',
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid var(--danger)',
        boxShadow: '2px 2px 0px var(--danger)'
      }}>
        <ArrowUpCircle size={16} strokeWidth={3} />
      </div>
    );
  }
  
  if (normalizedType === 'Movimiento Interno') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        backgroundColor: 'var(--surface-subtle)', color: 'var(--text-muted)',
        padding: '0.25rem 0.5rem', borderRadius: '9999px',
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid var(--border-muted)',
        boxShadow: '2px 2px 0px var(--border-muted)'
      }}>
        <RefreshCw size={16} strokeWidth={3} />
      </div>
    );
  }
  
  if (normalizedType === 'Ahorro/Inversión') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        backgroundColor: 'var(--pastel-purple)', color: 'var(--purple-accent)',
        padding: '0.25rem 0.5rem', borderRadius: '9999px',
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid var(--purple-accent)',
        boxShadow: '2px 2px 0px var(--purple-accent)'
      }}>
        <ArrowUpCircle size={16} strokeWidth={3} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      backgroundColor: 'var(--surface-subtle)', color: 'var(--text-muted)',
      padding: '0.25rem 0.5rem', borderRadius: '9999px',
      fontWeight: 800, fontSize: '0.75rem', border: '2px solid var(--border-muted)',
      boxShadow: '2px 2px 0px var(--border-muted)'
    }}>
      <span>{normalizedType ? normalizedType.toUpperCase() : 'DESCONOCIDO'}</span>
    </div>
  );
}
