// Teste pentru urmărirea comportării în timp (migrarea 0015).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql'])
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
await as('dir', `insert into receptii (proiect_id, tip, obiect) values ($1, 'terminare', 'Întreaga construcție')`, [P]);
const R = one(await db.query(`select id from receptii where proiect_id = $1`, [P])).id;
await db.query(`update receptii set stare = 'aprobata', decizie = 'admitere', decis_la = '2025-06-01', aprobat_la = '2025-06-05T10:00:00Z', garantie_pana = '2028-06-05' where id = $1`, [R]);

console.log('Programul de urmărire');
const punct = (user, ce, interval = 12) => as(user, `insert into puncte_urmarire (proiect_id, ce, interval_luni) values ($1, $2, $3) returning id`, [P, ce, interval]);
let P1, P2, P3;
await ok('proiectantul stabilește programul', async () => { P1 = one(await punct('proi', 'Fisuri în elementele structurale')).id; return true; });
await ok('administratorul clădirii adaugă un punct', async () => { P2 = one(await punct('admc', 'Infiltrații la terasă', 6)).id; return true; });
await ok('beneficiarul adaugă un punct', async () => { P3 = one(await punct('benef', 'Tasări și înclinări')).id; return true; });
await refuses('constructorul nu schimbă programul', () => punct('rte', 'Altceva'), 'row-level');
await refuses('cititorul nu schimbă programul', () => punct('citit', 'Altceva'), 'row-level');
await refuses('intervalul e de cel mult 12 luni (Legea 169/2026)', () => punct('proi', 'Rosturi', 18), 'check');
await ok('punctul se poate dezactiva', async () => (await as('admc', `update puncte_urmarire set activ = false where id = $1`, [P3])).affectedRows === 1);
await ok('dar nu se poate șterge', async () => { try { await as('admc', `delete from puncte_urmarire where id = $1`, [P3]); return false; } catch { return true; } });
await ok('fără exploatare nu sunt scadențe', async () => (await as('benef', `select * from scadente_urmarire($1)`, [P])).rows.length === 0);

console.log('Inspecțiile');
const insp = (user, data, constatari, concluzii = 'Construcția se comportă normal.') =>
  as(user, `select inregistreaza_inspectie($1, $2, 'Ing. Ion Pop, expert tehnic', $3, null, $4::jsonb) id`, [P, data, concluzii, JSON.stringify(constatari)]);
