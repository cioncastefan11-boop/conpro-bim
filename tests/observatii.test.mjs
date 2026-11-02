// Teste pentru observațiile pe model, BCF (migrarea 0018).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql', '0010_documente_cde.sql', '0011_model_ifc.sql', '0012_conventie_sarcini.sql', '0013_gdpr.sql', '0014_exploatare.sql', '0015_urmarire.sql', '0016_mentenanta.sql', '0017_reclamatii.sql', '0018_observatii.sql'])
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
const obs = (user, extra = {}) => as(user, `insert into observatii (proiect_id, tip, titlu, descriere, atribuita_rol, atribuita_catre, termen, elemente, punct_vedere) values ($1, $2, $3, 'Armătura nu respectă detaliul D3.', $4, $5, $6, $7::jsonb, $8::jsonb) returning id, numar, stare, bcf_guid`,
  [P, extra.tip ?? 'neconformitate', extra.titlu ?? 'Acoperire insuficientă grinda G3', extra.rol ?? 'proiectant', extra.catre ?? null, extra.termen ?? null,
   JSON.stringify(extra.elemente ?? [{ guid: '2O2Fr$t4X7Zf8NOew3FLOH', nume: 'Grinda G3', clasa: 'IFCBEAM' }]),
   JSON.stringify(extra.pv ?? { camera_view_point: [10, -5, 8], camera_direction: [-1, 1, -0.5], camera_up_vector: [0, 0, 1], field_of_view: 60 })]);
const stare = (user, id, s, c = null) => as(user, `select observatie_stare($1, $2, $3)`, [id, s, c]);
const st = async id => one(await db.query(`select stare, rezolvata_la, inchisa_la, inchisa_de from observatii where id = $1`, [id]));

console.log('Deschiderea');
let O1, O2;
await ok('dirigintele deschide o neconformitate pe un element, atribuită proiectantului', async () => { const r = one(await obs('dir')); O1 = r.id; return r.numar === 1 && r.stare === 'deschisa' && r.bcf_guid; });
await ok('constructorul pune o întrebare, atribuită lui Proi', async () => { const r = one(await obs('rte', { tip: 'intrebare', titlu: 'Golul din placă se mută?', rol: null, catre: U.proi, termen: '2026-12-01' })); O2 = r.id; return r.numar === 2; });
await refuses('cititorul nu deschide observații', () => obs('citit'), 'nu cititorii');
await refuses('cei din afara proiectului nu', () => obs('strain'));
await refuses('nu se atribuie cuiva din afara proiectului', () => obs('dir', { catre: U.strain }), 'nu face parte');
await refuses('rolul atribuit trebuie să existe', () => obs('dir', { rol: 'bucatar' }), 'nu există');
await refuses('starea nu se forțează la creare', async () => { const r = one(await as('dir', `insert into observatii (proiect_id, titlu, stare) values ($1, 'Test stare', 'inchisa') returning stare`, [P])); if (r.stare === 'deschisa') throw new Error('normalizat'); }, 'normalizat');
await ok('observația atribuită rolului apare în De făcut la proiectant', async () => (await sarcini('proi')).some(s => s.tip === 'observatie' && /Acoperire/.test(s.titlu) && s.cale === `model/observatii/${O1}`));
await ok('observația atribuită persoanei apare doar la ea', async () => (await sarcini('proi')).some(s => /Golul/.test(s.titlu)) && !(await sarcini('proi2')).some(s => /Golul/.test(s.titlu)));
await ok('dar observația atribuită rolului apare la ambii proiectanți', async () => (await sarcini('proi2')).some(s => /Acoperire/.test(s.titlu)));

