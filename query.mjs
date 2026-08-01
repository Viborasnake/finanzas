import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function main() {
  const { data, error } = await supabase.from('transactions').select('*')
  if (error) console.error(error)
  else {
    console.log("Total txs:", data.length)
    console.log("Scotiabank txs:", data.filter(d => d.bank === 'Scotiabank').length)
    console.log("Itaú txs:", data.filter(d => d.bank === 'Itaú').length)
    console.log("BancoEstado txs:", data.filter(d => d.bank === 'BancoEstado').length)
    
    const itauTxs = data.filter(d => d.bank === 'Itaú')
    if (itauTxs.length > 0) {
      console.log("First Itaú tx:", JSON.stringify(itauTxs[0], null, 2))
    }
  }
}
main()
