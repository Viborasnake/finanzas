import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MigrationAudit() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [counts, setCounts] = useState<{ [categoryName: string]: number }>({});
  
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, category:categories(name)')
        .eq('user_id', user?.id);
        
      if (error) throw error;
      
      const txs = data || [];
      setTransactions(txs);
      
      const c: { [key: string]: number } = {};
      txs.forEach(t => {
        const catName = t.category?.name || 'Sin Categoría';
        c[catName] = (c[catName] || 0) + 1;
      });
      
      setCounts(c);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar datos para auditoría');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(transactions, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `misfinanzas_backup_${new Date().toISOString()}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success('Backup descargado con éxito');
  };

  if (loading) return <div style={{ padding: '2rem' }}>Cargando auditoría...</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div className="card" style={{ backgroundColor: 'var(--pastel-yellow)', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Auditoría Previa a Migración</h1>
        <p style={{ fontWeight: 600, marginTop: '1rem' }}>
          Total de transacciones: {transactions.length}
        </p>
        <button className="btn" style={{ backgroundColor: 'black', color: 'white', marginTop: '1rem', width: '100%', justifyContent: 'center' }} onClick={handleDownload}>
          <Download size={20} />
          Descargar Backup JSON Completo
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Conteo por Categoría Actual</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '1rem' }}>
          <thead style={{ borderBottom: '2px solid black' }}>
            <tr>
              <th style={{ padding: '0.75rem', fontWeight: 800 }}>Categoría Antigua</th>
              <th style={{ padding: '0.75rem', fontWeight: 800, textAlign: 'right' }}>Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(counts)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count], i) => (
              <tr key={name} style={{ borderBottom: '2px solid black', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.03)' }}>
                <td style={{ padding: '0.75rem', fontWeight: 600 }}>{name}</td>
                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800 }}>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
