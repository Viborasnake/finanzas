-- Product feedback by screen/function for maturity-stage UX validation.
CREATE TABLE IF NOT EXISTS public.product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  screen_key text NOT NULL,
  screen_label text NOT NULL,
  path text NOT NULL,
  category text NOT NULL CHECK (category IN ('bug', 'idea', 'confusion', 'praise', 'other')),
  rating smallint CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  message text NOT NULL CHECK (char_length(btrim(message)) >= 3 AND char_length(message) <= 2000),
  feature text,
  user_agent text,
  viewport text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_feedback_created_at_idx
  ON public.product_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS product_feedback_screen_key_idx
  ON public.product_feedback (screen_key);

CREATE INDEX IF NOT EXISTS product_feedback_status_idx
  ON public.product_feedback (status);

CREATE INDEX IF NOT EXISTS product_feedback_user_id_idx
  ON public.product_feedback (user_id);

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_feedback_insert_own ON public.product_feedback;
CREATE POLICY product_feedback_insert_own
  ON public.product_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS product_feedback_select_own_or_admin ON public.product_feedback;
CREATE POLICY product_feedback_select_own_or_admin
  ON public.product_feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_current_user_admin());

DROP POLICY IF EXISTS product_feedback_admin_update ON public.product_feedback;
CREATE POLICY product_feedback_admin_update
  ON public.product_feedback
  FOR UPDATE
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

GRANT SELECT, INSERT ON public.product_feedback TO authenticated;
GRANT UPDATE (status) ON public.product_feedback TO authenticated;

COMMENT ON TABLE public.product_feedback IS
  'User feedback tagged by screen/function for product maturity reviews.';
