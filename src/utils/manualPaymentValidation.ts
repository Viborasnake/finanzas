export interface ManualPaymentValidationInput {
  amount: string;
  date: string;
  bank: string;
  allowedBanks: string[];
  periodStart: string;
  periodEnd: string;
}

export interface ManualPaymentErrors {
  amount: string;
  date: string;
  bank: string;
}

export const validateManualPayment = ({
  amount,
  date,
  bank,
  allowedBanks,
  periodStart,
  periodEnd
}: ManualPaymentValidationInput): ManualPaymentErrors => {
  const parsedAmount = Number(amount);

  return {
    amount: !amount.trim()
      ? 'Ingresa el monto pagado.'
      : !Number.isFinite(parsedAmount) || parsedAmount <= 0
        ? 'El monto debe ser mayor que $0.'
        : '',
    date: !date
      ? 'Selecciona la fecha del pago.'
      : date < periodStart || date > periodEnd
        ? 'La fecha debe estar dentro del periodo que estás revisando.'
        : '',
    bank: !bank
      ? 'Selecciona el banco desde el que pagaste.'
      : !allowedBanks.includes(bank)
        ? 'Selecciona uno de tus bancos conectados.'
        : ''
  };
};

export const hasManualPaymentErrors = (errors: ManualPaymentErrors) => Object.values(errors).some(Boolean);
