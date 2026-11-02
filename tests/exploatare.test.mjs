// Teste pentru exploatarea construcției (migrarea 0014).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql'])
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

console.log('Trecerea în exploatare');
await refuses('fără recepție aprobată nu se trece în exploatare', () => as('benef', `select trece_in_exploatare($1, current_date)`, [P]), 'recepția la terminarea');
await refuses('evenimentele se țin doar în exploatare', () => ev('benef'), 'după trecerea');
await refuses('administratorul nu scrie singur data intrării în exploatare', () => as('admin', `update proiecte set exploatare_din = current_date where id = $1`, [P]), 'fila Exploatare');
// recepția la terminare, aprobată (pașii comisiei sunt testați în receptie.test.mjs)
await as('dir', `insert into receptii (proiect_id, tip, obiect) values ($1, 'terminare', 'Întreaga construcție')`, [P]);
const R = one(await db.query(`select id from receptii where proiect_id = $1`, [P])).id;
await ok('nu e încă sarcină înainte de aprobare', async () => !(await sarcini('benef')).some(s => s.tip === 'exploatare'));
await db.query(`update receptii set stare = 'aprobata', decizie = 'admitere', decis_la = '2026-10-01', aprobat_la = '2026-10-05T10:00:00Z', garantie_pana = '2029-10-05' where id = $1`, [R]);
await ok('beneficiarul are de trecut construcția în exploatare', async () => (await sarcini('benef')).some(s => s.tip === 'exploatare' && s.cale === 'exploatare'));
await ok('și administratorul proiectului', async () => (await sarcini('admin')).some(s => s.tip === 'exploatare'));
await ok('dirigintele nu are sarcina', async () => !(await sarcini('dir')).some(s => s.tip === 'exploatare'));
await ok('recepția aprobată se vede de membri', async () => (await as('dir', `select * from receptie_terminare_aprobata($1)`, [P])).rows.length === 1);
await ok('dar nu de cei din afara proiectului', async () => (await as('strain', `select * from receptie_terminare_aprobata($1)`, [P])).rows.length === 0);
await refuses('dirigintele nu trece construcția în exploatare', () => as('dir', `select trece_in_exploatare($1, current_date)`, [P]), 'beneficiarul');
await refuses('data nu poate fi înaintea aprobării recepției', () => as('benef', `select trece_in_exploatare($1, '2026-09-01')`, [P]), 'înaintea aprobării');
await refuses('data nu poate fi în viitor', () => as('benef', `select trece_in_exploatare($1, current_date + 3)`, [P]), 'viitor');
await ok('beneficiarul trece construcția în exploatare', async () => {
  await as('benef', `select trece_in_exploatare($1, '2026-10-06')`, [P]);
  const p = one(await db.query(`select exploatare_din::text d, stadiu_catuc from proiecte where id = $1`, [P]));
  return p.d === '2026-10-06' && p.stadiu_catuc === 7;
});
await refuses('nu se trece de două ori', () => as('benef', `select trece_in_exploatare($1, current_date)`, [P]), 'deja în exploatare');
await ok('sarcina dispare', async () => !(await sarcini('benef')).some(s => s.tip === 'exploatare'));
await refuses('data nu se mai modifică direct', () => as('admin', `update proiecte set exploatare_din = '2026-10-10' where id = $1`, [P]), 'fila Exploatare');
await ok('celelalte date ale proiectului se modifică în continuare', async () => (await as('admin', `update proiecte set denumire = 'Bloc test A' where id = $1`, [P])).affectedRows === 1);
await ok('trecerea apare în istoric', async () => (await db.query(`select 1 from jurnal where tabel = 'proiecte' and inainte->>'exploatare_din' is null and dupa->>'exploatare_din' = '2026-10-06'`)).rows.length === 1);

console.log('Jurnalul evenimentelor');
let E1;
await ok('administratorul clădirii înregistrează un eveniment, numerotat', async () => { const r = one(await ev('admc')); E1 = r.id; return r.numar === 1; });
await ok('constructorul înregistrează intervenția în garanție, nr. 2', async () => one(await ev('rte', { tip: 'interventie', titlu: 'Refacere hidroizolație', descriere: 'Hidroizolația terasei refăcută pe 20 m².' })).numar === 2);
await refuses('cititorul nu înregistrează evenimente', () => ev('citit'), 'nu cititorii');
await refuses('cei din afara proiectului nu înregistrează', () => ev('strain'));
await refuses('data nu poate fi în viitor', () => ev('admc', { data: '2099-01-01' }), 'viitor');
await refuses('tipul trebuie să fie din listă', () => ev('admc', { tip: 'orice' }), 'check');
await refuses('descrierea e obligatorie', () => ev('admc', { descriere: ' ' }), 'check');
await refuses('evenimentul nu se modifică', () => as('admc', `update evenimente_exploatare set titlu = 'Altceva' where id = $1`, [E1]), 'permission');
await refuses('evenimentul nu se șterge', () => as('admin', `delete from evenimente_exploatare where id = $1`, [E1]), 'permission');
await ok('o greșeală se corectează cu o intrare nouă, legată de cea veche', async () => one(await ev('admc', { tip: 'altul', titlu: 'Corecție la nr. 1', descriere: 'Infiltrația era la etajul 3, nu la etajul 4.', corecteaza: E1 })).numar === 3);
await ok('toți membrii văd jurnalul', async () => (await as('citit', `select count(*)::int n from evenimente_exploatare`)).rows[0].n === 3);
await ok('cei din afara proiectului nu-l văd', async () => (await as('strain', `select count(*)::int n from evenimente_exploatare`)).rows[0].n === 0);
await ok('evenimentul apare în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel = 'evenimente_exploatare'`)).rows[0].n === 3);

console.log('Fotografii și documente la eveniment');
let nf = 0;
const atas = (user, id) => as(user, `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'eveniment_exploatare', $2, 'poza', 'a.jpg', $3)`,
  [P, id, `${P}/eveniment_exploatare/${id}/${++nf}.jpg`]);
await ok('autorul atașează fotografii', async () => (await atas('admc', E1)).affectedRows === 1);
await ok('beneficiarul atașează ulterior raportul expertului', async () => (await atas('benef', E1)).affectedRows === 1);
await refuses('proiectantul nu atașează la evenimentul altcuiva', () => atas('proi', E1), 'Nu puteți atașa');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
