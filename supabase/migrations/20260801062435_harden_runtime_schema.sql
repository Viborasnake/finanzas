-- Align the deployed schema with the onboarding flow and harden access paths
-- reported by Supabase's security and performance advisors.

ALTER TABLE public.user_settings
  ALTER COLUMN rut DROP NOT NULL;

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

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS admin_users_granted_by_idx
  ON public.admin_users (granted_by);
CREATE INDEX IF NOT EXISTS categories_user_id_idx
  ON public.categories (user_id);
CREATE INDEX IF NOT EXISTS classification_rules_user_id_idx
  ON public.classification_rules (user_id);
CREATE INDEX IF NOT EXISTS known_contacts_user_id_idx
  ON public.known_contacts (user_id);
CREATE INDEX IF NOT EXISTS transactions_category_id_idx
  ON public.transactions (category_id);
CREATE INDEX IF NOT EXISTS transactions_shared_with_id_idx
  ON public.transactions (shared_with_id);

DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden ver su propio perfil"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.profiles;
CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Los usuarios ven sus propias categorías" ON public.categories;
CREATE POLICY "Los usuarios ven sus propias categorías"
  ON public.categories FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own rules" ON public.classification_rules;
CREATE POLICY "Users can manage their own rules"
  ON public.classification_rules FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage their own contacts" ON public.known_contacts;
CREATE POLICY "Users can manage their own contacts"
  ON public.known_contacts FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own import batches" ON public.transaction_import_batches;
CREATE POLICY "Users can view their own import batches"
  ON public.transaction_import_batches FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden actualizar sus transacciones" ON public.transactions;
CREATE POLICY "Los usuarios pueden actualizar sus transacciones"
  ON public.transactions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden eliminar sus transacciones" ON public.transactions;
CREATE POLICY "Los usuarios pueden eliminar sus transacciones"
  ON public.transactions FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Los usuarios pueden insertar sus transacciones" ON public.transactions;
CREATE POLICY "Los usuarios pueden insertar sus transacciones"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Los usuarios ven sus propias transacciones" ON public.transactions;
CREATE POLICY "Los usuarios ven sus propias transacciones"
  ON public.transactions FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (SELECT auth.uid()) = shared_with_id
  );

DROP POLICY IF EXISTS "Users can manage their own settings" ON public.user_settings;
CREATE POLICY "Users can manage their own settings"
  ON public.user_settings FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
