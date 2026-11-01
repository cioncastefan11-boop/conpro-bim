// Teste pentru condica de betoane și încercări (migrarea 0005).
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
for (const f of ['0001_fundatie.sql', '0002_procese_verbale.sql', '0003_continut_pv.sql', '0004_fam.sql', '0005_betoane_incercari.sql'])
  await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));

const U = {
  admin: '11111111-1111-1111-1111-111111111111', dir: '22222222-2222-2222-2222-222222222222',
  rte: '33333333-3333-3333-3333-333333333333', proi: '44444444-4444-4444-4444-444444444444',
  benef: '55555555-5555-5555-5555-555555555555', lab: '66666666-6666-6666-6666-666666666666',
  strain: '77777777-7777-7777-7777-777777777777',
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

// --- pregătire: echipă, FAM de beton aprobat, PV de armare semnat ---
await as('admin', `insert into proiecte (cod, denumire) values ('BLC01', 'Bloc test')`);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['benef', 'beneficiar'], ['lab', 'laborator']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'benef', 'lab']) await as(u, `select accepta_invitatiile()`);

await as('rte', `insert into fam (proiect_id, material, utilizare, producator, produs, dop_numar) values ($1, 'Beton C25/30 XC1 S3', 'Plăci și grinzi', 'Stația X', 'C25/30 S3 D16', 'Rețetă 12')`, [P]);
const FAM = one(await db.query(`select id from fam limit 1`)).id;
await as('rte', `insert into fam (proiect_id, material, utilizare, producator, produs, dop_numar) values ($1, 'Beton neaprobat', 'test', 'Y', 'Z', 'D')`, [P]);
const FAM_CIORNA = one(await db.query(`select id from fam where material='Beton neaprobat'`)).id;
await as('rte', `select fam_depune($1)`, [FAM]);
await as('proi', `select fam_avizeaza($1, 'conform', null)`, [FAM]);
await as('dir', `select fam_decide($1, 'aprobat', null)`, [FAM]);

const pvNou = async () => {
  const id = one(await as('rte', `select convoaca_pv($1, 'faza_determinanta', 'Armare placă', 'Placa +3,00', '2026-11-03', null, $2::uuid[], null) id`, [P, [U.dir, U.rte, U.proi]])).id;
  await as('rte', `select completeaza_pv($1, 'S-a executat armarea plăcii conform planșelor.', null, 'Se admite turnarea betonului.')`, [id]);
  return id;
};
const PV_SEMNAT = await pvNou();
for (const u of ['dir', 'rte', 'proi']) await as(u, `select confirma_pv($1, 'confirm', null)`, [PV_SEMNAT]);
const PV_DESCHIS = await pvNou();

const turneaza = (user, cols = '', vals = '') => as(user,
  `insert into turnari (proiect_id, data, element, clasa_beton, volum, probe_prelevate${cols})
   values ($1, '2026-11-04', 'Placa +3,00, axele 1–6', 'C25/30', 42.5, 2${vals})`, [P]);

console.log('Condica de betoane');
await ok('RTE-ul înregistrează o turnare', async () => (await turneaza('rte')).affectedRows === 1);
await ok('turnarea primește numărul 1', async () => one(await db.query(`select numar from turnari`)).numar === 1);
await refuses('dirigintele nu ține condica (o ține executantul)', () => turneaza('dir'));
await refuses('laboratorul nu înregistrează turnări', () => turneaza('lab'));
await refuses('clasa betonului trebuie scrisă corect (ex. C25/30)', () =>
  as('rte', `insert into turnari (proiect_id, data, element, clasa_beton) values ($1, '2026-11-04', 'Stâlpi parter', '25/30')`, [P]));
await ok('turnarea se leagă de FAM-ul aprobat și de PV-ul semnat', async () =>
  (await turneaza('rte', ', fam_id, pv_id', `, '${FAM}', '${PV_SEMNAT}'`)).affectedRows === 1);
await refuses('cu un FAM neaprobat nu se toarnă', () => turneaza('rte', ', fam_id', `, '${FAM_CIORNA}'`), 'FAM aprobat');
await refuses('cu un PV de armare nesemnat nu se toarnă', () => turneaza('rte', ', pv_id', `, '${PV_DESCHIS}'`), 'semnat');
const T = one(await db.query(`select id from turnari where numar = 2`)).id;
await ok('al doilea număr e 2', async () => !!T);
await ok('RTE-ul corectează turnarea înainte de viză', async () =>
  (await as('rte', `update turnari set temp_aer = 8.5, bonuri = 'B-101, B-102' where id = $1`, [T])).affectedRows === 1);
