export const toLocalDateInput = (value: Date) => [
  value.getFullYear(),
  String(value.getMonth() + 1).padStart(2, '0'),
  String(value.getDate()).padStart(2, '0')
].join('-');

export const parseLocalDateInput = (value: string) => {
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};
