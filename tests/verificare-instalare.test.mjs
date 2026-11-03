// Testează scriptul supabase/verificare_instalare.sql: pe o bază completă totul e OK,
// pe o bază incompletă arată exact migrările care lipsesc și versiunile vechi ale funcțiilor.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const dir = new URL('../supabase/migrations/', import.meta.url);
const migrari = fs.readdirSync(dir).filter(f => /^00\d\d_/.test(f) && !f.includes('reinstalare')).sort();
const script = fs.readFileSync(new URL('../supabase/verificare_instalare.sql', import.meta.url), 'utf8');

async function baza(pana) {
  const db = new PGlite();
  await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;`);
  for (const f of migrari) if (Number(f.slice(0, 4)) <= pana) await db.exec(fs.readFileSync(new URL(f, dir), 'utf8'));
  return db;
}
let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}

const ultima = Number(migrari.at(-1).slice(0, 4));
console.log('Verificarea instalării');
const completa = (await (await baza(ultima)).query(script)).rows;
await ok(`baza completă (0001–${String(ultima).padStart(4, '0')}): totul OK`, () => completa[0].starea === 'OK' && completa.slice(1).every(r => r.starea === 'OK'));
await ok('fiecare migrare are cel puțin o verificare', () => migrari.map(f => f.slice(0, 4)).every(m => completa.some(r => r.migrarea === m)));
await ok('fiecare tabel are RLS verificat', () => completa.filter(r => r.migrarea === 'RLS').length >= 40);
await ok('doar citește: rularea de două ori dă același rezultat', async () => {
  const db = await baza(ultima); const a = (await db.query(script)).rows, b = (await db.query(script)).rows;
  return JSON.stringify(a) === JSON.stringify(b);
});
const partiala = (await (await baza(17)).query(script)).rows;
await ok('baza până la 0017: rezumatul numește migrările de rulat', () => partiala[0].starea.startsWith('De rulat: 0018') && partiala[0].starea.includes(String(ultima).padStart(4, '0')));
await ok('… iar 0001–0017 rămân OK', () => partiala.filter(r => /^00(0[1-9]|1[0-7])$/.test(r.migrarea)).every(r => r.starea === 'OK'));
await ok('versiunea veche a unei funcții rescrise se vede', () => partiala.some(r => r.migrarea === '0018' && r.verificarea.startsWith('poate_atasa()') && r.starea === 'LIPSEȘTE'));
await ok('rândurile care lipsesc vin primele în migrarea lor', () => { const m = partiala.filter(r => r.migrarea === '0018'); return m[0].starea === 'LIPSEȘTE'; });

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
