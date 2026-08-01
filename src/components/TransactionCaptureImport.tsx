import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Eye,
  FileImage,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/authContextValue';
import { AVAILABLE_BANKS, useBanks, type Bank } from '../contexts/bankContextValue';
import { useSettings } from '../contexts/settingsContextValue';
import { recognizeCaptureImageLocally, type LocalCaptureOcrProgress } from '../services/localCaptureOcr';
import { supabase } from '../services/supabase';
import { applyRules } from '../utils/classificationRules';
import {
  isCaptureCandidateComplete,
  parseCaptureTransactions,
  type CaptureCurrency,
  type CaptureOcrLine,
  type CaptureTransactionCandidate
} from '../utils/transactionCapture.ts';
import { assignStatementOriginIdentities, hashImportFile } from '../utils/transactionIdentity';
import { CascadingCategorySelector } from '../pages/Transactions';

interface TransactionCaptureImportProps {
  onComplete?: () => void;
}

type CaptureStep = 'select' | 'analyzing' | 'review' | 'saving' | 'success';

interface CaptureCategory {
  tipo: string | null;
  principal: string | null;
  secundaria: string | null;
}

interface ReviewCandidate extends CaptureTransactionCandidate {
  category: CaptureCategory;
}

interface SaveSummary {
  inserted: number;
  omitted: number;
  replayed: boolean;
}

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const getToday = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatMoney = (amount: number, currency: CaptureCurrency = 'CLP') => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency,
  maximumFractionDigits: currency === 'CLP' ? 0 : 2
}).format(amount);

const getConfidenceLabel = (confidence: number) => {
  if (confidence >= 0.86) return { label: 'Lectura alta', tone: 'high' };
  if (confidence >= 0.68) return { label: 'Conviene revisar', tone: 'medium' };
  return { label: 'Revisión necesaria', tone: 'low' };
};

const getBankLabel = (bank: string) => AVAILABLE_BANKS.find(item => item.id === bank)?.label || bank;

