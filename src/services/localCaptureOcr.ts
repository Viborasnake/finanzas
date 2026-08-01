import type { CaptureOcrLine } from '../utils/transactionCapture.ts';

export interface LocalCaptureOcrProgress {
  status: string;
  progress: number;
  label: string;
}

export interface LocalCaptureOcrResult {
  text: string;
  confidence: number;
  lines: CaptureOcrLine[];
}

const STATUS_LABELS: Record<string, string> = {
  'loading tesseract core': 'Preparando reconocimiento',
  'initializing tesseract': 'Preparando reconocimiento',
  'loading language traineddata': 'Cargando lectura en español',
  'initializing api': 'Preparando lectura',
  'recognizing text': 'Leyendo transacciones'
};

const createAbortError = () => new DOMException('El análisis fue cancelado.', 'AbortError');

export const recognizeCaptureImageLocally = async (
  file: File,
  onProgress?: (progress: LocalCaptureOcrProgress) => void,
  signal?: AbortSignal
): Promise<LocalCaptureOcrResult> => {
  if (signal?.aborted) throw createAbortError();

  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let aborted = false;

  const handleAbort = () => {
    aborted = true;
    if (worker) void worker.terminate();
  };
  signal?.addEventListener('abort', handleAbort, { once: true });

  try {
    worker = await createWorker(['spa', 'eng'], undefined, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/core',
      langPath: '/tesseract/lang',
      gzip: false,
      logger: message => {
        const progress = Number.isFinite(message.progress) ? message.progress : 0;
        onProgress?.({
          status: message.status,
          progress,
          label: STATUS_LABELS[message.status] || 'Analizando imagen'
        });
      }
    });
    if (aborted || signal?.aborted) throw createAbortError();

    const result = await worker.recognize(file, {}, { text: true, blocks: true });
    if (aborted || signal?.aborted) throw createAbortError();

    const blockLines = result.data.blocks?.flatMap(block => (
      block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => ({
        text: line.text.trim(),
        confidence: line.confidence,
        bbox: {
          x0: line.bbox.x0,
          y0: line.bbox.y0,
          x1: line.bbox.x1,
          y1: line.bbox.y1
        }
      })))
    )).filter(line => line.text) || [];

    const lines = blockLines.length > 0
      ? blockLines
      : result.data.text.split(/\r?\n/).map((text, index) => ({
          text: text.trim(),
          confidence: result.data.confidence,
          bbox: { x0: 0, y0: index * 40, x1: 1000, y1: (index + 1) * 40 }
        })).filter(line => line.text);

    return {
      text: result.data.text,
      confidence: result.data.confidence,
      lines
    };
  } finally {
    signal?.removeEventListener('abort', handleAbort);
    if (worker && !aborted) await worker.terminate();
  }
};
