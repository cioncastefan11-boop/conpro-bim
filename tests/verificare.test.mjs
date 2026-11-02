// Teste pentru regulile modelului și rapoartele de verificare (migrarea 0022).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql', '0017_reclamatii.sql', '0018_observatii.sql', '0019_legaturi_model.sql', '0020_plan_livrare.sql', '0021_cerinte_lectii.sql', '0022_verificare_model.sql'])
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

const reg = (user, extra = {}) => as(user, `insert into reguli_model (proiect_id, denumire, clasa, tip_cerinta, pset, proprietate, valoare) values ($1, $2, $3, $4, $5, $6, $7) returning id, clasa, pset`,
  [P, extra.denumire ?? 'Pereții au IsExternal', extra.clasa ?? 'IfcWall', extra.tip ?? 'proprietate', extra.pset ?? 'Pset_WallCommon', extra.prop ?? 'IsExternal', extra.valoare ?? null]);
console.log('Regulile modelului');
let R;
await ok('beneficiarul adaugă o regulă; clasa se scrie cu majuscule', async () => { const r = one(await reg('benef')); R = r.id; return r.clasa === 'IFCWALL'; });
await ok('dirigintele adaugă o regulă de nivel', async () => (await reg('dir', { denumire: 'Stâlpii sunt pe un nivel', clasa: 'IFCCOLUMN', tip: 'nivel', pset: null, prop: null })).rows.length === 1);
await ok('administratorul cere numele spațiilor', async () => (await reg('admin', { denumire: 'Spațiile au nume', clasa: 'IFCSPACE', tip: 'atribut', pset: null, prop: 'LongName' })).rows.length === 1);
await refuses('constructorul nu stabilește regulile', () => reg('rte'), 'beneficiarul');
await refuses('proiectantul nici el', () => reg('proi'), 'beneficiarul');
await refuses('regula de proprietate are setul', () => reg('benef', { pset: ' ' }), 'regula_completa');
await refuses('atributul trebuie să fie unul cunoscut', () => reg('benef', { tip: 'atribut', pset: null, prop: 'Culoare' }), 'regula_completa');
await refuses('clasa trebuie să fie o clasă IFC', () => reg('benef', { clasa: 'perete' }), 'check');
await ok('toată echipa vede regulile', async () => (await as('rte', `select count(*)::int n from reguli_model`)).rows[0].n === 3);
await ok('cei din afară nu', async () => (await as('strain', `select count(*)::int n from reguli_model`)).rows[0].n === 0);
await ok('constructorul nu le modifică', async () => (await as('rte', `update reguli_model set obligatorie = false`)).affectedRows === 0);
await ok('beneficiarul își modifică regula; autorul rămâne', async () => {
  await as('benef', `update reguli_model set valoare = 'true' where id = $1`, [R]);
  const r = one(await db.query(`select valoare, creat_de from reguli_model where id = $1`, [R]));
  return r.valoare === 'true' && r.creat_de === U.benef;
});

console.log('Rapoartele de verificare');
const rap = (user, rezultat = [{ denumire: 'Pereții au IsExternal', verificate: 12, trec: 10, nu_trec: ['2O2Fr$t4X7Zf8NOew3FLOH'] }]) =>
  as(user, `insert into verificari_model (proiect_id, modele, reguli, elemente, neconforme, rezultat) values ($1, $2, 3, 12, 2, $3) returning id, creat_de`, [P, ['ARH.ifc rev. P02'], JSON.stringify(rezultat)]);
let V;
await ok('constructorul salvează un raport', async () => { const r = one(await rap('rte')); V = r.id; return r.creat_de === U.rte; });
await ok('proiectantul la fel', async () => (await rap('proi')).rows.length === 1);
await refuses('cititorul nu salvează', () => rap('citit'), 'nu cititorii');
await refuses('rezultatul trebuie să fie o listă', () => rap('rte', { x: 1 }), 'listă');
await ok('raportul nu se mai modifică', async () => { try { await as('rte', `update verificari_model set neconforme = 0 where id = $1`, [V]); return false; } catch { return true; } });
await ok('cititorul vede rapoartele', async () => (await as('citit', `select count(*)::int n from verificari_model`)).rows[0].n === 2);
await ok('autorul nu îl poate șterge', async () => (await as('rte', `delete from verificari_model where id = $1`, [V])).affectedRows === 0);
await ok('administratorul da', async () => (await as('admin', `delete from verificari_model where id = $1`, [V])).affectedRows === 1);
await ok('totul rămâne în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel in ('reguli_model', 'verificari_model')`)).rows[0].n >= 6);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
