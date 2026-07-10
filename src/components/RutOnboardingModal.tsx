import { useState } from 'react';
import { BadgeCheck, Save } from 'lucide-react';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import toast from 'react-hot-toast';
import { useSettings } from '../contexts/SettingsContext';

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
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div className="card settings-card" style={{ maxWidth: '500px', width: '100%', margin: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fef08a', border: '3px solid #000', marginBottom: '1rem', boxShadow: '4px 4px 0 #000' }}>
            <BadgeCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', fontWeight: 900 }}>Configuración Inicial</h2>
          <p style={{ color: '#475569', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.4 }}>
            Para que MisFinanzas reconozca automáticamente tus transferencias entre cuentas propias, necesitamos tu RUT.
          </p>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 800 }}>RUT (Sin puntos, con guión)</label>
            <input 
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
            {saving ? 'Guardando...' : 'Guardar y Continuar'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#64748b', textAlign: 'center', fontWeight: 500 }}>
          Solo usamos tu RUT de manera local para detectar movimientos hacia ti mismo.
        </p>
      </div>
    </div>
  );
}
