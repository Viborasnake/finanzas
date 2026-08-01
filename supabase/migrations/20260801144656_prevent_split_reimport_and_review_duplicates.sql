-- Preserve each statement row identity after the user splits or redates it.
-- Similar financial attributes remain review candidates; only a matching
-- origin that has already been split is omitted automatically.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_origin_key text;

CREATE INDEX IF NOT EXISTS transactions_source_origin_key_idx
  ON public.transactions (user_id, bank, source_kind, source_origin_key)
  WHERE source_origin_key IS NOT NULL;

WITH ranked_origins AS (
  SELECT
    transaction.id,
    COALESCE(
      transaction.candidate_fingerprint,
      transaction.raw_data #>> '{_source,candidate_fingerprint}'
    )
      || '|OCC|'
      || pg_catalog.row_number() OVER (
        PARTITION BY
          transaction.user_id,
          transaction.bank,
          COALESCE(transaction.source_kind, transaction.raw_data #>> '{_source,kind}'),
          COALESCE(transaction.ingestion_batch_id::text, transaction.source_file_hash),
          COALESCE(
            transaction.candidate_fingerprint,
            transaction.raw_data #>> '{_source,candidate_fingerprint}'
          )
        ORDER BY transaction.source_row_key NULLS LAST, transaction.id
      )::text AS origin_key
  FROM public.transactions AS transaction
  WHERE transaction.source_origin_key IS NULL
    AND COALESCE(transaction.source_file_hash, transaction.raw_data #>> '{_source,file_hash}') IS NOT NULL
    AND COALESCE(
      transaction.candidate_fingerprint,
      transaction.raw_data #>> '{_source,candidate_fingerprint}'
    ) IS NOT NULL
)
UPDATE public.transactions AS transaction
SET
  source_origin_key = origin.origin_key,
  raw_data = COALESCE(transaction.raw_data, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      '_source',
      COALESCE(transaction.raw_data -> '_source', '{}'::jsonb)
        || pg_catalog.jsonb_build_object('origin_key', origin.origin_key)
    )
FROM ranked_origins AS origin
WHERE transaction.id = origin.id;

DROP FUNCTION IF EXISTS public.ingest_statement_transactions(text, text, jsonb, text);

CREATE FUNCTION public.ingest_statement_transactions(
  p_bank text,
  p_file_hash text,
  p_rows jsonb,
  p_source_kind text DEFAULT 'statement_import'::text
)
RETURNS TABLE (
  import_batch_id uuid,
  inserted_count integer,
  skipped_count integer,
  replayed boolean,
  split_skipped_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bank text := NULLIF(pg_catalog.btrim(p_bank), '');
  v_file_hash text := pg_catalog.lower(NULLIF(pg_catalog.btrim(p_file_hash), ''));
  v_source_kind text := NULLIF(pg_catalog.btrim(p_source_kind), '');
  v_batch_id uuid;
  v_requested_count integer;
  v_inserted_count integer := 0;
  v_split_skipped_count integer := 0;
  v_batch_reused boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  IF v_bank IS NULL OR v_source_kind IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Bank and source kind are required';
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
    pg_catalog.hashtextextended(v_user_id::text || ':' || v_bank || ':' || v_source_kind || ':' || v_file_hash, 0)
  );

  INSERT INTO public.transaction_import_batches (user_id, bank, source_kind, file_hash, requested_count)
  VALUES (v_user_id, v_bank, v_source_kind, v_file_hash, 0)
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

  SELECT pg_catalog.count(*)::integer
  INTO v_split_skipped_count
  FROM pg_catalog.jsonb_array_elements(p_rows) AS item(row_data)
  WHERE NULLIF(pg_catalog.btrim(item.row_data ->> 'source_origin_key'), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.transactions AS existing
      WHERE existing.user_id = v_user_id
        AND existing.bank = v_bank
        AND COALESCE(existing.source_kind, existing.raw_data #>> '{_source,kind}') = v_source_kind
        AND COALESCE(existing.source_origin_key, existing.raw_data #>> '{_source,origin_key}') = pg_catalog.btrim(item.row_data ->> 'source_origin_key')
        AND existing.raw_data ? 'split_group_id'
        AND COALESCE((existing.raw_data ->> 'is_split_child')::boolean, false) = false
    );

  WITH input_rows AS (
    SELECT
      item.row_data,
      pg_catalog.btrim(item.row_data ->> 'source_row_key') AS source_row_key,
      NULLIF(pg_catalog.btrim(item.row_data ->> 'source_origin_key'), '') AS source_origin_key
    FROM pg_catalog.jsonb_array_elements(p_rows) AS item(row_data)
  )
  INSERT INTO public.transactions (
    user_id, bank, date, description, amount, type, raw_data,
    tipo_movimiento, categoria_principal, categoria_secundaria,
    source_kind, source_external_id, source_file_hash, source_row_key,
    source_origin_key, candidate_fingerprint, ingestion_batch_id
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
            'row_key', input.source_row_key,
            'origin_key', input.source_origin_key
          )
      ),
    NULLIF(input.row_data ->> 'tipo_movimiento', ''),
    NULLIF(input.row_data ->> 'categoria_principal', ''),
    NULLIF(input.row_data ->> 'categoria_secundaria', ''),
    v_source_kind,
    NULLIF(pg_catalog.btrim(input.row_data ->> 'source_external_id'), ''),
    v_file_hash,
    input.source_row_key,
    input.source_origin_key,
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
  AND NOT EXISTS (
    SELECT 1
    FROM public.transactions AS existing
    WHERE input.source_origin_key IS NOT NULL
      AND existing.user_id = v_user_id
      AND existing.bank = v_bank
      AND COALESCE(existing.source_kind, existing.raw_data #>> '{_source,kind}') = v_source_kind
      AND COALESCE(existing.source_origin_key, existing.raw_data #>> '{_source,origin_key}') = input.source_origin_key
      AND existing.raw_data ? 'split_group_id'
      AND COALESCE((existing.raw_data ->> 'is_split_child')::boolean, false) = false
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
    v_batch_reused AND v_inserted_count = 0,
    v_split_skipped_count;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_statement_transactions(text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_statement_transactions(text, text, jsonb, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.split_transaction(
  p_transaction_id uuid,
  p_parts jsonb,
  p_candidate_fingerprint text,
  p_source_origin_key text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_part jsonb;
  v_split_group_id uuid := gen_random_uuid();
  v_original_amount numeric;
  v_original_date date;
  v_original_description text;
  v_part_count integer;
  v_parts_total numeric;
  v_common_raw_data jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  SELECT transaction.*
  INTO v_transaction
  FROM public.transactions AS transaction
  WHERE transaction.id = p_transaction_id
    AND transaction.user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Transaction not found';
  END IF;

  IF v_transaction.raw_data ? 'split_group_id' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Transaction is already split';
  END IF;

  IF p_parts IS NULL OR pg_catalog.jsonb_typeof(p_parts) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Parts must be a JSON array';
  END IF;

  v_part_count := pg_catalog.jsonb_array_length(p_parts);
  IF v_part_count < 2 OR v_part_count > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A split requires between 2 and 20 parts';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_parts) AS part(value)
    WHERE NULLIF(part.value ->> 'date', '') IS NULL
      OR NULLIF(part.value ->> 'amount', '') IS NULL
      OR (part.value ->> 'amount')::numeric <= 0
      OR NULLIF(part.value ->> 'tipo_movimiento', '') IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Every part requires a positive amount, date and classification';
  END IF;

  SELECT pg_catalog.sum((part.value ->> 'amount')::numeric)
  INTO v_parts_total
  FROM pg_catalog.jsonb_array_elements(p_parts) AS part(value);

  v_original_amount := pg_catalog.abs(COALESCE((v_transaction.raw_data ->> 'original_amount')::numeric, v_transaction.amount));
  IF v_parts_total <> v_original_amount THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Split parts must equal the original amount';
  END IF;

  v_original_date := COALESCE((v_transaction.raw_data ->> 'original_date')::date, v_transaction.date);
  v_original_description := COALESCE(
    NULLIF(v_transaction.raw_data ->> 'original_description', ''),
    NULLIF(v_transaction.raw_data #>> '{_source,original_description}', ''),
    v_transaction.description
  );
  v_common_raw_data := COALESCE(v_transaction.raw_data, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'original_amount', v_original_amount,
      'original_date', v_original_date,
      'original_description', v_original_description,
      'split_group_id', v_split_group_id,
      '_source',
      COALESCE(v_transaction.raw_data -> '_source', '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'candidate_fingerprint', NULLIF(pg_catalog.btrim(p_candidate_fingerprint), ''),
          'origin_key', NULLIF(pg_catalog.btrim(p_source_origin_key), '')
        )
    );

  v_part := p_parts -> 0;
  UPDATE public.transactions
  SET
    amount = CASE WHEN type = 'egreso' THEN -pg_catalog.abs((v_part ->> 'amount')::numeric) ELSE pg_catalog.abs((v_part ->> 'amount')::numeric) END,
    date = (v_part ->> 'date')::date,
    tipo_movimiento = NULLIF(v_part ->> 'tipo_movimiento', ''),
    categoria_principal = NULLIF(v_part ->> 'categoria_principal', ''),
    categoria_secundaria = NULLIF(v_part ->> 'categoria_secundaria', ''),
    candidate_fingerprint = NULLIF(pg_catalog.btrim(p_candidate_fingerprint), ''),
    source_origin_key = NULLIF(pg_catalog.btrim(p_source_origin_key), ''),
    raw_data = v_common_raw_data
  WHERE id = v_transaction.id;

  INSERT INTO public.transactions (
    user_id, date, description, amount, type, bank, is_shared,
    tipo_movimiento, categoria_principal, categoria_secundaria,
    raw_data, source_kind, candidate_fingerprint
  )
  SELECT
    v_transaction.user_id,
    (part.value ->> 'date')::date,
    v_transaction.description,
    CASE WHEN v_transaction.type = 'egreso' THEN -pg_catalog.abs((part.value ->> 'amount')::numeric) ELSE pg_catalog.abs((part.value ->> 'amount')::numeric) END,
    v_transaction.type,
    v_transaction.bank,
    v_transaction.is_shared,
    NULLIF(part.value ->> 'tipo_movimiento', ''),
    NULLIF(part.value ->> 'categoria_principal', ''),
    NULLIF(part.value ->> 'categoria_secundaria', ''),
    v_common_raw_data || pg_catalog.jsonb_build_object('is_split_child', true),
    'split_child',
    NULLIF(pg_catalog.btrim(p_candidate_fingerprint), '')
  FROM pg_catalog.jsonb_array_elements(p_parts) WITH ORDINALITY AS part(value, position)
  WHERE part.position > 1;

  RETURN v_split_group_id;
END;
$$;

REVOKE ALL ON FUNCTION public.split_transaction(uuid, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.split_transaction(uuid, jsonb, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_split_transaction(p_split_group_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_original public.transactions%ROWTYPE;
  v_original_amount numeric;
  v_original_date date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;

  SELECT transaction.*
  INTO v_original
  FROM public.transactions AS transaction
  WHERE transaction.user_id = auth.uid()
    AND transaction.raw_data ->> 'split_group_id' = p_split_group_id::text
    AND COALESCE((transaction.raw_data ->> 'is_split_child')::boolean, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Split transaction not found';
  END IF;

  v_original_amount := pg_catalog.abs((v_original.raw_data ->> 'original_amount')::numeric);
  v_original_date := COALESCE((v_original.raw_data ->> 'original_date')::date, v_original.date);

  DELETE FROM public.transactions
  WHERE user_id = auth.uid()
    AND raw_data ->> 'split_group_id' = p_split_group_id::text
    AND COALESCE((raw_data ->> 'is_split_child')::boolean, false) = true;

  UPDATE public.transactions
  SET
    amount = CASE WHEN type = 'egreso' THEN -v_original_amount ELSE v_original_amount END,
    date = v_original_date,
    raw_data = raw_data - ARRAY['split_group_id', 'original_amount', 'original_date', 'is_split_child']
  WHERE id = v_original.id;

  RETURN v_original.id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_split_transaction(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_split_transaction(uuid)
  TO authenticated;
