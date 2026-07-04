import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('transactions')
    .update({ 
      type: 'egreso', 
      tipo_movimiento: 'Gasto Real', 
      categoria_principal: 'Servicio de Deuda', 
      categoria_secundaria: 'Interés Línea de Crédito' 
    })
    .ilike('description', '%LINEA CREDITO%')
    .eq('type', 'ingreso');

  console.log('Update result:', data, error);
}

run();
