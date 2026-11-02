// Teste pentru convenția de denumire și sarcinile fiecăruia (migrarea 0012).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql'])
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
await as('admin', `update proiecte set ac_numar = '1/2026' where id = $1`, [P]);
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['proi2', 'proiectant'], ['benef', 'beneficiar'], ['citit', 'cititor']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'proi2', 'benef', 'citit']) await as(u, `select accepta_invitatiile()`);
const sarcini = async user => (await as(user, `select tip, titlu, cale from sarcinile_mele()`)).rows;
const doc = (user, extra = {}) => as(user, `insert into documente_proiect (proiect_id, initiator, volum, nivel, tip, rol, numar, titlu) values ($1, $2, $3, $4, 'DR', 'S', $5, 'Plan')`,
  [P, extra.initiator ?? 'SP', extra.volum ?? 'ZZ', extra.nivel ?? '00', extra.numar ?? '0101']);

console.log('Convenția de denumire');
await ok('fără convenție, orice cod valid e acceptat', async () => (await doc('proi', { initiator: 'XYZ' })).affectedRows === 1);
await refuses('constructorul nu schimbă convenția (doar administratorul)', async () => {
  const r = await as('rte', `update proiecte set standard_info = '{"strict": true}' where id = $1`, [P]);
  if (r.affectedRows === 0) throw new Error('fără drept');
}, 'fără drept');
await as('admin', `update proiecte set standard_info = $2 where id = $1`, [P, JSON.stringify({ strict: true, cifre: 4,
  initiatori: [{ cod: 'SP', nume: 'Studio Proiect' }, { cod: 'CV', nume: 'Construcții Vest' }],
  volume: [{ cod: 'ZZ', nume: 'Toate' }, { cod: 'A', nume: 'Corp A' }], niveluri: [{ cod: '00', nume: 'Parter' }, { cod: '01', nume: 'Etaj 1' }] })]);
await ok('în modul strict, codurile din convenție trec', async () => (await doc('proi', { numar: '0102', volum: 'a' })).affectedRows === 1);
await refuses('inițiatorul care nu e în listă e refuzat', () => doc('proi', { initiator: 'ABC', numar: '0103' }), 'Inițiatorul ABC');
await refuses('nivelul care nu e în listă e refuzat', () => doc('proi', { nivel: '05', numar: '0104' }), 'Nivelul 05');
await refuses('numărul trebuie să aibă câte cifre cere convenția', () => doc('proi', { numar: '01050' }), '4 cifre');
await as('admin', `update proiecte set standard_info = jsonb_set(standard_info, '{strict}', 'false') where id = $1`, [P]);
await ok('fără modul strict, listele sunt doar propuneri', async () => (await doc('proi', { initiator: 'ABC', numar: '0106' })).affectedRows === 1);

console.log('De făcut');
await ok('la început nimeni nu are nimic de făcut', async () => (await sarcini('dir')).length === 0 && (await sarcini('proi')).length === 0);
const pv = one(await as('rte', `select convoaca_pv($1, 'faza_determinanta', 'Armare placă', 'Placa +3,00', '2026-11-03', null, $2::uuid[], null) id`, [P, [U.dir, U.rte, U.proi]])).id;
await ok('un PV fără descriere nu apare încă de confirmat', async () => (await sarcini('dir')).length === 0);
await as('rte', `select completeaza_pv($1, 'S-a executat armarea plăcii conform planșelor.', null, 'Se admite turnarea betonului.')`, [pv]);
await ok('dirigintele și RTE-ul au PV-ul de confirmat', async () =>
  (await sarcini('dir')).some(s => s.tip === 'pv' && s.cale === 'pv/' + pv) && (await sarcini('rte')).some(s => s.tip === 'pv'));
await ok('proiectantul îl vede abia după diriginte și RTE (art. 426)', async () => (await sarcini('proi')).length === 0);
await as('dir', `select confirma_pv($1, 'confirm', null)`, [pv]);
await as('rte', `select confirma_pv($1, 'confirm', null)`, [pv]);
await ok('acum proiectantul are PV-ul de confirmat, iar dirigintele nu mai are', async () =>
  (await sarcini('proi')).some(s => s.tip === 'pv') && !(await sarcini('dir')).some(s => s.tip === 'pv'));

await as('rte', `insert into fam (proiect_id, material, utilizare, producator, produs, dop_numar) values ($1, 'Beton C25/30', 'Plăci', 'Stația X', 'C25/30', 'D1')`, [P]);
const F = one(await db.query(`select id from fam`)).id;
await as('rte', `select fam_depune($1)`, [F]);
await ok('FAM-ul depus apare la proiectanți de avizat', async () => (await sarcini('proi2')).some(s => s.tip === 'fam' && s.titlu.includes('de avizat')));
await as('proi', `select fam_avizeaza($1, 'conform', null)`, [F]);
await ok('FAM-ul avizat apare la diriginte de aprobat', async () => (await sarcini('dir')).some(s => s.tip === 'fam' && s.titlu.includes('de aprobat'))
  && !(await sarcini('proi')).some(s => s.tip === 'fam'));

const D = one(await db.query(`select id from documente_proiect where numar = '0101'`)).id;
await as('proi', `insert into revizii_document (document_id, revizie) values ($1, 'P01')`, [D]);
const R = one(await db.query(`select id from revizii_document`)).id;
await as('proi', `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale, marime) values ($1::uuid, 'revizie_document', $2::uuid, 'document', 'p.pdf', $3, 1)`, [P, R, `${P}/revizie_document/${R}/p.pdf`]);
await as('proi', `select revizie_partajeaza($1, 'S4')`, [R]);
await as('proi', `select revizie_cere_publicarea($1, 'A1')`, [R]);
await ok('documentul la aprobare apare la beneficiar, diriginte și administrator', async () =>
  (await sarcini('benef')).some(s => s.tip === 'document' && s.cale === 'documente/' + D) && (await sarcini('admin')).some(s => s.tip === 'document')
  && !(await sarcini('rte')).some(s => s.tip === 'document'));
await ok('fiecare sarcină are proiectul ei', async () => (await sarcini('dir')).every(s => s.titlu) && (await as('dir', `select cod_proiect from sarcinile_mele()`)).rows.every(r => r.cod_proiect === 'BLC01'));
await ok('un străin nu are sarcini în proiect', async () => (await sarcini('strain')).length === 0);
await refuses('nimeni nu poate citi sarcinile altei persoane', () => as('dir', `select * from sarcini_persoana($1)`, [U.proi]), 'permission');

console.log('Rezumatul pe e-mail');
await ok('fiecare își poate opri rezumatul zilnic', async () => {
  await as('dir', `update persoane set rezumat_zilnic = false where id = $1`, [U.dir]);
  return one(await db.query(`select rezumat_zilnic from persoane where id = $1`, [U.dir])).rezumat_zilnic === false;
});
await ok('dar nu și al altcuiva', async () => (await as('dir', `update persoane set rezumat_zilnic = false where id = $1`, [U.proi])).affectedRows === 0);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
