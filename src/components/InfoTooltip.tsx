import { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: string;
}

export default function InfoTooltip({ content }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      if (!iconRef.current) return;
      const rect = iconRef.current.getBoundingClientRect();
      const halfWidth = Math.min(125, (window.innerWidth - 32) / 2);
      setCoords({
        top: rect.top,
        left: Math.min(
          Math.max(rect.left + rect.width / 2, halfWidth + 16),
          window.innerWidth - halfWidth - 16
        )
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        iconRef.current?.focus();
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <span
      className="info-tooltip"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => {
        if (document.activeElement !== iconRef.current) setIsOpen(false);
      }}
    >
    <button
      type="button"
      ref={iconRef}
      className="info-tooltip-trigger"
      aria-label="Más información"
      aria-expanded={isOpen}
      aria-controls={isOpen ? tooltipId : undefined}
      aria-describedby={isOpen ? tooltipId : undefined}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
      onClick={() => setIsOpen(true)}
    >
      <Info size={16} aria-hidden="true" />
    </button>
      {isOpen && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          style={{
          position: 'fixed',
          top: coords.top - 8,
          left: coords.left,
          transform: 'translate(-50%, -100%)',
          backgroundColor: 'var(--surface-color)',
          border: '2px solid var(--border-color)',
          borderRadius: '8px',
          padding: '0.75rem',
          boxShadow: '4px 4px 0px var(--border-color)',
          width: 'max-content',
          maxWidth: 'min(250px, calc(100vw - 2rem))',
          zIndex: 99999,
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#000',
          lineHeight: '1.4',
          textAlign: 'center',
          pointerEvents: 'none'
        }}>
          {content}
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            bottom: '-6px',
            left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: '10px',
            height: '10px',
            backgroundColor: 'var(--surface-color)',
            borderRight: '2px solid var(--border-color)',
            borderBottom: '2px solid var(--border-color)'
          }} />
        </div>,
        document.body
      )}
    </span>
  );
}
