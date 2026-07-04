import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.from('classification_rules').select('*').limit(1);
  console.log('Rules cols:', data ? Object.keys(data[0] || {}) : null);
}
run();
