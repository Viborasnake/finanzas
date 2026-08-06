# Atajo iPhone → cartolas en MisFinanzas

## Qué es

Un **token personal** + **URL de subida** para que un Atajo de iOS envíe PDF/CSV/Excel con **Compartir**.

La plataforma **no instala el atajo sola** (limitación de Apple): genera credenciales y la guía. El usuario lo arma **una vez** (~2 min).

## Componentes

| Pieza | Ubicación |
|--------|-----------|
| Tablas `intake_tokens`, `intake_jobs` + bucket `cartola-intake` | `supabase/migrations/20260806210000_cartola_intake.sql` |
| Edge Function `intake-upload` | `supabase/functions/intake-upload/index.ts` |
| UI Ajustes | `src/components/IosShortcutIntake.tsx` → `#atajo-iphone` |
| Banner en Importar | `src/pages/ImportRoute.tsx` |

## Despliegue

```bash
# 1) Schema + storage
npx supabase db query --linked -f supabase/migrations/20260806210000_cartola_intake.sql

# 2) Function (requiere project linked)
npx supabase functions deploy intake-upload --no-verify-jwt
```

`--no-verify-jwt` porque el atajo autentica con `x-intake-token`, no con el JWT de Supabase Auth.

## Contrato del endpoint

`POST {SUPABASE_URL}/functions/v1/intake-upload`

| | |
|--|--|
| Header | `x-intake-token: msf_…` |
| Body | `multipart/form-data` campo `file` |
| Opcional | `source=ios_shortcut` |

Respuesta OK:

```json
{ "ok": true, "message": "…", "job": { "id": "…", "filename": "…", "status": "received" } }
```

## Flujo de usuario

1. Ajustes → **Atajo iPhone** → Generar token (copiar una vez).  
2. Atajos → Recibir archivo + Obtener contenido de URL (POST form).  
3. Cartola → Compartir → Enviar a MisFinanzas.  
4. Importar → banner de pendientes; procesar con el flujo actual de cartola.

## Seguridad

- Token hasheado (SHA-256); el secreto solo se muestra al crearlo.  
- Revocable desde Ajustes.  
- Storage privado; path `{user_id}/{job_id}/filename`.  
- Límite 20 MB; extensiones de cartola/imagen.

## Siguiente paso de producto

Abrir el archivo de `intake_jobs` en el flujo de `ImportModal` (descarga firmada + auto-selección de archivo) para no re-subir manualmente.
