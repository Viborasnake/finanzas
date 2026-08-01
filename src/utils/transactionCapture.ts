import { normalizeIdentityText } from './transactionIdentity.ts';

export interface CaptureOcrLine {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export type CaptureCurrency = 'CLP' | 'USD' | 'EUR';
export type CaptureDateResolution = 'explicit' | 'relative' | 'missing';

export interface CaptureTransactionCandidate {
  id: string;
  sourceRowKey: string;
  originalDescription: string;
  description: string;
  normalizedMerchant: string;
  paymentProcessor: string | null;
  amount: number | null;
  currency: CaptureCurrency;
  date: string | null;
  originalDateLabel: string | null;
  dateResolution: CaptureDateResolution;
  location: string | null;
  selected: boolean;
  confidence: {
    description: number;
    amount: number;
    date: number;
    overall: number;
  };
}

export interface CaptureParseResult {
  candidates: CaptureTransactionCandidate[];
  cardLast4: string | null;
}

export interface ExistingCaptureTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  bank: string;
  type?: string | null;
  originalDescription?: string | null;
  sourceOriginalDescription?: string | null;
  sourceKind?: string | null;
}

export interface PotentialCaptureDuplicate extends ExistingCaptureTransaction {
  dateDistanceDays: number;
  merchantSimilarity: number;
  sharedMerchantTokens: string[];
}

export interface ParsedCaptureAmount {
  amount: number;
  currency: CaptureCurrency;
  raw: string;
  index: number;
}

const CURRENCY_AMOUNT_PATTERN = /(?:US\$|USD|CLP|EUR|€|\$)\s*-?\s*\d[\d.,]*/i;
const EXPLICIT_DATE_PATTERN = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/;
export const CAPTURE_DUPLICATE_DATE_WINDOW_DAYS = 3;

const DUPLICATE_MERCHANT_NOISE_TOKENS = new Set([
  'redcompra', 'compra', 'venta', 'debito', 'credito', 'tarjeta', 'pago', 'pagos',
  'pac', 'tef', 'transferencia', 'transferencias', 'sumup', 'mercadopago', 'transbank',
  'spa', 'sp', 'sa', 'ltda', 'eirl', 'market', 'minimarket', 'comercial', 'comercio',
  'local', 'tienda', 'sucursal', 'region', 'metropolitana', 'santiago', 'chile', 'san',
  'del', 'de', 'la', 'el', 'los', 'las', 'bk'
]);

const clampConfidence = (value: number) => Math.min(1, Math.max(0, value > 1 ? value / 100 : value));

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDateAtNoon = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
};

const subtractDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
};

const parseLocalizedNumber = (rawValue: string, currency: CaptureCurrency) => {
  const normalized = rawValue.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!normalized) return null;

  if (currency === 'CLP') {
    const value = Number(normalized.replace(/[.,]/g, ''));
    return Number.isFinite(value) ? Math.abs(value) : null;
  }

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);
  const decimalDigits = decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0;
  const usesDecimalSeparator = decimalDigits > 0 && decimalDigits <= 2;
  const numeric = usesDecimalSeparator
    ? `${normalized.slice(0, decimalIndex).replace(/[.,]/g, '')}.${normalized.slice(decimalIndex + 1)}`
    : normalized.replace(/[.,]/g, '');
  const value = Number(numeric);
  return Number.isFinite(value) ? Math.abs(value) : null;
};

export const parseCaptureAmount = (text: string): ParsedCaptureAmount | null => {
  const match = CURRENCY_AMOUNT_PATTERN.exec(text);
  if (!match || match.index === undefined) return null;

  const raw = match[0].trim();
  const normalizedToken = raw.toUpperCase();
  const currency: CaptureCurrency = normalizedToken.includes('USD') || normalizedToken.includes('US$')
    ? 'USD'
    : normalizedToken.includes('EUR') || normalizedToken.includes('€')
      ? 'EUR'
      : 'CLP';
  const amount = parseLocalizedNumber(raw, currency);
  if (amount === null) return null;

  return { amount, currency, raw, index: match.index };
};

