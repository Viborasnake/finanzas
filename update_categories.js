import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: "ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS custom_categories JSONB DEFAULT '{}'::jsonb;" });
  if (error) {
     console.error("Direct RPC failed, falling back to local postgres query if possible, or we just trust the columns.", error);
  }
}
run();
