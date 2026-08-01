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

  const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  console.log('Authenticated diagnostic user:', user?.id);
}
run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
