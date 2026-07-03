-- Ejecuta este comando en el SQL Editor de tu panel de Supabase
ALTER TABLE "public"."transactions" 
ADD COLUMN IF NOT EXISTS "is_internal_transfer" boolean not null default false;
