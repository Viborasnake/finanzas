import { parseLocalDateInput } from './localDate.ts';

export interface BalanceSnapshotTransaction {
  date: string;
  bank?: string | null;
  created_at?: string | null;
  raw_data?: Record<string, unknown> | null;
}

const normalizeBank = (value: unknown) => String(value || '').toLowerCase();

const parseSignedClp = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const negative = raw.includes('-');
  const digits = raw
    .replace(/\s/g, '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
    .replace(/(?!^)-/g, '');
  const parsed = Number.parseFloat(digits);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
};

export const extractReportedBalance = (transaction: BalanceSnapshotTransaction) => {
  const rawData = transaction.raw_data;
  if (!rawData) return null;

  const balanceKey = Object.keys(rawData).find(key => {
    const normalized = key.toLowerCase();
    return normalized === 'saldo' || normalized.includes('saldo');
  });
  if (balanceKey) return parseSignedClp(rawData[balanceKey]);

  const bank = normalizeBank(transaction.bank);
  if (!bank.includes('consorcio') && !bank.includes('itau') && !bank.includes('itaú')) return null;

  const fullLine = String(rawData.fullLine || '');
  const amounts = Array.from(fullLine.matchAll(/\$\s*(-?\s*[\d.]+(?:,\d{1,2})?)/g));
  if (amounts.length < 2) return null;
  return parseSignedClp(amounts.at(-1)?.[1]);
};

export const getOpeningBalanceSnapshot = (
  transactions: BalanceSnapshotTransaction[],
  periodStart: Date,
  bankIds: string[]
) => {
  const uniqueBanks = Array.from(new Set(bankIds));
  const values: Record<string, number> = {};

  uniqueBanks.forEach(bank => {
    const candidates = transactions
      .filter(transaction => transaction.bank === bank && parseLocalDateInput(transaction.date) < periodStart)
      .sort((first, second) => {
        const dateDifference = parseLocalDateInput(second.date).getTime() - parseLocalDateInput(first.date).getTime();
        if (dateDifference !== 0) return dateDifference;
        return String(second.created_at || '').localeCompare(String(first.created_at || ''));
      });

    for (const candidate of candidates) {
      const balance = extractReportedBalance(candidate);
      if (balance === null) continue;
      values[bank] = balance;
      break;
    }
  });

  const missingBanks = uniqueBanks.filter(bank => values[bank] === undefined);
  return {
    values,
    total: Object.values(values).reduce((sum, value) => sum + value, 0),
    detectedBankCount: uniqueBanks.length - missingBanks.length,
    bankCount: uniqueBanks.length,
    missingBanks,
    complete: uniqueBanks.length > 0 && missingBanks.length === 0
  };
};
