import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'ingreso' | 'egreso';
  raw_data: any;
}

export default function CSVImport() {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const parseScotiabankDate = (dateStr: string) => {
    // Ejemplo: "1072026" (1/07/2026) o "30072026" (30/07/2026)
    if (!dateStr) return null;
    const str = dateStr.trim();
    if (str.length < 7 || str.length > 8) return null;
    
    const year = str.slice(-4);
    const month = str.slice(-6, -4);
    const day = str.slice(0, -6);
    
    // Formato YYYY-MM-DD para la base de datos
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };

  const parseAmount = (val: string) => {
    if (!val) return 0;
    // Elimina puntos de miles y cambia coma por punto decimal
    return parseFloat(val.replace(/\./g, '').replace(',', '.'));
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    acceptedFiles.forEach((file) => {
      Papa.parse(file, {
        header: false, // Leemos como arrays porque hay metadata arriba
        skipEmptyLines: true,
        complete: function (results) {
          const rows = results.data as string[][];
          
          // Encontrar la fila de cabeceras (la que contiene "Fecha" Y "Descripcion")
          let headerIndex = -1;
          for (let i = 0; i < Math.min(20, rows.length); i++) {
            const rowStr = rows[i].join(' ').toLowerCase();
            if (rowStr.includes('fecha') && rowStr.includes('descripc')) {
              headerIndex = i;
              break;
            }
          }

          if (headerIndex === -1) {
            setError("No se pudo encontrar la fila de cabeceras ('Fecha', 'Descripcion') en el archivo.");
            return;
          }

          const headers = rows[headerIndex].map(h => typeof h === 'string' ? h.trim().toLowerCase() : '');
          
          // Usamos findIndex con includes para que sea mucho más tolerante a espacios o caracteres extra invisibles
          const dateIdx = headers.findIndex(h => h.includes('fecha'));
          const descIdx = headers.findIndex(h => h.includes('descripc'));
          const cargosIdx = headers.findIndex(h => h.includes('cargo'));
          const abonosIdx = headers.findIndex(h => h.includes('abono'));

          if (dateIdx === -1 || descIdx === -1 || (cargosIdx === -1 && abonosIdx === -1)) {
            setError(`Faltan columnas. Encontradas: ${headers.join(', ')}`);
            return;
          }

          const parsedTransactions: Transaction[] = [];

          // Procesar las filas de datos (debajo de las cabeceras)
          for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const dateRaw = row[dateIdx];
            const descRaw = row[descIdx];
            
            if (!dateRaw || !descRaw) continue; // Saltar filas inválidas o totales

            const date = parseScotiabankDate(dateRaw);
            if (!date) continue; // Si la fecha es inválida, probablemente no es una transacción

            const cargos = parseAmount(cargosIdx !== -1 ? row[cargosIdx] : '');
            const abonos = parseAmount(abonosIdx !== -1 ? row[abonosIdx] : '');
            
            let amount = 0;
            let type: 'ingreso' | 'egreso' = 'egreso';

            if (cargos > 0) {
              amount = cargos;
              type = 'egreso';
            } else if (abonos > 0) {
              amount = abonos;
              type = 'ingreso';
            } else {
              continue; // Transacción en 0, ignorar
            }

            // Guardar fila original
            const raw_data: any = {};
            headers.forEach((h, idx) => {
              raw_data[h] = row[idx];
            });

            parsedTransactions.push({
              date,
              description: descRaw.trim(),
              amount,
              type,
              raw_data
            });
          }

          if (parsedTransactions.length === 0) {
            setError("No se encontraron transacciones válidas en el archivo.");
          } else {
            setData(parsedTransactions);
          }
        },
      });
    });
  }, []);

  const handleSave = async () => {
    if (!user) {
      setError("Debes iniciar sesión para guardar transacciones.");
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.from('transactions').insert(
        data.map(t => ({
          user_id: user.id,
          date: t.date,
          description: t.description,
          amount: t.amount,
          type: t.type,
          raw_data: t.raw_data
        }))
      );

      if (error) throw error;
      
      alert("Transacciones guardadas exitosamente!");
      navigate('/transactions');
    } catch (err: any) {
      setError(err.message || "Error al guardar en la base de datos.");
    } finally {
      setLoading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    multiple: false
  });

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem', fontSize: '2rem' }}>Importar Cartola Bancaria</h1>
      
      {error && (
        <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600 }}>
          <AlertTriangle />
          {error}
        </div>
      )}

      {!data.length ? (
        <div 
          {...getRootProps()} 
          className="card" 
          style={{ 
            textAlign: 'center', 
            padding: '4rem 2rem', 
            borderStyle: 'dashed', 
            borderWidth: '3px',
            borderColor: isDragActive ? 'var(--primary)' : 'var(--text-secondary)',
            backgroundColor: isDragActive ? 'var(--primary-light)' : 'var(--surface-color)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <input {...getInputProps()} />
          <UploadCloud size={64} style={{ margin: '0 auto 1rem', color: isDragActive ? 'var(--primary)' : 'var(--text-secondary)' }} />
          <h3 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>
            {isDragActive ? 'Suelta el archivo aquí...' : 'Arrastra tu archivo CSV (Scotiabank) aquí'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            O haz clic para seleccionar un archivo desde tu computador
          </p>
          <button className="btn btn-primary" type="button">
            Seleccionar Archivo
          </button>
        </div>
      ) : (
        <div className="card animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <CheckCircle2 color="var(--success)" size={32} />
            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Archivo analizado con éxito</h3>
          </div>
          
          <p style={{ marginBottom: '1.5rem', fontWeight: 600 }}>
            Se detectaron {data.length} transacciones.
          </p>

          <div style={{ overflowX: 'auto', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Fecha</th>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Descripción</th>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Tipo</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < 4 ? '2px solid black' : 'none' }}>
                    <td style={{ padding: '0.75rem 1rem', borderRight: '2px solid black' }}>{row.date}</td>
                    <td style={{ padding: '0.75rem 1rem', borderRight: '2px solid black' }}>{row.description}</td>
                    <td style={{ padding: '0.75rem 1rem', borderRight: '2px solid black' }}>
                      <span className={row.type === 'ingreso' ? 'badge badge-success' : 'badge badge-danger'}>
                        {row.type === 'ingreso' ? 'Abono' : 'Cargo'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                      ${row.amount.toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 5 && (
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>
              Mostrando las primeras 5 filas de {data.length}...
            </p>
          )}

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button className="btn btn-outline" onClick={() => setData([])} disabled={loading}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar en Base de Datos'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
