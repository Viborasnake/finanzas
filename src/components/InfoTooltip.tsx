import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: string;
}

export default function InfoTooltip({ content }: InfoTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHovered && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX + rect.width / 2
      });
    }
  }, [isHovered]);

  return (
    <div 
      ref={iconRef}
      style={{ display: 'inline-flex', alignItems: 'center', marginLeft: '0.5rem' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Info size={16} color="#64748b" style={{ cursor: 'help' }} />
      {isHovered && createPortal(
        <div style={{
          position: 'absolute',
          top: coords.top - 8,
          left: coords.left,
          transform: 'translate(-50%, -100%)',
          backgroundColor: '#fff',
          border: '2px solid #000',
          borderRadius: '8px',
          padding: '0.75rem',
          boxShadow: '4px 4px 0px #000',
          width: 'max-content',
          maxWidth: '250px',
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
            backgroundColor: '#fff',
            borderRight: '2px solid #000',
            borderBottom: '2px solid #000'
          }} />
        </div>,
        document.body
      )}
    </div>
  );
}
