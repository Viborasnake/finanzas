-- Legacy data normalization previously executed from ProtectedRoute.
-- Keeping it here makes the operation versioned, reviewable and independent
-- from a user's navigation through the product.

UPDATE public.transactions
SET tipo_movimiento = 'Egreso'
WHERE tipo_movimiento = 'Gasto Real';

UPDATE public.transactions
SET categoria_principal = 'Hijos'
WHERE categoria_principal = 'Benja';

UPDATE public.transactions
SET
  categoria_principal = 'Transferencias',
  categoria_secundaria = 'Transferencias de Otras Personas'
WHERE categoria_principal = 'Transferencias de Otras Personas';

UPDATE public.classification_rules
SET category_tipo = 'Egreso'
WHERE category_tipo = 'Gasto Real';

UPDATE public.classification_rules
SET category_principal = 'Hijos'
WHERE category_principal = 'Benja';

UPDATE public.classification_rules
SET
  category_principal = 'Transferencias',
  category_secundaria = 'Transferencias de Otras Personas'
WHERE category_principal = 'Transferencias de Otras Personas';

-- Itaú spreadsheets use a "Movimiento" column. Older imports could be saved
-- under Scotiabank before bank detection was corrected.
UPDATE public.transactions AS transaction
SET bank = 'Itaú'
WHERE transaction.bank = 'Scotiabank'
  AND jsonb_typeof(transaction.raw_data) = 'object'
  AND EXISTS (
    SELECT 1
    FROM jsonb_object_keys(transaction.raw_data) AS keys(key_name)
    WHERE lower(keys.key_name) LIKE '%movimiento%'
  );

-- Preserve known contacts while making them available to the current rules
-- engine. The source records are intentionally not deleted.
INSERT INTO public.classification_rules (
  user_id,
  bank,
  condition_type,
  condition_value,
  category_tipo,
  category_principal,
  category_secundaria
)
SELECT
  contact.user_id,
  'global',
  'contains',
  COALESCE(NULLIF(contact.rut, ''), contact.name),
  'Egreso',
  'Transferencias',
  'Transferencias a Otras Personas'
FROM public.known_contacts AS contact
WHERE COALESCE(NULLIF(contact.rut, ''), contact.name) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.classification_rules AS rule
    WHERE rule.user_id = contact.user_id
      AND lower(rule.condition_value) = lower(COALESCE(NULLIF(contact.rut, ''), contact.name))
  );

-- Some early installations stored rules as JSON in user_settings. This block
-- only runs when that legacy column still exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'classification_rules'
  ) THEN
    EXECUTE $migration$
      INSERT INTO public.classification_rules (
        user_id,
        bank,
        condition_type,
        condition_value,
        category_tipo,
        category_principal,
        category_secundaria
      )
      SELECT
        settings.user_id,
        'global',
        'contains',
        COALESCE(rule_data ->> 'keyword', rule_data ->> 'condition_value'),
        CASE
          WHEN COALESCE(rule_data ->> 'tipo_movimiento', rule_data ->> 'category_tipo') = 'Gasto Real' THEN 'Egreso'
          ELSE COALESCE(rule_data ->> 'tipo_movimiento', rule_data ->> 'category_tipo')
        END,
        CASE
          WHEN COALESCE(rule_data ->> 'categoria_principal', rule_data ->> 'category_principal') = 'Benja' THEN 'Hijos'
          WHEN COALESCE(rule_data ->> 'categoria_principal', rule_data ->> 'category_principal') = 'Transferencias de Otras Personas' THEN 'Transferencias'
          ELSE COALESCE(rule_data ->> 'categoria_principal', rule_data ->> 'category_principal')
        END,
        CASE
          WHEN COALESCE(rule_data ->> 'categoria_principal', rule_data ->> 'category_principal') = 'Transferencias de Otras Personas' THEN 'Transferencias de Otras Personas'
          ELSE COALESCE(rule_data ->> 'categoria_secundaria', rule_data ->> 'category_secundaria', '')
        END
      FROM public.user_settings AS settings
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(settings.classification_rules, '[]'::jsonb)) AS rule_data
      WHERE COALESCE(rule_data ->> 'keyword', rule_data ->> 'condition_value') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.classification_rules AS existing_rule
          WHERE existing_rule.user_id = settings.user_id
            AND lower(existing_rule.condition_value) = lower(COALESCE(rule_data ->> 'keyword', rule_data ->> 'condition_value'))
        )
    $migration$;
  END IF;
END
$$;
