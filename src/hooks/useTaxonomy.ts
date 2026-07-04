import { useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';

export const BASE_TAXONOMY: Record<string, Record<string, string[]>> = {
  'Ingreso': {
    'Sueldo': ['Sueldo', 'Bono', 'Aguinaldo'],
    'Honorarios': ['Boleta', 'Servicios'],
    'Ventas/Negocio': ['Venta', 'Servicios'],
    'Transferencias de Otras Personas': ['Transferencia Recibida'],
    'Devoluciones': ['Devolución Impuestos', 'Devolución Egresos'],
    'Otros Ingresos': ['Regalos', 'Intereses/Dividendos', 'Otros']
  },
  'Egreso': {
    'Alimentación': ['Supermercado', 'Feria', 'Abarrotes', 'Panadería', 'Cafetería/Snacks', 'Agua', 'Delivery/Restaurantes'],
    'Transporte': ['Bencina', 'Autopista', 'Estacionamiento', 'Transporte Público', 'Uber/Taxi', 'Seguro Auto', 'Mantención/Taller', 'Lavado Auto', 'Permisos', 'Municipalidad', 'Revisión Técnica'],
    'Vivienda': ['Dividendo', 'Contribuciones', 'Fijo', 'Seguro Hogar'],
    'Cuentas Básicas': ['Luz', 'Agua', 'Gas', 'GGCC', 'Internet Hogar', 'Internet Móvil', 'TV Cable', 'Telefonía'],
    'Hogar/Materiales': ['Bazar-Chinos', 'Ferretería', 'Mantenimiento/Mejoras', 'Muebles', 'Aseo'],
    'Salud': ['Farmacia', 'Consultas Médicas', 'Exámenes', 'Dentista', 'Seguro Salud/Isapre/Fonasa', 'Salud'],
    'Personal': ['Cuidado Personal', 'Peluquería', 'Ropa', 'Otros'],
    'Educación': ['Universidad/Instituto', 'Cursos/Diplomados', 'Materiales/Libros', 'Educación'],
    'Hijos': ['Colegio', 'Salud/Pediatra', 'Ropa/Zapatos', 'Útiles/Materiales', 'Juguetes/Entretención', 'Mesada', 'Hijos'],
    'Suscripciones': ['HBO MAX', 'Claude', 'Chat GPT', 'Google', 'Netflix', 'Spotify', 'Amazon Prime', 'Otras'],
    'Entretención/Ocio': ['Cine/Espectáculos', 'Paseos/Vacaciones', 'Deporte/Gimnasio', 'Regalos'],
    'Efectivo': ['Giro Cajero'],
    'Actividad Extra': ['Deportes', 'Eventos', 'Clases/Cursos', 'Otros'],
    'Retro Gaming/Hobbies': ['Juegos/Consolas', 'Accesorios', 'Coleccionables', 'Suscripciones', 'Otros'],
    'Mascotas': ['Alimento', 'Veterinario', 'Accesorios/Peluquería'],
    'Herramientas/Software': ['Herramientas/Software'],
    'Transferencias a Otras Personas': ['Familiares', 'Amigos', 'Préstamo', 'Devolución', 'Otros'],
    'Impuestos': ['IVA', 'Renta / F22', 'PPM', 'Retención Boletas', 'Otros'],
    'Intereses y Comisiones': ['Mantención Cuenta', 'Comisiones', 'Seguro Desgravamen/Fraude', 'Intereses'],
    'Pago Tarjeta Crédito': ['Tarjeta Credito'],
    'Servicio de Deuda': ['Interés Línea de Crédito', 'Abono Línea de Crédito', 'Crédito Consumo'],
    'Otros': ['Egresos Varios', 'Caja Chica', 'Diferencia de Cambio'],
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
