import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  // Try an update with a dummy user id to see if it fails with 401 or just silently fails
  const { data, error } = await supabase.from('user_settings').update({ main_bank: 'Itaú' }).eq('user_id', 'invalid-id');
  console.log('Update result:', error);
}
run();
