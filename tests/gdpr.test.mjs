// Teste pentru termenii acceptați și exportul datelor personale (migrarea 0013).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
`);
for (const f of ['0001_fundatie.sql', '0002_procese_verbale.sql', '0003_continut_pv.sql', '0004_fam.sql', '0005_betoane_incercari.sql',
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql'])
  await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));

const U = {
  admin: '11111111-1111-1111-1111-111111111111', dir: '22222222-2222-2222-2222-222222222222',
  rte: '33333333-3333-3333-3333-333333333333', proi: '44444444-4444-4444-4444-444444444444',
  benef: '55555555-5555-5555-5555-555555555555', proi2: '66666666-6666-6666-6666-666666666666', citit: '88888888-8888-8888-8888-888888888888', strain: '77777777-7777-7777-7777-777777777777',
};

let pass = 0, fail = 0;
async function as(user, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${U[user]}', false);`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}
async function refuses(name, fn, contine) {
  try { await fn(); fail++; console.log('  ✗', name, '→ a trecut, dar trebuia refuzat'); }
  catch (e) {
    if (contine && !e.message.includes(contine)) { fail++; console.log('  ✗', name, '→ alt motiv:', e.message); return; }
    pass++; console.log('  ✓', name, '(refuzat:', e.message.slice(0, 80) + ')');
  }
}
const one = r => r.rows[0];
// conturile de test: unul care acceptă termenii la înregistrare, unul vechi (fără metadate)
await db.query(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, 'Admin@Test.ro', $2, now())`,
  [U.admin, JSON.stringify({ nume: 'Ana Admin', termeni_versiune: '2026-11-02' })]);
for (const k of ['dir', 'rte', 'proi', 'benef', 'proi2', 'citit', 'strain'])
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [U[k], `${k}@test.ro`]);
const pers = async id => one(await db.query(`select nume, email, termeni_versiune, termeni_acceptati_la from persoane where id = $1`, [id]));

console.log('Termenii acceptați');
await ok('la cont nou se păstrează numele, versiunea și momentul acceptării', async () => {
  const p = await pers(U.admin);
  return p.nume === 'Ana Admin' && p.email === 'admin@test.ro' && p.termeni_versiune === '2026-11-02' && p.termeni_acceptati_la !== null;
});
await ok('un cont fără acceptare are versiunea goală', async () => (await pers(U.dir)).termeni_versiune === null);
await ok('persoana acceptă versiunea curentă', async () => {
  await as('dir', `select accepta_termenii('2026-11-02')`);
  const p = await pers(U.dir); return p.termeni_versiune === '2026-11-02' && p.termeni_acceptati_la !== null;
});
await refuses('versiunea trebuie să fie o dată', () => as('dir', `select accepta_termenii('orice')`), 'nu e validă');
await refuses('nimeni nu-și scrie singur momentul acceptării', () => as('dir', `update persoane set termeni_acceptati_la = '2020-01-01' where id = $1`, [U.dir]), 'permission');
await refuses('anonimul nu poate accepta', async () => {
  await db.exec(`set role anon`);
  try { await db.query(`select accepta_termenii('2026-11-02')`); } finally { await db.exec(`reset role`); }
}, 'permission');

console.log('Datele mele');
await as('admin', `insert into proiecte (cod, denumire) values ('BLC01', 'Bloc test')`);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, 'dir@test.ro', 'diriginte')`, [P]);
await as('dir', `select accepta_invitatiile()`);
await as('dir', `update persoane set telefon = '0722000000' where id = $1`, [U.dir]);
await as('dir', `insert into documente_persoana (tip, numar, emitent) values ('autorizatie_isc', 'AD-123', 'ISC')`);
const d = (await as('dir', `select datele_mele() as d`)).rows[0].d;
await ok('exportul are profilul, contul și acceptarea termenilor', async () =>
  d.persoana.telefon === '0722000000' && d.cont.email === 'dir@test.ro' && d.persoana.termeni_versiune === '2026-11-02');
await ok('exportul are proiectele și rolul', async () => d.proiecte.length === 1 && d.proiecte[0].cod === 'BLC01' && d.proiecte[0].rol === 'diriginte');
await ok('exportul are documentele personale (autorizația)', async () => d.documente_personale.length === 1 && d.documente_personale[0].numar === 'AD-123');
await ok('exportul are acțiunile din istoric', async () => Array.isArray(d.actiuni_in_istoric) && d.actiuni_in_istoric.length >= 1);
await ok('exportul altcuiva nu conține datele dirigintelui', async () => {
  const s = (await as('strain', `select datele_mele() as d`)).rows[0].d;
  return s.cont.email === 'strain@test.ro' && s.proiecte.length === 0 && s.documente_personale.length === 0 && !JSON.stringify(s).includes('AD-123');
});
await refuses('anonimul nu are export', async () => {
  await db.exec(`set role anon`);
  try { await db.query(`select datele_mele()`); } finally { await db.exec(`reset role`); }
}, 'permission');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
