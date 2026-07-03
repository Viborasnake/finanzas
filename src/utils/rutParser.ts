export function cleanRut(rawRut: string): string {
  return rawRut.replace(/[^0-9kK]/g, '').toUpperCase();
}

export function validateRut(rut: string): boolean {
  const cleaned = cleanRut(rut);
  if (cleaned.length < 8) return false;
  
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  
  let sum = 0;
  let multiplier = 2;
  
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const expectedDv = 11 - (sum % 11);
  const expectedDvStr = expectedDv === 11 ? '0' : expectedDv === 10 ? 'K' : expectedDv.toString();
  
  return dv === expectedDvStr;
}

export function extractAndNormalizeRUT(text: string): string | null {
  if (!text) return null;
  
  // Buscar patrones que parezcan RUTs (con puntos, guiones, espacios, o pegados)
  // ej: 16.424.491-1, 16424491-1, 16424491 1, 164244911
  const regex = /\b(\d{1,2}\.?\d{3}\.?\d{3}[- ]?[0-9kK])\b/gi;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const candidate = match[1];
    const cleaned = cleanRut(candidate);
    
    // Si pasa la validación de Módulo 11, es casi 100% seguro que es un RUT
    if (validateRut(cleaned)) {
      return cleaned;
    }
  }
  
  // Como fallback, buscar números de 8-9 dígitos pegados (ej: 164244911)
  const regexPegado = /\b(\d{8,9}[kK]?)\b/gi;
  while ((match = regexPegado.exec(text)) !== null) {
    const candidate = match[1];
    const cleaned = cleanRut(candidate);
    if (validateRut(cleaned)) {
      return cleaned;
    }
  }
  
  return null;
}
