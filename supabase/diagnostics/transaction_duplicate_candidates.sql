-- Read-only duplicate investigation for the schema that is currently in
-- production. Run each result set independently in the Supabase SQL editor.
-- Nothing in this file updates or deletes financial data.

-- 1. Strong file-row identities recorded by recent statement imports.
-- Any group returned here is safe to investigate as an ingestion replay,
-- because the same source file and physical row were stored more than once.
WITH source_rows AS (
  SELECT
    transaction.id,
    transaction.user_id,
    transaction.bank,
    transaction.date,
    transaction.amount,
    transaction.type,
    transaction.description,
    transaction.created_at,
    transaction.raw_data #>> '{_source,kind}' AS source_kind,
    transaction.raw_data #>> '{_source,file_hash}' AS file_hash,
    transaction.raw_data #>> '{_source,row_key}' AS row_key
  FROM public.transactions AS transaction
  WHERE transaction.raw_data #>> '{_source,file_hash}' IS NOT NULL
    AND transaction.raw_data #>> '{_source,row_key}' IS NOT NULL
), repeated_source_rows AS (
  SELECT
    user_id,
    bank,
    source_kind,
    file_hash,
    row_key
  FROM source_rows
  GROUP BY user_id, bank, source_kind, file_hash, row_key
  HAVING count(*) > 1
)
SELECT source.*
FROM source_rows AS source
JOIN repeated_source_rows AS repeated
  USING (user_id, bank, source_kind, file_hash, row_key)
ORDER BY source.user_id, source.bank, source.file_hash, source.row_key, source.created_at;

-- 2. Strong external identifiers, when a source provided one.
WITH external_rows AS (
  SELECT
    transaction.id,
    transaction.user_id,
    transaction.bank,
    transaction.date,
    transaction.amount,
    transaction.type,
    transaction.description,
    transaction.created_at,
    transaction.raw_data #>> '{_source,kind}' AS source_kind,
    transaction.raw_data #>> '{_source,transaction_id}' AS source_transaction_id
  FROM public.transactions AS transaction
  WHERE transaction.raw_data #>> '{_source,transaction_id}' IS NOT NULL
), repeated_external_ids AS (
  SELECT
    user_id,
    bank,
    source_kind,
    source_transaction_id
  FROM external_rows
  GROUP BY user_id, bank, source_kind, source_transaction_id
  HAVING count(*) > 1
)
SELECT source.*
FROM external_rows AS source
JOIN repeated_external_ids AS repeated
  USING (user_id, bank, source_kind, source_transaction_id)
ORDER BY source.user_id, source.bank, source.source_transaction_id, source.created_at;

-- 3. Similar financial records. These are candidates only: equal date, amount
-- and description are not sufficient evidence to exclude either transaction.
WITH comparable_rows AS (
  SELECT
    transaction.id,
    transaction.user_id,
    transaction.bank,
    transaction.date,
    transaction.amount,
    transaction.type,
    transaction.description,
    transaction.created_at,
    lower(regexp_replace(btrim(transaction.description), '\s+', ' ', 'g')) AS normalized_description
  FROM public.transactions AS transaction
), candidate_groups AS (
  SELECT
    user_id,
    bank,
    date,
    amount,
    type,
    normalized_description
  FROM comparable_rows
  GROUP BY user_id, bank, date, amount, type, normalized_description
  HAVING count(*) > 1
)
SELECT candidate.*
FROM comparable_rows AS candidate
JOIN candidate_groups AS duplicate_candidate
  USING (user_id, bank, date, amount, type, normalized_description)
ORDER BY candidate.user_id, candidate.bank, candidate.date, candidate.amount, candidate.created_at;
