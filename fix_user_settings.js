import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: users } = await supabase.from('user_settings').select('user_id, banks');
  for (const u of users || []) {
    console.log('User settings:', u);
    await supabase.from('user_settings').update({
      banks: ['Scotiabank'],
      main_bank: 'Scotiabank'
    }).eq('user_id', u.user_id);
  }
  console.log('Fixed users.');
}
run();
