import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, ScanLine, Smartphone } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import ImportModal from '../components/ImportModal';
import TransactionCaptureImport from '../components/TransactionCaptureImport';
import { supabase } from '../services/supabase';
import type { IntakeJobRow } from '../utils/intakeTokens';

type ImportSource = 'statement' | 'capture';

export default function ImportRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSource = searchParams.get('source');
  const source: ImportSource = rawSource === 'capture' ? 'capture' : 'statement';
  const [pendingIntake, setPendingIntake] = useState<IntakeJobRow[]>([]);

  const loadPendingIntake = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('intake_jobs')
        .select('id, filename, content_type, byte_size, storage_path, source, status, error_message, created_at')
        .in('status', ['received', 'ready'])
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setPendingIntake((data || []) as IntakeJobRow[]);
    } catch {
      setPendingIntake([]);
    }
  }, []);

  useEffect(() => {
    loadPendingIntake();
  }, [loadPendingIntake]);

  const pageTitle = source === 'capture'
    ? 'Importar desde una captura'
    : 'Importar cartola bancaria';
  const pageDescription = source === 'capture'
    ? 'Lee comercio, monto y fecha desde una imagen. Revisa todo antes de guardar.'
    : 'Carga el archivo de tu banco y revisa los movimientos antes de incorporarlos.';

  const selectSource = (nextSource: ImportSource) => {
    const next = new URLSearchParams(searchParams);
    if (nextSource === 'statement') next.delete('source');
    else next.set('source', nextSource);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="import-route-shell">
      {pendingIntake.length > 0 && (
        <aside className="import-intake-banner" role="status">
          <Smartphone size={20} aria-hidden="true" />
          <div>
            <strong>
              {pendingIntake.length} cartola{pendingIntake.length === 1 ? '' : 's'} recibida
              {pendingIntake.length === 1 ? '' : 's'} por atajo
            </strong>
            <p>
              {pendingIntake
                .slice(0, 3)
                .map((j) => j.filename)
                .join(' · ')}
              {pendingIntake.length > 3 ? ` · +${pendingIntake.length - 3} más` : ''}
              . Descárgalas desde el almacenamiento o vuelve a subirlas aquí para procesarlas.
              Configura el atajo en{' '}
              <Link to="/settings#atajo-iphone">Ajustes → Atajo iPhone</Link>.
            </p>
          </div>
        </aside>
      )}

      <header className="import-route-header">
        <div>
          <h1 id="import-route-title">{pageTitle}</h1>
          <p>{pageDescription}</p>
        </div>
        <div className="import-source-tabs" role="tablist" aria-label="Origen de los movimientos">
          <button
            id="import-source-statement-tab"
            type="button"
            role="tab"
            aria-selected={source === 'statement'}
            aria-controls="import-source-panel"
            className={source === 'statement' ? 'active' : ''}
            onClick={() => selectSource('statement')}
          >
            <FileSpreadsheet size={19} aria-hidden="true" />
            Cartola bancaria
          </button>
          <button
            id="import-source-capture-tab"
            type="button"
            role="tab"
            aria-selected={source === 'capture'}
            aria-controls="import-source-panel"
            className={source === 'capture' ? 'active' : ''}
            onClick={() => selectSource('capture')}
          >
            <ScanLine size={19} aria-hidden="true" />
            Captura de tarjeta
          </button>
        </div>
      </header>

      <div
        id="import-source-panel"
        role="tabpanel"
        aria-labelledby={`import-source-${source}-tab`}
      >
        {source === 'statement' && <ImportModal presentation="page" onClose={() => navigate('/transactions?review=recent')} />}
        {source === 'capture' && <TransactionCaptureImport onComplete={() => navigate('/transactions')} />}
      </div>
    </div>
  );
}
