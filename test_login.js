import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const email = process.env.DIAGNOSTIC_USER_EMAIL;
  const password = process.env.DIAGNOSTIC_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('Set DIAGNOSTIC_USER_EMAIL and DIAGNOSTIC_USER_PASSWORD before running this script.');
  }

  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (authError || !user) {
    console.log('Login failed:', authError?.message);
    return;
  }
  console.log('Logged in as', user.id);
  const { error } = await supabase.from('user_settings').update({ banks: ['Scotiabank'] }).eq('user_id', user.id);
  console.log('Update result:', error);
  const { data: readData } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Read result:', readData);
}
run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
