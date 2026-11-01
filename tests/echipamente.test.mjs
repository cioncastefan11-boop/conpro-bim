// Teste pentru spații, echipamente și documentele Cărții tehnice (migrarea 0006).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const db = new PGlite();
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
`);
for (const f of ['0001_fundatie.sql', '0002_procese_verbale.sql', '0003_continut_pv.sql', '0004_fam.sql', '0005_betoane_incercari.sql', '0006_echipamente_carte.sql'])
  await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));

const U = {
  admin: '11111111-1111-1111-1111-111111111111', dir: '22222222-2222-2222-2222-222222222222',
  rte: '33333333-3333-3333-3333-333333333333', proi: '44444444-4444-4444-4444-444444444444',
  benef: '55555555-5555-5555-5555-555555555555', strain: '77777777-7777-7777-7777-777777777777',
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
const rows = r => r.rows.length;

for (const cod of ['BLC01', 'ALT01']) await as('admin', `insert into proiecte (cod, denumire) values ($1, 'Proiect ' || $1)`, [cod]);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
const P2 = one(await db.query(`select id from proiecte where cod='ALT01'`)).id;
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['benef', 'beneficiar']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, 'rte@test.ro', 'constructor')`, [P2]);
for (const u of ['dir', 'rte', 'proi', 'benef']) await as(u, `select accepta_invitatiile()`);

console.log('Spații');
await ok('proiectantul definește nivelurile', async () =>
  (await as('proi', `insert into niveluri (proiect_id, cod, denumire, cota, ordine) values ($1, 'P', 'Parter', 0, 1), ($1, 'E1', 'Etaj 1', 3, 2)`, [P])).affectedRows === 2);
const NP = one(await db.query(`select id from niveluri where cod='P' and proiect_id=$1`, [P])).id;
await ok('constructorul adaugă încăperi', async () =>
  (await as('rte', `insert into incaperi (proiect_id, nivel_id, cod, denumire, functiune, arie) values ($1, $2, 'P.01', 'Centrală termică', 'Tehnic', 12.5)`, [P, NP])).affectedRows === 1);
await refuses('beneficiarul nu modifică spațiile', () =>
  as('benef', `insert into niveluri (proiect_id, cod, denumire) values ($1, 'S', 'Subsol')`, [P]));
await refuses('o încăpere nu se leagă de nivelul altui proiect', async () => {
  await as('rte', `insert into niveluri (proiect_id, cod, denumire) values ($1, 'P', 'Parter')`, [P2]);
  const N2 = one(await db.query(`select id from niveluri where proiect_id=$1`, [P2])).id;
  await as('rte', `insert into incaperi (proiect_id, nivel_id, cod, denumire) values ($1, $2, 'P.02', 'Greșit')`, [P, N2]);
}, 'Nivelul');
await refuses('codurile de încăperi sunt unice pe proiect', () =>
  as('rte', `insert into incaperi (proiect_id, nivel_id, cod, denumire) values ($1, $2, 'P.01', 'Dublură')`, [P, NP]));
const IC = one(await db.query(`select id from incaperi where cod='P.01'`)).id;

console.log('Echipamente');
await ok('constructorul definește un tip de echipament', async () =>
  (await as('rte', `insert into tipuri_echipament (proiect_id, denumire, categorie, producator, model, garantie_luni, interval_mentenanta_luni, durata_viata_ani)
                    values ($1, 'Pompă de căldură aer-apă 12 kW', 'Încălzire', 'Producător PC', 'HP-12', 36, 12, 20)`, [P])).affectedRows === 1);
const TIP = one(await db.query(`select id from tipuri_echipament limit 1`)).id;
await ok('constructorul înregistrează echipamentul montat', async () =>
  (await as('rte', `insert into echipamente (proiect_id, tip_id, incapere_id, cod, serie, data_montaj) values ($1, $2, $3, 'PC-01', 'SN-0001', '2026-10-30')`, [P, TIP, IC])).affectedRows === 1);
