import { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, CheckCircle2, AlertTriangle, Edit2, X } from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/authContextValue';
import { useSettings } from '../contexts/settingsContextValue';
import toast from 'react-hot-toast';
import { extractAndNormalizeRUT } from '../utils/rutParser';
import { applyRules } from '../utils/classificationRules';
import { useBanks, type Bank, AVAILABLE_BANKS } from '../contexts/bankContextValue';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.js?url';
import { cleanRut } from '../utils/rutParser';
import { Dialog } from './Dialog';
import {
  getUnsupportedImportFileMessage,
  IMPORT_DROPZONE_ACCEPT,
  IMPORT_FORMAT_LABEL,
  isSupportedImportFile
} from '../utils/importFileTypes';
import {
  buildStrongTransactionIdentity,
  buildTransactionCandidateFingerprint,
  hashImportFile,
  partitionByStrongIdentity
} from '../utils/transactionIdentity';

const loadPdfJs = async () => {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjsLib;
};

interface Transaction {
  date: string;
  description: string;
  original_description: string;
  amount: number;
  type: 'ingreso' | 'egreso';
  raw_data: any;
  sourceRowKey: string;
}

interface ImportModalProps {
  onClose?: () => void;
  presentation?: 'dialog' | 'page';
}

export default function ImportModal({ onClose, presentation = 'dialog' }: ImportModalProps = {}) {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myRut, setMyRut] = useState<string | null>(null);

  const { user } = useAuth();
  const { classificationRules } = useSettings();
  const { activeBank, setActiveBank, addBank, connectedBanks } = useBanks();

  type ImportStep = 'upload' | 'confirm' | 'preview';
  const [step, setStep] = useState<ImportStep>('upload');
  const [detectedBank, setDetectedBank] = useState<Bank | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileHash, setSelectedFileHash] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);

  // Password Decryption States
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pdfFileToDecrypt, setPdfFileToDecrypt] = useState<File | null>(null);
  const [pdfPasswordInput, setPdfPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const fetchData = async () => {
        try {
          const { data: s } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle();
          if (s) setMyRut(s.rut);
        } catch (e) {
          console.error(e);
        }
      };
      fetchData();
    }
  }, [user]);



  const parseLocalDate = (dateStr: string) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('T')[0].split('-');
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
  };

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
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx');
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
            const match = valRow.match(/\b(20\d{2})\b/);
            if (match) {
              baseYear = parseInt(match[1], 10);
            }
          }
          if (rowStr.includes('fecha') && rowStr.includes('movimiento')) {
            headerRowIndex = i;
          }
        }

        if (headerRowIndex === -1) {
          setError("No se pudo encontrar la tabla de Movimientos en el archivo Itaú.");
          setStep('upload');
          return;
        }

        const headers = rows[headerRowIndex].map(h => typeof h === 'string' ? h.trim().toLowerCase() : '');
        const dateIdx = headers.findIndex(h => h.includes('fecha'));
        const descIdx = headers.findIndex(h => h.includes('movimiento'));
        const cargosIdx = headers.findIndex(h => h.includes('cargo'));
        const abonosIdx = headers.findIndex(h => h.includes('abono'));

        if (dateIdx === -1 || descIdx === -1 || (cargosIdx === -1 && abonosIdx === -1)) {
          setError(`Faltan columnas en Itaú. Encontradas: ${headers.join(', ')}`);
          setStep('upload');
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
            raw_data,
            sourceRowKey: `sheet:0:row:${i}`
          });
        }

        if (parsedTransactions.length === 0) {
          setError("No se encontraron transacciones válidas en el archivo Itaú.");
          setStep('upload');
        } else {
          setData(parsedTransactions);
          setStep('preview');
        }
      } catch (err) {
        console.error(err);
        setError("Error procesando el archivo Excel Itaú.");
        setStep('upload');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseCsvStandard = async (file: File) => {
    const { default: Papa } = await import('papaparse');
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
            setStep('upload');
            return;
          }

          const headers = rows[headerIndex].map(h => typeof h === 'string' ? h.trim().toLowerCase() : '');
          
          const dateIdx = headers.findIndex(h => h.includes('fecha'));
          const descIdx = headers.findIndex(h => h.includes('descripc'));
          const cargosIdx = headers.findIndex(h => h.includes('cargo'));
          const abonosIdx = headers.findIndex(h => h.includes('abono'));

          if (dateIdx === -1 || descIdx === -1 || (cargosIdx === -1 && abonosIdx === -1)) {
            setError(`Faltan columnas. Encontradas: ${headers.join(', ')}`);
            setStep('upload');
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
              raw_data,
              sourceRowKey: `row:${i}`
            });
          }

          if (parsedTransactions.length === 0) {
            setError("No se encontraron transacciones válidas en el archivo.");
            setStep('upload');
          } else {
            setData(parsedTransactions);
            setStep('preview');
          }
        },
      });
  };

  const handlePasswordSubmit = () => {
    if (!pdfFileToDecrypt) return;
    parseMachPdf(pdfFileToDecrypt, pdfPasswordInput);
  };

  const parseMachPdf = async (file: File, manualPassword?: string) => {
    try {
      setLoading(true);
      setError(null);
      setPasswordError(null);
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      let pdf;

      const tryPassword = async (pwd?: string) => {
        return await pdfjsLib.getDocument({ data: arrayBuffer.slice(0), password: pwd }).promise;
      };

      try {
        if (manualPassword) {
          pdf = await tryPassword(manualPassword);
        } else {
          pdf = await tryPassword();
        }
      } catch (err: any) {
        if (err.name === 'PasswordException') {
          let success = false;

          if (!manualPassword && myRut) {
            const cleaned = cleanRut(myRut);
            const autoPassword = cleaned.slice(0, -1);
            try {
              pdf = await tryPassword(autoPassword);
              success = true;
            } catch (passErr: any) {
              if (passErr.name !== 'PasswordException') throw passErr;
            }
          }

          if (!success) {
            setPdfFileToDecrypt(file);
            setShowPasswordModal(true);
            if (manualPassword) {
              setPasswordError("Contraseña incorrecta. Por favor, intenta de nuevo.");
            }
            setLoading(false);
            return;
          }
        } else {
          throw err;
        }
      }

      if (!pdf) return;

      setShowPasswordModal(false);
      setPasswordError(null);
      setPdfPasswordInput('');

      const parsedTransactions: Transaction[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        let egresoX = -1;
        let ingresoX = -1;
        
        const rawItems = Array.isArray(textContent.items) ? textContent.items : Array.from(textContent.items || []);
        
        for (let k = 0; k < rawItems.length; k++) {
           const item = rawItems[k] as any;
           const str = (item.str || '').trim();
           if (str === 'Egreso') egresoX = item.transform[4];
           if (str === 'Ingreso') ingresoX = item.transform[4];
        }

        const items = rawItems.map((item: any) => ({
          str: item.str || '',
          x: item.transform[4],
          y: item.transform[5],
        })).sort((a, b) => {
          if (Math.abs(a.y - b.y) > 4) {
             return b.y - a.y;
          }
          return a.x - b.x;
        });

        const lines: any[][] = [];
        let currentLine: any[] = [];
        let lastY = -1;
        
        for (let k = 0; k < items.length; k++) {
           const item = items[k];
           if (!item.str.trim() && item.str !== ' ') continue;
           
           if (lastY === -1 || Math.abs(item.y - lastY) > 4) {
              if (currentLine.length > 0) lines.push(currentLine);
              currentLine = [item];
              lastY = item.y;
           } else {
              currentLine.push(item);
           }
        }
        if (currentLine.length > 0) lines.push(currentLine);

        for (let l = 0; l < lines.length; l++) {
           const lineItems = lines[l];
           const firstItem = lineItems[0];
           const dateMatch = firstItem.str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
           if (!dateMatch) continue;

           const dateStr = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
           
           let amountItem = null;
           for (let i = lineItems.length - 1; i >= 0; i--) {
              if (lineItems[i].str.includes('$') || /^[0-9.]+$/.test(lineItems[i].str.trim())) {
                 amountItem = lineItems[i];
                 break;
              }
           }
           
           if (!amountItem) continue;

           const amountStr = amountItem.str.replace(/[^0-9]/g, '');
           const amount = parseFloat(amountStr);
           if (isNaN(amount) || amount === 0) continue;

           let type: 'ingreso' | 'egreso' = 'egreso';
           if (egresoX !== -1 && ingresoX !== -1) {
              const distToEgreso = Math.abs(amountItem.x - egresoX);
              const distToIngreso = Math.abs(amountItem.x - ingresoX);
              type = distToIngreso < distToEgreso ? 'ingreso' : 'egreso';
           } else {
              const fullText = lineItems.map((i: any) => i.str).join(' ').toLowerCase();
              if (fullText.includes('reembolso') || fullText.includes('abono')) {
                 type = 'ingreso';
              } else if (fullText.includes('compra')) {
                 type = 'egreso';
              } else {
                 if (amountItem.x > 450) type = 'ingreso'; 
              }
           }

           let description = '';
           for (let i = 1; i < lineItems.length; i++) {
              const item = lineItems[i];
              if (item === amountItem) continue;
              const s = item.str.trim();
              if (!s || s === '1' || s === 'CLP' || s === '$') continue;
              description += (description ? ' ' : '') + s;
           }

           description = description.replace(/^\s*-\s*/, '').trim();

           parsedTransactions.push({
             date: dateStr,
             description: description,
             original_description: description,
             amount,
             type,
             raw_data: { fullLine: lineItems.map((i: any) => i.str).join(' '), 'Descripción': description },
             sourceRowKey: `page:${pageNum}:line:${l}`
           });
        }
      }

      if (parsedTransactions.length === 0) {
        setError("No se encontraron transacciones en el PDF. Asegúrate de que es una cartola válida.");
        setStep('upload');
      } else {
        setData(parsedTransactions);
        setStep('preview');
      }
    } catch (err: any) {
      console.error(err);
      setError("Error procesando el PDF: " + (err.message || 'Error desconocido'));
      setStep('upload');
    } finally {
      setLoading(false);
    }
  };
  const parseConsorcioPdf = async (file: File) => {
    try {
      setLoading(true);
      setError(null);
      const pdfjsLib = await loadPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      if (!pdf) return;

      const parsedTransactions: Transaction[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const rawItems = Array.isArray(textContent.items) ? textContent.items : Array.from(textContent.items || []);
        
        const items = rawItems.map((item: any) => ({
          str: item.str || '',
          x: item.transform[4],
          y: item.transform[5],
        })).sort((a, b) => {
          if (Math.abs(a.y - b.y) > 4) {
             return b.y - a.y; // Higher Y first (top to bottom)
          }
          return a.x - b.x; // Left to right
        });

        const lines: any[][] = [];
        let currentLine: any[] = [];
        let lastY = -1;
        
        for (let k = 0; k < items.length; k++) {
           const item = items[k];
           if (!item.str.trim() && item.str !== ' ') continue;
           
           if (lastY === -1 || Math.abs(item.y - lastY) > 4) {
              if (currentLine.length > 0) lines.push(currentLine);
              currentLine = [item];
              lastY = item.y;
           } else {
              currentLine.push(item);
           }
        }
        if (currentLine.length > 0) lines.push(currentLine);

        for (let l = 0; l < lines.length; l++) {
           const lineItems = lines[l];
           const fullText = lineItems.map((i: any) => i.str).join(' ').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/\s*-\s*/g, '-').trim();
           
           const regex = /^(\d{2}[/.-]\d{2}[/.-]\d{2,4})(?:\s+\d{2}:\d{2}:\d{2})?\s+(.+?)\s*(?:\$\s*)?(-?[\d.,]+)\s*(?:\$\s*)?(-?[\d.,]+)\s*(?:\$\s*)?(-?[\d.,]+)$/;
           const match = fullText.match(regex);
           if (!match) continue;

           const dateMatch = match[1].match(/^(\d{2})[/.-](\d{2})[/.-](\d{2,4})/);
           if (!dateMatch) continue;
           let year = dateMatch[3];
           if (year.length === 2) year = '20' + year;
           const dateStr = `${year}-${dateMatch[2]}-${dateMatch[1]}`;
           
           const description = match[2].trim();

           const cargo = parseFloat(match[3].replace(/\./g, '').replace(/,/g, '.'));
           const abono = parseFloat(match[4].replace(/\./g, '').replace(/,/g, '.'));

           let amount = 0;
           let type: 'ingreso' | 'egreso' = 'egreso';

           if (cargo > 0) {
             amount = cargo;
             type = 'egreso';
           } else if (abono > 0) {
             amount = abono;
             type = 'ingreso';
           } else {
             continue;
           }

           parsedTransactions.push({
             date: dateStr,
             description,
             original_description: description,
             amount,
             type,
             raw_data: { fullLine: fullText, 'Descripción': description },
             sourceRowKey: `page:${pageNum}:line:${l}`
           });
        }
      }

      if (parsedTransactions.length === 0) {
        setError("No se encontraron transacciones en el PDF de Consorcio. Asegúrate de que es una cartola válida.");
        setStep('upload');
      } else {
        setData(parsedTransactions);
        setStep('preview');
      }
    } catch (err: any) {
      console.error(err);
      setError("Error procesando el PDF de Consorcio: " + (err.message || 'Error desconocido'));
      setStep('upload');
    } finally {
      setLoading(false);
    }
  };

  const detectBankFromFile = async (file: File): Promise<Bank | null> => {
    const name = file.name.toLowerCase();
    
    if (name.endsWith('.pdf')) {
      if (name.includes('consorcio')) return 'Consorcio';
      if (name.includes('mach')) return 'Mach';
      
      try {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
        return 'Consorcio';
      } catch {
        return 'Mach';
      }
    }
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) return 'Itaú';
    
    if (name.endsWith('.dat') || name.endsWith('.csv') || name.endsWith('.txt')) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = (e.target?.result as string) || '';
          const lowerText = text.toLowerCase();
          
          if (lowerText.includes('itau') || lowerText.includes('itaú')) resolve('Itaú');
          else if (lowerText.includes('scotiabank') || lowerText.includes('scotia')) resolve('Scotiabank');
          else if (lowerText.includes('bancoestado') || lowerText.includes('estado')) resolve('BancoEstado' as Bank);
          else if (lowerText.includes('mach')) resolve('Mach');
          else resolve('Scotiabank'); // default fallback for text files previously
        };
        reader.readAsText(file.slice(0, 1000));
      });
    }
    return null;
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];

    setSelectedFile(file);
    try {
      const hash = await hashImportFile(file);
      setSelectedFileHash(hash);

      if (user) {
        const { data: batch } = await supabase
          .from('transaction_import_batches')
          .select('id')
          .eq('user_id', user.id)
          .eq('file_hash', hash)
          .eq('status', 'completed')
          .limit(1)
          .maybeSingle();

        if (batch) {
          toast.error("Esta cartola ya fue importada previamente. Las repeticiones exactas serán ignoradas.", { duration: 6000 });
        }
      }
    } catch (hashError) {
      console.error('Could not hash import file:', hashError);
      setSelectedFileHash(null);
    }
    const guessedBank = await detectBankFromFile(file);
    setDetectedBank(guessedBank || activeBank || 'Scotiabank');
    setStep('confirm');
  }, [activeBank, user]);

  const handleConfirmBank = () => {
    if (!selectedFile || !detectedBank) return;
    
    if (selectedFile.name.toLowerCase().endsWith('.pdf')) {
      if (detectedBank === 'Consorcio') {
        parseConsorcioPdf(selectedFile);
      } else {
        parseMachPdf(selectedFile);
      }
    } else {
      setStep('preview');
      if (detectedBank === 'Itaú') parseItauXls(selectedFile);
      else parseCsvStandard(selectedFile);
    }
  };

  const handleCancelProcess = () => {
    setData([]);
    setStep('upload');
    setSelectedFile(null);
    setSelectedFileHash(null);
    setDetectedBank(null);
    setError(null);
  };

  const finalizeImportedBank = async (bank: Bank) => {
    try {
      if (!connectedBanks.includes(bank)) {
        await addBank(bank);
        toast.success(`${bank} fue agregado a tus bancos`, { duration: 2000 });
      }
      if (activeBank !== bank) setActiveBank(bank);
      return true;
    } catch (bankError) {
      console.error('Error connecting imported bank:', bankError);
      setError(`Los movimientos se guardaron, pero no pudimos conectar ${bank}. Intenta conectarlo desde Configuración.`);
      toast.error(`La cartola se guardó, pero falta conectar ${bank}.`);
      return false;
    }
  };

  const handleSave = async () => {
    if (saveInFlightRef.current) return;
    if (!user) {
      setError("Debes iniciar sesión para guardar transacciones.");
      return;
    }
    const importBank = detectedBank || activeBank;
    if (!importBank) {
      setError("Confirma el banco de la cartola antes de importar.");
      return;
    }
    
    saveInFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      if (data.length === 0) {
        toast.error("No hay datos para guardar.");
        return;
      }

      if (!selectedFileHash) {
        throw new Error('No pudimos identificar el archivo de forma segura. Vuelve a seleccionarlo e intenta otra vez.');
      }

      // Buscar rango de fechas de la subida para limitar la consulta
      const dates = data.map(t => new Date(t.date).getTime());

      // Obtener transacciones que ya existen en este rango de fechas (+/- 5 días para atrapar manuales)
      const minDateObj = new Date(Math.min(...dates));
      minDateObj.setDate(minDateObj.getDate() - 5);
      const minDateStrPadded = minDateObj.toISOString().split('T')[0] + 'T00:00:00.000Z';
      
      const maxDateObj = new Date(Math.max(...dates));
      maxDateObj.setDate(maxDateObj.getDate() + 5);
      const maxDateStrPadded = maxDateObj.toISOString().split('T')[0] + 'T23:59:59.999Z';

      const { data: existing, error: fetchError } = await supabase
        .from('transactions')
        .select('id, date, description, amount, type, raw_data, tipo_movimiento, categoria_principal, categoria_secundaria')
        .eq('user_id', user.id)
        .eq('bank', importBank)
        .gte('date', minDateStrPadded)
        .lte('date', maxDateStrPadded);

      if (fetchError) throw fetchError;

      const existingStrongIdentities = (existing || []).flatMap(t => {
        const source = t.raw_data?._source;
        const identity = buildStrongTransactionIdentity({
          bank: importBank,
          date: t.date,
          amount: t.raw_data?.original_amount ?? t.amount,
          type: t.type,
          originalDescription: t.raw_data?.original_description ?? t.description,
          sourceFileHash: source?.file_hash,
          sourceRowKey: source?.row_key,
          sourceTransactionId: source?.transaction_id
        });
        return identity ? [identity] : [];
      });

      const sourceRows = data.map(t => ({
        ...t,
        bank: importBank,
        sourceFileHash: selectedFileHash,
        sourceRowKey: t.sourceRowKey
      }));
      const exactPartition = partitionByStrongIdentity(sourceRows, existingStrongIdentities);

      // Similar financial attributes are candidates for review, not proof of a
      // duplicate. Only source-backed identities may omit a row automatically.
      // Deduplicación inteligente de divisiones de transacciones
      // Si la transacción ya fue dividida, la omitimos automáticamente para no volver a cargar la original.
      const existingCandidateFingerprints = new Map<string, any>();
      (existing || []).forEach(t => {
        const fingerprint = buildTransactionCandidateFingerprint({
          bank: importBank,
          date: t.date,
          amount: t.raw_data?.original_amount ?? t.amount,
          type: t.type,
          originalDescription: t.raw_data?.original_description ?? t.description
        });
        existingCandidateFingerprints.set(fingerprint, t);
      });

      const newTransactions = exactPartition.accepted.filter(t => {
        const fp = buildTransactionCandidateFingerprint({
          bank: importBank,
          date: t.date,
          amount: t.amount,
          type: t.type,
          originalDescription: t.original_description
        });
        const match = existingCandidateFingerprints.get(fp);
        if (match) {
          if (match.raw_data?.split_group_id) {
            // Es una transacción que fue dividida. La descartamos silenciosamente.
            exactPartition.repeated.push(t);
            return false;
          }
          if (match.raw_data?.is_manual) {
            // Es un pago manual, lo conservamos para que se pueda enlazar más abajo
            return true;
          }
          // Es un duplicado probable (cartola solapada). Lo omitimos automáticamente.
          exactPartition.repeated.push(t);
          return false;
        }
        return true;
      });

      // Ya no insertamos duplicados probables, pero los contamos para el log si existieran.
      // potentialExistingMatches ahora será 0 ya que los filtramos arriba.
      const potentialExistingMatches = 0;
      
      // Deduplicación inteligente de pagos manuales
      const manualTransactions = existing?.filter(t => t.raw_data && t.raw_data.is_manual) || [];
      const manualCandidateIds: string[] = [];
      const manualMatches = new Map<string, any>();

      newTransactions.forEach(t => {
        const tDate = parseLocalDate(t.date).getTime();
        const match = manualTransactions.find(m => {
          if (manualCandidateIds.includes(m.id)) return false;
          if (m.amount !== t.amount) return false; // El monto debe ser idéntico
          const mDate = parseLocalDate(m.date).getTime();
          const diffDays = Math.abs(tDate - mDate) / (1000 * 60 * 60 * 24);
          return diffDays <= 5; // Margen de 5 días
        });

        if (match) {
          manualCandidateIds.push(match.id);
          const sig = `${t.date}_${t.amount}_${t.original_description}`;
          manualMatches.set(sig, match);
        }
      });

      if (newTransactions.length === 0) {
        const bankReady = await finalizeImportedBank(importBank);
        toast.success("No hay datos nuevos. ¡Todas estas transacciones ya estaban en tu sistema!");
        if (bankReady && onClose) onClose();
        return;
      }

      const rowsToImport = newTransactions.map(t => {
        const sig = `${t.date}_${t.amount}_${t.original_description}`;
        const manualMatch = manualMatches.get(sig);
        const candidateFingerprint = buildTransactionCandidateFingerprint({
          bank: importBank,
          date: t.date,
          amount: t.amount,
          type: t.type,
          originalDescription: t.original_description
        });

        if (manualMatch) {
          // A fuzzy match may inherit the user's classification, but the manual
          // payment is preserved until the user explicitly resolves the pair.
          return {
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.type,
            source_row_key: t.sourceRowKey,
            candidate_fingerprint: candidateFingerprint,
            raw_data: {
              ...t.raw_data,
              _source: {
                ...(t.raw_data?._source || {}),
                candidate_fingerprint: candidateFingerprint,
                manual_candidate_id: manualMatch.id
              }
            },
            tipo_movimiento: manualMatch.tipo_movimiento,
            categoria_principal: manualMatch.categoria_principal,
            categoria_secundaria: manualMatch.categoria_secundaria
          };
        }

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
          date: t.date,
          description: t.description,
          amount: t.amount,
          type: t.type,
          source_row_key: t.sourceRowKey,
          candidate_fingerprint: candidateFingerprint,
          raw_data: {
            ...t.raw_data,
            _source: {
              ...(t.raw_data?._source || {}),
              candidate_fingerprint: candidateFingerprint
            }
          },
          tipo_movimiento,
          categoria_principal,
          categoria_secundaria
        };
      });

      const { data: importResult, error: insertError } = await supabase.rpc(
        'ingest_statement_transactions',
        {
          p_bank: importBank,
          p_file_hash: selectedFileHash,
          p_rows: rowsToImport,
          p_source_kind: 'statement_import'
        }
      );
      if (insertError) throw insertError;

      const importSummary = Array.isArray(importResult) ? importResult[0] : importResult;
      const insertedCount = Number(importSummary?.inserted_count || 0);
      const serverSkippedCount = Number(importSummary?.skipped_count || 0);
      const replayed = Boolean(importSummary?.replayed);
      const omittedCount = exactPartition.repeated.length + serverSkippedCount;

      const bankReady = await finalizeImportedBank(importBank);
      if (replayed) {
        toast.success('Esta cartola ya había sido procesada. No se duplicó ningún movimiento.');
      } else {
        toast.success(`Se guardaron ${insertedCount} nuevas transacciones.` + (omittedCount > 0 ? ` Se omitieron ${omittedCount} repeticiones exactas.` : ''));
      }
      if (manualCandidateIds.length > 0) {
        toast(`Se conservaron ${manualCandidateIds.length} pagos manuales como posibles coincidencias para revisión.`);
      }
      if (potentialExistingMatches > 0) {
        toast(`Detectamos ${potentialExistingMatches} movimientos similares. Se conservaron porque podrían ser válidos.`);
      }
      if (bankReady && onClose) onClose();
    } catch (err: any) {
      setError(err.message || "Error al guardar en la base de datos.");
    } finally {
      saveInFlightRef.current = false;
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
                type="button"
                className="btn btn-outline" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }} 
                onClick={() => toast.dismiss(t.id)}
              >
                Solo a esta
              </button>
              <button 
                type="button"
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
    onDrop: async acceptedFiles => {
      const file = acceptedFiles[0];
      if (file && !isSupportedImportFile(file)) {
        setError(getUnsupportedImportFileMessage(file.name));
        return;
      }
      await onDrop(acceptedFiles);
    },
    onDropRejected: rejections => {
      const file = rejections[0]?.file;
      setSelectedFile(null);
      setDetectedBank(null);
      setStep('upload');
      setError(getUnsupportedImportFileMessage(file?.name));
    },
    accept: IMPORT_DROPZONE_ACCEPT,
    multiple: false
  });

  const closeModal = onClose || handleCancelProcess;

  const content = (
    <div className="import-flow-content">
      {presentation === 'dialog' && (
        <div className="import-flow-header">
          <h2 id="import-dialog-title">Importar cartola bancaria</h2>
          <button type="button" className="dialog-close" onClick={closeModal} aria-label="Cerrar importación">
            <X size={24} />
          </button>
        </div>
      )}
      
      {error && (
        <div role="alert" style={{ backgroundColor: 'var(--danger-surface)', color: 'var(--danger-text)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '2px solid black', boxShadow: '4px 4px 0px black', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 700 }}>
          <AlertTriangle />
          {error}
        </div>
      )}

      {step === 'upload' && (
        <div 
          {...getRootProps()} 
          className="card import-dropzone"
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
          <input {...getInputProps({ 'aria-label': 'Seleccionar archivo de cartola bancaria' })} />
          <UploadCloud size={64} style={{ margin: '0 auto 1rem', color: isDragActive ? 'var(--primary)' : 'var(--text-secondary)' }} />
          <h3 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>
            {isDragActive ? 'Suelta el archivo aquí...' : 'Arrastra tu cartola bancaria aquí'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontWeight: 500 }}>
            Formatos admitidos: {IMPORT_FORMAT_LABEL}. También puedes hacer clic para elegirla.
          </p>
          <button className="btn btn-primary" type="button">
            Seleccionar Archivo
          </button>
        </div>
      )}

      {step === 'confirm' && (
        <div className="card animate-fade-in import-confirm-card" style={{ textAlign: 'center', border: '2px solid black', boxShadow: '4px 4px 0px black' }}>
           <h3 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 900 }}>Confirma el banco</h3>
           <p style={{ fontSize: '1.1rem', marginBottom: '2rem', color: 'var(--text-secondary)' }}>Hemos analizado el archivo y detectado que pertenece a:</p>
           
           <div style={{ marginBottom: '3rem' }}>
             <label htmlFor="import-bank" className="sr-only">Banco de la cartola</label>
             <select
               id="import-bank"
               className="form-input" 
               style={{ maxWidth: '300px', margin: '0 auto', fontSize: '1.25rem', textAlign: 'center', padding: '1rem', border: '2px solid black', borderRadius: '12px', boxShadow: '4px 4px 0px black', cursor: 'pointer', fontWeight: 800 }}
               value={detectedBank || ''} 
               onChange={(e) => setDetectedBank(e.target.value as Bank)}
             >
               {AVAILABLE_BANKS.map(b => (
                 <option key={b.id} value={b.id} style={{ fontWeight: 800 }}>{b.emoji} {b.label}</option>
               ))}
             </select>
           </div>
           
           <div className="import-flow-actions centered">
             <button type="button" className="btn btn-outline" style={{ padding: '0.8rem 2rem', fontSize: '1.1rem' }} onClick={handleCancelProcess} disabled={loading}>
               Cancelar
             </button>
             <button type="button" className="btn btn-primary" style={{ padding: '0.8rem 2rem', fontSize: '1.1rem' }} onClick={handleConfirmBank} disabled={loading}>
               {loading ? 'Procesando...' : 'Confirmar y Procesar'}
             </button>
           </div>
        </div>
      )}

      {step === 'preview' && data.length > 0 && (
        <div className="card animate-fade-in import-preview-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <CheckCircle2 color="var(--success)" size={32} />
            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Archivo analizado con éxito</h3>
          </div>
          
          <p style={{ marginBottom: '1.5rem', fontWeight: 600 }}>
            Se detectaron {data.length} transacciones de {detectedBank}. Puedes editar los nombres antes de guardar. El banco activo no cambiará hasta que confirmes.
          </p>

          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '2px solid black', borderRadius: 'var(--radius-sm)' }}>
            <table className="responsive-table" style={{ width: '100%', tableLayout: 'fixed' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: '120px' }}>Fecha</th>
                  <th>Descripción (Clic para editar)</th>
                  <th style={{ width: '90px' }}>Tipo</th>
                  <th style={{ width: '110px' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td data-label="Fecha">{row.date}</td>
                    <td data-label="Descripción" style={{ padding: '0', position: 'relative', overflow: 'hidden' }}>
                      <input 
                        type="text" 
                        value={row.description}
                        onChange={(e) => handleDescriptionChange(i, e.target.value)}
                        onBlur={() => handleDescriptionBlur(i)}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem 2rem 0.75rem 1rem', 
                          border: 'none', 
                          background: 'transparent',
                          fontWeight: row.description !== row.original_description ? 700 : 500,
                          color: row.description !== row.original_description ? 'var(--primary)' : 'inherit',
                          outline: 'none',
                          cursor: 'text',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap'
                        }}
                      />
                      <Edit2 size={14} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.3, pointerEvents: 'none' }} />
                    </td>
                    <td data-label="Tipo">
                      <span className={row.type === 'ingreso' ? 'badge badge-success' : 'badge badge-danger'}>
                        {row.type === 'ingreso' ? 'Abono' : 'Cargo'}
                      </span>
                    </td>
                    <td data-label="Monto" style={{ fontWeight: 600 }}>
                      ${row.amount.toLocaleString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="import-flow-actions" style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={handleCancelProcess} disabled={loading}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={loading}>
              {loading ? 'Guardando...' : 'Confirmar y Procesar'}
            </button>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <Dialog
          onClose={() => { setShowPasswordModal(false); setStep('upload'); }}
          labelledBy="pdf-password-dialog-title"
          describedBy="pdf-password-dialog-help"
          closeOnBackdrop={false}
          backdropStyle={{ zIndex: 100000 }}
          panelStyle={{ maxWidth: '400px', padding: '2rem' }}
        >
            <h3 id="pdf-password-dialog-title" style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '1rem', fontWeight: 900 }}>Archivo protegido</h3>
            <p id="pdf-password-dialog-help" style={{ fontSize: '0.95rem', marginBottom: '1.5rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Este PDF está protegido por contraseña. Para cartolas de MACH, la clave es tu RUT sin puntos, guión ni dígito verificador (ej: 17673553).
            </p>
            {passwordError && (
              <div role="alert" style={{ color: 'var(--danger-text)', fontWeight: 700, marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--danger-surface)', borderRadius: '8px', border: '2px solid black', fontSize: '0.9rem' }}>
                {passwordError}
              </div>
            )}
            <label className="label" htmlFor="pdf-password">Contraseña del PDF</label>
            <input 
              type="password" 
              id="pdf-password"
              name="pdf-password"
              autoComplete="off"
              placeholder="Ej: 17673553" 
              className="input"
              data-dialog-initial-focus
              style={{ width: '100%', marginBottom: '1.5rem', fontSize: '1.1rem', fontWeight: 700 }}
              value={pdfPasswordInput}
              onChange={(e) => setPdfPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handlePasswordSubmit();
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                type="button"
                className="btn btn-outline" 
                onClick={() => { setShowPasswordModal(false); setStep('upload'); }}
                disabled={loading}
              >
                Cancelar
              </button>
              <button 
                type="button"
                className="btn btn-primary" 
                onClick={handlePasswordSubmit}
                disabled={loading || !pdfPasswordInput.trim()}
              >
                {loading ? 'Validando...' : 'Desbloquear'}
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );

  if (presentation === 'page') {
    return (
      <section className="import-flow-page">
        {content}
      </section>
    );
  }

  return (
    <Dialog
      onClose={closeModal}
      labelledBy="import-dialog-title"
      closeOnBackdrop={false}
      panelStyle={{ maxWidth: '1200px', maxHeight: '90vh', backgroundColor: 'var(--bg-color)' }}
    >
      {content}
    </Dialog>
  );
}
