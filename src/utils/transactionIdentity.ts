export interface TransactionIdentityInput {
  bank?: string | null;
  date: string;
  amount: number | string;
  type?: string | null;
  originalDescription?: string | null;
  sourceFileHash?: string | null;
  sourceRowKey?: string | null;
  sourceTransactionId?: string | null;
}

export interface StrongIdentityPartition<T> {
  accepted: T[];
  repeated: T[];
}

const normalizeWhitespace = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');

export const normalizeIdentityText = (value: unknown) => normalizeWhitespace(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const normalizeIdentifier = (value: unknown) => normalizeWhitespace(value).toUpperCase();

const normalizeAmount = (value: number | string) => {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return amount.toFixed(2);
};

/**
 * Returns an identity that is safe to enforce. Similar financial attributes are
 * intentionally excluded because two valid movements can share them.
 */
export const buildStrongTransactionIdentity = (input: TransactionIdentityInput) => {
  const bank = normalizeIdentifier(input.bank);
  const externalId = normalizeIdentifier(input.sourceTransactionId);

  if (bank && externalId) {
    return `external:${bank}:${externalId}`;
  }

  const fileHash = normalizeIdentifier(input.sourceFileHash).toLowerCase();
  const rowKey = normalizeIdentifier(input.sourceRowKey);
  if (bank && fileHash && rowKey) {
    return `file-row:${bank}:${fileHash}:${rowKey}`;
  }

  return null;
};

/**
 * Produces a weak comparison key for candidate discovery only. It must never be
 * used as a database uniqueness constraint.
 */
export const buildTransactionCandidateFingerprint = (input: TransactionIdentityInput) => [
  normalizeIdentifier(input.bank),
  input.date.split('T')[0],
  normalizeAmount(input.amount),
  normalizeIdentifier(input.type),
  normalizeIdentityText(input.originalDescription)
].join('|');

export const partitionByStrongIdentity = <T extends TransactionIdentityInput>(
  rows: T[],
  existingIdentities: Iterable<string> = []
): StrongIdentityPartition<T> => {
  const seen = new Set(existingIdentities);
  const accepted: T[] = [];
  const repeated: T[] = [];

  rows.forEach(row => {
    const identity = buildStrongTransactionIdentity(row);
    if (identity && seen.has(identity)) {
      repeated.push(row);
      return;
    }

    if (identity) seen.add(identity);
    accepted.push(row);
  });

  return { accepted, repeated };
};

export const sha256Hex = async (data: ArrayBuffer) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

export const hashImportFile = async (file: Blob) => sha256Hex(await file.arrayBuffer());
