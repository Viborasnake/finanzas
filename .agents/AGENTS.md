# Workspace Rules & Context for MisFinanzas

## Project Identity & Stack
*   **Name:** MisFinanzas — Personal Finance Tracking Application.
*   **Tech Stack:** React 19, TypeScript 6, Vite 8, Supabase (PostgreSQL + Auth + RLS + RPCs), Vanilla CSS.
*   **Design System:** Neo-Brutalist (see Styling Guidelines below).
*   **Deploy:** Vercel (configured via `vercel.json`).
*   **Linter:** oxlint (`oxlint.json`).

---

## Architecture Overview

### Route Structure (`App.tsx`)
```
/login          → Login (public)
/               → ProtectedRoute > Layout (Outlet)
  /             → Dashboard
  /transactions → Transactions
  /accounts     → Accounts (Gastos Fijos tracker)
  /import       → CSVImport
  /settings     → Settings
  /audit        → MigrationAudit (herramienta de backup JSON)
  /admin        → AdminDashboard (solo viborasnake@gmail.com)
```

### Context Providers (nested in `main.tsx` order)
1. `AuthProvider` — session, user, isPaused, signOut
2. `BankProvider` — connectedBanks, activeBank, dashboardScope, mainBank
3. `SettingsProvider` — customCategories, classificationRules, fixedExpenses

---

## Database Schema (Supabase)

### Tables
| Tabla | Descripción |
|---|---|
| `auth.users` | Usuarios de Supabase Auth |
| `public.profiles` | Perfil extendido: `id`, `email`, `full_name`, `created_at`, `status` ('active'|'paused') |
| `public.user_settings` | Config por usuario: `user_id` (PK), `rut`, `banks` (array), `main_bank`, `custom_categories` (JSONB), `classification_rules` (JSONB legacy - migrado a tabla), `created_at` |
| `public.transactions` | Todos los movimientos: `id`, `user_id`, `date`, `description`, `original_description`, `amount`, `type` ('ingreso'|'egreso'), `bank`, `tipo_movimiento`, `categoria_principal`, `categoria_secundaria`, `raw_data` (JSONB), `category_id` (legacy), `is_shared`, `created_at` |
| `public.known_contacts` | Contactos por RUT: `id`, `user_id`, `name`, `rut`, `alias`, `created_at` |
| `public.classification_rules` | Reglas de clasificación en BD: `id`, `user_id`, `bank`, `condition_type` ('contains'), `condition_value` (keyword), `category_tipo`, `category_principal`, `category_secundaria` |
| `public.categories` | Tabla legacy (usada solo por MigrationAudit). No usar en features nuevas. |

### RLS Policies
*   Todas las tablas tienen RLS activado. Los usuarios solo ven sus propios datos.
*   Las RPCs admin usan `SECURITY DEFINER` y validan `auth.jwt() ->> 'email' = 'viborasnake@gmail.com'`.

### RPCs (Supabase functions)
| Función | Descripción |
|---|---|
| `delete_user()` | Borra el usuario auth autenticado (self-delete desde Settings) |
| `admin_get_dashboard_data()` | Retorna todos los perfiles con conteo de TX y bancos (admin only) |
| `admin_update_user_status(target_user_id, new_status)` | Cambia status en `profiles` (admin only) |
| `admin_update_user_details(target_user_id, new_name, new_rut)` | Edita nombre y RUT (admin only) |
| `admin_delete_user(target_user_id)` | Borra usuario desde auth.users (admin only) |

---

## Key Business Logic

### Transaction Types & Categories (Taxonomía)
Definida en `src/hooks/useTaxonomy.ts` → `BASE_TAXONOMY`. Los 4 tipos raíz:
*   `Egreso` — Gasto real de dinero (la mayoría de categorías)
*   `Ingreso` — Entradas de dinero
*   `Movimiento Interno` — Transferencias propias
*   `Ahorro/Inversión` — Ahorro o inversión

