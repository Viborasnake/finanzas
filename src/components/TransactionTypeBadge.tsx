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
        backgroundColor: 'var(--pastel-green)', color: '#16a34a',
        padding: '0.25rem 0.5rem', borderRadius: '9999px',
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid #16a34a',
        boxShadow: '2px 2px 0px #16a34a'
      }}>
        <ArrowDownCircle size={16} strokeWidth={3} />
      </div>
    );
  }

  if (normalizedType === 'Egreso') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        backgroundColor: 'var(--danger-surface)', color: '#dc2626',
        padding: '0.25rem 0.5rem', borderRadius: '9999px',
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid #dc2626',
        boxShadow: '2px 2px 0px #dc2626'
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
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid #94a3b8',
        boxShadow: '2px 2px 0px #94a3b8'
      }}>
        <RefreshCw size={16} strokeWidth={3} />
      </div>
    );
  }
  
  if (normalizedType === 'Ahorro/Inversión') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        backgroundColor: 'var(--pastel-purple)', color: '#9333ea',
        padding: '0.25rem 0.5rem', borderRadius: '9999px',
        fontWeight: 800, fontSize: '0.75rem', border: '2px solid #9333ea',
        boxShadow: '2px 2px 0px #9333ea'
      }}>
        <ArrowUpCircle size={16} strokeWidth={3} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      backgroundColor: 'var(--surface-subtle)', color: '#6b7280',
      padding: '0.25rem 0.5rem', borderRadius: '9999px',
      fontWeight: 800, fontSize: '0.75rem', border: '2px solid #9ca3af',
      boxShadow: '2px 2px 0px #9ca3af'
    }}>
      <span>{normalizedType ? normalizedType.toUpperCase() : 'DESCONOCIDO'}</span>
    </div>
  );
}
