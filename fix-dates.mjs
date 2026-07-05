import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://htcvwruezenheyjvqxth.supabase.co',
  'sb_publishable_to95_V7IQzFxIwSPYqLdcw_OxJTgNfd'
)
// I need the service role key to bypass RLS, or I can just use a temporary function in Dashboard.tsx
