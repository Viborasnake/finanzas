-- Only the principal admin account may read feedback inbox.
-- All authenticated users can still submit feedback.

DROP POLICY IF EXISTS product_feedback_select_own_or_admin ON public.product_feedback;

DROP POLICY IF EXISTS product_feedback_select_admin_only ON public.product_feedback;
CREATE POLICY product_feedback_select_admin_only
  ON public.product_feedback
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

COMMENT ON POLICY product_feedback_select_admin_only ON public.product_feedback IS
  'Inbox visible only to admin accounts (viborasnake via admin_users).';
