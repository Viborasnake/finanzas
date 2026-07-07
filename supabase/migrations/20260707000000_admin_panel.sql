-- Add status column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Function to get admin dashboard data
CREATE OR REPLACE FUNCTION admin_get_dashboard_data()
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
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Security check: only allow viborasnake@gmail.com
  IF auth.jwt() ->> 'email' != 'viborasnake@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  RETURN QUERY
  SELECT 
    p.id, 
    p.email, 
    p.full_name, 
    p.created_at, 
    p.status,
    s.rut,
    COUNT(t.id) as tx_count,
    ARRAY_AGG(DISTINCT t.bank) FILTER (WHERE t.bank IS NOT NULL) as banks
  FROM public.profiles p
  LEFT JOIN public.user_settings s ON p.id = s.user_id
  LEFT JOIN public.transactions t ON p.id = t.user_id
  GROUP BY p.id, p.email, p.full_name, p.created_at, p.status, s.rut;
END;
$$;

-- Function to delete user
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'viborasnake@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Function to update user status
CREATE OR REPLACE FUNCTION admin_update_user_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'viborasnake@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  UPDATE public.profiles SET status = new_status WHERE id = target_user_id;
END;
$$;

-- Function to update user details
CREATE OR REPLACE FUNCTION admin_update_user_details(target_user_id uuid, new_name text, new_rut text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.jwt() ->> 'email' != 'viborasnake@gmail.com' THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;

  UPDATE public.profiles SET full_name = new_name WHERE id = target_user_id;
  
  IF new_rut IS NOT NULL AND new_rut != '' THEN
    INSERT INTO public.user_settings (user_id, rut)
    VALUES (target_user_id, new_rut)
    ON CONFLICT (user_id) DO UPDATE SET rut = new_rut;
  END IF;
END;
$$;
