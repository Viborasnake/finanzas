# MisFinanzas

MisFinanzas es una plataforma moderna e inteligente para el control y seguimiento de finanzas personales. Centraliza las transacciones bancarias importadas de cartolas (MACH, Itaú, Scotiabank y Consorcio) en un solo lugar y clasifica automáticamente los movimientos.

## 🚀 Características
*   **Importación Multiformato:** Carga de cartolas en formato CSV, Excel (XLSX), DAT y PDFs protegidos de MACH.
*   **Extracción de PDF Local:** Procesamiento seguro de archivos PDF directamente en el navegador del usuario usando `pdfjs-dist` (legacy).
*   **Clasificador Inteligente:** Sugerencias explicables, reglas persistentes, creación de categorías y corrección desde el mismo flujo.
*   **Dashboard Consolidado:** Reportes por banco o consolidados, con contexto de periodo y desglose de movimientos.
*   **Cuentas:** Seguimiento mensual de gastos fijos vinculados por categoría, historial y corrección de asociaciones.
*   **Revisión de Duplicados:** Agrupa coincidencias para revisión, conserva las divisiones procesadas y permite eliminar registros únicamente con confirmación explícita.
*   **Trazabilidad de Cartolas:** Cada fila importada mantiene una identidad de origen que evita reimportar el monto original después de dividirlo o cambiarlo de periodo.
*   **Panel de Administración Seguro:** Panel de control de usuarios para la cuenta de administración principal (`viborasnake@gmail.com`) con permisos para pausar accesos, editar detalles, reenviar restablecimiento de credenciales y eliminar cuentas definitivamente.

---

## 🛠️ Tecnologías y Librerías
*   **Frontend:** React (TypeScript) + Vite
*   **Base de Datos / Autenticación:** Supabase (PostgreSQL, Row Level Security, RPCs con Security Definer)
*   **Procesamiento de PDF:** `pdfjs-dist@3.11.174` (legacy build)
*   **Lector de CSV:** `PapaParse`
*   **Lector de Excel:** `xlsx` (SheetJS)
*   **Iconografía:** `lucide-react`
*   **Estilos:** Vanilla CSS (Alineado con directrices Neo-Brutalistas)

---

## 💻 Desarrollo Local

### 1. Clonar e Instalar dependencias:
```bash
git clone <url-del-repositorio>
cd Finanzas
npm install
```

### 2. Configurar Variables de Entorno:
Crea un archivo `.env` en la raíz con las siguientes variables de tu proyecto de Supabase:
```env
VITE_SUPABASE_URL=https://<tu-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>
```

### 3. Iniciar Servidor de Desarrollo:
```bash
npm run dev
```

### 4. Verificar antes de entregar:
```bash
npm test
npm run lint
npm run build
```

Las pruebas de `tests/` cubren la lógica financiera pura que no debe depender de la interfaz, incluida la identidad de origen y la revisión de duplicados. La línea base de QA responsive y accesibilidad está en `docs/design-qa-baseline.md`.

---

## 💾 Base de Datos e Integraciones (Supabase)
La fuente de verdad está en `supabase/migrations/`. La migración `20260701000000_base_schema.sql` contiene la base estructural y las siguientes migraciones agregan normalización, administración e ingestión idempotente. Los SQL de la raíz se conservan únicamente como referencia histórica.

El procedimiento para instalaciones nuevas y para reconciliar el proyecto remoto existente está en `docs/supabase-bootstrap.md`.

Las entidades principales son:
*   `profiles`: Guarda los perfiles de usuario vinculados a la autenticación de Supabase (con columna de `status`).
*   `admin_users`: Registro privado de cuentas con rol administrativo; no admite lectura ni escritura directa desde el cliente.
*   `user_settings`: Configuración general del usuario y RUT.
*   `known_contacts`: Contactos conocidos guardados para clasificar transferencias.
*   `transactions`: Todos los movimientos bancarios importados (monto, tipo, alias, categoría principal y secundaria, banco origen, metadatos originales).
*   `classification_rules`: Reglas transversales de clasificación automática por usuario.
*   `transaction_import_batches`: Control idempotente de cartolas y capturas procesadas.
