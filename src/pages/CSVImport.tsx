import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, AlertTriangle, Edit2 } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import { applyRules } from '../utils/classificationRules';
import { useBanks } from '../contexts/BankContext';

interface Transaction {
  date: string;
  description: string;
  original_description: string;
  amount: number;
  type: 'ingreso' | 'egreso';
  raw_data: any;
}

export default function CSVImport() {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myRut, setMyRut] = useState<string | null>(null);
  const [knownContacts, setKnownContacts] = useState<any[]>([]);
  const { user } = useAuth();
  const { classificationRules } = useSettings();
  const { activeBank, setActiveBank } = useBanks();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          const [{ data: s }, { data: c }] = await Promise.all([
            supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
            supabase.from('known_contacts').select('*').eq('user_id', user.id)
          ]);
          if (s) setMyRut(s.rut);
          if (c) setKnownContacts(c);
        } catch (e) {
          console.error(e);
        }
      };
      fetchData();
    }
  }, [user]);

  const parseScotiabankDate = (dateStr: string) => {
    if (!dateStr) return null;
    const str = dateStr.trim();
    if (str.length < 7 || str.length > 8) return null;
    
    const year = str.slice(-4);
    const month = str.slice(-6, -4);
    const day = str.slice(0, -6);
    
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  };

  const parseAmount = (val: string | number) => {
    if (!val) return 0;
    const cleanStr = String(val).replace(/[^0-9,-]/g, '');
    const num = parseFloat(cleanStr.replace(',', '.'));
    return isNaN(num) ? 0 : num;
  };

  const parseItauXls = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dataBuffer = e.target?.result;
        const workbook = XLSX.read(dataBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

        let baseYear = new Date().getFullYear();
        let headerRowIndex = -1;
        
        for (let i = 0; i < Math.min(50, rows.length); i++) {
          const rowStr = rows[i].join(' ').toLowerCase();
          
          if (rowStr.includes('desde hasta')) {
            const valRow = rows[i + 1]?.join(' ') || '';
            const match = valRow.match(/\d{4}/);
            if (match) {
              baseYear = parseInt(match[0], 10);
            }
          }
          if (rowStr.includes('fecha') && rowStr.includes('movimiento')) {
            headerRowIndex = i;
          }
        }

        if (headerRowIndex === -1) {
          setError("No se pudo encontrar la tabla de Movimientos en el archivo Itaú.");
          return;
        }

        const headers = rows[headerRowIndex].map(h => typeof h === 'string' ? h.trim().toLowerCase() : '');
        const dateIdx = headers.findIndex(h => h.includes('fecha'));
        const descIdx = headers.findIndex(h => h.includes('movimiento'));
        const cargosIdx = headers.findIndex(h => h.includes('cargo'));
        const abonosIdx = headers.findIndex(h => h.includes('abono'));

        if (dateIdx === -1 || descIdx === -1 || (cargosIdx === -1 && abonosIdx === -1)) {
          setError(`Faltan columnas en Itaú. Encontradas: ${headers.join(', ')}`);
          return;
        }

        const parsedTransactions: Transaction[] = [];

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          const dateRaw = row[dateIdx];
          const descRaw = row[descIdx];
          
          if (!dateRaw || !descRaw) continue;

          let dateStr = '';
          
          // Excel numbers for dates (if parsed as number) or string '26/06'
          if (typeof dateRaw === 'number') {
            const excelDate = new Date(Math.round((dateRaw - 25569) * 86400 * 1000));
            dateStr = excelDate.toISOString().split('T')[0];
          } else {
            const dateParts = String(dateRaw).trim().split('/');
            if (dateParts.length === 2) {
              const day = dateParts[0].padStart(2, '0');
              const month = dateParts[1].padStart(2, '0');
              dateStr = `${baseYear}-${month}-${day}`;
            } else {
              continue;
            }
          }

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
            continue;
          }

          const raw_data: any = {};
          headers.forEach((h, idx) => {
            raw_data[h] = row[idx];
          });

          parsedTransactions.push({
            date: dateStr,
            description: String(descRaw).trim(),
            original_description: String(descRaw).trim(),
            amount,
            type,
            raw_data
          });
        }

        if (parsedTransactions.length === 0) {
          setError("No se encontraron transacciones válidas en el archivo Itaú.");
        } else {
          setData(parsedTransactions);
        }
      } catch (err) {
        console.error(err);
        setError("Error procesando el archivo Excel Itaú.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseCsvStandard = (file: File) => {
    Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: function (results) {
          const rows = results.data as string[][];
          
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
          
          const dateIdx = headers.findIndex(h => h.includes('fecha'));
          const descIdx = headers.findIndex(h => h.includes('descripc'));
          const cargosIdx = headers.findIndex(h => h.includes('cargo'));
          const abonosIdx = headers.findIndex(h => h.includes('abono'));

          if (dateIdx === -1 || descIdx === -1 || (cargosIdx === -1 && abonosIdx === -1)) {
            setError(`Faltan columnas. Encontradas: ${headers.join(', ')}`);
            return;
          }

          const parsedTransactions: Transaction[] = [];

          for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const dateRaw = row[dateIdx];
            const descRaw = row[descIdx];
            
            if (!dateRaw || !descRaw) continue;

            const date = parseScotiabankDate(dateRaw);
            if (!date) continue;

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
              continue;
            }

            const raw_data: any = {};
            headers.forEach((h, idx) => {
              raw_data[h] = row[idx];
            });

            parsedTransactions.push({
              date,
              description: descRaw.trim(),
              original_description: descRaw.trim(),
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
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    acceptedFiles.forEach((file) => {
      const isExcel = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');
      
      if (isExcel) {
        if (activeBank !== 'Itaú') {
          setActiveBank('Itaú');
          toast.success("Cambiado automáticamente a Itaú", { duration: 2000 });
        }
        parseItauXls(file);
      } else {
        if (activeBank !== 'Scotiabank') {
          setActiveBank('Scotiabank');
          toast.success("Cambiado automáticamente a Scotiabank", { duration: 2000 });
        }
        parseCsvStandard(file);
      }
    });
  }, [activeBank, setActiveBank]);

  const handleSave = async () => {
    if (!user) {
      setError("Debes iniciar sesión para guardar transacciones.");
      return;
    }
    if (!activeBank) {
      setError("Debes tener un banco seleccionado antes de importar.");
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      if (data.length === 0) {
        toast.error("No hay datos para guardar.");
        return;
      }

      // Buscar rango de fechas de la subida para limitar la consulta
      const dates = data.map(t => new Date(t.date).getTime());
      const minDateStr = new Date(Math.min(...dates)).toISOString().split('T')[0] + 'T00:00:00.000Z';
      const maxDateStr = new Date(Math.max(...dates)).toISOString().split('T')[0] + 'T23:59:59.999Z';

      // Obtener transacciones que ya existen en este rango de fechas
      const { data: existing, error: fetchError } = await supabase
        .from('transactions')
        .select('date, amount, raw_data')
        .eq('user_id', user.id)
        .gte('date', minDateStr)
        .lte('date', maxDateStr);

      if (fetchError) throw fetchError;

      // Crear firmas únicas para lo que ya existe
      const existingSet = new Set(existing?.map(t => {
        const descKey = Object.keys(t.raw_data || {}).find(k => k.toLowerCase().includes('descripc') || k.toLowerCase().includes('movimiento') || k.toLowerCase().includes('detalle')) || '';
        const origDesc = t.raw_data ? (t.raw_data[descKey] || '') : '';
        return `${t.date}_${t.amount}_${String(origDesc).trim()}`;
      }));

      // Filtrar las transacciones entrantes contra las firmas
      const newTransactions = data.filter(t => {
        const sig = `${t.date}_${t.amount}_${t.original_description}`;
        return !existingSet.has(sig);
      });

      if (newTransactions.length === 0) {
        toast.success("No hay datos nuevos. ¡Todas estas transacciones ya estaban en tu sistema!");
        navigate('/transactions');
        return;
      }

      const { error } = await supabase.from('transactions').insert(
        newTransactions.map(t => {
          const descForCheck = (t.original_description || t.description || '').toLowerCase();
          
          let tipo_movimiento = null;
          let categoria_principal = null;
          let categoria_secundaria = null;
          
          const rutExtracted = extractAndNormalizeRUT(descForCheck);
          const normalizedMyRut = myRut ? extractAndNormalizeRUT(myRut) : null;
          
          if (rutExtracted && normalizedMyRut && rutExtracted === normalizedMyRut) {
            tipo_movimiento = 'Movimiento Interno';
            categoria_principal = descForCheck.includes('fondo') ? 'Traspaso fondo' : 'Transferencia personal';
            categoria_secundaria = categoria_principal;
          } else {
            // Buscar por RUT si existe, sino por nombre
            const contact = knownContacts.find(c => {
              if (rutExtracted && c.rut && extractAndNormalizeRUT(c.rut) === rutExtracted) return true;
              if (c.name && descForCheck.includes(c.name.toLowerCase())) return true;
              return false;
            });
            if (contact) {
              tipo_movimiento = 'Egreso';
              categoria_principal = 'Transferencias a Otras Personas';
              categoria_secundaria = 'Familiares';
            }
          }

          if (!tipo_movimiento) {
            const ruleMatch = applyRules(descForCheck, classificationRules);
            if (ruleMatch) {
              tipo_movimiento = ruleMatch.tipo_movimiento;
              categoria_principal = ruleMatch.categoria_principal;
              categoria_secundaria = ruleMatch.categoria_secundaria;
            }
          }

          if (!tipo_movimiento) {
            const ruleMatch = applyRules(descForCheck, classificationRules);
            if (ruleMatch) {
              tipo_movimiento = ruleMatch.tipo_movimiento;
              categoria_principal = ruleMatch.categoria_principal;
              categoria_secundaria = ruleMatch.categoria_secundaria;
            }
          }

          return {
            user_id: user.id,
            bank: activeBank,
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            raw_data: t.raw_data,
            tipo_movimiento,
            categoria_principal,
            categoria_secundaria
          };
        })
      );

      if (error) throw error;
      
      const omitidas = data.length - newTransactions.length;
      toast.success(`Se guardaron ${newTransactions.length} nuevas transacciones.` + (omitidas > 0 ? ` (Se omitieron ${omitidas} duplicadas)` : ''));
      navigate('/transactions');
    } catch (err: any) {
      setError(err.message || "Error al guardar en la base de datos.");
    } finally {
      setLoading(false);
    }
  };

  const handleDescriptionChange = (index: number, newDesc: string) => {
    const newData = [...data];
    newData[index].description = newDesc;
    setData(newData);
  };

  const handleDescriptionBlur = (index: number) => {
    const row = data[index];
    if (row.description !== row.original_description && row.description.trim() !== '') {
      const othersCount = data.filter((t, i) => i !== index && t.original_description === row.original_description && t.description === row.original_description).length;
      
      if (othersCount > 0) {
        toast.custom((t) => (
          <div className="card" style={{ padding: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', background: 'white', maxWidth: '400px' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.125rem' }}>Renombrado Múltiple</h3>
            <p style={{ margin: '0.5rem 0 1.5rem' }}>
              Hay otras {othersCount} transacciones idénticas. ¿Quieres aplicar el nombre "{row.description}" a todas ellas también?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-outline" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
                onClick={() => toast.dismiss(t.id)}
              >
                Solo a esta
              </button>
              <button 
                className="btn btn-primary" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
                onClick={() => {
                  toast.dismiss(t.id);
                  const newData = data.map(t_iter => {
                    if (t_iter.original_description === row.original_description) {
                      return { ...t_iter, description: row.description };
                    }
                    return t_iter;
                  });
                  setData(newData);
                  toast.success("Nombres actualizados masivamente");
                }}
              >
                Sí, a todas
              </button>
            </div>
          </div>
        ), { duration: Infinity });
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
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
          <input {...getInputProps({ accept: '.csv, .xls, .xlsx' })} />
          <UploadCloud size={64} style={{ margin: '0 auto 1rem', color: isDragActive ? 'var(--primary)' : 'var(--text-secondary)' }} />
          <h3 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>
            {isDragActive ? 'Suelta el archivo aquí...' : 'Arrastra tu cartola CSV o Excel (Itaú) aquí'}
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
            Se detectaron {data.length} transacciones. Puedes editar los nombres haciendo clic en ellos antes de guardar.
          </p>

          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', position: 'relative' }}>
              <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Fecha</th>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Descripción (Clic para editar)</th>
                  <th style={{ padding: '0.75rem 1rem', borderRight: '2px solid black', fontWeight: 700 }}>Tipo</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < data.length - 1 ? '2px solid black' : 'none' }}>
                    <td style={{ padding: '0.75rem 1rem', borderRight: '2px solid black' }}>{row.date}</td>
                    <td style={{ padding: '0', borderRight: '2px solid black', position: 'relative' }}>
                      <input 
                        type="text" 
                        value={row.description}
                        onChange={(e) => handleDescriptionChange(i, e.target.value)}
                        onBlur={() => handleDescriptionBlur(i)}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem 1rem', 
                          border: 'none', 
                          background: 'transparent',
                          fontWeight: row.description !== row.original_description ? 700 : 500,
                          color: row.description !== row.original_description ? 'var(--primary)' : 'inherit',
                          outline: 'none',
                          cursor: 'text'
                        }}
                      />
                      <Edit2 size={14} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.3, pointerEvents: 'none' }} />
                    </td>
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
