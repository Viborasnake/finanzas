import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface NeoDatePickerProps {
  value: Date;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

export default function NeoDatePicker({ value, onChange }: NeoDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const containerRef = useRef<HTMLDivElement>(null);
  const calendarId = useId();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay(); // 0 is Sunday
  
  // Adjust so Monday is 0
  const startDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; 

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleSelectDate = (day: number) => {
    const newDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    onChange(newDate);
    setIsOpen(false);
  };

  const formatDisplay = (d: Date) => {
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      {/* Input Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={calendarId}
        aria-label={`Seleccionar fecha. Fecha actual: ${formatDisplay(value)}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: 'var(--surface-color)',
          border: '2px solid var(--border-color)',
          borderRadius: '8px',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
          fontWeight: 700,
          userSelect: 'none',
          transition: 'all 0.1s ease',
          transform: isOpen ? 'translate(2px, 2px)' : 'none',
          boxShadow: isOpen ? '0px 0px 0px var(--border-color)' : '4px 4px 0px var(--border-color)',
          textAlign: 'left'
        }}
      >
        <CalendarIcon size={18} strokeWidth={2.5} />
        <span style={{ fontSize: '0.9rem', color: 'var(--border-color)', flex: 1 }}>{formatDisplay(value)}</span>
      </button>

      {/* Popover Calendar */}
      {isOpen && (
        <div
          id={calendarId}
          role="dialog"
          aria-label="Calendario"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 100,
            backgroundColor: 'var(--surface-color)',
            border: '2px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-md)',
            padding: '1rem',
            width: '280px'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <button 
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mes anterior"
              style={{ background: 'var(--surface-subtle)', border: '2px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={18} strokeWidth={3} />
            </button>
            <div style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </div>
            <button 
              type="button"
              onClick={handleNextMonth}
              aria-label="Mes siguiente"
              style={{ background: 'var(--surface-subtle)', border: '2px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRight size={18} strokeWidth={3} />
            </button>
          </div>

          {/* Days Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '0.5rem' }}>
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontWeight: 900, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = value.getDate() === day && value.getMonth() === currentMonth.getMonth() && value.getFullYear() === currentMonth.getFullYear();
              const today = new Date();
              const isToday = today.getDate() === day && today.getMonth() === currentMonth.getMonth() && today.getFullYear() === currentMonth.getFullYear();
              const dateLabel = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
              
              return (
                <button
                  type="button"
                  key={day}
                  onClick={(e) => { e.stopPropagation(); handleSelectDate(day); }}
                  aria-label={dateLabel}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  style={{
                    backgroundColor: isSelected ? 'var(--border-color)' : isToday ? 'var(--pastel-yellow)' : 'var(--surface-color)',
                    color: isSelected ? 'var(--surface-color)' : 'var(--border-color)',
                    border: '2px solid',
                    borderColor: isSelected || isToday ? 'var(--border-color)' : 'transparent',
                    borderRadius: '6px',
                    padding: '6px 0',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface-subtle)';
                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-color)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = isToday ? 'var(--pastel-yellow)' : 'var(--surface-color)';
                    if (!isSelected) e.currentTarget.style.borderColor = isToday ? 'var(--border-color)' : 'transparent';
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
