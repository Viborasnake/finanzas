# MisFinanzas 💸

MisFinanzas es una plataforma moderna e inteligente para el control y seguimiento de finanzas personales. Centraliza las transacciones bancarias importadas de cartolas (MACH, Itaú, Scotiabank) en un solo lugar y clasifica automáticamente los movimientos.

## 🚀 Características
*   **Importación Multiformato:** Carga de cartolas en formato CSV, Excel (XLSX), DAT y PDFs protegidos de MACH.
*   **Extracción de PDF Local:** Procesamiento seguro de archivos PDF directamente en el navegador del usuario usando `pdfjs-dist` (legacy).
*   **Clasificador Inteligente:** Reglas dinámicas de categorización automática y asignación de alias de transacciones.
*   **Lista Individual & Categorización Masiva:** Interfaces interactivas y veloces con diseño Neo-Brutalista.
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

---

## 💾 Base de Datos e Integraciones (Supabase)
Las tablas y relaciones fundamentales están definidas en `supabase_schema.sql` y las migraciones adicionales están en `supabase/migrations/`:
*   `profiles`: Guarda los perfiles de usuario vinculados a la autenticación de Supabase (con columna de `status`).
*   `user_settings`: Configuración general del usuario y RUT.
*   `known_contacts`: Contactos conocidos guardados para clasificar transferencias.
*   `transactions`: Todos los movimientos bancarios importados (monto, tipo, alias, categoría principal y secundaria, banco origen, metadatos originales).
