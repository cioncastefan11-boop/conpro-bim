// Teste pentru FAM, livrări și atașamente (migrarea 0004).
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
-- schema storage simplificată, ca în Supabase
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert on storage.objects to authenticated;
`);
for (const f of ['0001_fundatie.sql', '0002_procese_verbale.sql', '0003_continut_pv.sql', '0004_fam.sql'])
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

await as('admin', `insert into proiecte (cod, denumire) values ('BLC01', 'Bloc test')`);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['benef', 'beneficiar']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'benef']) await as(u, `select accepta_invitatiile()`);

const famNou = async (user = 'rte', extra = {}) => {
  await as(user, `insert into fam (proiect_id, material, utilizare, cerinte_proiect) values ($1, $2, 'Fațade, termosistem', 'λ ≤ 0,039 W/mK, clasa E')`,
    [P, extra.material ?? 'Polistiren expandat EPS 80']);
  return one(await db.query(`select id from fam order by creat_la desc, numar desc limit 1`)).id;
};
const stare = async id => one(await db.query(`select stare from fam where id=$1`, [id])).stare;

console.log('Întocmire și depunere');
let F;
await ok('constructorul întocmește un FAM (ciornă)', async () => { F = await famNou(); return (await stare(F)) === 'ciorna'; });
await ok('primește numărul 1, revizia 1 și codul FAM-BLC01-001/R1', async () =>
  one(await db.query(`select cod_fam($1) c`, [F])).c === 'FAM-BLC01-001/R1');
await refuses('dirigintele nu întocmește FAM-uri', () => famNou('dir'));
await refuses('beneficiarul nu întocmește FAM-uri', () => famNou('benef'));
await refuses('un FAM incomplet nu se depune', () => as('rte', `select fam_depune($1)`, [F]), 'producătorul');
await ok('constructorul completează produsul', async () =>
  (await as('rte', `update fam set producator='Producător SA', produs='EPS 80 fațadă', utilizare='Pereți exteriori, etajele 1–4' where id=$1`, [F])).affectedRows === 1);
await refuses('fără documente însoțitoare nu se depune (art. 563)', () => as('rte', `select fam_depune($1)`, [F]), 'art. 563');
await ok('cu declarația de performanță se depune → așteaptă avizul proiectantului', async () => {
  await as('rte', `update fam set dop_numar='DoP-123', marcaj_ce=true where id=$1`, [F]);
  return one(await as('rte', `select fam_depune($1) s`, [F])).s === 'depus'; });
await ok('după depunere FAM-ul nu se mai modifică', async () =>
  (await as('rte', `update fam set produs='alt produs' where id=$1`, [F])).affectedRows === 0);
await refuses('nimeni nu schimbă starea direct', () => as('rte', `update fam set stare='aprobat' where id=$1`, [F]));

console.log('Avizul proiectantului');
await refuses('dirigintele nu poate decide înaintea avizului', () => as('dir', `select fam_decide($1, 'aprobat', null)`, [F]), 'nu așteaptă');
await refuses('constructorul nu avizează', () => as('rte', `select fam_avizeaza($1, 'conform', null)`, [F]), 'proiectantul');
await refuses('avizul neconform cere motiv', () => as('proi', `select fam_avizeaza($1, 'neconform', '')`, [F]), 'Motivați');
await ok('neconform cu motiv → FAM întors la completări', async () =>
  one(await as('proi', `select fam_avizeaza($1, 'neconform', 'Lipsește clasa de reacție la foc din DoP') s`, [F])).s === 'completari');
await ok('constructorul poate completa din nou', async () =>
  (await as('rte', `update fam set performante_declarate='λ = 0,038 W/mK; clasa E' where id=$1`, [F])).affectedRows === 1);
await ok('redepunere → din nou la proiectant', async () => one(await as('rte', `select fam_depune($1) s`, [F])).s === 'depus');
await ok('aviz conform → la diriginte', async () => one(await as('proi', `select fam_avizeaza($1, 'conform', null) s`, [F])).s === 'avizat');

console.log('Decizia dirigintelui');
await refuses('proiectantul nu aprobă', () => as('proi', `select fam_decide($1, 'aprobat', null)`, [F]), 'dirigintele');
await refuses('beneficiarul nu aprobă', () => as('benef', `select fam_decide($1, 'aprobat', null)`, [F]), 'dirigintele');
await ok('dirigintele aprobă', async () => one(await as('dir', `select fam_decide($1, 'aprobat', null) s`, [F])).s === 'aprobat');
await ok('aprobarea intră în registrul dirigintelui', async () =>
  one(await as('dir', `select descriere from registru_intrari where tip='aprobare_fam'`)).descriere.startsWith('FAM-BLC01-001/R1 aprobat'));
await refuses('un FAM aprobat nu se mai decide o dată', () => as('dir', `select fam_decide($1, 'respins', 'test')`, [F]), 'nu așteaptă');

console.log('Respingere și revizie');
let R;
await ok('al doilea FAM primește numărul 2', async () => {
  R = await famNou('rte', { material: 'Adeziv pentru polistiren' });
  await as('rte', `update fam set producator='X', produs='Adeziv Y', alte_documente='Declarație de conformitate nr. 5' where id=$1`, [R]);
  await as('rte', `select fam_depune($1)`, [R]);
  await as('proi', `select fam_avizeaza($1, 'echivalent', 'Echivalent cu produsul din caietul de sarcini')`, [R]);
  return one(await db.query(`select cod_fam($1) c`, [R])).c === 'FAM-BLC01-002/R1'; });
await refuses('respingerea cere motiv', () => as('dir', `select fam_decide($1, 'respins', '')`, [R]), 'motivul');
await ok('dirigintele respinge cu motiv', async () =>
  one(await as('dir', `select fam_decide($1, 'respins', 'Aderența declarată sub cerința proiectului') s`, [R])).s === 'respins');
let R2;
await ok('constructorul face revizia 2, cu același număr', async () => {
  R2 = one(await as('rte', `select fam_revizie_noua($1) id`, [R])).id;
  return one(await db.query(`select cod_fam($1) c, stare from fam where id=$1`, [R2])).c === 'FAM-BLC01-002/R2'; });
await refuses('nu se fac două revizii din același FAM', () => as('rte', `select fam_revizie_noua($1)`, [R]), 'deja');
await refuses('un FAM aprobat nu se revizuiește', () => as('rte', `select fam_revizie_noua($1)`, [F]), 'respins');

console.log('Verificarea la livrare');
await refuses('livrarea unui material fără FAM aprobat e refuzată', () =>
  as('dir', `insert into livrari_fam (fam_id, conform, lot) values ($1, true, 'L1')`, [R2]), 'aprobat');
await refuses('constructorul nu înregistrează verificarea la livrare', () =>
  as('rte', `insert into livrari_fam (fam_id, conform) values ($1, true)`, [F]), 'dirigintele');
await ok('dirigintele înregistrează o livrare conformă', async () =>
  (await as('dir', `insert into livrari_fam (fam_id, conform, lot, cantitate) values ($1, true, 'L-2026-44', '120 m²')`, [F])).affectedRows === 1);
await refuses('o livrare neconformă cere observații', () =>
  as('dir', `insert into livrari_fam (fam_id, conform) values ($1, false)`, [F]));
await ok('o livrare neconformă intră ca neconformitate în registru', async () => {
  await as('dir', `insert into livrari_fam (fam_id, conform, observatii) values ($1, false, 'Produs livrat EPS 70 în loc de EPS 80')`, [F]);
  return rows(await as('dir', `select * from registru_intrari where tip='neconformitate'`)) === 1; });

console.log('Atașamente');
const cale = (ent, id, f = 'fisa.pdf') => `${P}/${ent}/${id}/${f}`;
await ok('constructorul atașează fișa tehnică la o ciornă', async () =>
  (await as('rte', `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'fam', $2, 'fisa_tehnica', 'fisa.pdf', $3)`,
    [P, R2, cale('fam', R2)])).affectedRows === 1);
await refuses('după depunere nu se mai atașează', () =>
  as('rte', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'fam', $2, 'x.pdf', $3)`, [P, F, cale('fam', F, 'x.pdf')]), 'depunere');