Las categorías custom del usuario se mezclan al `BASE_TAXONOMY` en runtime via `useTaxonomy()`.

### Classification Rules
*   Guardadas en la tabla `classification_rules` por `user_id` y `bank`.
*   `SettingsContext` las carga al cambiar de banco activo.
*   En `SettingsContext.saveClassificationRules()` se hace **DELETE + INSERT** completo (no UPDATE parcial).
*   En `classificationRules.ts`, `applyRules()` hace match por substring case-insensitive.
*   Al migrar desde localStorage (legacy), se insertan en la BD y se borra el item de localStorage.

### Bank System
*   Bancos disponibles: `Scotiabank`, `Itaú`, `Mach` (BancoEstado comentado).
*   `BankContext` persiste `activeBank` y `dashboardScope` en `localStorage`.
*   `dashboardScope` puede ser `'all'` (consolidado) o un bank ID específico.
*   En modo consolidado se muestran transacciones de todos los bancos conectados.

### Silent Migrations (en `App.tsx` → `ProtectedRoute`)
Se ejecutan una vez por usuario al inicio de sesión (guardadas en `localStorage`):
*   **v2:** Renombra `'Gasto Real'` → `'Egreso'`, `'Benja'` → `'Hijos'` en transactions y classification_rules.
*   **v3:** Renombra `'Transferencias de Otras Personas'` (categoria_principal) → `'Transferencias'`, mueve el nombre a categoria_secundaria.
*   **v4:** Corrige transacciones de Itaú incorrectamente guardadas como Scotiabank (detectado por keys del raw_data que contengan 'movimiento').

### Fixed Expenses / Cuentas (Accounts)
*   Definidos en `SettingsContext` como `fixedExpenses: FixedExpense[]`.
*   Guardados en `user_settings.custom_categories` bajo la key especial `'__fixed_expenses'`.
*   La página `Accounts.tsx` cruza los gastos fijos contra las transacciones del mes seleccionado.
*   Matching por: categoria, description tokens, o keyword configurada en el gasto fijo.
*   Muestra histórico de 8 meses por item.

### Smart Assistant (`SmartAssistant.tsx`)
*   Analiza transacciones sin categorizar y propone clasificaciones.
*   Heurísticas locales por regex (`HEURISTICS` array) para detectar tipo de gasto.
*   También detecta transferencias con RUT extraído via `extractAndNormalizeRUT()`.
*   Al aceptar, guarda la regla en `classification_rules` y aplica la categoría.

### Action Queue (`useActionQueue`)
*   Hook para operaciones con "undo" tipo Slack.
*   Muestra un toast con botón Deshacer durante 6 segundos.
*   Ejecuta la acción real en BD solo si el usuario no deshace.
*   Se usa en `Transactions.tsx` para ediciones inline.

### Laika Pet (`LaikaPet.tsx`)
*   Mascota visual del proyecto. Renderiza PNG de la carpeta `src/assets/laika/`.
*   Poses disponibles: `welcome`, `pointing`, `tip`, `celebrating`, `thinking`, `warning`, `error`, `success`, `loading`, `love`.

---

## Admin Panel & User Status Rules
*   **Admin Account:** Solo `viborasnake@gmail.com` tiene acceso a `/admin`.
*   **Guard de frontend:** `AdminDashboard.tsx` redirige a `/` si el email no coincide.
*   **Cuentas pausadas:** `AuthContext` verifica `profiles.status` al iniciar sesión. Si es `'paused'`, `isPaused = true` y `ProtectedRoute` muestra el bloqueo inline (no redirige a otra ruta).
*   **Acción de pausa:** Admin llama `admin_update_user_status` RPC. El usuario pausado no puede operar aunque tenga sesión activa.

---

## Bank Statement Imports (`CSVImport.tsx`)

