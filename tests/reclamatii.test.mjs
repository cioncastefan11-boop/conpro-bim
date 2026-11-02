// Teste pentru locatari și reclamații (migrarea 0017).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql', '0017_reclamatii.sql'])
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
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['benef', 'beneficiar'], ['citit', 'cititor'], ['admc', 'administrator_cladire']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'benef', 'citit', 'admc']) await as(u, `select accepta_invitatiile()`);
const ev = (user, extra = {}) => as(user, `insert into evenimente_exploatare (proiect_id, tip, data_eveniment, titlu, descriere, corecteaza_id) values ($1, $2, $3, $4, $5, $6) returning id, numar`,
  [P, extra.tip ?? 'avarie', extra.data ?? '2026-10-20', extra.titlu ?? 'Infiltrație terasă', extra.descriere ?? 'Pată de umezeală în tavanul de la etajul 4.', extra.corecteaza ?? null]);
const sarcini = async user => (await as(user, `select tip, titlu, cale from sarcinile_mele()`)).rows;
const LOC = 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', LOC2 = 'efefefef-efef-efef-efef-efefefefefef';
U.loc = LOC; U.loc2 = LOC2;
await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'loc@test.ro', now())`, [LOC]);

console.log('Locatarii');
await refuses('locatarii se adaugă după trecerea în exploatare', () => as('admc', `insert into locatari (proiect_id, email, unitate) values ($1, 'loc@test.ro', 'Ap. 14')`, [P]), 'după trecerea');
await as('dir', `insert into receptii (proiect_id, tip, obiect) values ($1, 'terminare', 'Întreaga construcție')`, [P]);
const R = one(await db.query(`select id from receptii where proiect_id = $1`, [P])).id;
await db.query(`update receptii set stare = 'aprobata', decizie = 'admitere', decis_la = now() - interval '30 days', aprobat_la = now() - interval '30 days', garantie_pana = current_date + 1000 where id = $1`, [R]);
await as('benef', `select trece_in_exploatare($1, current_date - 20)`, [P]);
await ok('administratorul clădirii adaugă un locatar cu cont (legat imediat)', async () => {
  await as('admc', `insert into locatari (proiect_id, email, unitate) values ($1, ' LOC@test.ro ', 'Ap. 14, scara A')`, [P]);
  const l = one(await db.query(`select persoana_id, acceptat_la from locatari where email = 'loc@test.ro'`));
  return l.persoana_id === LOC && l.acceptat_la;
});
await ok('și unul fără cont încă', async () => (await as('benef', `insert into locatari (proiect_id, email, unitate) values ($1, 'loc2@test.ro', 'Ap. 3')`, [P])).affectedRows === 1);
await refuses('constructorul nu adaugă locatari', () => as('rte', `insert into locatari (proiect_id, email, unitate) values ($1, 'x@test.ro', 'Ap. 1')`, [P]), 'row-level');
await refuses('același e-mail nu se adaugă de două ori', () => as('admc', `insert into locatari (proiect_id, email, unitate) values ($1, 'loc2@test.ro', 'Ap. 9')`, [P]), 'duplicate');
await db.query(`insert into auth.users (id, email, email_confirmed_at) values ($1, 'loc2@test.ro', now())`, [LOC2]);
await ok('la intrarea în cont, locatarul nou e legat de clădire', async () => {
  await as('loc2', `select accepta_invitatiile()`);
  return one(await db.query(`select persoana_id from locatari where email = 'loc2@test.ro'`)).persoana_id === LOC2;
});
await ok('dar nu devine membru al proiectului', async () => (await db.query(`select 1 from membri_proiect where persoana_id = $1`, [LOC2])).rows.length === 0);
await ok('locatarul își vede clădirea și unitatea', async () => { const r = (await as('loc', `select * from locuintele_mele()`)).rows; return r.length === 1 && r[0].unitate === 'Ap. 14, scara A' && r[0].cod === 'BLC01'; });
await ok('locatarul nu vede proiectul, PV-urile, echipa, ceilalți locatari', async () =>
  (await as('loc', `select count(*)::int n from proiecte`)).rows[0].n === 0 && (await as('loc', `select count(*)::int n from membri_proiect`)).rows[0].n === 0
  && (await as('loc', `select count(*)::int n from locatari`)).rows[0].n === 1 && (await as('loc', `select count(*)::int n from evenimente_exploatare`)).rows[0].n === 0);
await refuses('locatarul nu își schimbă singur unitatea', async () => { const r = await as('loc', `update locatari set unitate = 'Penthouse' where email = 'loc@test.ro'`); if (!r.affectedRows) throw new Error('fără drept'); }, 'fără drept');

console.log('Reclamațiile');
const rec = (user, extra = {}) => as(user, `insert into reclamatii (proiect_id, categorie, unitate, titlu, descriere, urgenta) values ($1, $2, $3, $4, $5, $6) returning id, numar, unitate, de_locatar`,
  [P, extra.categorie ?? 'infiltratii', extra.unitate ?? 'Ap. 99', extra.titlu ?? 'Pată de umezeală în baie', extra.descriere ?? 'Pe tavanul băii, de la ploaia de ieri.', extra.urgenta ?? false]);
let R1, R2;
await ok('locatarul trimite o reclamație, pentru unitatea lui (nu pentru alta)', async () => { const r = one(await rec('loc')); R1 = r.id; return r.numar === 1 && r.unitate === 'Ap. 14, scara A' && r.de_locatar; });
await ok('echipa trimite o reclamație pentru părțile comune', async () => { const r = one(await rec('admc', { categorie: 'lift', unitate: 'Scara A', titlu: 'Liftul se oprește între etaje' })); R2 = r.id; return r.numar === 2 && !r.de_locatar; });
await refuses('cei din afara clădirii nu trimit reclamații', () => rec('strain'), 'locatarii');
await refuses('cititorul nu trimite reclamații', () => rec('citit'), 'locatarii');
await ok('locatarul își vede doar reclamațiile lui', async () => (await as('loc', `select id from reclamatii`)).rows.map(x => x.id).join() === R1);
await ok('celălalt locatar nu le vede pe ale primului', async () => (await as('loc2', `select count(*)::int n from reclamatii`)).rows[0].n === 0);
await ok('echipa le vede pe toate', async () => (await as('proi', `select count(*)::int n from reclamatii`)).rows[0].n === 2);
await refuses('starea nu se schimbă direct', () => as('admc', `update reclamatii set stare = 'confirmata' where id = $1`, [R1]), 'permission');
await ok('reclamația nouă apare în De făcut la administrare', async () => (await sarcini('admc')).some(s => s.tip === 'reclamatie' && /nouă: Ap\. 14/.test(s.titlu)));

console.log('Fotografiile');
const foto = (user, id) => as(user, `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'reclamatie', $2, 'poza', 'a.jpg', $3)`, [P, id, `${P}/reclamatie/${id}/${user}.jpg`]);
await ok('locatarul atașează fotografii la reclamația lui', async () => (await foto('loc', R1)).affectedRows === 1);
await ok('și le vede', async () => (await as('loc', `select count(*)::int n from atasamente`)).rows[0].n === 1);
await refuses('dar nu la reclamația altcuiva', () => foto('loc', R2), 'Nu puteți atașa');
await ok('poate încărca fișierul în storage doar pe calea reclamației lui', async () => {
  const bun = (await as('loc', `select reclamatie_a_mea($1) ok`, [`${P}/reclamatie/${R1}/x.jpg`])).rows[0].ok;
  const rau = (await as('loc', `select reclamatie_a_mea($1) ok`, [`${P}/reclamatie/${R2}/x.jpg`])).rows[0].ok;
  const pv = (await as('loc', `select reclamatie_a_mea($1) ok`, [`${P}/pv/${R1}/x.jpg`])).rows[0].ok;
  return bun && !rau && !pv;
});

console.log('Fluxul');
await refuses('constructorul nu preia reclamații', () => as('rte', `select reclamatie_preia($1, false)`, [R1]), 'administrarea');
await ok('administrarea o trimite constructorului (în garanție)', async () => {
  await as('admc', `select reclamatie_preia($1, true)`, [R1]);
  return one(await db.query(`select stare from reclamatii where id = $1`, [R1])).stare === 'la_constructor';
});
await ok('constructorul o are în De făcut', async () => (await sarcini('rte')).some(s => s.tip === 'reclamatie' && /în garanție/.test(s.titlu)));
await ok('constructorul atașează dovada', async () => (await foto('rte', R1)).affectedRows === 1);
await refuses('rezolvarea cere o descriere', () => as('rte', `select reclamatie_rezolva($1, '')`, [R1]), 'Descrieți');
await ok('constructorul o rezolvă', async () => { await as('rte', `select reclamatie_rezolva($1, 'Refăcut etanșarea la aerisitor; reparat tavanul.')`, [R1]); return one(await db.query(`select stare from reclamatii where id = $1`, [R1])).stare === 'rezolvata'; });
await ok('locatarul are de confirmat (cu legătura către pagina lui)', async () => (await sarcini('loc')).some(s => s.tip === 'reclamatie' && s.cale === `/locuinta/${R1}`));
await refuses('altcineva nu confirmă în locul lui', () => as('admc', `select reclamatie_confirma($1, true, null)`, [R1]), 'cel care a trimis');
await refuses('redeschiderea cere motivul', () => as('loc', `select reclamatie_confirma($1, false, '')`, [R1]), 'ce nu s-a rezolvat');
await ok('locatarul o redeschide: revine la constructor', async () => {
  await as('loc', `select reclamatie_confirma($1, false, 'Pata a reapărut după două zile.')`, [R1]);
  const r = one(await db.query(`select stare, redeschideri from reclamatii where id = $1`, [R1]));
  return r.stare === 'la_constructor' && r.redeschideri === 1;
});
await ok('a doua oară o confirmă', async () => {
  await as('rte', `select reclamatie_rezolva($1, 'Înlocuit garnitura aerisitorului.')`, [R1]);
  await as('loc', `select reclamatie_confirma($1, true, null)`, [R1]);
  return one(await db.query(`select stare from reclamatii where id = $1`, [R1])).stare === 'confirmata';
});
await refuses('o reclamație închisă nu se mai preia', () => as('admc', `select reclamatie_preia($1, false)`, [R1]), 'închisă');
await refuses('respingerea cere motivul', () => as('benef', `select reclamatie_respinge($1, '')`, [R2]), 'motivul');
await ok('administrarea respinge motivat', async () => { await as('benef', `select reclamatie_respinge($1, 'Liftul are contract de service separat; s-a anunțat firma.')`, [R2]); return one(await db.query(`select stare from reclamatii where id = $1`, [R2])).stare === 'respinsa'; });
await ok('totul rămâne în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel = 'reclamatii'`)).rows[0].n >= 8);

console.log('Locatarul mutat');
await ok('administrarea dezactivează locatarul', async () => (await as('admc', `update locatari set activ = false where email = 'loc@test.ro'`)).affectedRows === 1);
await ok('nu-și mai vede clădirea și reclamațiile', async () => (await as('loc', `select * from locuintele_mele()`)).rows.length === 0 && (await as('loc', `select count(*)::int n from reclamatii`)).rows[0].n === 0);
await refuses('și nu mai trimite reclamații', () => rec('loc'), 'locatarii');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
