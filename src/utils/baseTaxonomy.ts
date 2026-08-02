export const BASE_TAXONOMY: Record<string, Record<string, string[]>> = {
  Ingreso: {
    Sueldo: ['Sueldo', 'Bono', 'Aguinaldo'],
    Honorarios: ['Boleta', 'Servicios'],
    'Ventas/Negocio': ['Venta', 'Servicios'],
    Transferencias: ['Transferencias de Otras Personas', 'Transferencias Propias'],
    Devoluciones: ['Devolución Impuestos', 'Devolución Egresos'],
    Créditos: ['Línea de Crédito (Crédito)', 'Crédito Consumo'],
    'Otros Ingresos': ['Regalos', 'Intereses/Dividendos', 'Otros'],
    Ajustes: ['Saldo Inicial', 'Ajuste de Saldo']
  },
  Egreso: {
    Alimentación: ['Supermercado', 'Feria', 'Abarrotes', 'Panadería', 'Cafetería/Snacks', 'Agua', 'Delivery/Restaurantes'],
    Transporte: ['Bencina', 'Autopista', 'Estacionamiento', 'Transporte Público', 'Uber/Taxi', 'Seguro Auto', 'Mantención/Taller', 'Lavado Auto', 'Permisos', 'Municipalidad', 'Revisión Técnica'],
    Vivienda: ['Dividendo', 'Contribuciones', 'Fijo', 'Seguro Hogar'],
    'Cuentas Básicas': ['Luz', 'Agua', 'Gas', 'GGCC', 'Internet Hogar', 'Internet Móvil', 'TV Cable', 'Telefonía'],
    'Hogar/Materiales': ['Bazar-Chinos', 'Ferretería', 'Mantenimiento/Mejoras', 'Muebles', 'Aseo'],
    Salud: ['Farmacia', 'Consultas Médicas', 'Exámenes', 'Dentista', 'Seguro Salud/Isapre/Fonasa', 'Salud'],
    Personal: ['Cuidado Personal', 'Peluquería', 'Ropa', 'Otros'],
    Educación: ['Universidad/Instituto', 'Cursos/Diplomados', 'Materiales/Libros', 'Educación'],
    Hijos: ['Colegio', 'Salud/Pediatra', 'Ropa/Zapatos', 'Útiles/Materiales', 'Juguetes/Entretención', 'Mesada', 'Hijos'],
    Suscripciones: ['HBO MAX', 'Claude', 'Chat GPT', 'Google', 'Netflix', 'Spotify', 'Amazon Prime', 'Otras'],
    'Entretención/Ocio': ['Cine/Espectáculos', 'Paseos/Vacaciones', 'Deporte/Gimnasio', 'Regalos'],
    Efectivo: ['Giro Cajero'],
    'Actividad Extra': ['Deportes', 'Eventos', 'Clases/Cursos', 'Otros'],
    'Retro Gaming/Hobbies': ['Juegos/Consolas', 'Accesorios', 'Coleccionables', 'Suscripciones', 'Otros'],
    Mascotas: ['Alimento', 'Veterinario', 'Accesorios/Peluquería'],
    'Herramientas/Software': ['Herramientas/Software'],
    'Transferencias a Otras Personas': ['Familiares', 'Amigos', 'Préstamo', 'Devolución', 'Otros'],
    'Transferencias Propias': ['Transferencias Propias'],
    Impuestos: ['IVA', 'Renta / F22', 'PPM', 'Retención Boletas', 'Otros'],
    'Intereses y Comisiones': ['Mantención Cuenta', 'Comisiones', 'Seguro Desgravamen/Fraude', 'Intereses'],
    'Pago Tarjeta Crédito': ['Tarjeta Credito'],
    'Servicio de Deuda': [
      'Cuota sin desglose',
      'Capital de Crédito',
      'Intereses de Crédito',
      'Seguros y Comisiones',
      'Interés Línea de Crédito',
      'Abono Línea de Crédito',
      'Crédito Consumo',
      'Línea de Crédito (Crédito)'
    ],
    Otros: ['Egresos Varios', 'Caja Chica', 'Diferencia de Cambio'],
    'Sin Especificar': ['Sin Especificar'],
    Ajustes: ['Saldo Inicial', 'Ajuste de Saldo']
  },
  'Ahorro/Inversión': {
    Ahorro: ['Ahorro'],
    Inversión: ['Inversión']
  }
};
