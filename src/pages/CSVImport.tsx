import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { UploadCloud, FileType, CheckCircle2 } from 'lucide-react';

export default function CSVImport() {
  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          if (results.data && results.data.length > 0) {
            setColumns(Object.keys(results.data[0] as object));
            setData(results.data);
          }
        },
      });
    });
  }, []);

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
            {isDragActive ? 'Suelta el archivo aquí...' : 'Arrastra tu archivo CSV aquí'}
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
            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Archivo cargado con éxito</h3>
          </div>
          
          <p style={{ marginBottom: '1.5rem', fontWeight: 600 }}>
            Se encontraron {data.length} transacciones.
          </p>

          <div style={{ overflowX: 'auto', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ backgroundColor: 'var(--primary-light)', borderBottom: '2px solid black' }}>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i} style={{ padding: '0.75rem 1rem', borderRight: i < columns.length - 1 ? '2px solid black' : 'none', fontWeight: 700 }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 5).map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < 4 ? '2px solid black' : 'none' }}>
                    {columns.map((col, j) => (
                      <td key={j} style={{ padding: '0.75rem 1rem', borderRight: j < columns.length - 1 ? '2px solid black' : 'none' }}>
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 5 && (
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>
              Mostrando las primeras 5 filas...
            </p>
          )}

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button className="btn btn-outline" onClick={() => setData([])}>
              Cancelar
            </button>
            <button className="btn btn-primary">
              Guardar en Base de Datos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
