/** Client-side helpers for iOS Shortcut / device intake tokens. */

export type IntakeTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type IntakeJobRow = {
  id: string;
  filename: string;
  content_type: string | null;
  byte_size: number | null;
  storage_path: string;
  source: string;
  status: 'received' | 'ready' | 'imported' | 'error' | 'discarded';
  error_message: string | null;
  created_at: string;
};

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Generate a one-time-display secret for Shortcuts (never stored in plain text). */
export function generateIntakeTokenSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `msf_${body}`;
}

export function getIntakeUploadUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || '';
  return `${base}/functions/v1/intake-upload`;
}

export function buildShortcutSetupText(params: {
  uploadUrl: string;
  token: string;
  appOrigin: string;
}): string {
  const { uploadUrl, token, appOrigin } = params;
  return [
    'Atajo MisFinanzas — Enviar cartola',
    '',
    '1) Abre la app Atajos en el iPhone → + → Nueva atajo.',
    '2) Añade la acción: “Recibir [Archivos] de [Compartir hoja]”.',
    '3) Añade “Obtener contenido de URL” con:',
    `   URL: ${uploadUrl}`,
    '   Método: POST',
    '   Cuerpo: Formulario',
    '   Campo file: Archivo compartido (el de la acción 1)',
    '   Cabeceras:',
    `     x-intake-token: ${token}`,
    '4) (Opcional) Añade “Mostrar resultado” o “Notificación”.',
    '5) Nombre del atajo: “Enviar a MisFinanzas”.',
    '6) En cualquier PDF/CSV → Compartir → Enviar a MisFinanzas.',
    '',
    `Luego revisa en: ${appOrigin}/import`,
    '',
    '⚠️ Guarda el token en un lugar seguro. Solo se muestra una vez.',
  ].join('\n');
}
