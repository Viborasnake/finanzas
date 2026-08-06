# Feedback por pantalla

Sistema para recolectar comentarios de usuarios por función/pantalla en etapa de madurez.

## Qué se captura

| Campo | Descripción |
|--------|-------------|
| `screen_key` / `screen_label` | Pantalla resuelta desde la ruta (`dashboard`, `transactions`, etc.) |
| `path` | Ruta exacta al enviar |
| `category` | `bug`, `confusion`, `idea`, `praise`, `other` |
| `rating` | 1–5 opcional |
| `feature` | Función concreta opcional (ej. “importar PDF”) |
| `message` | Comentario libre |
| `viewport` / `user_agent` | Contexto de dispositivo |
| `status` | `new` → `reviewed` → `done` (triage admin) |

## UI

- Botón flotante **Feedback** en todas las pantallas autenticadas (`FeedbackWidget` dentro de `Layout`).
- La pantalla se detecta sola con `resolveFeedbackScreen(pathname)`.
- Admin → sección **Feedback por pantalla** con filtros y cambio de estado.

## Migración

Archivo:

`supabase/migrations/20260806180000_product_feedback.sql`

Aplicar en el proyecto remoto (una de):

```bash
supabase db push
# o ejecutar el SQL en el SQL Editor de Supabase
```

Sin esta migración el envío fallará y se mostrará un toast indicando que falta aplicar el schema.

## RLS

- Usuario autenticado: **solo inserta** feedback.
- Admin (`is_current_user_admin()`, cuenta principal en `admin_users` / viborasnake): **lee todo** y actualiza `status`.
- Ningún usuario no-admin puede listar el inbox.