### Flujo de importación
1. Usuario arrastra/selecciona archivo (`react-dropzone`).
2. Se detecta el banco por extensión y contenido del archivo.
3. Se muestra modal de confirmación del banco detectado.
4. Se parsea el archivo (CSV/XLSX/DAT/PDF).
5. Se aplican reglas de clasificación automática.
6. Usuario puede editar y confirmar antes de insertar en BD.

### Formatos soportados
| Banco | Formato | Parser |
|---|---|---|
| Scotiabank | CSV (separador `;`) | PapaParse |
| Itaú | XLSX / XLS | SheetJS (xlsx) |
| Mach | PDF protegido | pdfjs-dist legacy |

### MACH PDF Parsing — Reglas críticas
*   Usar **`pdfjs-dist@3.11.174`** (legacy build). **NO usar v4+** (falla en Safari por ES2022 async iterators).
*   Worker: `pdfjs-dist/legacy/build/pdf.worker.min.js?url` importado como Vite URL.
*   Inicializar: `pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl`.
*   Buffer del PDF: siempre hacer `arrayBuffer.slice(0)` antes de pasarlo a pdfjs para evitar "Buffer is already detached" en múltiples intentos de contraseña.
*   Iterar texto: usar `for (let i = 0; i < items.length; i++)` (NO `for...of` ni métodos de Array).
*   Contraseña del PDF: RUT sin puntos, guiones, ni dígito verificador (ej. `17673553`).

### Scotiabank CSV — Formato de fecha
*   Formato especial: `DDMMYYYY` sin separadores (ej: `09072026`).
*   Función `parseScotiabankDate()` maneja esto: últimos 4 = año, 2 anteriores = mes, primeros = día.

---

## Styling & Design Guidelines

MisFinanzas usa **Neo-Brutalist** como lenguaje visual. Siempre respetar:

*   **Bordes gruesos:** `border: '2px solid black'` o `border: '3px solid black'`. Nunca bordes finos o de colores en contenedores principales.
*   **Sombras duras:** `boxShadow: '4px 4px 0px black'` o `boxShadow: '6px 6px 0px black'`. Nunca sombras difusas o con blur.
*   **Tablas:** `tableLayout: 'fixed'`. Definir anchos estrictos para columnas Date/Monto/Badge (`width: '120px'`) para maximizar espacio en campos de descripción editables.
*   **Cards y layouts:** Los controles de tabla y filtros van dentro de cards con `margin-bottom`, no en fondos grises a ancho completo.
*   **Colores:** Usar las variables CSS del `index.css` (`--pastel-green`, `--pastel-yellow`, etc.). Evitar colores planos genéricos.
*   **Tipografía:** Font del proyecto cargado desde Google Fonts (Inter). Pesos 600-900 para énfasis.

---

## Component Map

| Archivo | Descripción |
|---|---|
| `src/App.tsx` | Router principal, `ProtectedRoute`, migraciones silenciosas |
| `src/main.tsx` | Entry point, wrapping de providers |
| `src/components/Layout.tsx` | Sidebar nav, `BankIndicator` switcher, header |
| `src/components/SmartAssistant.tsx` | Asistente de clasificación automática |
| `src/components/InitialAdjustmentManager.tsx` | Manager de "Saldo Inicial" por banco |
| `src/components/MindMapChart.tsx` | Mapa mental de categorías (react-d3-tree) |
| `src/components/NeoDatePicker.tsx` | Date picker custom neo-brutalist |
| `src/components/LaikaPet.tsx` | Mascota visual Laika |
| `src/components/InfoTooltip.tsx` | Tooltip de información |
| `src/components/TransactionTypeBadge.tsx` | Badge visual para tipo/categoría de TX |
| `src/pages/Dashboard.tsx` | Dashboard principal con charts (Recharts), filtros de período, KPIs |
| `src/pages/Transactions.tsx` | Lista editable de TX + `CascadingCategorySelector` (exportado) |
| `src/pages/Accounts.tsx` | Tracker de gastos fijos mensuales |
| `src/pages/CSVImport.tsx` | Importador multiformato (CSV/XLSX/PDF) |
| `src/pages/Settings.tsx` | Configuración: RUT, bancos, categorías, reglas, gastos fijos, eliminar cuenta |
| `src/pages/Login.tsx` | Pantalla de login/registro |
| `src/pages/AdminDashboard.tsx` | Panel admin (solo viborasnake@gmail.com) |
| `src/pages/MigrationAudit.tsx` | Herramienta de backup JSON (legacy) |
| `src/contexts/AuthContext.tsx` | Auth, isPaused |
| `src/contexts/BankContext.tsx` | Bancos conectados, banco activo, scope |
| `src/contexts/SettingsContext.tsx` | Categorías, reglas, gastos fijos |
| `src/hooks/useTaxonomy.ts` | Merge de BASE_TAXONOMY + categorías custom |
| `src/hooks/useActionQueue.tsx` | Operaciones con undo (toast 6s) |
| `src/utils/rutParser.ts` | `cleanRut`, `validateRut`, `extractAndNormalizeRUT` |
| `src/utils/classificationRules.ts` | Interface `ClassificationRule` + `applyRules()` |
| `src/services/supabase.ts` | Cliente Supabase singleton |

