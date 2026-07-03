-- =======================================================
-- MIGRACIÓN ESTRUCTURAL FINANZAS
-- Ejecuta todo este script de una sola vez en el SQL Editor
-- =======================================================

-- 1. AGREGAR NUEVAS COLUMNAS A TRANSACCIONES
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS tipo_movimiento text,
ADD COLUMN IF NOT EXISTS categoria_principal text,
ADD COLUMN IF NOT EXISTS categoria_secundaria text;


-- 2. TABLAS DE CONFIGURACIÓN Y CONTACTOS
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rut text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own settings" 
  ON user_settings FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS known_contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rut text,
  alias text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE known_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own contacts" 
  ON known_contacts FOR ALL USING (auth.uid() = user_id);


-- 3. MIGRACIÓN DE DATOS MASIVA (MAPEO EXACTO)
-- Primero migramos las transacciones basadas en su categoría actual (match exacto por nombre en tabla categories)

-- Feria
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Alimentación', categoria_secundaria = 'Feria' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Feria');

-- Abarrotes
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Alimentación', categoria_secundaria = 'Abarrotes' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Abarrotes');

-- chinos
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Hogar/Materiales', categoria_secundaria = 'Bazar-Chinos' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'chinos');

-- Bencina
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Transporte', categoria_secundaria = 'Bencina' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Bencina');

-- Autopista
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Transporte', categoria_secundaria = 'Autopista' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Autopista');

-- Fijo
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Vivienda', categoria_secundaria = 'Fijo' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Fijo');

-- impuesto
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Impuestos', categoria_secundaria = 'Impuestos' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'impuesto');

-- Interes
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Intereses y Comisiones', categoria_secundaria = 'Intereses' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Interes');

-- Tarjeta Credito
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Pago Tarjeta Crédito', categoria_secundaria = 'Tarjeta Credito' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Tarjeta Credito');

-- Actividad Extra
UPDATE transactions SET tipo_movimiento = 'Gasto Real', categoria_principal = 'Actividad Extra', categoria_secundaria = 'Actividad Extra' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Actividad Extra');

-- Ahorro
UPDATE transactions SET tipo_movimiento = 'Ahorro/Inversión', categoria_principal = 'Ahorro', categoria_secundaria = 'Ahorro' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Ahorro');

-- Mapeos pendientes que dependerán de RUT (se actualizan para dejarlos temporalmente como movimientos internos si existían)
UPDATE transactions SET tipo_movimiento = 'Movimiento Interno', categoria_principal = 'Transferencia personal', categoria_secundaria = 'Transferencia personal' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Transferencia personal');

UPDATE transactions SET tipo_movimiento = 'Movimiento Interno', categoria_principal = 'Traspaso fondo', categoria_secundaria = 'Traspaso fondo' 
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Traspaso fondo');

-- NOTA: Las transacciones "Sin Categoría" (category_id = null) quedarán con los 3 campos nuevos en NULL por defecto, cumpliendo el Paso 4.
