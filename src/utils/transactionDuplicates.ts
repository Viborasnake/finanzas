import { buildTransactionCandidateFingerprint } from './transactionIdentity.ts';

export interface DuplicateReviewTransaction {
  id: string;
  bank?: string | null;
  date: string;
  amount: number;
  type?: string | null;
  description?: string | null;
  created_at?: string | null;
  candidate_fingerprint?: string | null;
  source_origin_key?: string | null;
  raw_data?: Record<string, any> | null;
}

export interface DuplicateReviewEntry {
  key: string;
  transactionIds: string[];
  splitGroupId: string | null;
  isSplit: boolean;
  createdAt: string;
  bank: string;
  date: string;
  amount: number;
  type: string;
  description: string;
  fingerprint: string;
}

export interface DuplicateReviewGroup {
  key: string;
  entries: DuplicateReviewEntry[];
  keepEntryKey: string;
  recommendedDeleteIds: string[];
  containsSplit: boolean;
  reason: string;
}

const getSplitGroupId = (transaction: DuplicateReviewTransaction) => (
  transaction.raw_data?.split_group_id || null
);

const getFingerprint = (transaction: DuplicateReviewTransaction) => (
  transaction.candidate_fingerprint
  || transaction.raw_data?._source?.candidate_fingerprint
  || buildTransactionCandidateFingerprint({
    bank: transaction.bank,
    date: transaction.raw_data?.original_date || transaction.date,
    amount: transaction.raw_data?.original_amount ?? transaction.amount,
    type: transaction.type,
    originalDescription: transaction.raw_data?.original_description
      || transaction.raw_data?._source?.original_description
      || transaction.description
  })
);

const toEntry = (
  transactions: DuplicateReviewTransaction[],
  splitGroupId: string | null
): DuplicateReviewEntry => {
  const root = transactions.find(transaction => !transaction.raw_data?.is_split_child) || transactions[0];
  const fingerprint = getFingerprint(root);

  return {
    key: splitGroupId ? `split:${splitGroupId}` : `transaction:${root.id}`,
    transactionIds: transactions.map(transaction => transaction.id),
    splitGroupId,
    isSplit: Boolean(splitGroupId),
    createdAt: root.created_at || '',
    bank: String(root.bank || 'Sin banco'),
    date: String(root.raw_data?.original_date || root.date),
    amount: Number(root.raw_data?.original_amount ?? root.amount),
    type: String(root.type || ''),
    description: String(
      root.raw_data?.original_description
      || root.raw_data?._source?.original_description
      || root.description
      || 'Sin descripción'
    ),
    fingerprint
  };
};

/**
 * Collapses every split group into one logical movement before looking for
 * candidates. This prevents the parts of a legitimate split from being marked
 * as duplicates of each other.
 */
export const buildDuplicateReviewGroups = (
  transactions: DuplicateReviewTransaction[]
): DuplicateReviewGroup[] => {
  const splitGroups = new Map<string, DuplicateReviewTransaction[]>();
  const entries: DuplicateReviewEntry[] = [];

  transactions.forEach(transaction => {
    const splitGroupId = getSplitGroupId(transaction);
    if (!splitGroupId) {
      entries.push(toEntry([transaction], null));
      return;
    }

    const group = splitGroups.get(splitGroupId) || [];
    group.push(transaction);
    splitGroups.set(splitGroupId, group);
  });

  splitGroups.forEach((group, splitGroupId) => {
    entries.push(toEntry(group, splitGroupId));
  });

  const candidates = new Map<string, DuplicateReviewEntry[]>();
  entries.forEach(entry => {
    const group = candidates.get(entry.fingerprint) || [];
    group.push(entry);
    candidates.set(entry.fingerprint, group);
  });

  return Array.from(candidates.entries())
    .filter(([, group]) => group.length > 1)
    .map(([fingerprint, group]) => {
      const sorted = [...group].sort((first, second) => {
        if (first.isSplit !== second.isSplit) return first.isSplit ? -1 : 1;
        const createdComparison = first.createdAt.localeCompare(second.createdAt);
        return createdComparison || first.key.localeCompare(second.key);
      });
      const [keep, ...duplicates] = sorted;
      const containsSplit = sorted.some(entry => entry.isSplit);

      return {
        key: fingerprint,
        entries: sorted,
        keepEntryKey: keep.key,
        recommendedDeleteIds: containsSplit ? duplicates.flatMap(entry => entry.transactionIds) : [],
        containsSplit,
        reason: containsSplit
          ? 'Una transacción dividida coincide con otro movimiento completo.'
          : 'Coinciden banco, fecha, monto, tipo y descripción normalizada.'
      };
    })
    .sort((first, second) => {
      if (first.containsSplit !== second.containsSplit) return first.containsSplit ? -1 : 1;
      return second.entries.length - first.entries.length;
    });
};
