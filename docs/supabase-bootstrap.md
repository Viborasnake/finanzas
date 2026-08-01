# Bootstrap y migraciones de Supabase

La fuente de verdad del esquema es `supabase/migrations/`, aplicada en orden cronológico. `supabase_schema.sql`, `migration.sql` y `migration_gasto_real.sql` son referencias históricas y no deben ejecutarse además de la cadena formal.

## Instalación nueva

1. Instalar Supabase CLI y Docker.
2. Ejecutar `supabase init` si todavía no existe `supabase/config.toml`.
3. Iniciar el stack con `supabase start`.
4. Ejecutar `supabase db reset`.
5. Ejecutar `npm test`, `npm run lint` y `npm run build`.

`20260701000000_base_schema.sql` crea las tablas estructurales, índices, políticas RLS y el trigger de perfiles. Las migraciones posteriores normalizan datos, agregan administración e implementan la ingestión idempotente.

## Proyecto remoto existente

No se debe ejecutar `db push` directamente después de incorporar esta base histórica. Primero:

1. Crear una rama limpia y respaldar el proyecto remoto.
2. Ejecutar `supabase link --project-ref <project-ref>`.
3. Ejecutar `supabase db pull` para capturar el esquema y el historial remoto.
4. Comparar la migración generada con `20260701000000_base_schema.sql`.
5. Levantar localmente y confirmar la cadena completa con `supabase db reset`.
6. Revisar cualquier diferencia antes de ejecutar `supabase db push`.

La guía oficial recomienda `db pull` cuando el proyecto remoto contiene cambios que no existen en las migraciones locales: <https://supabase.com/docs/guides/local-development/database-migrations>.

## Limitación de la reconstrucción inicial

La primera versión de la migración base fue reconstruida desde:

- el SQL histórico versionado;
- las tablas y columnas usadas por el frontend;
- las migraciones de administración e ingestión existentes.

La extracción remota mediante el rol temporal de Supabase falló por timeout y el endpoint OpenAPI requiere una clave secreta, que no se utilizó. Por eso la comparación mediante `db pull` es obligatoria antes de desplegar esta migración a la base existente.
