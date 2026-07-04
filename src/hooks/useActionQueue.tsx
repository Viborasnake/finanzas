import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

type ActionPayload = {
  id: string; // ID único para la acción o entidad (ej. transaction id)
  message: string; // Mensaje del toast
  execute: () => Promise<void>; // Función asíncrona que impacta la BD
  onUndo?: () => void; // Función síncrona que revierte el estado local de React
};

export function useActionQueue() {
  const timeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const dispatchAction = useCallback(({ id, message, execute, onUndo }: ActionPayload) => {
    // Si ya había una acción con este ID en cola, la limpiamos para no duplicar llamadas a BD
    if (timeouts.current[id]) {
      clearTimeout(timeouts.current[id]);
    }

    toast.custom((t) => (
      <div 
        style={{ 
          padding: '1rem', 
          border: '2px solid black', 
          boxShadow: '4px 4px 0px black', 
          background: 'white', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem', 
          maxWidth: '400px',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>{message}</p>
        <button
          onClick={() => {
            clearTimeout(timeouts.current[id]);
            delete timeouts.current[id];
            toast.dismiss(t.id);
            if (onUndo) onUndo();
            toast.success("Acción deshecha", { duration: 2000, icon: '⏪' });
          }}
          style={{ 
            padding: '0.4rem 0.8rem', 
            background: '#fecaca', 
            color: '#991b1b', 
            border: '2px solid black', 
            borderRadius: 'var(--radius-sm)', 
            fontWeight: 700, 
            cursor: 'pointer',
            transition: 'all 0.1s'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          Deshacer
        </button>
      </div>
    ), { duration: 6000, id: `toast-${id}` }); // Usamos el ID para asegurar un toast único por entidad

    timeouts.current[id] = setTimeout(async () => {
      delete timeouts.current[id];
      toast.dismiss(`toast-${id}`); // Forzar cierre del toast para que no se quede pegado si el usuario pasó el mouse
      try {
        await execute();
      } catch (err) {
        console.error('Action failed:', err);
        toast.error("Hubo un error al guardar la acción en el servidor");
      }
    }, 6000);

  }, []);

  return { dispatchAction };
}
