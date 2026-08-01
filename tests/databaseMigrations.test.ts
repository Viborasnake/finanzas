import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationsDirectory)
  .filter(file => file.endsWith('.sql'))
  .sort();

const readMigration = (filename: string) => (
  readFileSync(new URL(filename, migrationsDirectory), 'utf8')
);

const allMigrations = migrationFiles.map(readMigration).join('\n');

test('la cadena parte con una base estructural antes de migrar datos', () => {
  assert.equal(migrationFiles[0], '20260701000000_base_schema.sql');

  const baseline = readMigration(migrationFiles[0]);
  for (const table of [
    'profiles',
    'categories',
    'transactions',
    'user_settings',
    'known_contacts',
    'classification_rules',
  ]) {
    assert.match(baseline, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, 'i'));
  }
});

test('todas las tablas con datos personales habilitan RLS', () => {
  const baseline = readMigration('20260701000000_base_schema.sql');
  for (const table of [
    'profiles',
    'categories',
    'transactions',
    'user_settings',
    'known_contacts',
    'classification_rules',
  ]) {
    assert.match(baseline, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'));
  }

  assert.match(allMigrations, /ALTER TABLE public\.admin_users ENABLE ROW LEVEL SECURITY/i);
  assert.match(allMigrations, /ALTER TABLE public\.transaction_import_batches ENABLE ROW LEVEL SECURITY/i);
});

test('las RPC críticas existen en la cadena versionada', () => {
  for (const rpc of [
    'delete_user',
    'is_current_user_admin',
    'admin_get_dashboard_data',
    'admin_update_user_status',
    'admin_update_user_details',
    'admin_delete_user',
    'ingest_statement_transactions',
    'split_transaction',
    'restore_split_transaction',
  ]) {
    assert.match(allMigrations, new RegExp(`FUNCTION public\\.${rpc}\\b`, 'i'));
  }
});

test('la identidad de origen sobrevive a divisiones y bloquea su reimportación', () => {
  const migration = readMigration('20260801144656_prevent_split_reimport_and_review_duplicates.sql');

  assert.match(migration, /ADD COLUMN IF NOT EXISTS source_origin_key text/i);
  assert.match(migration, /existing\.raw_data \? 'split_group_id'/i);
  assert.match(migration, /split_skipped_count integer/i);
  assert.match(migration, /FUNCTION public\.split_transaction\b/i);
  assert.match(migration, /FUNCTION public\.restore_split_transaction\b/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.split_transaction[\s\S]*FROM PUBLIC, anon, authenticated/i);
});

test('las divisiones históricas recuperan identidad desde la fila bancaria original', () => {
  const migration = readMigration('20260801145106_backfill_legacy_split_origins.sql');

  assert.match(migration, /raw_data ->> 'fecha'/i);
  assert.match(migration, /raw_data ->> 'original_amount'/i);
  assert.match(migration, /raw_data ->> 'descripcion'/i);
  assert.match(migration, /candidate_fingerprint/i);
  assert.match(migration, /source_origin_key/i);
  assert.match(migration, /'split_group_id'/i);
});

test('la versión final de delete_user fija search_path y permisos', () => {
  const hardening = readMigration('20260716000000_harden_delete_user_rpc.sql');
  assert.match(hardening, /SECURITY DEFINER\s+SET search_path = ''/i);
  assert.match(hardening, /WHERE id = auth\.uid\(\)/i);
  assert.match(hardening, /REVOKE ALL ON FUNCTION public\.delete_user\(\) FROM PUBLIC, anon, authenticated/i);
  assert.match(hardening, /GRANT EXECUTE ON FUNCTION public\.delete_user\(\) TO authenticated/i);
});

test('el endurecimiento runtime corrige onboarding, trigger y políticas RLS', () => {
  const hardening = readMigration('20260801062435_harden_runtime_schema.sql');

  assert.match(hardening, /ALTER COLUMN rut DROP NOT NULL/i);
  assert.match(hardening, /FUNCTION public\.handle_new_user\(\)[\s\S]*SET search_path = ''/i);
  assert.match(hardening, /REVOKE ALL ON FUNCTION public\.handle_new_user\(\) FROM PUBLIC, anon, authenticated/i);
  assert.match(hardening, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/i);
  assert.match(hardening, /transactions_shared_with_id_idx/i);
});
