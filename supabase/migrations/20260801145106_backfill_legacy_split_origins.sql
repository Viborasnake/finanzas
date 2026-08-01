-- Two historical Scotiabank splits predate ingestion lineage. Rebuild the
-- same normalized fingerprint produced by the browser from the untouched raw
-- statement fields, not from dates or descriptions edited after the split.

WITH legacy_split_roots AS (
  SELECT
    transaction.id,
    transaction.user_id,
    transaction.bank,
    transaction.type,
    transaction.raw_data,
    CASE
      WHEN transaction.raw_data ->> 'fecha' ~ '^[0-9]{7,8}$' THEN
        pg_catalog.right(transaction.raw_data ->> 'fecha', 4)
          || '-'
          || pg_catalog.substring(
            transaction.raw_data ->> 'fecha',
            pg_catalog.length(transaction.raw_data ->> 'fecha') - 5,
            2
          )
          || '-'
          || pg_catalog.lpad(
            pg_catalog.left(
              transaction.raw_data ->> 'fecha',
              pg_catalog.length(transaction.raw_data ->> 'fecha') - 6
            ),
            2,
            '0'
          )
      ELSE transaction.date::text
    END AS original_date,
    pg_catalog.abs(
      COALESCE((transaction.raw_data ->> 'original_amount')::numeric, transaction.amount)
    ) AS original_amount,
    COALESCE(NULLIF(transaction.raw_data ->> 'descripcion', ''), transaction.description) AS original_description
  FROM public.transactions AS transaction
  WHERE transaction.raw_data ? 'split_group_id'
    AND COALESCE((transaction.raw_data ->> 'is_split_child')::boolean, false) = false
    AND COALESCE(transaction.source_origin_key, transaction.raw_data #>> '{_source,origin_key}') IS NULL
), fingerprints AS (
  SELECT
    legacy.*,
    pg_catalog.upper(pg_catalog.btrim(legacy.bank))
      || '|'
      || legacy.original_date
      || '|'
      || pg_catalog.to_char(legacy.original_amount, 'FM999999999999990.00')
      || '|'
      || pg_catalog.upper(pg_catalog.btrim(legacy.type))
      || '|'
      || pg_catalog.lower(
        pg_catalog.regexp_replace(
          pg_catalog.btrim(
            pg_catalog.translate(
              legacy.original_description,
              'ÁÉÍÓÚÜÑáéíóúüñ',
              'AEIOUUNaeiouun'
            )
          ),
          '\s+',
          ' ',
          'g'
        )
      ) AS candidate_fingerprint
  FROM legacy_split_roots AS legacy
), ranked AS (
  SELECT
    fingerprint.*,
    fingerprint.candidate_fingerprint
      || '|OCC|'
      || pg_catalog.row_number() OVER (
        PARTITION BY fingerprint.user_id, fingerprint.bank, fingerprint.candidate_fingerprint
        ORDER BY fingerprint.id
      )::text AS source_origin_key
  FROM fingerprints AS fingerprint
)
UPDATE public.transactions AS transaction
SET
  source_kind = COALESCE(transaction.source_kind, 'statement_import'),
  candidate_fingerprint = ranked.candidate_fingerprint,
  source_origin_key = ranked.source_origin_key,
  raw_data = COALESCE(transaction.raw_data, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'original_date', ranked.original_date,
      'original_description', ranked.original_description,
      '_source',
      COALESCE(transaction.raw_data -> '_source', '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'kind', 'statement_import',
          'candidate_fingerprint', ranked.candidate_fingerprint,
          'origin_key', ranked.source_origin_key,
          'original_description', ranked.original_description
        )
    )
FROM ranked
WHERE transaction.id = ranked.id;
