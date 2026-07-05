import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://htcvwruezenheyjvqxth.supabase.co',
  'sb_publishable_to95_V7IQzFxIwSPYqLdcw_OxJTgNfd'
)

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
