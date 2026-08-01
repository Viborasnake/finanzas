import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const openDialogs: symbol[] = [];
let previousBodyOverflow = '';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

interface DialogProps {
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  backdropStyle?: CSSProperties;
  closeOnBackdrop?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function Dialog({
  open = true,
  onClose,
  children,
  labelledBy,
  describedBy,
  panelClassName = '',
  panelStyle,
  backdropStyle,
  closeOnBackdrop = true,
  returnFocusRef
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogIdRef = useRef(Symbol('dialog'));
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const dialogId = dialogIdRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const explicitReturnTarget = returnFocusRef?.current;
    openDialogs.push(dialogId);

    if (openDialogs.length === 1) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        `[data-dialog-initial-focus], ${focusableSelector}`
      );
      (firstFocusable || panelRef.current)?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== dialogId) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter(element => element.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);

      const index = openDialogs.lastIndexOf(dialogId);
      if (index >= 0) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.body.style.overflow = previousBodyOverflow;

      const focusTarget = explicitReturnTarget || previouslyFocused;
      window.setTimeout(() => {
        if (!openDialogs.includes(dialogId) && focusTarget?.isConnected) focusTarget.focus();
      }, 0);
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return createPortal(
    <div
      className="dialog-backdrop"
      style={backdropStyle}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`dialog-panel ${panelClassName}`.trim()}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
