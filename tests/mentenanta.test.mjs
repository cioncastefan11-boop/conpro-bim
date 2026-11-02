// Teste pentru mentenanța echipamentelor și garanții (migrarea 0016).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql'])
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
const zi = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

console.log('Echipamentele în exploatare');
await as('rte', `insert into tipuri_echipament (proiect_id, denumire, garantie_luni, interval_mentenanta_luni) values ($1, 'Centrală termică 35 kW', 24, 12)`, [P]);
await as('rte', `insert into tipuri_echipament (proiect_id, denumire, garantie_luni) values ($1, 'Ușă rezistentă la foc', 120)`, [P]);
const T1 = one(await db.query(`select id from tipuri_echipament where denumire like 'Centrală%'`)).id;
const T2 = one(await db.query(`select id from tipuri_echipament where denumire like 'Ușă%'`)).id;
// centrala: pusă în funcțiune acum 11,5 luni (revizia anuală e scadentă în ~2 săptămâni), garanția de 24 de luni
const pf = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 12); d.setUTCDate(d.getUTCDate() + 10); return d.toISOString().slice(0, 10); })();
await as('rte', `insert into echipamente (proiect_id, tip_id, cod, data_punere_functiune, garantie_start) values ($1, $2, 'CT-01', $3, $3)`, [P, T1, pf]);
// ușa: garanție de 120 de luni, expiră peste 30 de zile
const gs = (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 120); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })();
await as('rte', `insert into echipamente (proiect_id, tip_id, cod, garantie_start) values ($1, $2, 'UF-01', $3)`, [P, T2, gs]);
const E1 = one(await db.query(`select id from echipamente where cod = 'CT-01'`)).id;
await ok('administratorul clădirii înlocuiește / adaugă echipamente', async () => (await as('admc', `insert into echipamente (proiect_id, tip_id, cod) values ($1, $2, 'CT-02')`, [P, T1])).affectedRows === 1);
await ok('și le actualizează', async () => (await as('admc', `update echipamente set serie = 'SN-123' where cod = 'CT-02'`)).affectedRows === 1);
await ok('cititorul nu', async () => (await as('citit', `update echipamente set serie = 'X' where cod = 'CT-02'`)).affectedRows === 0);
await ok('administratorul clădirii atașează documentația echipamentului', async () =>
  (await as('admc', `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'echipament', $2, 'manual', 'm.pdf', $3)`, [P, E1, `${P}/echipament/${E1}/m.pdf`])).affectedRows === 1);

console.log('Scadențele și garanțiile');
await ok('scadența mentenanței pornește de la punerea în funcțiune', async () => {
  const r = (await as('admc', `select cod, urmatoarea::text u from scadente_mentenanta($1)`, [P])).rows;
  return r.length === 1 && r[0].cod === 'CT-01' && r[0].u === zi(10);
});
await ok('echipamentul fără dată de pornire și fără exploatare nu are scadență', async () => !(await as('admc', `select cod from scadente_mentenanta($1)`, [P])).rows.some(x => x.cod === 'CT-02'));
await ok('garanțiile echipamentelor se calculează din tip', async () => {
  const r = (await as('benef', `select ce, denumire, garantie_pana::text g from garantii($1)`, [P])).rows;
  return r.length === 2 && r.find(x => x.denumire.startsWith('UF-01')).g === zi(30);
});
await ok('cei din afara proiectului nu văd scadențele și garanțiile', async () =>
  (await as('strain', `select * from scadente_mentenanta($1)`, [P])).rows.length === 0 && (await as('strain', `select * from garantii($1)`, [P])).rows.length === 0);
await ok('înainte de exploatare nu apar sarcini de mentenanță', async () => !(await sarcini('admc')).some(s => s.tip === 'mentenanta' || s.tip === 'garantie'));

