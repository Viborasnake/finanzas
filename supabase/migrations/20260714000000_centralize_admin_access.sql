-- Centralize administrative access in a private table instead of repeating an
-- email address across client and server code. The client cannot read or write
-- this table directly.
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;

-- Bootstrap the existing administrator. Future changes only need to update
-- this private table through a trusted migration or server-side operation.
INSERT INTO public.admin_users (user_id)
SELECT id
FROM auth.users
WHERE lower(email) = 'viborasnake@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_data()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  status text,
  rut text,
  tx_count bigint,
  banks text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.full_name,
    p.created_at,
    p.status,
    s.rut,
    COUNT(t.id) AS tx_count,
    ARRAY_AGG(DISTINCT t.bank) FILTER (WHERE t.bank IS NOT NULL) AS banks
  FROM public.profiles p
  LEFT JOIN public.user_settings s ON p.id = s.user_id
  LEFT JOIN public.transactions t ON p.id = t.user_id
  GROUP BY p.id, p.email, p.full_name, p.created_at, p.status, s.rut;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Access denied';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Administrators cannot delete their own account from the admin panel';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Access denied';
  END IF;

  IF target_user_id = auth.uid() AND new_status = 'paused' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Administrators cannot pause their own account';
  END IF;

  IF new_status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid status';
  END IF;

  UPDATE public.profiles
  SET status = new_status
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_details(target_user_id uuid, new_name text, new_rut text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Access denied';
  END IF;

  UPDATE public.profiles
  SET full_name = new_name
  WHERE id = target_user_id;

  IF new_rut IS NOT NULL AND new_rut <> '' THEN
    INSERT INTO public.user_settings (user_id, rut)
    VALUES (target_user_id, new_rut)
    ON CONFLICT (user_id) DO UPDATE SET rut = EXCLUDED.rut;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_dashboard_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_user_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_user_details(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_data() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_details(uuid, text, text) TO authenticated;
