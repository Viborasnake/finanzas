import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  // List all tables accessible
  const { data: t1 } = await supabase.from('transactions').select('count').limit(0, { count: 'exact' });
  console.log("Transactions count:", t1);
  
  const { data: t2, error: e2 } = await supabase.from('user_settings').select('user_id').limit(5);
  console.log("User settings rows:", t2, "Error:", e2?.message);
}
check();
