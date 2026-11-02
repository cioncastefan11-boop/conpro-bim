// Teste pentru planul de livrare a informațiilor, MIDP / TIDP (migrarea 0020).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql', '0017_reclamatii.sql', '0018_observatii.sql', '0019_legaturi_model.sql', '0020_plan_livrare.sql'])
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
const azi = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const moment = (user, cod, data) => as(user, `insert into momente_livrare (proiect_id, cod, denumire, data_planificata) values ($1, $2, 'Moment ' || $2, $3) returning id`, [P, cod, data]);
const liv = (user, extra = {}) => as(user, `insert into livrabile_planificate (proiect_id, moment_id, initiator, tip, rol, numar, titlu, stare_ceruta, termen, responsabil) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, cod`,
  [P, extra.moment ?? null, extra.initiator ?? 'SP', extra.tip ?? 'DR', extra.rol ?? 'S', extra.numar ?? '0101', extra.titlu ?? 'Plan cofraj', extra.stare ?? 'publicat', extra.termen ?? null, extra.resp ?? null]);
const stare = async () => Object.fromEntries((await as('admin', `select cod, stare, atins, termen::text t from livrabile_stare($1)`, [P])).rows.map(r => [r.cod, r]));

console.log('Momentele de livrare');
let M1, M2;
await ok('administratorul stabilește momentele', async () => { M1 = one(await moment('admin', 'pte', azi(-3))).id; M2 = one(await moment('admin', 'REC', azi(60))).id; return true; });
await ok('codul se scrie cu majuscule', async () => one(await db.query(`select cod from momente_livrare where id = $1`, [M1])).cod === 'PTE');
await refuses('proiectantul nu stabilește momente', () => moment('proi', 'X1', azi(5)), 'Momentele');

console.log('Livrabilele (TIDP → MIDP)');
let L1, L2, L3;
await ok('proiectantul își planifică livrabilele, cu codul din convenție', async () => { const r = one(await liv('proi', { moment: M1, resp: U.proi })); L1 = r.id; return r.cod === 'BLC01-SP-ZZ-ZZ-DR-S-0101'; });
await ok('un livrabil cerut doar partajat', async () => { L2 = one(await liv('proi', { moment: M1, numar: '0102', titlu: 'Plan armare', stare: 'partajat' })).id; return true; });
await ok('constructorul își planifică documentele lui', async () => { L3 = one(await liv('rte', { initiator: 'CV', tip: 'RP', rol: 'Z', numar: '0001', titlu: 'Program de control al calității', moment: M2 })).id; return true; });
await refuses('cititorul nu', () => liv('citit', { numar: '0199' }), 'nu cititorii');
await refuses('codul nu se dublează', () => liv('rte', { numar: '0101' }), 'duplicate');
await refuses('responsabilul trebuie să fie din proiect', () => liv('proi', { numar: '0103', resp: U.strain }), 'nu face parte');
await ok('termenul vine din moment, dacă nu e dat', async () => (await stare())['BLC01-SP-ZZ-ZZ-DR-S-0101'].t === azi(-3));
await ok('fără document în CDE: neînceput, întârziat', async () => { const s = (await stare())['BLC01-SP-ZZ-ZZ-DR-S-0101']; return s.stare === 'neinceput' && !s.atins; });
await ok('responsabilul îl are în De făcut', async () => (await sarcini('proi')).some(s => s.tip === 'livrabil' && /0101/.test(s.titlu) && s.cale === 'documente/plan'));
await ok('administratorul vede cele fără responsabil, întârziate', async () => (await sarcini('admin')).some(s => s.tip === 'livrabil' && /1 livrabile întârziate/.test(s.titlu)));
await ok('livrabilul viitor nu e încă sarcină', async () => !(await sarcini('rte')).some(s => s.tip === 'livrabil'));

console.log('Legătura cu CDE');
const doc = (numar) => as('proi', `insert into documente_proiect (proiect_id, initiator, volum, nivel, tip, rol, numar, titlu) values ($1, 'SP', 'ZZ', 'ZZ', 'DR', 'S', $2, 'Plan') returning id`, [P, numar]);
const D1 = one(await doc('0101')).id;
await ok('documentul creat cu același cod: în lucru', async () => (await stare())['BLC01-SP-ZZ-ZZ-DR-S-0101'].stare === 'in_lucru');
const D2 = one(await doc('0102')).id;
await as('proi', `insert into revizii_document (document_id, revizie) values ($1, 'P01')`, [D2]);
const R2 = one(await db.query(`select id from revizii_document where document_id = $1`, [D2])).id;
await db.query(`update revizii_document set stare = 'partajat', cod_stare = 'S2' where id = $1`, [R2]);
await ok('partajat: livrabilul cerut „partajat” e atins', async () => { const s = (await stare())['BLC01-SP-ZZ-ZZ-DR-S-0102']; return s.stare === 'partajat' && s.atins; });
await as('proi', `insert into revizii_document (document_id, revizie) values ($1, 'P01')`, [D1]);
await db.query(`update revizii_document set stare = 'publicat', cod_stare = 'A1' where document_id = $1`, [D1]);
await ok('publicat: livrabilul cerut „publicat” e atins și dispare din De făcut', async () => {
  const s = (await stare())['BLC01-SP-ZZ-ZZ-DR-S-0101'];
  return s.stare === 'publicat' && s.atins && !(await sarcini('proi')).some(x => x.tip === 'livrabil' && /0101/.test(x.titlu));
});

console.log('Modificări');
await ok('echipa își mută termenul', async () => (await as('rte', `update livrabile_planificate set termen = $2 where id = $1`, [L3, azi(30)])).affectedRows === 1);
await ok('altă echipă nu', async () => (await as('proi', `update livrabile_planificate set termen = $2 where id = $1`, [L3, azi(1)])).affectedRows === 0);
await ok('administratorul poate modifica orice rând', async () => (await as('admin', `update livrabile_planificate set responsabil = $2 where id = $1`, [L3, U.rte])).affectedRows === 1);
await ok('schimbarea codului se recalculează', async () => { await as('rte', `update livrabile_planificate set numar = '0002' where id = $1`, [L3]); return one(await db.query(`select cod from livrabile_planificate where id = $1`, [L3])).cod === 'BLC01-CV-ZZ-ZZ-RP-Z-0002'; });
await ok('toate rămân în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel in ('livrabile_planificate', 'momente_livrare')`)).rows[0].n >= 7);
await ok('cei din afara proiectului nu văd planul', async () => (await as('strain', `select count(*)::int n from livrabile_planificate`)).rows[0].n === 0 && (await as('strain', `select * from livrabile_stare($1)`, [P])).rows.length === 0);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
