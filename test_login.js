import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'viborasnake@gmail.com',
    password: 'password123'
  });
  if (authError || !user) {
    console.log('Login failed:', authError?.message);
    return;
  }
  console.log('Logged in as', user.id);
  const { data, error } = await supabase.from('user_settings').update({ banks: ['Scotiabank'] }).eq('user_id', user.id);
  console.log('Update result:', error);
  const { data: readData, error: readError } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
  console.log('Read result:', readData);
}
run();
