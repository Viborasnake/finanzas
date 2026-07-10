import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  // Check user_settings for fixed_expenses config
  const { data: settings } = await supabase.from('user_settings').select('custom_categories').single();
  const fe = settings?.custom_categories?.['__fixed_expenses'] || [];
  const hbo = fe.find(x => x.name?.toLowerCase().includes('hbo'));
  console.log("HBO config:", JSON.stringify(hbo, null, 2));

  // Check Consorcio transactions
  const { data: txs } = await supabase.from('transactions').select('description, tipo_movimiento, categoria_principal, categoria_secundaria, bank').eq('bank', 'Consorcio');
  console.log("Consorcio txs:", txs?.slice(0, 5));
}
check();
