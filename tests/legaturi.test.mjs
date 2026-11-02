// Teste pentru legăturile cu modelul și starea execuției (migrarea 0019).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql', '0017_reclamatii.sql', '0018_observatii.sql', '0019_legaturi_model.sql'])
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
const PV = one(await as('dir', `select convoaca_pv($1, 'lucrari_ascunse', 'Armare grinzi etaj 1', 'Grinzi etaj 1', current_date, 'Șantier', $2::uuid[], null) as id`, [P, [U.dir, U.rte]])).id;
await as('rte', `insert into turnari (proiect_id, data, element, clasa_beton) values ($1, current_date, 'Grinzi etaj 1', 'C25/30')`, [P]);
const T = one(await db.query(`select id from turnari where proiect_id = $1`, [P])).id;
const leaga = (user, ent, id, guid = '2O2Fr$t4X7Zf8NOew3FLOH') => as(user, `insert into elemente_legate (proiect_id, entitate, entitate_id, guid, nume, clasa) values ($1, $2, $3, $4, 'Grinda G3', 'IFCBEAM')`, [P, ent, id, guid]);

console.log('Legăturile');
await ok('constructorul leagă grinda de PV-ul de lucrări ascunse', async () => (await leaga('rte', 'pv', PV)).affectedRows === 1);
await ok('și de turnare', async () => (await leaga('rte', 'turnare', T)).affectedRows === 1);
await ok('dirigintele leagă alt element de PV', async () => (await leaga('dir', 'pv', PV, '1hOSvn6df7F8_7GcBWlRGQ')).affectedRows === 1);
await refuses('aceeași legătură nu se dublează', () => leaga('rte', 'pv', PV), 'duplicate');
await refuses('beneficiarul nu leagă elemente de turnări', () => leaga('benef', 'turnare', T, 'x1'), 'Nu puteți lega');
await refuses('proiectantul nu leagă turnări', () => leaga('proi', 'turnare', T, 'x2'), 'Nu puteți lega');
await refuses('cititorul nu', () => leaga('citit', 'pv', PV, 'x3'), 'Nu puteți lega');
await refuses('documentul trebuie să fie din proiect', () => leaga('rte', 'pv', '00000000-0000-0000-0000-000000000000', 'x4'), 'Nu puteți lega');
await ok('toți membrii văd legăturile', async () => (await as('citit', `select count(*)::int n from elemente_legate`)).rows[0].n === 3);
await ok('cei din afara proiectului nu', async () => (await as('strain', `select count(*)::int n from elemente_legate`)).rows[0].n === 0);
await ok('legarea apare în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel = 'elemente_legate'`)).rows[0].n === 3);

console.log('Ștergerea legăturilor');
await ok('autorul își șterge legătura greșită (PV nesemnat)', async () => (await as('dir', `delete from elemente_legate where guid = '1hOSvn6df7F8_7GcBWlRGQ'`)).affectedRows === 1);
await ok('altcineva nu', async () => (await as('proi', `delete from elemente_legate where entitate = 'turnare'`)).affectedRows === 0);
await db.query(`update procese_verbale set stare = 'semnat' where id = $1`, [PV]);
await ok('după semnarea PV-ului, autorul nu mai șterge legătura', async () => (await as('rte', `delete from elemente_legate where entitate = 'pv'`)).affectedRows === 0);
await ok('dirigintele da', async () => (await as('dir', `delete from elemente_legate where entitate = 'pv'`)).affectedRows === 1);
await ok('ștergerea apare în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel = 'elemente_legate' and operatie = 'DELETE'`)).rows[0].n === 2);
await db.query(`update procese_verbale set stare = 'anulat' where id = $1`, [PV]);
await refuses('la un PV anulat nu se mai leagă', () => leaga('rte', 'pv', PV, 'x5'), 'Nu puteți lega');

console.log('Elementele executate');
const exec = (user, guid, data = null) => as(user, `insert into elemente_executate (proiect_id, guid, nume, executat_la) values ($1, $2, 'Stâlp S1', coalesce($3::date, current_date))`, [P, guid, data]);
await ok('constructorul marchează un element executat', async () => (await exec('rte', 'S1')).affectedRows === 1);
await refuses('proiectantul nu', () => exec('proi', 'S2'), 'constructorul');
await refuses('data nu poate fi în viitor', () => exec('rte', 'S3', '2099-01-01'), 'viitor');
await refuses('un element se marchează o singură dată', () => exec('dir', 'S1'), 'duplicate');
await ok('marcajul se poate anula de autor', async () => (await as('rte', `delete from elemente_executate where guid = 'S1'`)).affectedRows === 1);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