---

## Key Dependencies
| Paquete | Versión | Uso |
|---|---|---|
| `pdfjs-dist` | `3.11.174` | Parseo de PDFs MACH (ver reglas críticas arriba) |
| `papaparse` | `5.5.x` | Parseo de CSVs Scotiabank |
| `xlsx` | `0.18.5` | Parseo de XLSX Itaú |
| `recharts` | `3.9.x` | Gráficos en Dashboard (AreaChart, LineChart, Bar, ComposedChart) |
| `react-d3-tree` | `3.6.6` | Mapa mental de categorías |
| `react-dropzone` | `15.x` | Zona de drag & drop en importación |
| `react-hot-toast` | `2.6.x` | Toasts y acción queue con undo |
| `lucide-react` | `1.23.x` | Iconografía |
| `react-router-dom` | `7.x` | Routing |

---

## CascadingCategorySelector (componente exportado desde `Transactions.tsx`)
*   Selector de categorías con buscador fuzzy + árbol colapsable.
*   Importado en `Settings.tsx` y `Accounts.tsx`.
*   Soporta creación de categorías custom inline.
*   Props: `initialPrincipal`, `initialSecundaria`, `contextDescription`, `onSave(tipo, principal, secundaria)`.

---

## Important Patterns & Gotchas

1.  **Parsing de fechas locales:** Usar siempre `parseLocalDate()` (split por `-`, `new Date(y, m-1, d, 12, 0, 0)`) para evitar desfases de timezone al trabajar con fechas de BD.
2.  **Banco desconectado:** Nunca asumir que `activeBank` tiene valor. Puede ser `null` si el usuario no ha conectado ningún banco.
3.  **Reglas de clasificación:** Las reglas están en la tabla `classification_rules` indexadas por `bank`. Al copiar configuración entre bancos, se usa `copySettingsFromBank()` del SettingsContext.
4.  **Categorías custom:** Se guardan en `user_settings.custom_categories` como JSONB con estructura `{ [bankId]: CustomCategory[] }`. La key especial `'__fixed_expenses'` guarda los gastos fijos.
5.  **`tipo_movimiento` vs `type`:** El campo `type` (ingreso/egreso lowercase) viene del CSV raw. El campo `tipo_movimiento` (Ingreso/Egreso capitalized) es la categorización semántica de la app. Ambos coexisten.
6.  **SmartAssistant y transferencias:** Extrae RUTs de la descripción con `extractAndNormalizeRUT()`. Si el RUT coincide con un `known_contact`, propone el nombre del contacto.
7.  **Scope consolidado:** `dashboardScope === 'all'` solo es válido cuando `connectedBanks.length > 1`. En ese modo, el Dashboard y Accounts cargan TXs de todos los bancos en paralelo.
