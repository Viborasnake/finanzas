export interface SemanticTransaction {
  description?: string | null;
  original_description?: string | null;
  tipo_movimiento?: string | null;
  categoria_principal?: string | null;
  categoria_secundaria?: string | null;
}

export const normalizeSemanticText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const INVESTMENT_DESCRIPTION_MARKERS = [
  'abono liquidacion captacion',
  'liquidacion captacion',
  'pago captacion inicial',
  'constitucion captacion',
  'deposito a plazo',
  'rescate dap',
  'vencimiento dap',
  'renovacion dap'
];

export const isInvestmentMovement = (transaction: SemanticTransaction) => {
  const movementType = normalizeSemanticText(transaction.tipo_movimiento);
  const principal = normalizeSemanticText(transaction.categoria_principal);
  const description = normalizeSemanticText(`${transaction.description || ''} ${transaction.original_description || ''}`);

  return movementType === 'ahorro/inversion'
    || principal === 'ahorro/inversion'
    || INVESTMENT_DESCRIPTION_MARKERS.some(marker => description.includes(marker));
};

export const isOwnTransferMovement = (transaction: SemanticTransaction) => {
  if (isInvestmentMovement(transaction)) return false;
  const movementType = normalizeSemanticText(transaction.tipo_movimiento);
  const secondary = normalizeSemanticText(transaction.categoria_secundaria);

  return movementType === 'movimiento interno'
    || secondary === 'transferencias propias'
    || secondary === 'transferencia personal';
};

export const isCreditCardSettlement = (transaction: SemanticTransaction) => {
  const principal = normalizeSemanticText(transaction.categoria_principal);
  const secondary = normalizeSemanticText(transaction.categoria_secundaria);
  const description = normalizeSemanticText(`${transaction.description || ''} ${transaction.original_description || ''}`);

  return principal === 'pago tarjeta credito'
    || secondary === 'tarjeta credito'
    || description.includes('pago tarjeta de credito')
    || description.includes('pago tarjeta credito');
};
