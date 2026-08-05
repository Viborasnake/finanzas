import { useState } from 'react';
import { BadgeCheck, Save } from 'lucide-react';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import toast from 'react-hot-toast';
import { useSettings } from '../contexts/settingsContextValue';
import { Dialog } from './Dialog';

export function RutOnboardingModal() {
  const { saveUserRut } = useSettings();
  const [rut, setRut] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = extractAndNormalizeRUT(rut);
    if (!normalized) {
      toast.error('RUT inválido. Verifica el formato.');
      return;
    }
    
    setSaving(true);
    try {
      await saveUserRut(normalized);
      toast.success('RUT guardado exitosamente.');
    } catch (e) {
      console.error(e);
      toast.error('Error guardando el RUT.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      onClose={() => undefined}
      closeOnBackdrop={false}
      labelledBy="rut-onboarding-title"
      describedBy="rut-onboarding-description"
      panelStyle={{ maxWidth: '500px' }}
    >
      <div className="settings-card" style={{ margin: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--pastel-yellow)', border: '3px solid var(--border-color)', marginBottom: '1rem', boxShadow: '4px 4px 0 var(--border-color)' }}>
            <BadgeCheck size={32} />
          </div>
          <h2 id="rut-onboarding-title" style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 900 }}>Configuración inicial</h2>
          <p id="rut-onboarding-description" style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.4 }}>
            Para que MisFinanzas reconozca automáticamente tus transferencias entre cuentas propias, necesitamos tu RUT.
          </p>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="rut-onboarding-input" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800 }}>RUT (sin puntos, con guion)</label>
            <input 
              id="rut-onboarding-input"
              type="text" 
              className="input" 
              placeholder="Ej: 16424491-1" 
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              style={{ width: '100%', fontSize: '1.2rem', padding: '0.75rem' }}
              autoFocus
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ padding: '1rem', fontSize: '1.1rem', justifyContent: 'center' }} disabled={saving || !rut}>
            <Save size={24} />
            {saving ? 'Guardando...' : 'Guardar y continuar'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', fontWeight: 500 }}>
          Guardamos tu RUT de forma segura en tu configuración y solo lo usamos para detectar movimientos entre tus propias cuentas.
        </p>
      </div>
    </Dialog>
  );
}