await refuses('o cale din alt proiect e refuzată', () =>
  as('rte', `insert into atasamente (proiect_id, entitate, entitate_id, nume_fisier, cale) values ($1, 'fam', $2, 'y.pdf', $3)`,
    [P, R2, `00000000-0000-0000-0000-000000000000/fam/${R2}/y.pdf`]), 'Calea');
await ok('participantul la un PV atașează scanul semnat', async () => {
  const pv = one(await as('rte', `select convoaca_pv($1, 'lucrari_ascunse', 'Hidroizolație', null, '2026-11-02', null, $2::uuid[], null) id`, [P, [U.dir, U.rte]])).id;
  return (await as('dir', `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'pv', $2, 'pv_semnat', 'pv.pdf', $3)`,
    [P, pv, cale('pv', pv, 'pv.pdf')])).affectedRows === 1; });
await ok('membrii văd atașamentele, străinii nu', async () =>
  rows(await as('benef', `select * from atasamente`)) === 2 && rows(await as('strain', `select * from atasamente`)) === 0);
await ok('atașamentele nu se șterg', async () =>
  (await as('rte', `delete from atasamente`).catch(() => ({ affectedRows: 0 }))).affectedRows === 0);

console.log('Storage');
await ok('membrul încarcă în folderul proiectului', async () =>
  (await as('rte', `insert into storage.objects (bucket_id, name) values ('documente', $1)`, [cale('fam', R2, 'a.pdf')])).affectedRows === 1);
await refuses('un străin nu încarcă în proiect', () =>
  as('strain', `insert into storage.objects (bucket_id, name) values ('documente', $1)`, [cale('fam', R2, 'b.pdf')]));
await refuses('o cale fără proiect valid e refuzată', () =>
  as('rte', `insert into storage.objects (bucket_id, name) values ('documente', 'oriunde/fisier.pdf')`));
await ok('membrul vede fișierele, străinul nu', async () =>
  rows(await as('benef', `select * from storage.objects`)) === 1 && rows(await as('strain', `select * from storage.objects`)) === 0);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
