import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('transactions').select('bank, id');
  if (error) console.error(error);
  else {
    const counts = {};
    data.forEach(d => { counts[d.bank] = (counts[d.bank] || 0) + 1; });
    console.log("Counts:", counts);
  }
}
check();
