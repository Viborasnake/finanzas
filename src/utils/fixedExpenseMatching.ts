type TransactionLike = Record<string, any>;
type FixedExpenseLike = Record<string, any>;

const normalizeText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const normalizeMovementType = (value: unknown) => {
  const normalized = normalizeText(value);
  if (['egreso', 'gasto real', 'expense', 'gasto'].includes(normalized)) return 'egreso';
  if (['ingreso', 'income'].includes(normalized)) return 'ingreso';
  if (['movimiento interno', 'interno'].includes(normalized)) return 'movimiento interno';
  if (['ahorro/inversion', 'ahorro', 'inversion'].includes(normalized)) return 'ahorro/inversion';
  return normalized;
};

const getTransactionDescription = (tx: TransactionLike) => [
  tx.description,
  tx.original_description,
  tx.raw_data ? Object.values(tx.raw_data).join(' ') : ''
].filter(Boolean).join(' ');

export const getTransactionCategory = (tx: TransactionLike) => ({
  tipo: tx.tipo_movimiento || tx.category_tipo || (tx.type === 'egreso' ? 'Egreso' : tx.type === 'ingreso' ? 'Ingreso' : ''),
  principal: tx.categoria_principal || tx.category_principal || '',
  secundaria: tx.categoria_secundaria || tx.category_secundaria || ''
});

export const evaluateAccountMatch = (tx: TransactionLike, item: FixedExpenseLike) => {
  if (!item.categoria_principal) {
    return { matches: false, reason: 'La cuenta no tiene categoría vinculada' };
  }

  const transactionCategory = getTransactionCategory(tx);
  const typeMatches = normalizeMovementType(transactionCategory.tipo) === normalizeMovementType(item.tipo_movimiento || 'Egreso');
  const principalMatches = normalizeText(transactionCategory.principal) === normalizeText(item.categoria_principal);
  const secondaryMatches = !item.categoria_secundaria
    || normalizeText(transactionCategory.secundaria) === normalizeText(item.categoria_secundaria);

  if (typeMatches && principalMatches && secondaryMatches) {
    return {
      matches: true,
      reason: item.categoria_secundaria
        ? 'Coincidencia exacta de tipo, categoría y subcategoría'
        : 'Coincidencia exacta de tipo y categoría principal'
    };
  }

  return { matches: false, reason: 'La categoría de la transacción es diferente' };
};

export const evaluateAccountCandidate = (tx: TransactionLike, item: FixedExpenseLike) => {
  const description = normalizeText(getTransactionDescription(tx));
  const keyword = normalizeText(item.keyword);
  const accountName = normalizeText(item.name);
  const nameTokens = accountName.split(/[^a-z0-9]+/).filter(token => token.length >= 3);
  const transactionCategory = getTransactionCategory(tx);
  const isExpense = tx.type === 'egreso'
    || Number(tx.amount || 0) < 0
    || normalizeMovementType(transactionCategory.tipo) === 'egreso';

  if (!isExpense) return null;
  if (keyword && description.includes(keyword)) {
    return { tx, score: 100, reason: `Contiene la palabra configurada "${item.keyword}"` };
  }
  if ((accountName.includes(' ') || accountName.length >= 5) && description.includes(accountName)) {
    return { tx, score: 82, reason: `La descripción contiene "${item.name}"` };
  }

  const matchingToken = nameTokens.find(token => description.split(/[^a-z0-9]+/).includes(token));
  if (matchingToken) {
    return { tx, score: 68, reason: `La descripción contiene "${matchingToken}"` };
  }

  if (
    item.categoria_principal
    && normalizeText(transactionCategory.principal) === normalizeText(item.categoria_principal)
    && !normalizeText(transactionCategory.secundaria)
  ) {
    return { tx, score: 42, reason: `Está en "${item.categoria_principal}" pero aún no tiene subcategoría` };
  }

  return null;
};