export default function TransactionCaptureImport({ onComplete }: TransactionCaptureImportProps) {
  const { user } = useAuth();
  const { activeBank, connectedBanks } = useBanks();
  const { classificationRules } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveInFlightRef = useRef(false);

  const [step, setStep] = useState<CaptureStep>('select');
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captureDate, setCaptureDate] = useState(getToday);
  const [selectedBank, setSelectedBank] = useState<Bank | ''>(() => activeBank || connectedBanks[0] || '');
  const [progress, setProgress] = useState<LocalCaptureOcrProgress>({ status: 'idle', progress: 0, label: 'Preparando' });
  const [recognizedLines, setRecognizedLines] = useState<CaptureOcrLine[]>([]);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<SaveSummary | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!selectedBank && activeBank) setSelectedBank(activeBank);
  }, [activeBank, selectedBank]);

  useEffect(() => () => {
    abortControllerRef.current?.abort();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectedCandidates = useMemo(() => candidates.filter(candidate => candidate.selected), [candidates]);
  const completeCandidates = useMemo(
    () => selectedCandidates.filter(isCaptureCandidateComplete),
    [selectedCandidates]
  );
  const updateCandidate = (id: string, patch: Partial<ReviewCandidate>) => {
    setCandidates(current => current.map(candidate => ({
      ...candidate,
      ...(candidate.id === id ? patch : {})
    })));
  };

  const validateImage = (candidateFile: File) => {
    const extensionAllowed = /\.(png|jpe?g|webp)$/i.test(candidateFile.name);
    if (!ACCEPTED_IMAGE_TYPES.has(candidateFile.type) && !extensionAllowed) {
      return 'Usa una captura PNG, JPG o WEBP.';
    }
    if (candidateFile.size > MAX_IMAGE_SIZE) {
      return 'La imagen supera 20 MB. Recórtala o usa una versión más liviana.';
    }
    return null;
  };

  const selectFile = (candidateFile: File) => {
    const validationError = validateImage(candidateFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(candidateFile);
    setPreviewUrl(URL.createObjectURL(candidateFile));
    setError(null);
    setFileHash(null);
    setCandidates([]);
    setRecognizedLines([]);
    setCardLast4(null);
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    if (nextFile) selectFile(nextFile);
    event.target.value = '';
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const image = Array.from(event.clipboardData.files).find(item => item.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    selectFile(image);
    toast.success('Captura pegada. Ya puedes analizarla.');
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const image = Array.from(event.dataTransfer.files).find(item => item.type.startsWith('image/'));
    if (image) selectFile(image);
  };

  const analyzeImage = async () => {
    if (!file) {
      setError('Selecciona una captura antes de continuar.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStep('analyzing');
    setProgress({ status: 'starting', progress: 0, label: 'Preparando reconocimiento' });
    setError(null);

    try {
      const [hash, ocrResult] = await Promise.all([
        hashImportFile(file),
        recognizeCaptureImageLocally(file, setProgress, controller.signal)
      ]);
      const parsed = parseCaptureTransactions(ocrResult.lines, captureDate);
      if (parsed.candidates.length === 0) {
        throw new Error('No pude encontrar movimientos con monto. Usa una captura donde se vean comercio, fecha y valor.');
      }

      const reviewRows: ReviewCandidate[] = parsed.candidates.map(candidate => {
        const rule = applyRules(`${candidate.originalDescription} ${candidate.normalizedMerchant}`, classificationRules);
        return {
          ...candidate,
          description: candidate.normalizedMerchant || candidate.description,
          category: {
            tipo: rule?.tipo_movimiento || null,
            principal: rule?.categoria_principal || null,
            secundaria: rule?.categoria_secundaria || null
          }
        };
      });

      setFileHash(hash);
      setRecognizedLines(ocrResult.lines);
      setCardLast4(parsed.cardLast4);
      setCandidates(reviewRows);
      setStep('review');
    } catch (analysisError) {
      if (controller.signal.aborted || (analysisError instanceof DOMException && analysisError.name === 'AbortError')) {
        setStep('select');
        return;
      }
      const message = analysisError instanceof Error ? analysisError.message : 'No pudimos analizar la captura.';
      setError(message);
      setStep('select');
    } finally {
      abortControllerRef.current = null;
    }
  };

  const cancelAnalysis = () => {
    abortControllerRef.current?.abort();
    setStep('select');
  };

  const reanalyzeWithCaptureDate = () => {
    if (recognizedLines.length === 0) return;
    const parsed = parseCaptureTransactions(recognizedLines, captureDate);
    setCardLast4(parsed.cardLast4);
    setCandidates(parsed.candidates.map(candidate => {
      const rule = applyRules(`${candidate.originalDescription} ${candidate.normalizedMerchant}`, classificationRules);
      return {
        ...candidate,
        description: candidate.normalizedMerchant || candidate.description,
        category: {
          tipo: rule?.tipo_movimiento || null,
          principal: rule?.categoria_principal || null,
          secundaria: rule?.categoria_secundaria || null
        }
      };
    }));
    toast.success('Fechas relativas recalculadas.');
  };

  const addManualCandidate = () => {
    const id = `manual:${crypto.randomUUID()}`;
    const manualCandidate: ReviewCandidate = {
      id,
      sourceRowKey: id,
      originalDescription: '',
      description: '',
      normalizedMerchant: '',
      paymentProcessor: null,
      amount: null,
      currency: 'CLP',
      date: captureDate,
      originalDateLabel: null,
      dateResolution: 'explicit',
      location: null,
      selected: true,
      confidence: { description: 0, amount: 0, date: 0, overall: 0 },
      category: { tipo: null, principal: null, secundaria: null }
    };
    setCandidates(current => [...current, manualCandidate]);
  };

  const saveTransactions = async () => {
    if (saveInFlightRef.current) return;
    if (!user) {
      setError('Debes iniciar sesión para guardar movimientos.');
      return;
    }
    if (!selectedBank) {
      setError('Selecciona el banco o tarjeta de origen.');
      return;
    }
    if (!fileHash) {
      setError('No pudimos identificar la captura. Vuelve a analizarla.');
      return;
    }
    if (selectedCandidates.length === 0) {
      setError('Selecciona al menos un movimiento.');
      return;
    }
    if (completeCandidates.length !== selectedCandidates.length) {
      setError('Corrige los movimientos marcados: cada uno necesita comercio, fecha y monto mayor que cero.');
      return;
    }

    saveInFlightRef.current = true;
    setStep('saving');
    setError(null);

    try {
      const rowsToSave = completeCandidates;
      if (rowsToSave.length === 0) {
        setSaveSummary({ inserted: 0, omitted: 0, replayed: false });
        setStep('success');
        return;
      }

      const rowsWithOrigin = assignStatementOriginIdentities(rowsToSave.map(candidate => ({
        ...candidate,
        date: candidate.date!,
        amount: candidate.amount!,
        type: 'egreso' as const,
        originalDescription: candidate.originalDescription || candidate.description.trim()
      })), selectedBank);
      const rows = rowsWithOrigin.map(candidate => {
        return {
          date: candidate.date,
          description: candidate.description.trim(),
          amount: candidate.amount,
          type: 'egreso',
          source_row_key: candidate.sourceRowKey,
          source_origin_key: candidate.sourceOriginKey,
          candidate_fingerprint: candidate.candidateFingerprint,
          raw_data: {
            original_description: candidate.originalDescription || candidate.description.trim(),
            currency: candidate.currency,
            capture: {
              channel: 'wallet_screenshot',
              capture_date: captureDate,
              card_last4: cardLast4,
              merchant_normalized: candidate.normalizedMerchant,
              payment_processor: candidate.paymentProcessor,
              location: candidate.location,
              original_date_label: candidate.originalDateLabel,
              date_resolution: candidate.dateResolution,
              confidence: candidate.confidence
            },
            _source: {
              kind: 'card_activity_screenshot',
              original_description: candidate.originalDescription || candidate.description.trim(),
              candidate_fingerprint: candidate.candidateFingerprint,
              origin_key: candidate.sourceOriginKey
            }
          },
          tipo_movimiento: candidate.category.tipo,
          categoria_principal: candidate.category.principal,
          categoria_secundaria: candidate.category.secundaria
        };
      });

      const { data, error: insertError } = await supabase.rpc('ingest_statement_transactions', {
        p_bank: selectedBank,
        p_file_hash: fileHash,
        p_rows: rows,
        p_source_kind: 'card_activity_screenshot'
      });
      if (insertError) {
        if (/ingest_statement_transactions|schema cache|function/i.test(insertError.message)) {
          throw new Error('La captura quedó revisada, pero falta habilitar la actualización segura de la base de datos. No se guardó ningún movimiento.');
        }
        throw insertError;
      }

      const result = Array.isArray(data) ? data[0] : data;
      const inserted = Number(result?.inserted_count || 0);
      const serverSkipped = Number(result?.skipped_count || 0);
      const replayed = Boolean(result?.replayed);
      setSaveSummary({ inserted, omitted: serverSkipped, replayed });
      setStep('success');
      toast.success(replayed ? 'Esta captura ya estaba procesada. No se duplicó nada.' : `${inserted} movimientos guardados.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No pudimos guardar los movimientos.');
      setStep('review');
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const resetCapture = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStep('select');
    setFile(null);
    setFileHash(null);
    setPreviewUrl(null);
    setProgress({ status: 'idle', progress: 0, label: 'Preparando' });
    setRecognizedLines([]);
    setCardLast4(null);
    setCandidates([]);
    setSaveSummary(null);
    setError(null);
  };

  if (step === 'analyzing') {
    return (
      <section className="capture-import capture-processing" aria-live="polite" aria-busy="true">
        <LoaderCircle className="capture-spinner" size={38} aria-hidden="true" />
        <div>
          <span className="capture-eyebrow">Análisis local</span>
          <h2>{progress.label}</h2>
          <p>La captura se procesa en este navegador. No estamos subiendo la imagen.</p>
        </div>
        <div className="capture-progress" aria-label={`${Math.round(progress.progress * 100)}% completado`}>
          <span style={{ width: `${Math.max(4, Math.round(progress.progress * 100))}%` }} />
        </div>
        <strong>{Math.round(progress.progress * 100)}%</strong>
        <button type="button" className="btn btn-outline" onClick={cancelAnalysis}>
          <X size={18} /> Cancelar
        </button>
      </section>
    );
  }

  if (step === 'success' && saveSummary) {
    return (
      <section className="capture-import capture-success" aria-live="polite">
        <CheckCircle2 size={46} aria-hidden="true" />
        <span className="capture-eyebrow">Captura procesada</span>
        <h2>{saveSummary.replayed ? 'Esta captura ya estaba guardada' : 'Movimientos listos'}</h2>
        <p>
          {saveSummary.replayed
            ? 'Reconocimos el mismo archivo y evitamos registrarlo dos veces.'
            : `${saveSummary.inserted} movimiento${saveSummary.inserted === 1 ? '' : 's'} guardado${saveSummary.inserted === 1 ? '' : 's'}.`}
          {saveSummary.omitted > 0 ? ` ${saveSummary.omitted} se omitieron según tu revisión.` : ''}
        </p>
        <div className="capture-success-actions">
          <button type="button" className="btn btn-primary" onClick={onComplete}>
            <Eye size={18} /> Ver transacciones
          </button>
          <button type="button" className="btn btn-outline" onClick={resetCapture}>
            <RotateCcw size={18} /> Importar otra captura
          </button>
        </div>
      </section>
    );
  }

  if (step === 'review' || step === 'saving') {
    return (
      <section className="capture-import capture-review" aria-busy={step === 'saving'}>
        <div className="capture-review-heading">
          <div>
            <span className="capture-eyebrow">Revisión antes de guardar</span>
            <h2>{candidates.length} movimientos encontrados</h2>
            <p>Corrige solo lo necesario. Ningún movimiento se guarda hasta que confirmes.</p>
          </div>
          <button type="button" className="btn btn-outline" onClick={resetCapture} disabled={step === 'saving'}>
            <ArrowLeft size={18} /> Cambiar captura
          </button>
        </div>

        <div className="capture-review-controls">
          <label>
            <span>Banco o tarjeta</span>
            <select
              className="input"
              value={selectedBank}
              onChange={event => {
                setSelectedBank(event.target.value as Bank);
              }}
              disabled={step === 'saving'}
            >
              <option value="">Seleccionar banco</option>
              {connectedBanks.map(bank => <option key={bank} value={bank}>{getBankLabel(bank)}</option>)}
            </select>
          </label>
          <label>
            <span>Fecha de la captura</span>
            <span className="capture-date-control">
              <input
                className="input"
                type="date"
                value={captureDate}
                onChange={event => setCaptureDate(event.target.value)}
                disabled={step === 'saving'}
              />
              <button type="button" className="btn btn-outline" onClick={reanalyzeWithCaptureDate} disabled={step === 'saving'} title="Recalcular Ayer y días de la semana">
                <RotateCcw size={17} /> Recalcular
              </button>
            </span>
          </label>
          <div className="capture-review-summary" aria-label="Resumen de selección">
            <strong>{selectedCandidates.length} seleccionados</strong>
            <span>{completeCandidates.length} listos</span>
            {cardLast4 && <span>Tarjeta terminada en {cardLast4}</span>}
          </div>
        </div>

        {connectedBanks.length === 0 && (
          <div className="capture-alert capture-alert-warning" role="alert">
            <AlertTriangle size={20} />
            <div><strong>Primero conecta un banco.</strong><span>Puedes hacerlo desde Configuración y volver a esta revisión.</span></div>
          </div>
        )}

        {error && (
          <div className="capture-alert capture-alert-error" role="alert">
            <AlertTriangle size={20} />
            <span>{error}</span>
          </div>
        )}

        <details className="capture-source-preview">
          <summary><FileImage size={18} /> Ver captura original</summary>
          {previewUrl && <img src={previewUrl} alt="Captura original usada para reconocer los movimientos" />}
        </details>

        <div className="capture-selection-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setCandidates(current => current.map(candidate => ({ ...candidate, selected: true })))}
            disabled={step === 'saving'}
          >
            <Check size={17} /> Seleccionar todos
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setCandidates(current => current.map(candidate => ({ ...candidate, selected: false })))}
            disabled={step === 'saving'}
          >
            <X size={17} /> Quitar selección
          </button>
          <button type="button" className="btn btn-outline" onClick={addManualCandidate} disabled={step === 'saving'}>
            <Plus size={17} /> Agregar movimiento
          </button>
        </div>

        <div className="capture-candidate-list">
          {candidates.map((candidate, index) => {
            const confidence = getConfidenceLabel(candidate.confidence.overall);
            const complete = isCaptureCandidateComplete(candidate);
            return (
              <article
                id={`capture-row-${candidate.id}`}
                key={candidate.id}
                className={`capture-candidate ${candidate.selected ? '' : 'is-excluded'} ${!complete && candidate.selected ? 'has-error' : ''}`}
              >
                <div className="capture-candidate-index">
                  <label className="capture-checkbox">
                    <input
                      type="checkbox"
                      checked={candidate.selected}
                      onChange={event => updateCandidate(candidate.id, { selected: event.target.checked })}
                      disabled={step === 'saving'}
                    />
                    <span>{index + 1}</span>
                  </label>
                  <span className={`capture-confidence confidence-${confidence.tone}`}>{confidence.label}</span>
                </div>

                <div className="capture-candidate-fields">
                  <label className="capture-field-description">
                    <span>Comercio</span>
                    <input
                      className="input"
                      value={candidate.description}
                      onChange={event => updateCandidate(candidate.id, { description: event.target.value })}
                      disabled={!candidate.selected || step === 'saving'}
                    />
                    <small title={candidate.originalDescription}>Leído: {candidate.originalDescription}</small>
                  </label>
                  <label>
                    <span>Fecha</span>
                    <input
                      className="input"
                      type="date"
                      value={candidate.date || ''}
                      onChange={event => updateCandidate(candidate.id, { date: event.target.value || null, dateResolution: 'explicit' })}
                      disabled={!candidate.selected || step === 'saving'}
                    />
                    {candidate.originalDateLabel && <small>Original: {candidate.originalDateLabel}</small>}
                  </label>
                  <label>
                    <span>Monto</span>
                    <span className="capture-money-field">
                      <select
                        className="input"
                        value={candidate.currency}
                        onChange={event => updateCandidate(candidate.id, { currency: event.target.value as CaptureCurrency })}
                        disabled={!candidate.selected || step === 'saving'}
                        aria-label={`Moneda del movimiento ${index + 1}`}
                      >
                        <option value="CLP">CLP</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                      <input
                        className="input"
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step={candidate.currency === 'CLP' ? '1' : '0.01'}
                        value={candidate.amount ?? ''}
                        onChange={event => updateCandidate(candidate.id, { amount: event.target.value ? Number(event.target.value) : null })}
                        disabled={!candidate.selected || step === 'saving'}
                        aria-label={`Monto del movimiento ${index + 1}`}
                      />
                    </span>
                  </label>
                  <div className="capture-field-category">
                    <span>Clasificación</span>
                    <CascadingCategorySelector
                      initialTipo={candidate.category.tipo}
                      initialPrincipal={candidate.category.principal}
                      initialSecundaria={candidate.category.secundaria}
                      contextDescription={`${candidate.originalDescription} ${candidate.normalizedMerchant}`}
                      onSave={(tipo: string | null, principal: string | null, secundaria: string | null) => updateCandidate(candidate.id, {
                        category: { tipo, principal, secundaria }
                      })}
                    />
                  </div>
                </div>

                {(candidate.location || candidate.paymentProcessor) && (
                  <details className="capture-candidate-details">
                    <summary>Más datos reconocidos</summary>
                    <dl>
                      {candidate.paymentProcessor && <><dt>Procesador</dt><dd>{candidate.paymentProcessor}</dd></>}
                      {candidate.location && <><dt>Ubicación</dt><dd>{candidate.location}</dd></>}
                      <dt>Importe</dt><dd>{candidate.amount === null ? 'Sin monto' : formatMoney(candidate.amount, candidate.currency)}</dd>
                    </dl>
                  </details>
                )}

                {candidate.selected && !complete && (
                  <div className="capture-inline-error" role="status">Completa comercio, fecha y monto.        </div>
                )}
              </article>
            );
          })}
        </div>

        <div className="capture-review-footer">
          <div>
            <strong>{selectedCandidates.length} movimientos seleccionados</strong>
            <span>Revisaremos coincidencias antes de guardar.</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveTransactions}
            disabled={step === 'saving' || !selectedBank || selectedCandidates.length === 0}
          >
            {step === 'saving' ? <LoaderCircle className="capture-spinner" size={18} /> : <Save size={18} />}
            {step === 'saving' ? 'Comprobando y guardando...' : 'Comprobar y guardar'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="capture-import" onPaste={handlePaste}>
      <div className="capture-privacy-note">
        <LockKeyhole size={21} aria-hidden="true" />
        <div><strong>Procesamiento privado</strong><span>La imagen se analiza localmente en este navegador y no se guarda.</span></div>
      </div>

      <div
        className={`capture-dropzone ${isDragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragEnter={event => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileInput}
          hidden
        />
        {previewUrl ? (
          <div className="capture-selected-file">
            <img src={previewUrl} alt="Vista previa de la captura seleccionada" />
            <div>
              <CheckCircle2 size={24} aria-hidden="true" />
              <strong>{file?.name || 'Captura pegada'}</strong>
              <span>{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : ''}</span>
            </div>
          </div>
        ) : (
          <>
            <Camera size={38} aria-hidden="true" />
            <strong>Selecciona, arrastra o pega una captura</strong>
            <span>PNG, JPG o WEBP · máximo 20 MB</span>
          </>
        )}
        <div className="capture-file-actions">
          <button
            type="button"
            className={`btn ${file ? 'btn-outline' : 'btn-primary'}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileImage size={18} /> {file ? 'Cambiar imagen' : 'Elegir imagen'}
          </button>
          {file ? (
            <button type="button" className="btn btn-primary" onClick={analyzeImage}>
              <Camera size={19} /> Analizar captura
            </button>
          ) : (
            <span><ClipboardPaste size={17} /> También puedes pegar con Ctrl/⌘ + V</span>
          )}
        </div>
      </div>

      <div className="capture-start-controls">
        <label>
          <span>Fecha en que tomaste la captura</span>
          <input className="input" type="date" value={captureDate} onChange={event => setCaptureDate(event.target.value)} />
          <small>Se usa para interpretar “Ayer” y los días de la semana.</small>
        </label>
      </div>

      {error && (
        <div className="capture-alert capture-alert-error" role="alert">
          <AlertTriangle size={20} /> <span>{error}</span>
        </div>
      )}
    </section>
  );
}
