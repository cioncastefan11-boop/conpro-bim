// Teste pentru cerințele de predare și lecțiile învățate (migrarea 0021).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql', '0017_reclamatii.sql', '0018_observatii.sql', '0019_legaturi_model.sql', '0020_plan_livrare.sql', '0021_cerinte_lectii.sql'])
  await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));

const U = {
  admin: '11111111-1111-1111-1111-111111111111', dir: '22222222-2222-2222-2222-222222222222',
  rte: '33333333-3333-3333-3333-333333333333', proi: '44444444-4444-4444-4444-444444444444',
  benef: '55555555-5555-5555-5555-555555555555', proi2: '66666666-6666-6666-6666-666666666666', citit: '88888888-8888-8888-8888-888888888888', strain: '77777777-7777-7777-7777-777777777777',
};
for (const [k, id] of Object.entries(U))
  await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [id, `${k}@test.ro`]);

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
const ADMC = 'abababab-abab-abab-abab-abababababab'; U.admc = ADMC;
await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'admc@test.ro', now())`, [ADMC]);

await as('admin', `insert into proiecte (cod, denumire) values ('BLC01', 'Bloc test')`);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
await as('admin', `update proiecte set ac_numar = '1/2026', clasa_consecinte = 'CC2' where id = $1`, [P]);
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['proi2', 'proiectant'], ['benef', 'beneficiar'], ['citit', 'cititor'], ['admc', 'administrator_cladire']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'proi2', 'benef', 'citit', 'admc']) await as(u, `select accepta_invitatiile()`);
const ev = (user, extra = {}) => as(user, `insert into evenimente_exploatare (proiect_id, tip, data_eveniment, titlu, descriere, corecteaza_id) values ($1, $2, $3, $4, $5, $6) returning id, numar`,
  [P, extra.tip ?? 'avarie', extra.data ?? '2026-10-20', extra.titlu ?? 'Infiltrație terasă', extra.descriere ?? 'Pată de umezeală în tavanul de la etajul 4.', extra.corecteaza ?? null]);
const sarcini = async user => (await as(user, `select tip, titlu, cale from sarcinile_mele()`)).rows;
const cer = (user, extra = {}) => as(user, `insert into cerinte_predare (proiect_id, categorie, camp, aplicabil_la, titlu, cuvinte) values ($1, $2, $3, $4, $5, $6) returning id, cod_document`,
  [P, extra.categorie ?? 'echipament', extra.camp ?? null, extra.aplicabil ?? null, extra.titlu ?? null, extra.cuvinte ?? null]);
console.log('Cerințele de predare');
await ok('beneficiarul cere seria la toate echipamentele', async () => (await cer('benef', { camp: 'serie' })).affectedRows === 1);
await ok('administratorul cere proiectul as-built', async () => (await cer('admin', { categorie: 'document', titlu: 'Proiectul as-built', cuvinte: 'as-built, real executat' })).affectedRows === 1);
await refuses('constructorul nu stabilește cerințele', () => cer('rte', { camp: 'model' }), 'beneficiarul');
await refuses('cerința de echipament are câmpul', () => cer('benef', { camp: null }), 'cerinta_completa');
await refuses('cerința de document are titlul', () => cer('benef', { categorie: 'document', titlu: ' ' }), 'cerinta_completa');
await refuses('câmpul trebuie să fie din listă', () => cer('benef', { camp: 'culoare' }), 'check');
await ok('toată echipa vede cerințele', async () => (await as('rte', `select count(*)::int n from cerinte_predare`)).rows[0].n === 2);
await ok('cei din afara proiectului nu', async () => (await as('strain', `select count(*)::int n from cerinte_predare`)).rows[0].n === 0);
await ok('constructorul nu le modifică', async () => (await as('rte', `update cerinte_predare set obligatorie = false`)).affectedRows === 0);

console.log('Lecțiile învățate');
const lec = (user, titlu = 'Convenția de denumire stabilită prea târziu') => as(user, `insert into lectii_invatate (proiect_id, categorie, titlu, recomandare) values ($1, 'informatii', $2, 'Stabiliți convenția înainte de prima planșă.') returning id`, [P, titlu]);
let L;
await ok('proiectantul scrie o lecție', async () => { L = one(await lec('proi')).id; return true; });
await ok('constructorul scrie alta', async () => (await lec('rte', 'Fișele COBie completate la montaj, nu la final')).rows.length === 1);
await refuses('cititorul nu', () => lec('citit'), 'nu cititorii');
await ok('autorul își modifică lecția', async () => (await as('proi', `update lectii_invatate set pozitiva = true where id = $1`, [L])).affectedRows === 1);
await ok('altcineva nu', async () => (await as('rte', `update lectii_invatate set titlu = 'x' where id = $1`, [L])).affectedRows === 0);
await ok('administratorul poate șterge', async () => (await as('admin', `delete from lectii_invatate where id = $1`, [L])).affectedRows === 1);
await ok('totul rămâne în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel in ('cerinte_predare', 'lectii_invatate')`)).rows[0].n >= 5);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
