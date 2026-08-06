-- Async cartola intake for iOS Shortcuts / future email-telegram adapters.
-- Files land in storage; user reviews them later in Import.

CREATE TABLE IF NOT EXISTS public.intake_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'iPhone',
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS intake_tokens_user_id_idx
  ON public.intake_tokens (user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.intake_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.intake_tokens(id) ON DELETE SET NULL,
  filename text NOT NULL,
  content_type text,
  byte_size bigint,
  storage_path text NOT NULL,
  source text NOT NULL DEFAULT 'ios_shortcut'
    CHECK (source IN ('ios_shortcut', 'android_share', 'email', 'telegram', 'api')),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'ready', 'imported', 'error', 'discarded')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_jobs_user_created_idx
  ON public.intake_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS intake_jobs_user_status_idx
  ON public.intake_jobs (user_id, status);

ALTER TABLE public.intake_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intake_tokens_select_own ON public.intake_tokens;
CREATE POLICY intake_tokens_select_own
  ON public.intake_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS intake_tokens_insert_own ON public.intake_tokens;
CREATE POLICY intake_tokens_insert_own
  ON public.intake_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS intake_tokens_update_own ON public.intake_tokens;
CREATE POLICY intake_tokens_update_own
  ON public.intake_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS intake_jobs_select_own ON public.intake_jobs;
CREATE POLICY intake_jobs_select_own
  ON public.intake_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS intake_jobs_update_own ON public.intake_jobs;
CREATE POLICY intake_jobs_update_own
  ON public.intake_jobs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.intake_tokens TO authenticated;
GRANT SELECT, UPDATE ON public.intake_jobs TO authenticated;

-- Private bucket for incoming cartolas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cartola-intake',
  'cartola-intake',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Users can read their own intake files (path prefix = user_id)
DROP POLICY IF EXISTS cartola_intake_select_own ON storage.objects;
CREATE POLICY cartola_intake_select_own
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cartola-intake'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS cartola_intake_delete_own ON storage.objects;
CREATE POLICY cartola_intake_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cartola-intake'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMENT ON TABLE public.intake_tokens IS
  'Long-lived device tokens for iOS Shortcuts / external cartola intake.';
COMMENT ON TABLE public.intake_jobs IS
  'Files received from shortcuts/email/telegram pending user import review.';
