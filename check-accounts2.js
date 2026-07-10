import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: settings } = await supabase.from('user_settings').select('custom_categories').limit(1);
  console.log("Settings:", JSON.stringify(settings?.[0]?.custom_categories, null, 2));
}
check();