await refuses('înainte de exploatare nu se înregistrează inspecții', () => insp('admc', '2025-07-01', [{ punct_id: P1, stare: 'normal' }]), 'după trecerea');
await as('benef', `select trece_in_exploatare($1, '2025-06-10')`, [P]);
await ok('scadențele pornesc de la intrarea în exploatare (punctele active)', async () => {
  const r = (await as('benef', `select punct_id, urmatoarea::text u from scadente_urmarire($1)`, [P])).rows;
  return r.length === 2 && r.find(x => x.punct_id === P2).u === '2025-12-10' && r.find(x => x.punct_id === P1).u === '2026-06-10';
});
await ok('cei din afara proiectului nu văd scadențele', async () => (await as('strain', `select * from scadente_urmarire($1)`, [P])).rows.length === 0);
await ok('verificările întârziate apar în De făcut la beneficiar', async () => (await sarcini('benef')).some(s => s.tip === 'urmarire' && /2 verificări scadente/.test(s.titlu)));
await ok('și la administratorul clădirii', async () => (await sarcini('admc')).some(s => s.tip === 'urmarire'));
await ok('nu și la constructor', async () => !(await sarcini('rte')).some(s => s.tip === 'urmarire'));
await refuses('cititorul nu înregistrează inspecții', () => insp('citit', '2026-01-10', [{ punct_id: P1, stare: 'normal' }]), 'nu cititorii');
await refuses('data nu poate fi înaintea exploatării', () => insp('admc', '2025-05-01', [{ punct_id: P1, stare: 'normal' }]), 'înaintea intrării');
await refuses('fără niciun punct verificat nu e inspecție', () => insp('admc', '2026-01-10', [{ punct_id: P1, stare: 'neverificat' }]), 'niciun punct');
await refuses('atenția sau alarma cer o descriere', () => insp('admc', '2026-01-10', [{ punct_id: P2, stare: 'atentie' }]), 'Descrieți');
await refuses('punctele trebuie să fie din programul proiectului', () => insp('admc', '2026-01-10', [{ punct_id: '00000000-0000-0000-0000-000000000000', stare: 'normal' }]), 'nu face parte');
let I1;
await ok('administratorul clădirii înregistrează inspecția', async () => {
  I1 = one(await insp('admc', '2026-01-10', [{ punct_id: P1, stare: 'normal' }, { punct_id: P2, stare: 'atentie', observatii: 'Pată de umezeală lângă aerisitor.' }])).id;
  const i = one(await db.query(`select numar, stare, eveniment_id from inspectii_urmarire where id = $1`, [I1]));
  return i.numar === 1 && i.stare === 'atentie' && i.eveniment_id;
});
await ok('inspecția intră în jurnalul evenimentelor, cu constatarea', async () => {
  const e = one(await db.query(`select e.tip, e.titlu, e.efecte, e.necesita_expertiza from evenimente_exploatare e join inspectii_urmarire i on i.eveniment_id = e.id where i.id = $1`, [I1]));
  return e.tip === 'inspectie' && /nr\. 1 · atenție/.test(e.titlu) && /Infiltrații la terasă: Pată/.test(e.efecte) && !e.necesita_expertiza;
});
await ok('scadențele se mută de la ultima verificare', async () => {
  const r = (await as('benef', `select punct_id, ultima::text ul, urmatoarea::text u from scadente_urmarire($1)`, [P])).rows;
  return r.find(x => x.punct_id === P2).u === '2026-07-10' && r.find(x => x.punct_id === P1).u === '2027-01-10';
});
await ok('un punct nebifat la inspecție rămâne cu scadența veche', async () => {
  await insp('admc', '2026-02-01', [{ punct_id: P1, stare: 'normal' }, { punct_id: P2, stare: 'neverificat' }]);
  const r = (await as('benef', `select punct_id, urmatoarea::text u from scadente_urmarire($1)`, [P])).rows;
  return r.find(x => x.punct_id === P2).u === '2026-07-10' && r.find(x => x.punct_id === P1).u === '2027-02-01';
});
await ok('alarma marchează evenimentul „necesită expertiză”', async () => {
  const id = one(await insp('dir', '2026-03-01', [{ punct_id: P1, stare: 'alarma', observatii: 'Fisură de 1 mm în grinda G3, ax 4.' }], 'Se cere expertiză tehnică.')).id;
  const e = one(await db.query(`select e.necesita_expertiza, e.titlu from evenimente_exploatare e join inspectii_urmarire i on i.eveniment_id = e.id where i.id = $1`, [id]));
  return e.necesita_expertiza && /ALARMĂ/.test(e.titlu);
});
await refuses('inspecția nu se modifică', () => as('admc', `update inspectii_urmarire set concluzii = 'x' where id = $1`, [I1]), 'permission');
await refuses('constatările nu se modifică', () => as('admc', `update constatari_inspectie set stare = 'normal' where inspectie_id = $1`, [I1]), 'permission');
await refuses('inspecția nu se inserează direct, ocolind verificările', () => as('admc', `insert into inspectii_urmarire (proiect_id, numar, data_inspectiei, efectuata_de, concluzii, stare) values ($1, 99, '2026-01-01', 'Eu', 'Bine', 'normal')`, [P]), 'permission');
await ok('toți membrii văd inspecțiile și constatările', async () => (await as('citit', `select count(*)::int n from constatari_inspectie`)).rows[0].n === 5);
await ok('cei din afara proiectului nu', async () => (await as('strain', `select count(*)::int n from inspectii_urmarire`)).rows[0].n === 0);
await ok('cu toate punctele verificate azi, sarcina dispare', async () => {
  await as('admc', `select inregistreaza_inspectie($1, current_date, 'Administrator', 'Normal.', null, $2::jsonb)`, [P, JSON.stringify([{ punct_id: P1, stare: 'normal' }, { punct_id: P2, stare: 'normal' }])]);
  return !(await sarcini('benef')).some(s => s.tip === 'urmarire');
});
const atas = user => as(user, `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'inspectie_urmarire', $2, 'poza', 'a.jpg', $3)`, [P, I1, `${P}/inspectie_urmarire/${I1}/${user}.jpg`]);
await ok('autorul atașează fotografii la inspecție', async () => (await atas('admc')).affectedRows === 1);
await refuses('constructorul nu atașează la inspecția altcuiva', () => atas('rte'), 'Nu puteți atașa');

console.log('Scadențele calculate în aplicație (src/lib/urmarire.ts) = cele din baza de date');
const { build } = await import('esbuild');
const out = new URL('./.build/urmarire.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../src/lib/urmarire.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out.pathname, logLevel: 'silent' });
const { plusLuni, scadente } = await import(out.href);
await ok('31.01 + 1 lună = 28.02, ca în Postgres', async () => plusLuni('2026-01-31', 1) === '2026-02-28' && plusLuni('2028-01-31', 1) === '2028-02-29' && plusLuni('2025-06-10', 12) === '2026-06-10');
await ok('scadențele din aplicație coincid cu cele din baza de date', async () => {
  const q = async t => (await db.query(`select * from ${t} where proiect_id = $1`, [P])).rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString().slice(0, 10) : v])));
  const pr = one(await db.query(`select exploatare_din::text from proiecte where id = $1`, [P]));
  const ins = (await db.query(`select id, data_inspectiei::text from inspectii_urmarire where proiect_id = $1`, [P])).rows;
  const app = scadente({ exploatare_din: pr.exploatare_din }, await q('puncte_urmarire'), ins, await q('constatari_inspectie'));
  const bd = (await db.query(`select punct_id, urmatoarea::text from scadente_urmarire_intern($1) order by 2`, [P])).rows;
  return app.length === bd.length && app.every((x, i) => x.punct_id === bd[i].punct_id && x.urmatoarea === bd[i].urmatoarea);
});

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
