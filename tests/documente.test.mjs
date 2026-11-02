// Teste pentru documentele proiectului, CDE după ISO 19650 (migrarea 0010).
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
for (const f of ['0001_fundatie.sql', '0002_procese_verbale.sql', '0003_continut_pv.sql', '0004_fam.sql', '0005_betoane_incercari.sql',
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql'])
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


await as('admin', `insert into proiecte (cod, denumire) values ('BLC01', 'Bloc test')`);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['proi2', 'proiectant'], ['benef', 'beneficiar'], ['citit', 'cititor']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'proi2', 'benef', 'citit']) await as(u, `select accepta_invitatiile()`);

const docNou = (user, numar = '0101', extra = {}) => as(user,
  `insert into documente_proiect (proiect_id, initiator, volum, nivel, tip, rol, numar, titlu) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [P, extra.initiator ?? 'cvs', extra.volum ?? 'zz', extra.nivel ?? '01', extra.tip ?? 'DR', extra.rol ?? 'S', numar, extra.titlu ?? 'Plan cofraj placă peste parter']);
const fisier = (user, rev) => as(user, `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale, marime)
  values ($1::uuid, 'revizie_document', $2::uuid, 'document', 'plansa.pdf', $3, 1000)`, [P, rev, `${P}/revizie_document/${rev}/x-plansa.pdf`]);

console.log('Documentul și codul standard');
await refuses('cititorul nu adaugă documente', () => docNou('citit'));
await refuses('un străin nu adaugă documente', () => docNou('strain'));
await ok('proiectantul adaugă o planșă', async () => (await docNou('proi')).affectedRows === 1);
const D = one(await db.query(`select * from documente_proiect`));
await ok('codul se compune după ISO 19650: BLC01-CVS-ZZ-01-DR-S-0101', () => D.cod === 'BLC01-CVS-ZZ-01-DR-S-0101' && D.autor_rol === 'proiectant');
await refuses('același cod nu se poate folosi de două ori', () => docNou('proi2'), 'duplicate');
await refuses('numărul are 4–6 cifre', () => docNou('proi', '12'), 'check');
await refuses('tipul are două caractere', () => docNou('proi', '0102', { tip: 'DRW' }), 'check');
await ok('codul nu se mai schimbă, titlul da', async () => {
  await as('proi', `update documente_proiect set titlu = 'Plan cofraj placă +3,00' where id = $1`, [D.id]);
  const d = one(await db.query(`select cod, titlu from documente_proiect where id = $1`, [D.id]));
  return d.titlu === 'Plan cofraj placă +3,00';
});
await refuses('codul nu poate fi modificat direct', () => as('proi', `update documente_proiect set numar = '0999' where id = $1`, [D.id]), 'permission');
await ok('constructorul nu poate schimba titlul documentului proiectantului', async () =>
  (await as('rte', `update documente_proiect set titlu = 'Alt titlu' where id = $1`, [D.id])).affectedRows === 0);

console.log('Revizia în lucru (WIP)');
await refuses('constructorul nu face revizii la documentul proiectantului', () =>
  as('rte', `insert into revizii_document (document_id, revizie) values ($1, 'P01')`, [D.id]), 'echipa');
await ok('proiectantul creează revizia P01, în lucru (S0)', async () =>
  (await as('proi', `insert into revizii_document (document_id, revizie, modificari) values ($1, 'P01', 'Prima emitere')`, [D.id])).affectedRows === 1);
const R1 = one(await db.query(`select * from revizii_document where revizie = 'P01'`));
await ok('revizia începe în lucru, cu codul S0', () => R1.stare === 'wip' && R1.cod_stare === 'S0');
await refuses('nu pot exista două revizii în lucru', () => as('proi', `insert into revizii_document (document_id, revizie) values ($1, 'P02')`, [D.id]), 'în lucru');
await docNou('proi', '0102', { titlu: 'Plan armare placă' });
const D2 = one(await db.query(`select id from documente_proiect where numar = '0102'`)).id;
await refuses('codul reviziei respectă formatul P01 / C01', () => as('proi2', `insert into revizii_document (document_id, revizie) values ($1, 'R1')`, [D2]), 'check');
await ok('echipa autorului vede revizia în lucru', async () => (await as('proi2', `select id from revizii_document`)).rows.length === 1);
await ok('restul proiectului nu o vede', async () => (await as('rte', `select id from revizii_document`)).rows.length === 0
  && (await as('dir', `select id from revizii_document`)).rows.length === 0);
await refuses('partajarea fără fișier', () => as('proi', `select revizie_partajeaza($1, 'S2')`, [R1.id]), 'fișierul');
await refuses('constructorul nu încarcă fișiere la revizia altei echipe', () => fisier('rte', R1.id), 'revizie în lucru');
await ok('proiectantul încarcă fișierul reviziei', async () => (await fisier('proi', R1.id)).affectedRows === 1);
await ok('fișierul reviziei în lucru nu e vizibil celorlalți', async () =>
  (await as('rte', `select id from atasamente where entitate = 'revizie_document'`)).rows.length === 0
  && (await as('proi2', `select id from atasamente where entitate = 'revizie_document'`)).rows.length === 1);

console.log('Partajare (S1–S4)');
await refuses('scopul partajării trebuie să fie S1–S4', () => as('proi', `select revizie_partajeaza($1, 'A1')`, [R1.id]), 'S1–S4');
await refuses('constructorul nu partajează revizia proiectantului', () => as('rte', `select revizie_partajeaza($1, 'S2')`, [R1.id]), 'echipa');
await ok('proiectantul partajează pentru informare (S2)', async () => { await as('proi', `select revizie_partajeaza($1, 'S2')`, [R1.id]); return true; });
await ok('după partajare o vede tot proiectul, cu fișierul', async () =>
  (await as('rte', `select id from revizii_document where stare = 'partajat' and cod_stare = 'S2'`)).rows.length === 1
  && (await as('rte', `select id from atasamente where entitate = 'revizie_document'`)).rows.length === 1);
await refuses('după partajare nu se mai încarcă fișiere', () => fisier('proi', R1.id));
await ok('după partajare descrierea nu se mai schimbă', async () =>
  (await as('proi', `update revizii_document set modificari = 'altceva' where id = $1`, [R1.id])).affectedRows === 0);

console.log('Publicare (A, B, CR)');
await refuses('codul de publicare trebuie să fie A, B sau CR', () => as('proi', `select revizie_cere_publicarea($1, 'S4')`, [R1.id]), 'A, B sau CR');
await ok('proiectantul cere publicarea pentru execuție (A1)', async () => { await as('proi', `select revizie_cere_publicarea($1, 'A1')`, [R1.id]); return true; });
await refuses('nu se poate începe altă revizie cât una e la aprobare', () => as('proi', `insert into revizii_document (document_id, revizie) values ($1, 'P02')`, [D.id]), 'la aprobare');
await refuses('constructorul nu aprobă publicarea', () => as('rte', `select revizie_aproba_publicarea($1, true, null)`, [R1.id]), 'beneficiarul');
await refuses('proiectantul nu își aprobă singur publicarea', () => as('proi', `select revizie_aproba_publicarea($1, true, null)`, [R1.id]), 'beneficiarul');
await refuses('refuzul trebuie motivat', () => as('benef', `select revizie_aproba_publicarea($1, false, '')`, [R1.id]), 'de ce');
await ok('beneficiarul poate refuza, revizia rămâne partajată', async () => {
  await as('benef', `select revizie_aproba_publicarea($1, false, 'Lipsește detaliul de armare la gol.')`, [R1.id]);
  return one(await db.query(`select stare from revizii_document where id = $1`, [R1.id])).stare === 'partajat';
});

console.log('Revizie nouă și arhivare');
await ok('proiectantul face revizia P02', async () =>
  (await as('proi', `insert into revizii_document (document_id, revizie, modificari) values ($1, 'P02', 'Adăugat detaliul de armare la gol')`, [D.id])).affectedRows === 1);
const R2 = one(await db.query(`select * from revizii_document where revizie = 'P02'`));
await fisier('proi', R2.id);
await as('proi', `select revizie_partajeaza($1, 'S3')`, [R2.id]);
await ok('partajarea P02 arhivează P01', async () =>
  one(await db.query(`select stare from revizii_document where id = $1`, [R1.id])).stare === 'arhivat');
await as('proi', `select revizie_cere_publicarea($1, 'A1')`, [R2.id]);
await ok('dirigintele aprobă publicarea P02 cu codul A1', async () => {
  await as('dir', `select revizie_aproba_publicarea($1, true, 'Bun pentru execuție.')`, [R2.id]);
  const r = one(await db.query(`select stare, cod_stare, aprobat_de from revizii_document where id = $1`, [R2.id]));
  return r.stare === 'publicat' && r.cod_stare === 'A1' && r.aprobat_de === U.dir;
});
await ok('revizia publicată rămâne în vigoare cât P03 e partajată', async () => {
  await as('proi', `insert into revizii_document (document_id, revizie) values ($1, 'P03')`, [D.id]);
  const R3 = one(await db.query(`select id from revizii_document where revizie = 'P03'`)).id;
  await fisier('proi', R3); await as('proi', `select revizie_partajeaza($1, 'S1')`, [R3]);
  return one(await db.query(`select stare from revizii_document where id = $1`, [R2.id])).stare === 'publicat';
});
await ok('publicarea C01 arhivează tot ce era înainte', async () => {
  await as('proi', `insert into revizii_document (document_id, revizie) values ($1, 'C01')`, [D.id]);
  const C = one(await db.query(`select id from revizii_document where revizie = 'C01'`)).id;
  await fisier('proi', C); await as('proi', `select revizie_partajeaza($1, 'S4')`, [C]);
  await as('proi', `select revizie_cere_publicarea($1, 'CR')`, [C]); await as('benef', `select revizie_aproba_publicarea($1, true, null)`, [C]);
  const st = (await db.query(`select revizie, stare from revizii_document order by creat_la`)).rows;
  return st.filter(x => x.stare === 'publicat').length === 1 && st.find(x => x.revizie === 'C01').stare === 'publicat'
    && st.filter(x => x.stare === 'arhivat').length === 3;
});
await ok('istoricul complet rămâne vizibil', async () => (await as('rte', `select id from revizii_document`)).rows.length === 4);
await refuses('reviziile nu se șterg', () => as('proi', `delete from revizii_document`), 'permission');
await ok('un străin nu vede documentele', async () => (await as('strain', `select id from documente_proiect`)).rows.length === 0);

console.log('Identificatorul din modelul IFC (0011)');
await ok('nivelul preluat din model păstrează GlobalId-ul', async () =>
  (await as('rte', `insert into niveluri (proiect_id, cod, denumire, ifc_guid) values ($1, '00', 'Parter', '1Ano2ZUxnEIvVQ_beukl8b')`, [P])).affectedRows === 1);
await refuses('același element din model nu se preia de două ori', () =>
  as('rte', `insert into niveluri (proiect_id, cod, denumire, ifc_guid) values ($1, '00b', 'Parter', '1Ano2ZUxnEIvVQ_beukl8b')`, [P]), 'duplicate');
await ok('nivelurile introduse de mână (fără GlobalId) merg ca înainte', async () =>
  (await as('rte', `insert into niveluri (proiect_id, cod, denumire) values ($1, 'E1', 'Etaj 1'), ($1, 'E2', 'Etaj 2')`, [P])).affectedRows === 2);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
