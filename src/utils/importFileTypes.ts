export const IMPORT_FILE_EXTENSIONS = ['.csv', '.txt', '.dat', '.xls', '.xlsx', '.pdf'];

export const IMPORT_DROPZONE_ACCEPT: Record<string, string[]> = {
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/octet-stream': ['.dat'],
  'application/pdf': ['.pdf']
};

export const IMPORT_FORMAT_LABEL = 'CSV, TXT, DAT, XLS, XLSX o PDF';

export const isSupportedImportFile = (file: Pick<File, 'name'>) => {
  const normalizedName = file.name.trim().toLowerCase();
  return IMPORT_FILE_EXTENSIONS.some(extension => normalizedName.endsWith(extension));
};

export const getUnsupportedImportFileMessage = (fileName?: string) => {
  const prefix = fileName ? `“${fileName}” no es compatible.` : 'Ese archivo no es compatible.';
  return `${prefix} Usa una cartola en formato ${IMPORT_FORMAT_LABEL}.`;
};