await refuses('etichetele sunt unice pe proiect', () =>
  as('rte', `insert into echipamente (proiect_id, tip_id, cod) values ($1, $2, 'PC-01')`, [P, TIP]));
await refuses('punerea în funcțiune nu poate fi înaintea montajului', () =>
  as('rte', `update echipamente set data_punere_functiune = '2026-10-01' where cod = 'PC-01'`), 'montajului');
await refuses('PV-ul de punere în funcțiune trebuie să fie semnat', async () => {
  const pv = one(await as('rte', `select convoaca_pv($1, 'punere_in_functiune', 'Pompa de căldură', null, '2026-11-01', null, $2::uuid[], null) id`, [P, [U.dir, U.rte]])).id;
  await as('rte', `update echipamente set pv_id = $1 where cod = 'PC-01'`, [pv]);
}, 'semnat');
await refuses('un echipament nu se leagă de tipul altui proiect', async () => {
  await as('rte', `insert into tipuri_echipament (proiect_id, denumire) values ($1, 'Tip din alt proiect')`, [P2]);
  const T2 = one(await db.query(`select id from tipuri_echipament where proiect_id=$1`, [P2])).id;
  await as('rte', `insert into echipamente (proiect_id, tip_id, cod) values ($1, $2, 'X-01')`, [P, T2]);
}, 'Tipul');
await refuses('dirigintele nu modifică echipamentele', () =>
  as('dir', `insert into echipamente (proiect_id, tip_id, cod) values ($1, $2, 'PC-02')`, [P, TIP]));
await ok('dirigintele și beneficiarul le văd', async () =>
  rows(await as('dir', `select * from echipamente`)) === 1 && rows(await as('benef', `select * from tipuri_echipament`)) === 1);
await ok('un străin nu vede nimic', async () =>
  rows(await as('strain', `select * from echipamente`)) + rows(await as('strain', `select * from incaperi`)) === 0);
await ok('constructorul completează seria și garanția', async () =>
  (await as('rte', `update echipamente set garantie_start = '2026-11-01' where cod = 'PC-01'`)).affectedRows === 1);
await refuses('un tip folosit nu se poate șterge', () => as('rte', `delete from tipuri_echipament where id = $1`, [TIP]));

console.log('Cartea tehnică');
await ok('dirigintele înregistrează autorizația de construire în capitolul A', async () =>
  (await as('dir', `insert into documente_carte (proiect_id, capitol, titlu, numar, data, emitent) values ($1, 'A', 'Autorizația de construire', '412/2026', '2026-09-30', 'Primăria Sector 6')`, [P])).affectedRows === 1);
await refuses('capitolul trebuie să fie A, B, C sau D', () =>
  as('dir', `insert into documente_carte (proiect_id, capitol, titlu) values ($1, 'E', 'Alt capitol')`, [P]));
await refuses('documentele înregistrate nu se modifică', () => as('dir', `update documente_carte set numar = 'x'`));
await ok('nici nu se șterg', async () =>
  (await as('dir', `delete from documente_carte`).catch(() => ({ affectedRows: 0 }))).affectedRows === 0);
const DC = one(await db.query(`select id from documente_carte limit 1`)).id;
await ok('cine a înregistrat documentul îi atașează fișierul', async () =>
  (await as('dir', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'document_carte', $2, 'ac.pdf', $3)`,
    [P, DC, `${P}/document_carte/${DC}/ac.pdf`])).affectedRows === 1);
await refuses('altcineva nu atașează la documentul lui', () =>
  as('rte', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'document_carte', $2, 'x.pdf', $3)`,
    [P, DC, `${P}/document_carte/${DC}/x.pdf`]));
await ok('constructorul atașează fișa tehnică la tipul de echipament', async () =>
  (await as('rte', `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'tip_echipament', $2, 'fisa_tehnica', 'f.pdf', $3)`,
    [P, TIP, `${P}/tip_echipament/${TIP}/f.pdf`])).affectedRows === 1);
await ok('beneficiarul vede documentele Cărții tehnice', async () => rows(await as('benef', `select * from documente_carte`)) === 1);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