const normalizeDateLabel = (value: string) => normalizeIdentityText(value)
  .replace(/[.,]/g, '')
  .trim();

export const resolveCaptureDate = (
  label: string,
  anchorDate: string
): { date: string | null; resolution: CaptureDateResolution } => {
  const explicit = EXPLICIT_DATE_PATTERN.exec(label);
  if (explicit) {
    const year = explicit[3].length === 2 ? 2000 + Number(explicit[3]) : Number(explicit[3]);
    const month = Number(explicit[2]);
    const day = Number(explicit[1]);
    const parsed = new Date(year, month - 1, day, 12);
    const valid = parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
    return { date: valid ? formatIsoDate(parsed) : null, resolution: valid ? 'explicit' : 'missing' };
  }

  const anchor = parseIsoDateAtNoon(anchorDate);
  if (!anchor) return { date: null, resolution: 'missing' };

  const normalized = normalizeDateLabel(label);
  if (normalized === 'hoy') return { date: formatIsoDate(anchor), resolution: 'relative' };
  if (normalized === 'ayer') return { date: formatIsoDate(subtractDays(anchor, 1)), resolution: 'relative' };
  if (normalized === 'anteayer') return { date: formatIsoDate(subtractDays(anchor, 2)), resolution: 'relative' };

  const weekdays: Record<string, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6
  };
  const targetWeekday = weekdays[normalized];
  if (targetWeekday === undefined) return { date: null, resolution: 'missing' };

  const elapsedDays = (anchor.getDay() - targetWeekday + 7) % 7 || 7;
  return { date: formatIsoDate(subtractDays(anchor, elapsedDays)), resolution: 'relative' };
};

