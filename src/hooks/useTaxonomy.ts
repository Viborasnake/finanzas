import { useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';

export const BASE_TAXONOMY: Record<string, Record<string, string[]>> = {
  'Ingreso Real': {
    'Sueldo': ['Sueldo', 'Bono', 'Aguinaldo'],
    'Honorarios': ['Boleta', 'Servicios'],
    'Ventas/Negocio': ['Giro', 'Venta', 'Servicios'],
    'Devoluciones': ['Devolución Impuestos', 'Devolución Gastos'],
    'Otros Ingresos': ['Regalos', 'Intereses/Dividendos', 'Otros']
  },
  'Gasto Real': {
    'Alimentación': ['Supermercado', 'Feria', 'Abarrotes', 'Panadería', 'Cafetería/Snacks', 'Agua', 'Delivery/Restaurantes'],
    'Transporte': ['Bencina', 'Autopista', 'Estacionamiento', 'Transporte Público', 'Uber/Taxi', 'Seguro Auto', 'Mantención/Taller', 'Lavado Auto', 'Permisos', 'Municipalidad', 'Revisión Técnica'],
    'Vivienda': ['Dividendo', 'Contribuciones', 'Fijo', 'Seguro Hogar'],
    'Cuentas Básicas': ['Luz', 'Agua', 'Gas', 'GGCC', 'Internet Hogar', 'Internet Móvil', 'TV Cable', 'Telefonía'],
    'Hogar/Materiales': ['Bazar-Chinos', 'Ferretería', 'Mantenimiento/Mejoras', 'Muebles', 'Aseo'],
    'Salud': ['Farmacia', 'Consultas Médicas', 'Exámenes', 'Dentista', 'Seguro Salud/Isapre/Fonasa', 'Salud'],
    'Personal': ['Cuidado Personal', 'Peluquería', 'Ropa', 'Otros'],
    'Educación': ['Universidad/Instituto', 'Cursos/Diplomados', 'Materiales/Libros', 'Educación'],
    'Benja': ['Colegio', 'Salud/Pediatra', 'Ropa/Zapatos', 'Útiles/Materiales', 'Juguetes/Entretención', 'Mesada', 'Benja'],
    'Suscripciones': ['HBO MAX', 'Claude', 'Chat GPT', 'Google', 'Netflix', 'Spotify', 'Amazon Prime', 'Otras'],
    'Entretención/Ocio': ['Cine/Espectáculos', 'Paseos/Vacaciones', 'Deporte/Gimnasio', 'Regalos'],
    'Actividad Extra': ['Actividad Extra'],
    'Retro Gaming/Hobbies': ['Retro Gaming/Hobbies'],
    'Mascotas': ['Alimento', 'Veterinario', 'Accesorios/Peluquería'],
    'Herramientas/Software': ['Herramientas/Software'],
    'Pago a Familiar': ['Pago a Familiar'],
    'Impuestos': ['Impuestos'],
    'Intereses y Comisiones': ['Mantención Cuenta', 'Comisiones', 'Seguro Desgravamen/Fraude', 'Intereses'],
    'Pago Tarjeta Crédito': ['Tarjeta Credito'],
    'Servicio de Deuda': ['Interés Línea de Crédito', 'Abono Línea de Crédito', 'Crédito Consumo'],
    'Otros': ['Gastos Varios', 'Caja Chica', 'Diferencia de Cambio'],
    'Sin Especificar': ['Sin Especificar']
  },
  'Movimiento Interno': {
    'Transferencia personal': ['Transferencia personal'],
    'Traspaso fondo': ['Traspaso fondo']
  },
  'Ahorro/Inversión': {
    'Ahorro': ['Ahorro'],
    'Inversión': ['Inversión']
  }
};

export function useTaxonomy() {
  const { customCategories } = useSettings();

  const taxonomy = useMemo(() => {
    const merged = JSON.parse(JSON.stringify(BASE_TAXONOMY));

    customCategories?.forEach(cat => {
      if (!merged[cat.tipo]) merged[cat.tipo] = {};
      if (!merged[cat.tipo][cat.principal]) merged[cat.tipo][cat.principal] = [];
      
      cat.secundarias.forEach(sec => {
        if (!merged[cat.tipo][cat.principal].includes(sec)) {
          merged[cat.tipo][cat.principal].push(sec);
        }
      });
    });

    return merged;
  }, [customCategories]);

  const allOptions = useMemo(() => {
    return Object.entries(taxonomy).flatMap(([tipo, principals]) => 
      Object.entries(principals as Record<string, string[]>).flatMap(([principal, secundarias]) => 
        secundarias.map(secundaria => ({
          label: secundaria === principal ? principal : `${secundaria} (${principal})`,
          tipo,
          principal,
          secundaria
        }))
      )
    );
  }, [taxonomy]);

  return { taxonomy, allOptions };
}
