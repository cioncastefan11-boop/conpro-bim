// Teste pentru textele EIR și BEP (migrarea 0023).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql', '0017_reclamatii.sql', '0018_observatii.sql', '0019_legaturi_model.sql', '0020_plan_livrare.sql', '0021_cerinte_lectii.sql', '0022_verificare_model.sql', '0023_documente_bim.sql'])
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

const scrie = (user, tip, sectiuni) => as(user, `insert into documente_bim (proiect_id, tip, sectiuni) values ($1, $2, $3) on conflict (proiect_id, tip) do update set sectiuni = excluded.sectiuni returning versiune, actualizat_de`, [P, tip, JSON.stringify(sectiuni)]);
const citeste = tip => db.query(`select * from documente_bim where proiect_id = $1 and tip = $2`, [P, tip]).then(one);
console.log('EIR');
await ok('beneficiarul scrie scopul EIR-ului; versiunea 1', async () => one(await scrie('benef', 'eir', { scop: 'Modelul servește la recepție și exploatare.' })).versiune === 1);
await ok('dirigintele îl modifică; versiunea crește, autorul se schimbă', async () => { const r = one(await scrie('dir', 'eir', { scop: 'Alt text.', acceptare: 'Fără neconformități.' })); return r.versiune === 2 && r.actualizat_de === U.dir; });
await ok('salvarea fără schimbări nu crește versiunea', async () => one(await scrie('dir', 'eir', { scop: 'Alt text.', acceptare: 'Fără neconformități.' })).versiune === 2);
await refuses('constructorul nu scrie EIR-ul', () => scrie('rte', 'eir', { scop: 'x' }), 'EIR-ul');
await refuses('proiectantul nici el', () => scrie('proi', 'eir', { scop: 'x' }), 'EIR-ul');
console.log('BEP');
await ok('constructorul scrie BEP-ul', async () => one(await scrie('rte', 'bep', { strategie: 'Antreprenor general cu doi subcontractori.' })).versiune === 1);
await ok('proiectantul îl completează', async () => one(await scrie('proi', 'bep', { strategie: 'Antreprenor general cu doi subcontractori.', software: 'Revit 2026' })).versiune === 2);
await refuses('beneficiarul nu scrie BEP-ul', () => scrie('benef', 'bep', { x: 'y' }), 'BEP-ul');
await refuses('cititorul nu', () => scrie('citit', 'bep', { x: 'y' }));
await refuses('tipul trebuie să fie eir sau bep', () => scrie('admin', 'pex', {}));
await refuses('secțiunile sunt un obiect', () => as('admin', `update documente_bim set sectiuni = '[]' where tip = 'bep'`), 'check');
await ok('versiunea nu se poate scrie de mână', async () => { try { await as('admin', `update documente_bim set versiune = 99 where tip = 'bep'`); return false; } catch { return (await citeste('bep')).versiune === 2; } });
await ok('toată echipa citește, cei din afară nu', async () => (await as('citit', `select count(*)::int n from documente_bim`)).rows[0].n === 2 && (await as('strain', `select count(*)::int n from documente_bim`)).rows[0].n === 0);
await ok('totul rămâne în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel = 'documente_bim'`)).rows[0].n >= 4);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
