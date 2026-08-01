-- Restrict the self-delete RPC to the authenticated caller and prevent object
-- shadowing through a mutable search_path.
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.users
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
