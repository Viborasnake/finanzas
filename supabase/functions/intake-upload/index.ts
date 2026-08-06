// Deno Edge Function: receive cartola files from iOS Shortcuts (token auth).
// POST multipart/form-data field "file" + header x-intake-token: msf_...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-intake-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_EXT = ['.csv', '.txt', '.dat', '.xls', '.xlsx', '.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const MAX_BYTES = 20 * 1024 * 1024;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function safeFilename(name: string): string {
  const base = name.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/gi, '_').slice(0, 120);
  return base || 'cartola.bin';
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'Use POST with multipart file field "file".' });
  }

  try {
    const token =
      req.headers.get('x-intake-token')?.trim() ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ||
      '';

    if (!token.startsWith('msf_') || token.length < 20) {
      return json(401, { error: 'Token de intake inválido.' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: 'Falta configuración del servidor.' });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const tokenHash = await sha256Hex(token);
    const { data: tokenRow, error: tokenError } = await admin
      .from('intake_tokens')
      .select('id, user_id, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenError) {
      console.error(tokenError);
      return json(500, { error: 'No se pudo validar el token.' });
    }
    if (!tokenRow || tokenRow.revoked_at) {
      return json(401, { error: 'Token revocado o inexistente.' });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return json(400, { error: 'Envía el archivo en el campo multipart "file".' });
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return json(400, { error: 'Archivo vacío o mayor a 20 MB.' });
    }

    const filename = safeFilename(file.name || 'cartola.bin');
    if (!hasAllowedExtension(filename)) {
      return json(400, {
        error: 'Formato no soportado. Usa CSV, TXT, DAT, XLS, XLSX, PDF o imagen.',
      });
    }

    const jobId = crypto.randomUUID();
    const storagePath = `${tokenRow.user_id}/${jobId}/${filename}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from('cartola-intake')
      .upload(storagePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error(uploadError);
      return json(500, { error: 'No se pudo guardar el archivo.', details: uploadError.message });
    }

    const sourceRaw = String(form.get('source') || 'ios_shortcut');
    const source = ['ios_shortcut', 'android_share', 'email', 'telegram', 'api'].includes(sourceRaw)
      ? sourceRaw
      : 'ios_shortcut';

    const { data: job, error: jobError } = await admin
      .from('intake_jobs')
      .insert({
        id: jobId,
        user_id: tokenRow.user_id,
        token_id: tokenRow.id,
        filename,
        content_type: file.type || null,
        byte_size: file.size,
        storage_path: storagePath,
        source,
        status: 'received',
      })
      .select('id, filename, status, created_at')
      .single();

    if (jobError) {
      console.error(jobError);
      return json(500, { error: 'Archivo guardado pero no se registró el lote.', details: jobError.message });
    }

    await admin
      .from('intake_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenRow.id);

    return json(200, {
      ok: true,
      message: 'Cartola recibida. Ábrela en MisFinanzas → Importar.',
      job,
    });
  } catch (err) {
    console.error(err);
    return json(500, {
      error: err instanceof Error ? err.message : 'Error inesperado en intake-upload',
    });
  }
});