console.log('Discuția și stările');
await ok('proiectantul comentează', async () => (await as('proi', `insert into comentarii_observatie (observatie_id, proiect_id, text) values ($1, $2, 'Verific și revin cu detaliul.')`, [O1, P])).affectedRows === 1);
await refuses('cititorul nu comentează', () => as('citit', `insert into comentarii_observatie (observatie_id, proiect_id, text) values ($1, $2, 'x')`, [O1, P]), 'nu cititorii');
await refuses('constructorul (neatribuit) nu marchează rezolvată', () => stare('rte', O1, 'rezolvata', 'Gata'), 'atribuită');
await ok('proiectantul o preia', async () => { await stare('proi', O1, 'in_lucru'); return (await st(O1)).stare === 'in_lucru'; });
await refuses('rezolvarea cere o descriere', () => stare('proi', O1, 'rezolvata', ''), 'Descrieți');
await ok('proiectantul o rezolvă', async () => { await stare('proi', O1, 'rezolvata', 'Emis detaliul D3 rev. B: acoperire 3 cm.'); const s = await st(O1); return s.stare === 'rezolvata' && s.rezolvata_la; });
await ok('autorul o are de verificat', async () => (await sarcini('dir')).some(s => /de verificat/.test(s.titlu)));
await refuses('proiectantul nu o închide singur', () => stare('proi', O1, 'inchisa'), 'după verificare');
await ok('dirigintele o închide', async () => { await stare('dir', O1, 'inchisa'); const s = await st(O1); return s.stare === 'inchisa' && s.inchisa_de === U.dir; });
await ok('fiecare schimbare lasă un comentariu cu starea', async () => (await db.query(`select stare_noua from comentarii_observatie where observatie_id = $1 and stare_noua is not null order by creat_la`, [O1])).rows.map(r => r.stare_noua).join() === 'in_lucru,rezolvata,inchisa');
await refuses('starea nu se scrie direct', () => as('dir', `update observatii set stare = 'deschisa' where id = $1`, [O1]), 'permission');
await refuses('închisă, nu se mai modifică', () => as('dir', `update observatii set titlu = 'Alt titlu' where id = $1`, [O1]), 'închisă');
await refuses('redeschiderea cere motivul', () => stare('dir', O1, 'deschisa', ''), 'de ce');
await ok('dirigintele o redeschide', async () => { await stare('dir', O1, 'deschisa', 'Pe șantier armătura e tot neschimbată.'); const s = await st(O1); return s.stare === 'deschisa' && !s.inchisa_la && !s.rezolvata_la; });
await ok('autorul modifică termenul și atribuirea', async () => (await as('rte', `update observatii set termen = '2026-12-05', prioritate = 'mare' where id = $1`, [O2])).affectedRows === 1);
await ok('alții nu', async () => (await as('proi2', `update observatii set termen = '2027-01-01' where id = $1`, [O2])).affectedRows === 0);
await ok('totul rămâne în istoric', async () => (await db.query(`select count(*)::int n from jurnal where tabel = 'observatii'`)).rows[0].n >= 6);

console.log('Importul BCF');
await ok('o observație importată își păstrează identificatorul, starea și autorul din fișier', async () => {
  const g = '6f9f8a2e-3b1c-4c55-9d1e-0a1b2c3d4e5f';
  await as('proi', `insert into observatii (proiect_id, bcf_guid, titlu, stare, sursa, autor_extern, creat_la) values ($1, $2, 'Conflict conductă-grindă', 'rezolvata', 'coordonare.bcfzip', 'ana@studio.ro', '2026-09-01T10:00:00Z')`, [P, g]);
  const r = one(await db.query(`select stare, autor_extern, creat_la::date::text d, numar, rezolvata_la from observatii where bcf_guid = $1`, [g]));
  return r.stare === 'rezolvata' && r.autor_extern === 'ana@studio.ro' && r.d === '2026-09-01' && r.numar === 4 && r.rezolvata_la;
});
await refuses('același topic BCF nu se importă de două ori', () => as('proi', `insert into observatii (proiect_id, bcf_guid, titlu, sursa) values ($1, '6f9f8a2e-3b1c-4c55-9d1e-0a1b2c3d4e5f', 'Dublură', 'x.bcfzip')`, [P]), 'duplicate');
await ok('comentariile importate păstrează autorul și data din fișier', async () => {
  await as('proi', `insert into comentarii_observatie (observatie_id, proiect_id, text, autor_extern, data_externa) select id, proiect_id, 'Mutat traseul.', 'ion@instal.ro', '2026-09-02T08:00:00Z' from observatii where bcf_guid = '6f9f8a2e-3b1c-4c55-9d1e-0a1b2c3d4e5f'`);
  return (await db.query(`select autor_extern from comentarii_observatie where autor_extern = 'ion@instal.ro'`)).rows.length === 1;
});

console.log('Captura și fotografiile');
const atas = (user, id) => as(user, `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale) values ($1, 'observatie', $2, 'poza', 'a.png', $3)`, [P, id, `${P}/observatie/${id}/${user}-${Math.random()}.png`]);
await ok('membrii echipei atașează la o observație deschisă', async () => (await atas('rte', O2)).affectedRows === 1);
await refuses('cititorul nu', () => atas('citit', O2), 'Nu puteți atașa');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
