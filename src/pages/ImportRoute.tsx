import { FileSpreadsheet, ScanLine } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ImportModal from '../components/ImportModal';
import TransactionCaptureImport from '../components/TransactionCaptureImport';
type ImportSource = 'statement' | 'capture';

export default function ImportRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSource = searchParams.get('source');
  const source: ImportSource = rawSource === 'capture' ? 'capture' : 'statement';

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
