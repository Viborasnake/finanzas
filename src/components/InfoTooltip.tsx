import { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: string;
}

export default function InfoTooltip({ content }: InfoTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '0.5rem' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Info size={16} color="#64748b" style={{ cursor: 'help' }} />
      {isHovered && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#fff',
          border: '2px solid #000',
          borderRadius: '8px',
          padding: '0.75rem',
          boxShadow: '4px 4px 0px #000',
          width: 'max-content',
          maxWidth: '250px',
          zIndex: 100,
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#000',
          lineHeight: '1.4',
          textAlign: 'center'
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
        </div>
      )}
    </div>
  );
}
