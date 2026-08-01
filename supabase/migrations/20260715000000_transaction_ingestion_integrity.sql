-- Make statement imports idempotent at the database boundary. Financial
-- similarity (date, amount and description) is intentionally not unique: two
-- legitimate transactions may share those values.

CREATE TABLE IF NOT EXISTS public.transaction_import_batches (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank text NOT NULL,
  source_kind text NOT NULL DEFAULT 'statement_import',
  file_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  requested_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamptz,
  CONSTRAINT transaction_import_batches_file_hash_check
    CHECK (file_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT transaction_import_batches_status_check
    CHECK (status IN ('processing', 'completed', 'failed')),
  CONSTRAINT transaction_import_batches_counts_check
    CHECK (
      requested_count >= 0
      AND inserted_count >= 0
      AND skipped_count >= 0
      AND inserted_count + skipped_count <= requested_count
    ),
  CONSTRAINT transaction_import_batches_identity_key
    UNIQUE (user_id, bank, source_kind, file_hash)
);

ALTER TABLE public.transaction_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own import batches"
ON public.transaction_import_batches
FOR SELECT
USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.transaction_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.transaction_import_batches TO authenticated;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS source_file_hash text,
  ADD COLUMN IF NOT EXISTS source_row_key text,
  ADD COLUMN IF NOT EXISTS candidate_fingerprint text,
  ADD COLUMN IF NOT EXISTS ingestion_batch_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_ingestion_batch_id_fkey'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_ingestion_batch_id_fkey
      FOREIGN KEY (ingestion_batch_id)
      REFERENCES public.transaction_import_batches(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_source_file_identity_check'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_source_file_identity_check
      CHECK (
        (source_file_hash IS NULL AND source_row_key IS NULL)
        OR (
          source_file_hash ~ '^[0-9a-f]{64}$'
          AND NULLIF(btrim(source_row_key), '') IS NOT NULL
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_source_file_row_unique
ON public.transactions (user_id, bank, source_kind, source_file_hash, source_row_key)
WHERE source_file_hash IS NOT NULL AND source_row_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_source_external_id_unique
ON public.transactions (user_id, bank, source_kind, source_external_id)
WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_candidate_fingerprint_idx
ON public.transactions (user_id, candidate_fingerprint)
WHERE candidate_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_ingestion_batch_id_idx
ON public.transactions (ingestion_batch_id)
WHERE ingestion_batch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ingest_statement_transactions(
  p_bank text,
  p_file_hash text,
  p_rows jsonb,
  p_source_kind text DEFAULT 'statement_import'
)
RETURNS TABLE (
  import_batch_id uuid,
  inserted_count integer,
  skipped_count integer,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bank text := NULLIF(pg_catalog.btrim(p_bank), '');
  v_file_hash text := pg_catalog.lower(NULLIF(pg_catalog.btrim(p_file_hash), ''));
  v_source_kind text := NULLIF(pg_catalog.btrim(p_source_kind), '');
  v_batch_id uuid;
  v_requested_count integer;
  v_inserted_count integer := 0;
  v_batch_reused boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF v_bank IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Bank is required';
  END IF;

  IF v_source_kind IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Source kind is required';
  END IF;

  IF v_file_hash IS NULL OR v_file_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid SHA-256 file hash is required';
  END IF;

  IF p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Rows must be a JSON array';
  END IF;

  v_requested_count := pg_catalog.jsonb_array_length(p_rows);

  IF v_requested_count = 0 OR v_requested_count > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Import must contain between 1 and 5000 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_rows) AS item(row_data)
    WHERE NULLIF(pg_catalog.btrim(item.row_data ->> 'source_row_key'), '') IS NULL
      OR NULLIF(pg_catalog.btrim(item.row_data ->> 'date'), '') IS NULL
      OR NULLIF(pg_catalog.btrim(item.row_data ->> 'description'), '') IS NULL
      OR NULLIF(pg_catalog.btrim(item.row_data ->> 'amount'), '') IS NULL
      OR item.row_data ->> 'type' NOT IN ('ingreso', 'egreso')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every row requires source_row_key, date, description, amount and a valid type';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_rows) AS item(row_data)
    GROUP BY pg_catalog.btrim(item.row_data ->> 'source_row_key')
    HAVING pg_catalog.count(*) > 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Source row keys must be unique within an import';
  END IF;

  -- Serialize retries and concurrent submissions of the same statement.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || ':' || v_bank || ':' || v_source_kind || ':' || v_file_hash,
      0
    )
  );

  INSERT INTO public.transaction_import_batches (
    user_id,
    bank,
    source_kind,
    file_hash,
    requested_count
  )
  VALUES (
    v_user_id,
    v_bank,
    v_source_kind,
    v_file_hash,
    0
  )
  ON CONFLICT (user_id, bank, source_kind, file_hash) DO NOTHING
  RETURNING id INTO v_batch_id;

  IF v_batch_id IS NULL THEN
    SELECT batch.id
    INTO v_batch_id
    FROM public.transaction_import_batches AS batch
    WHERE batch.user_id = v_user_id
      AND batch.bank = v_bank
      AND batch.source_kind = v_source_kind
      AND batch.file_hash = v_file_hash;
    v_batch_reused := true;
  END IF;

  WITH input_rows AS (
    SELECT
      item.row_data,
      pg_catalog.btrim(item.row_data ->> 'source_row_key') AS source_row_key
    FROM pg_catalog.jsonb_array_elements(p_rows) AS item(row_data)
  )
  INSERT INTO public.transactions (
    user_id,
    bank,
    date,
    description,
    amount,
    type,
    raw_data,
    tipo_movimiento,
    categoria_principal,
    categoria_secundaria,
    source_kind,
    source_external_id,
    source_file_hash,
    source_row_key,
    candidate_fingerprint,
    ingestion_batch_id
  )
  SELECT
    v_user_id,
    v_bank,
    (input.row_data ->> 'date')::date,
    input.row_data ->> 'description',
    (input.row_data ->> 'amount')::numeric,
    input.row_data ->> 'type',
    COALESCE(input.row_data -> 'raw_data', '{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        '_source',
        COALESCE(input.row_data -> 'raw_data' -> '_source', '{}'::jsonb)
          || pg_catalog.jsonb_build_object(
            'kind', v_source_kind,
            'file_hash', v_file_hash,
            'row_key', input.source_row_key
          )
      ),
    NULLIF(input.row_data ->> 'tipo_movimiento', ''),
    NULLIF(input.row_data ->> 'categoria_principal', ''),
    NULLIF(input.row_data ->> 'categoria_secundaria', ''),
    v_source_kind,
    NULLIF(pg_catalog.btrim(input.row_data ->> 'source_external_id'), ''),
    v_file_hash,
    input.source_row_key,
    NULLIF(input.row_data ->> 'candidate_fingerprint', ''),
    v_batch_id
  FROM input_rows AS input
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.transactions AS existing
    WHERE existing.user_id = v_user_id
      AND existing.bank = v_bank
      AND COALESCE(existing.source_kind, existing.raw_data #>> '{_source,kind}') = v_source_kind
      AND COALESCE(existing.source_file_hash, existing.raw_data #>> '{_source,file_hash}') = v_file_hash
      AND COALESCE(existing.source_row_key, existing.raw_data #>> '{_source,row_key}') = input.source_row_key
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  UPDATE public.transaction_import_batches
  SET
    status = 'completed',
    requested_count = requested_count + v_requested_count,
    inserted_count = inserted_count + v_inserted_count,
    skipped_count = skipped_count + (v_requested_count - v_inserted_count),
    completed_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  WHERE id = v_batch_id;

  RETURN QUERY
  SELECT
    v_batch_id,
    v_inserted_count,
    v_requested_count - v_inserted_count,
    v_batch_reused AND v_inserted_count = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_statement_transactions(text, text, jsonb, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_statement_transactions(text, text, jsonb, text)
TO authenticated;

COMMENT ON FUNCTION public.ingest_statement_transactions(text, text, jsonb, text) IS
'Atomically imports a statement and safely replays the same file without inserting its transactions twice.';