const toDisplayMerchant = (value: string) => {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned !== cleaned.toUpperCase()) return cleaned;

  return cleaned
    .toLocaleLowerCase('es-CL')
    .replace(/(^|[\s-])([a-záéíóúñ])/g, (_, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase('es-CL')}`);
};

export const normalizeCaptureMerchant = (description: string) => {
  const original = description.replace(/\s+/g, ' ').trim();
  const processorPatterns = [
    { processor: 'SumUp', pattern: /^sumup\s*\*\s*/i },
    { processor: 'Mercado Pago', pattern: /^mercado\s*pago\s*\*?\s*/i },
    { processor: 'Mercado Pago', pattern: /^mercadopago\s*\*?\s*/i },
    { processor: 'Transbank', pattern: /^transbank\s*\*?\s*/i }
  ];
  const processorMatch = processorPatterns.find(item => item.pattern.test(original));
  const withoutProcessor = processorMatch ? original.replace(processorMatch.pattern, '') : original;
  const withoutTerminalSumUpCode = processorMatch?.processor === 'SumUp'
    ? withoutProcessor.replace(/\s+SP$/i, '')
    : withoutProcessor;

  return {
    merchant: toDisplayMerchant(withoutTerminalSumUpCode) || original,
    processor: processorMatch?.processor || null
  };
};

const isDateLabel = (value: string) => {
  if (EXPLICIT_DATE_PATTERN.test(value)) return true;
  return ['hoy', 'ayer', 'anteayer', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']
    .includes(normalizeDateLabel(value));
};

const isIgnoredLine = (value: string) => {
  const normalized = normalizeIdentityText(value);
  return !normalized || normalized.includes('transacciones recientes') || normalized === 'visa';
};

export const extractCardLast4 = (lines: CaptureOcrLine[]) => {
  const ordered = [...lines].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const firstTransactionY = ordered.find(line => parseCaptureAmount(line.text))?.bbox.y0 ?? Number.POSITIVE_INFINITY;
  const candidates = ordered
    .filter(line => line.bbox.y0 < firstTransactionY && !EXPLICIT_DATE_PATTERN.test(line.text))
    .flatMap(line => Array.from(line.text.matchAll(/\b(\d{4})\b/g)).map(match => match[1]))
    .filter(value => value !== '0000');

  return candidates.at(-1) || null;
};

export const parseCaptureTransactions = (
  lines: CaptureOcrLine[],
  anchorDate: string
): CaptureParseResult => {
  const ordered = [...lines]
    .filter(line => !isIgnoredLine(line.text))
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const amountLineIndexes = ordered
    .map((line, index) => parseCaptureAmount(line.text) ? index : -1)
    .filter(index => index >= 0);

  const candidates = amountLineIndexes.flatMap((lineIndex, ordinal) => {
    const line = ordered[lineIndex];
    const parsedAmount = parseCaptureAmount(line.text);
    if (!parsedAmount) return [];

    const nextAmountIndex = amountLineIndexes[ordinal + 1] ?? ordered.length;
    const segment = ordered.slice(lineIndex, nextAmountIndex);
    let descriptionLine = line;
    let description = line.text.slice(0, parsedAmount.index).replace(/[|•·]+$/g, '').trim();
    if (!description) {
      const amountCenterY = (line.bbox.y0 + line.bbox.y1) / 2;
      const adjacentDescription = ordered
        .slice(Math.max(0, lineIndex - 3), lineIndex)
        .reverse()
        .find(candidateLine => {
          const candidateCenterY = (candidateLine.bbox.y0 + candidateLine.bbox.y1) / 2;
          const sameVisualRow = Math.abs(candidateCenterY - amountCenterY) <= Math.max(24, line.bbox.y1 - line.bbox.y0);
          return sameVisualRow
            && candidateLine.bbox.x0 < line.bbox.x0
            && !parseCaptureAmount(candidateLine.text)
            && !isDateLabel(candidateLine.text)
            && !isIgnoredLine(candidateLine.text);
        });
      if (adjacentDescription) {
        descriptionLine = adjacentDescription;
        description = adjacentDescription.text.trim();
      }
    }
    if (!description) return [];

    const dateLine = segment.find((candidateLine, index) => index > 0 && isDateLabel(candidateLine.text));
    const dateResult = dateLine
      ? resolveCaptureDate(dateLine.text, anchorDate)
      : resolveCaptureDate(line.text, anchorDate);
    const locationLine = segment.find((candidateLine, index) => (
      index > 0
      && candidateLine !== dateLine
      && !parseCaptureAmount(candidateLine.text)
      && !isIgnoredLine(candidateLine.text)
    ));
    const merchant = normalizeCaptureMerchant(description);
    const descriptionConfidence = clampConfidence(descriptionLine.confidence);
    const amountConfidence = clampConfidence(line.confidence);
    const dateConfidence = dateLine ? clampConfidence(dateLine.confidence) : (dateResult.date ? descriptionConfidence : 0);
    const overallConfidence = (descriptionConfidence * 0.4) + (amountConfidence * 0.35) + (dateConfidence * 0.25);
    const rowSeed = `${ordinal + 1}:${Math.round(line.bbox.y0)}:${normalizeIdentityText(description)}:${parsedAmount.amount}`;
    const sourceRowKey = `wallet-row:${rowSeed}`;

    return [{
      id: sourceRowKey,
      sourceRowKey,
      originalDescription: description,
      description,
      normalizedMerchant: merchant.merchant,
      paymentProcessor: merchant.processor,
      amount: parsedAmount.amount,
      currency: parsedAmount.currency,
      date: dateResult.date,
      originalDateLabel: dateLine?.text.trim() || null,
      dateResolution: dateResult.resolution,
      location: locationLine?.text.trim() || null,
      selected: true,
      confidence: {
        description: descriptionConfidence,
        amount: amountConfidence,
        date: dateConfidence,
        overall: overallConfidence
      }
    } satisfies CaptureTransactionCandidate];
  });

  return {
    candidates,
    cardLast4: extractCardLast4(lines)
  };
};

export const isCaptureCandidateComplete = (candidate: CaptureTransactionCandidate) => Boolean(
  candidate.description.trim()
  && candidate.date
  && candidate.amount !== null
  && candidate.amount > 0
);

const getIsoDayNumber = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
};

const getMerchantTokens = (value: string) => Array.from(new Set(
  normalizeIdentityText(value)
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter(token => (
      token.length >= 3
      && !/^\d+$/.test(token)
      && !DUPLICATE_MERCHANT_NOISE_TOKENS.has(token)
    ))
));

const compareMerchantDescriptions = (candidateValue: string, existingValue: string) => {
  const candidateTokens = getMerchantTokens(candidateValue);
  const existingTokens = getMerchantTokens(existingValue);
  if (candidateTokens.length === 0 || existingTokens.length === 0) return null;

  const existingSet = new Set(existingTokens);
  const sharedMerchantTokens = candidateTokens.filter(token => existingSet.has(token));
  if (sharedMerchantTokens.length === 0) return null;

  const merchantSimilarity = sharedMerchantTokens.length / Math.min(candidateTokens.length, existingTokens.length);
  const hasDistinctiveToken = sharedMerchantTokens.some(token => token.length >= 4)
    || (candidateTokens.length === 1 && existingTokens.length === 1);
  if (!hasDistinctiveToken || merchantSimilarity < 0.5) return null;

  return { merchantSimilarity, sharedMerchantTokens };
};

/**
 * Finds review candidates only. A match must never be omitted automatically:
 * two valid purchases can share date, amount and merchant.
 */
export const findPotentialCaptureDuplicates = (
  candidate: CaptureTransactionCandidate,
  existingTransactions: ExistingCaptureTransaction[]
): PotentialCaptureDuplicate[] => {
  if (!candidate.date || candidate.amount === null) return [];

  const candidateDescriptions = [
    candidate.originalDescription,
    candidate.description,
    candidate.normalizedMerchant
  ].map(value => value.trim()).filter(Boolean);

  if (candidateDescriptions.length === 0) return [];
  const candidateDay = getIsoDayNumber(candidate.date);
  if (candidateDay === null) return [];

  return existingTransactions.flatMap(existing => {
    if (existing.type && existing.type !== 'egreso') return [];
    if (Math.abs(Number(existing.amount)) !== candidate.amount) return [];

    const existingDay = getIsoDayNumber(existing.date);
    if (existingDay === null) return [];
    const dateDistanceDays = Math.abs(existingDay - candidateDay);
    if (dateDistanceDays > CAPTURE_DUPLICATE_DATE_WINDOW_DAYS) return [];

    const existingDescriptions = [
      existing.description,
      existing.originalDescription,
      existing.sourceOriginalDescription
    ].filter((value): value is string => Boolean(value?.trim()));

    const merchantMatches = candidateDescriptions.flatMap(candidateDescription => (
      existingDescriptions.flatMap(existingDescription => {
        const comparison = compareMerchantDescriptions(candidateDescription, existingDescription);
        return comparison ? [comparison] : [];
      })
    ));
    if (merchantMatches.length === 0) return [];

    const bestMatch = merchantMatches.sort((a, b) => (
      b.merchantSimilarity - a.merchantSimilarity
      || b.sharedMerchantTokens.length - a.sharedMerchantTokens.length
    ))[0];

    return [{
      ...existing,
      dateDistanceDays,
      merchantSimilarity: bestMatch.merchantSimilarity,
      sharedMerchantTokens: bestMatch.sharedMerchantTokens
    }];
  }).sort((a, b) => (
    a.dateDistanceDays - b.dateDistanceDays
    || b.merchantSimilarity - a.merchantSimilarity
  ));
};