await refuses('constructorul nu-și vizează singur turnarea', () => as('rte', `select vizeaza_turnare($1, null)`, [T]), 'dirigintele');
await ok('dirigintele vizează turnarea', async () => { await as('dir', `select vizeaza_turnare($1, 'Vibrare corespunzătoare')`, [T]); return true; });
await ok('viza intră în registrul dirigintelui', async () =>
  one(await as('dir', `select descriere from registru_intrari where tip='condica_betoane'`)).descriere.includes('turnarea nr. 2'));
await ok('după viză turnarea nu se mai modifică', async () =>
  (await as('rte', `update turnari set volum = 1 where id = $1`, [T])).affectedRows === 0);
await refuses('viza nu se dă de două ori', () => as('dir', `select vizeaza_turnare($1, null)`, [T]), 'deja');
await refuses('nimeni nu scrie viza direct', () => as('rte', `update turnari set vizat_la = now() where numar = 1`));
await ok('membrii văd condica, străinii nu', async () =>
  rows(await as('benef', `select * from turnari`)) === 2 && rows(await as('strain', `select * from turnari`)) === 0);

console.log('Încercări');
const rezultat = (user, conform = true, obs = null, turnare = T) => as(user,
  `insert into incercari (proiect_id, turnare_id, tip, descriere, laborator, buletin_numar, varsta_zile, valoare, unitate, cerinta, conform, observatii)
   values ($1, $2, 'compresiune_28', 'Rezistența la compresiune pe cuburi', 'Laborator Autorizat SRL', 'B-55', 28, $3, 'MPa', '≥ 30 MPa', $4, $5)`,
  [P, turnare, conform ? 34.2 : 27.1, conform, obs]);
await ok('laboratorul introduce rezultatul la 28 de zile', async () => (await rezultat('lab')).affectedRows === 1);
await refuses('dirigintele nu introduce rezultate de laborator', () => rezultat('dir'));
await refuses('un rezultat neconform cere observații', () => rezultat('lab', false, null));
await ok('rezultat neconform cu observații', async () => (await rezultat('lab', false, 'Media seriei sub clasa prescrisă')).affectedRows === 1);
await refuses('o încercare trebuie legată de o turnare sau de un FAM', () =>
  as('lab', `insert into incercari (proiect_id, tip, conform) values ($1, 'altul', true)`, [P]));
await refuses('rezultatele nu se modifică', () => as('lab', `update incercari set valoare = 40`));
await ok('nici prin ștergere', async () =>
  (await as('lab', `delete from incercari`).catch(() => ({ affectedRows: 0 }))).affectedRows === 0);
const [I1, I2] = (await db.query(`select id from incercari order by conform desc`)).rows.map(r => r.id);
await refuses('doar dirigintele ia la cunoștință', () => as('benef', `select ia_la_cunostinta_incercare($1)`, [I1]), 'dirigintele');
await ok('dirigintele ia la cunoștință rezultatul conform → registru', async () => {
  await as('dir', `select ia_la_cunostinta_incercare($1)`, [I1]);
  return rows(await as('dir', `select * from registru_intrari where tip='incercare'`)) === 1; });
await ok('rezultatul neconform intră ca neconformitate', async () => {
  await as('dir', `select ia_la_cunostinta_incercare($1)`, [I2]);
  return one(await as('dir', `select descriere from registru_intrari where tip='neconformitate'`)).descriere.includes('NECONFORM'); });
await refuses('nu se ia la cunoștință de două ori', () => as('dir', `select ia_la_cunostinta_incercare($1)`, [I1]), 'deja');
await ok('încercare pe un material cu FAM', async () =>
  (await as('lab', `insert into incercari (proiect_id, fam_id, tip, descriere, conform) values ($1, $2, 'altul', 'Aderență adeziv', true)`, [P, FAM])).affectedRows === 1);

console.log('Atașamente');
const cale = (ent, id) => `${P}/${ent}/${id}/doc.pdf`;
await ok('RTE-ul atașează bonurile la turnare', async () =>
  (await as('rte', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'turnare', $2, 'bonuri.pdf', $3)`, [P, T, cale('turnare', T)])).affectedRows === 1);
const I3 = one(await db.query(`select id from incercari where fam_id is not null`)).id;
await ok('laboratorul atașează buletinul înainte de luarea la cunoștință', async () =>
  (await as('lab', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'incercare', $2, 'buletin.pdf', $3)`, [P, I3, cale('incercare', I3)])).affectedRows === 1);
await refuses('după luarea la cunoștință nu se mai atașează la încercare', () =>
  as('lab', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'incercare', $2, 'b2.pdf', $3)`, [P, I1, `${P}/incercare/${I1}/b2.pdf`]));
await refuses('beneficiarul nu atașează la turnări', () =>
  as('benef', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'turnare', $2, 'x.pdf', $3)`, [P, T, `${P}/turnare/${T}/x.pdf`]));

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
