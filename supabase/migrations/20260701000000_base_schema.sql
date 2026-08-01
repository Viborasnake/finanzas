-- Reproducible structural baseline for a fresh MisFinanzas database.
--
-- This migration intentionally contains schema only. Historical category/data
-- normalization remains in the later dated migrations. Every statement is
-- safe to replay against an installation that already has the legacy tables.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('ingreso', 'egreso')),
  bank text,
  tipo_movimiento text,
  categoria_principal text,
  categoria_secundaria text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_internal_transfer boolean NOT NULL DEFAULT false,
  is_shared boolean NOT NULL DEFAULT false,
  shared_with_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS tipo_movimiento text,
  ADD COLUMN IF NOT EXISTS categoria_principal text,
  ADD COLUMN IF NOT EXISTS categoria_secundaria text,
  ADD COLUMN IF NOT EXISTS is_internal_transfer boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rut text,
  banks jsonb NOT NULL DEFAULT '[]'::jsonb,
  main_bank text,
  old_custom_categories jsonb,
  custom_categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS banks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS main_bank text,
  ADD COLUMN IF NOT EXISTS old_custom_categories jsonb,
  ADD COLUMN IF NOT EXISTS custom_categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now());

-- Early installations required a RUT before bank onboarding. The current UI
-- creates settings first and collects the RUT afterwards.
ALTER TABLE public.user_settings ALTER COLUMN rut DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.known_contacts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rut text,
  alias text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.classification_rules (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank text NOT NULL DEFAULT 'global',
  condition_type text NOT NULL DEFAULT 'contains',
  condition_value text NOT NULL,
  category_tipo text NOT NULL,
  category_principal text NOT NULL,
  category_secundaria text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS categories_user_id_idx
ON public.categories (user_id);

CREATE INDEX IF NOT EXISTS transactions_user_bank_date_idx
ON public.transactions (user_id, bank, date DESC);

CREATE INDEX IF NOT EXISTS known_contacts_user_id_idx
ON public.known_contacts (user_id);

CREATE INDEX IF NOT EXISTS classification_rules_user_id_idx
ON public.classification_rules (user_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.known_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden ver su propio perfil"
ON public.profiles FOR SELECT
USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
ON public.profiles FOR UPDATE
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Los usuarios ven sus propias categorías" ON public.categories;
CREATE POLICY "Los usuarios ven sus propias categorías"
ON public.categories FOR ALL
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Los usuarios ven sus propias transacciones" ON public.transactions;
CREATE POLICY "Los usuarios ven sus propias transacciones"
ON public.transactions FOR SELECT
USING ((SELECT auth.uid()) = user_id OR (SELECT auth.uid()) = shared_with_id);

DROP POLICY IF EXISTS "Los usuarios pueden insertar sus transacciones" ON public.transactions;
CREATE POLICY "Los usuarios pueden insertar sus transacciones"
ON public.transactions FOR INSERT
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden actualizar sus transacciones" ON public.transactions;
CREATE POLICY "Los usuarios pueden actualizar sus transacciones"
ON public.transactions FOR UPDATE
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden eliminar sus transacciones" ON public.transactions;
CREATE POLICY "Los usuarios pueden eliminar sus transacciones"
ON public.transactions FOR DELETE
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own settings" ON public.user_settings;
CREATE POLICY "Users can manage their own settings"
ON public.user_settings FOR ALL
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.known_contacts;
CREATE POLICY "Users can manage their own contacts"
ON public.known_contacts FOR ALL
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own rules" ON public.classification_rules;
CREATE POLICY "Users can manage their own rules"
ON public.classification_rules FOR ALL
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.known_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.classification_rules TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