await as('dir', `insert into receptii (proiect_id, tip, obiect) values ($1, 'terminare', 'Întreaga construcție')`, [P]);
const R = one(await db.query(`select id from receptii where proiect_id = $1`, [P])).id;
await db.query(`update receptii set stare = 'aprobata', decizie = 'admitere', decis_la = now() - interval '1000 days', aprobat_la = now() - interval '1000 days', garantie_pana = $2 where id = $1`, [R, zi(60)]);
await as('benef', `select trece_in_exploatare($1, (current_date - 999))`, [P]);
await ok('garanția construcției apare lângă cele ale echipamentelor', async () => (await as('benef', `select ce from garantii($1)`, [P])).rows.filter(x => x.ce === 'constructie').length === 1);
await ok('în exploatare, mentenanța scadentă apare în De făcut', async () => (await sarcini('admc')).some(s => s.tip === 'mentenanta' && /2 echipamente scadente/.test(s.titlu)));
await ok('garanția construcției care expiră apare la beneficiar', async () => (await sarcini('benef')).some(s => s.tip === 'garantie' && /bună execuție/.test(s.titlu)));
await ok('garanția echipamentului care expiră apare la administratorul clădirii', async () => (await sarcini('admc')).some(s => s.tip === 'garantie' && /1 echipamente/.test(s.titlu)));
await ok('constructorul nu are aceste sarcini', async () => !(await sarcini('rte')).some(s => s.tip === 'mentenanta' || s.tip === 'garantie'));
await ok('echipamentul fără dată de pornire are scadența de la intrarea în exploatare', async () =>
  (await as('admc', `select cod from scadente_mentenanta($1)`, [P])).rows.some(x => x.cod === 'CT-02'));

console.log('Intervențiile');
const interv = (user, tip, data = zi(0), echip = E1) => as(user, `insert into interventii_echipament (proiect_id, echipament_id, tip, data, descriere, executant) values ($1, $2, $3, $4, 'Revizie anuală, curățat arzătorul.', 'Termo Service SRL') returning numar`, [P, echip, tip, data]);
await refuses('cititorul nu înregistrează intervenții', () => interv('citit', 'revizie'), 'nu cititorii');
await refuses('data nu poate fi în viitor', () => interv('admc', 'revizie', zi(5)), 'viitor');
await refuses('tipul trebuie să fie din listă', () => interv('admc', 'orice'), 'check');
await ok('un defect nu mută scadența reviziei', async () => {
  await interv('admc', 'defect');
  return (await as('admc', `select urmatoarea::text u from scadente_mentenanta($1) where cod = 'CT-01'`, [P])).rows[0].u === zi(10);
});
await ok('revizia mută scadența cu intervalul', async () => {
  const n = one(await interv('admc', 'revizie')).numar;
  const u = (await as('admc', `select urmatoarea::text u from scadente_mentenanta($1) where cod = 'CT-01'`, [P])).rows[0].u;
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 12);
  return n === 2 && u === d.toISOString().slice(0, 10);
});
await ok('constructorul înregistrează reparația în garanție', async () => (await as('rte', `insert into interventii_echipament (proiect_id, echipament_id, tip, data, descriere, in_garantie) values ($1, $2, 'reparatie', current_date, 'Înlocuit vasul de expansiune.', true)`, [P, E1])).affectedRows === 1);
const I = one(await db.query(`select id from interventii_echipament where tip = 'revizie'`)).id;
await refuses('intervenția nu se modifică', () => as('admc', `update interventii_echipament set descriere = 'x' where id = $1`, [I]), 'permission');
await refuses('intervenția nu se șterge', () => as('admin', `delete from interventii_echipament where id = $1`, [I]), 'permission');
await refuses('echipamentul trebuie să fie din proiect', () => interv('admc', 'revizie', zi(0), '00000000-0000-0000-0000-000000000000'), 'nu aparține');
await ok('intervenția apare în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel = 'interventii_echipament'`)).rows[0].n === 3);
const atas = user => as(user, `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'interventie_echipament', $2, 'document', 'f.pdf', $3)`, [P, I, `${P}/interventie_echipament/${I}/${user}.pdf`]);
await ok('autorul atașează fișa intervenției', async () => (await atas('admc')).affectedRows === 1);
await refuses('proiectantul nu atașează la intervenția altcuiva', () => atas('proi'), 'Nu puteți atașa');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
