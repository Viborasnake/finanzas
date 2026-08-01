-- Qualify batch counters inside the RPC. The output column names of a
-- RETURNS TABLE function are PL/pgSQL variables, so unqualified references in
-- the UPDATE statement are ambiguous.
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

  UPDATE public.transaction_import_batches AS batch
  SET
    status = 'completed',
    requested_count = batch.requested_count + v_requested_count,
    inserted_count = batch.inserted_count + v_inserted_count,
    skipped_count = batch.skipped_count + (v_requested_count - v_inserted_count),
    completed_at = pg_catalog.timezone('utc'::text, pg_catalog.now())
  WHERE batch.id = v_batch_id;

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
