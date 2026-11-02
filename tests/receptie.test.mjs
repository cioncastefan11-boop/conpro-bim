// Teste pentru recepția construcției (migrarea 0008).
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
  '0006_echipamente_carte.sql', '0007_condica_betoane.sql', '0008_receptie.sql', '0009_semnatura_electronica.sql'])
  await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));

const U = {
  admin: '11111111-1111-1111-1111-111111111111', dir: '22222222-2222-2222-2222-222222222222',
  rte: '33333333-3333-3333-3333-333333333333', proi: '44444444-4444-4444-4444-444444444444',
  benef: '55555555-5555-5555-5555-555555555555', strain: '77777777-7777-7777-7777-777777777777',
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

// --- pregătire: proiect CC2 fără autorizație, echipa ---
await as('admin', `insert into proiecte (cod, denumire, clasa_consecinte) values ('BLC01', 'Bloc test', 'CC2')`);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['benef', 'beneficiar']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'benef']) await as(u, `select accepta_invitatiile()`);
await db.query(`update proiecte set stadiu_catuc = 5 where id = $1`, [P]);

const receptie = (user, extra = '') => as(user,
  `insert into receptii (proiect_id, tip, obiect${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, 'terminare', 'Întreaga construcție'${extra ? ', ' + extra.split('=')[1] : ''})`, [P]);

console.log('Crearea recepției');
await refuses('fără autorizație de construire nu se recepționează (art. 280 alin. 8)', () => receptie('dir'), 'art. 280 alin. 8');
await db.query(`update proiecte set ac_numar = '412/2026', ac_emis_la = '2026-03-30' where id = $1`, [P]);
await refuses('constructorul nu deschide recepția', () => receptie('rte'));
await refuses('un străin nu deschide recepția', () => receptie('strain'));
await ok('dirigintele deschide recepția la terminare', async () => (await receptie('dir')).affectedRows === 1);
const R = one(await db.query(`select * from receptii where proiect_id = $1`, [P]));
await ok('garanția implicită e minimul legal pentru CC2: 36 de luni (art. 531 alin. 6)', () => R.garantie_luni === 36 && R.stare === 'pregatire' && R.numar === 1);
await refuses('a doua recepție la terminare a întregii construcții e refuzată', () => receptie('dir'), 'duplicate');
await ok('o recepție parțială merge în paralel (art. 527 alin. 3)', async () =>
  (await as('dir', `insert into receptii (proiect_id, tip, partiala, obiect) values ($1, 'terminare', true, 'Corpul A')`, [P])).affectedRows === 1);
await refuses('recepția finală fără o recepție la terminare aprobată', () =>
  as('dir', `insert into receptii (proiect_id, tip, obiect, receptie_terminare_id) values ($1, 'finala', 'Întreaga construcție', $2)`, [P, R.id]), 'aprobată');
await ok('toți membrii proiectului văd recepțiile', async () => (await as('benef', `select id from receptii`)).rows.length === 2);
await ok('un străin nu vede recepțiile', async () => (await as('strain', `select id from receptii`)).rows.length === 0);
await refuses('starea nu se schimbă direct', () => as('dir', `update receptii set stare = 'aprobata' where id = $1`, [R.id]), 'permission');

console.log('Comisia și convocarea');
const membru = (nume, calitate, user = 'dir') => as(user, `insert into comisie_receptie (receptie_id, nume, calitate) values ($1, $2, $3)`, [R.id, nume, calitate]);
await refuses('constructorul nu compune comisia', () => membru('Ion Pop', 'presedinte', 'rte'));
await ok('dirigintele adaugă președintele', async () => (await membru('Ana Popescu', 'presedinte')).affectedRows === 1);
await refuses('convocarea fără dată și loc', () => as('dir', `select receptie_convoaca($1)`, [R.id]), 'data și locul');
await as('dir', `update receptii set data_receptie = '2026-11-20', loc = 'Pe șantier' where id = $1`, [R.id]);
await refuses('convocarea fără specialist', () => as('dir', `select receptie_convoaca($1)`, [R.id]), 'specialist');
await membru('Mihai Radu', 'specialist');
await refuses('convocarea fără reprezentantul emitentului AC (art. 280 alin. 3)', () => as('dir', `select receptie_convoaca($1)`, [R.id]), 'art. 280 alin. 3');
await membru('Elena Dinu', 'reprezentant_ac');
await membru('Radu Marin', 'invitat_executant');
await as('dir', `update receptii set garantie_luni = 24 where id = $1`, [R.id]);
await refuses('garanția sub minimul legal pentru CC2', () => as('dir', `select receptie_convoaca($1)`, [R.id]), '36 luni');
await as('dir', `update receptii set garantie_luni = 48 where id = $1`, [R.id]);
await refuses('pozițiile nu se consemnează înainte de convocare', () =>
  as('dir', `update comisie_receptie set pozitie = 'de_acord' where receptie_id = $1 and calitate = 'presedinte'`, [R.id]), 'după convocare');
await refuses('beneficiarul nu convoacă', () => as('benef', `select receptie_convoaca($1)`, [R.id]), 'secretariatul');
await ok('dirigintele convoacă comisia', async () => { await as('dir', `select receptie_convoaca($1)`, [R.id]); return true; });
await refuses('componența comisiei nu se mai schimbă după convocare', () => membru('Alt specialist', 'specialist'), 'după convocare');

console.log('Ședința: poziții, obiecții, decizie');
const pozitie = (calitate, p, motivare = null) =>
  as('dir', `update comisie_receptie set pozitie = $2, motivare = $3 where receptie_id = $1 and calitate = $4`, [R.id, p, motivare, calitate]);
await refuses('invitații nu votează', () => pozitie('invitat_executant', 'de_acord'), 'invitatii_nu_voteaza');
await refuses('un specialist nu are drept de veto', () => pozitie('specialist', 'veto', 'Nu sunt îndeplinite condițiile.'), 'veto_doar_autoritati');
await refuses('vetoul trebuie motivat în scris', () => pozitie('reprezentant_ac', 'veto'), 'veto_motivat');
await pozitie('presedinte', 'de_acord');
await pozitie('specialist', 'obiectii', 'Finisaje casa scării');
await refuses('decizia fără toate pozițiile', () =>
  as('dir', `select receptie_decide($1, 'admitere', 'Lucrările corespund proiectului.', null)`, [R.id]), 'mai sunt 1');
await pozitie('reprezentant_ac', 'veto', 'Lipsește racordul la canalizare (art. 528 alin. 4).');
await refuses('cu un veto, recepția nu poate fi admisă', () =>
  as('dir', `select receptie_decide($1, 'admitere', 'Lucrările corespund proiectului.', null)`, [R.id]), 'veto');
await pozitie('reprezentant_ac', 'de_acord');
await refuses('constructorul nu formulează obiecții', () =>
  as('rte', `insert into obiectii_receptie (receptie_id, descriere, termen) values ($1, 'Retușuri tencuială casa scării', '2026-12-20')`, [R.id]));
await refuses('admitere cu obiecții fără obiecții consemnate', () =>
  as('dir', `select receptie_decide($1, 'admitere_cu_obiectii', 'Lucrările corespund, cu remedieri.', null)`, [R.id]), 'obiecțiile');
await ok('dirigintele consemnează o obiecție cu termen', async () =>
  (await as('dir', `insert into obiectii_receptie (receptie_id, descriere, termen, responsabil) values ($1, 'Retușuri tencuială casa scării', '2026-12-20', 'Executant')`, [R.id])).affectedRows === 1);
const O = one(await db.query(`select * from obiectii_receptie where receptie_id = $1`, [R.id]));
await ok('obiecțiile se numerotează', () => O.numar === 1 && O.stare === 'deschisa');
await refuses('admitere simplă cu obiecții deschise', () =>
  as('dir', `select receptie_decide($1, 'admitere', 'Lucrările corespund proiectului.', null)`, [R.id]), 'admitere cu obiecții');
await refuses('prelungirea garanției nu e o decizie la terminare', () =>
  as('dir', `select receptie_decide($1, 'prelungire_garantie', 'Defecte.', 'Defecte de remediat.', '2030-01-01')`, [R.id]), 'art. 532');
await refuses('constatările sunt obligatorii', () =>
  as('dir', `select receptie_decide($1, 'admitere_cu_obiectii', '', null)`, [R.id]), 'constatările');
await refuses('beneficiarul nu aprobă înainte de decizia comisiei', () =>
  as('benef', `select receptie_aproba($1, true, null)`, [R.id]), 'decizie');
await ok('dirigintele consemnează decizia: admitere cu obiecții', async () => {
  await as('dir', `select receptie_decide($1, 'admitere_cu_obiectii', 'Lucrările sunt executate conform autorizației și proiectului; Cartea tehnică este completă.', null)`, [R.id]);
  return one(await db.query(`select stare, decizie from receptii where id = $1`, [R.id])).decizie === 'admitere_cu_obiectii';
});
await ok('decizia intră în registrul dirigintelui', async () =>
  (await as('dir', `select descriere from registru_intrari where tip = 'receptie'`)).rows.some(r => r.descriere.includes('admiterea recepției cu 1 obiecții')));
await ok('după decizie, pozițiile nu se mai schimbă', async () => (await pozitie('presedinte', 'obiectii', 'Altceva')).affectedRows === 0);
await refuses('după decizie, recepția nu se mai anulează', () => as('dir', `select receptie_anuleaza($1, 'Greșeală de introducere')`, [R.id]), 'nu se mai anulează');

console.log('Aprobarea beneficiarului și garanția');
await refuses('dirigintele nu aprobă în locul beneficiarului', () => as('dir', `select receptie_aproba($1, true, null)`, [R.id]), 'beneficiarul');
await refuses('respingerea beneficiarului trebuie motivată', () => as('benef', `select receptie_aproba($1, false, '')`, [R.id]), 'Motivați');
await ok('beneficiarul aprobă recepția', async () => { await as('benef', `select receptie_aproba($1, true, 'De acord.')`, [R.id]); return true; });
const RA = one(await db.query(`select * from receptii where id = $1`, [R.id]));
await ok('garanția curge de la data recepției: 48 de luni (art. 531 alin. 9)', () =>
  RA.stare === 'aprobata' && new Date(RA.garantie_pana).toISOString().slice(0, 10) === '2030-11-20');
await ok('proiectul trece în stadiul 6 (predarea construcției)', async () =>
  one(await db.query(`select stadiu_catuc from proiecte where id = $1`, [P])).stadiu_catuc === 6);

console.log('Remedierea obiecțiilor');
await refuses('dirigintele nu poate confirma o obiecție neremediată', () => as('dir', `select obiectie_confirma($1, true, null)`, [O.id]), 'nu a fost raportată');
await refuses('beneficiarul nu raportează remedierea', () => as('benef', `select obiectie_remediata($1, 'Retușat.')`, [O.id]), 'executantul');
await ok('executantul raportează remedierea', async () => { await as('rte', `select obiectie_remediata($1, 'Tencuiala a fost retușată și zugrăvită.')`, [O.id]); return true; });
await ok('dirigintele poate refuza remedierea, cu motiv', async () => {
  await as('dir', `select obiectie_confirma($1, false, 'Diferențe de nuanță la zugrăveală.')`, [O.id]);
  return one(await db.query(`select stare from obiectii_receptie where id = $1`, [O.id])).stare === 'deschisa';
});
await as('rte', `select obiectie_remediata($1, 'Zugrăvit din nou tot peretele.')`, [O.id]);
await ok('dirigintele confirmă remedierea', async () => {
  await as('dir', `select obiectie_confirma($1, true, null)`, [O.id]);
  return one(await db.query(`select stare from obiectii_receptie where id = $1`, [O.id])).stare === 'confirmata';
});

console.log('Recepția finală');
await ok('după recepția la terminare aprobată se deschide recepția finală', async () =>
  (await as('dir', `insert into receptii (proiect_id, tip, obiect, receptie_terminare_id) values ($1, 'finala', 'Întreaga construcție', $2)`, [P, R.id])).affectedRows === 1);
const F = one(await db.query(`select * from receptii where tip = 'finala'`));
await as('dir', `update receptii set data_receptie = '2030-11-25', loc = 'Pe șantier' where id = $1`, [F.id]);
for (const [n, c] of [['Ana Popescu', 'presedinte'], ['Mihai Radu', 'specialist']])
  await as('dir', `insert into comisie_receptie (receptie_id, nume, calitate) values ($1, $2, $3)`, [F.id, n, c]);
await ok('la recepția finală, convocarea nu cere reprezentantul AC', async () => { await as('dir', `select receptie_convoaca($1)`, [F.id]); return true; });
await as('dir', `update comisie_receptie set pozitie = 'de_acord' where receptie_id = $1`, [F.id]);
await refuses('prelungirea garanției cere defecte consemnate', () =>
  as('dir', `select receptie_decide($1, 'prelungire_garantie', 'Fisuri la parapetul terasei.', 'Defecte apărute în garanție.', '2031-06-30')`, [F.id]), 'obiecțiile');
await ok('recepția finală admisă', async () => {
  await as('dir', `select receptie_decide($1, 'admitere', 'Construcția corespunde; viciile ascunse au fost remediate.', null)`, [F.id]);
  await as('benef', `select receptie_aproba($1, true, null)`, [F.id]);
  return one(await db.query(`select stadiu_catuc from proiecte where id = $1`, [P])).stadiu_catuc === 7;
});

console.log('Atașamente');
await ok('proiectantul poate atașa punctul de vedere la recepție', async () =>
  one(await as('proi', `select poate_atasa('receptie', $1, $2) ok`, [R.id, P])).ok === true);
await ok('un străin nu poate atașa', async () => one(await as('strain', `select poate_atasa('receptie', $1, $2) ok`, [R.id, P])).ok === false);
await ok('la o obiecție confirmată nu se mai atașează', async () =>
  one(await as('rte', `select poate_atasa('obiectie_receptie', $1, $2) ok`, [O.id, P])).ok === false);

console.log('Semnături electronice (0009)');
const atas = (user, tip) => as(user, `insert into atasamente (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale, marime)
  values ($1::uuid, 'receptie', $2::uuid, $3, 'PV.pdf', $4, 1000)`, [P, R.id, tip, `${P}/receptie/${R.id}/${tip}-PV.pdf`]);
await atas('dir', 'pv_receptie_semnat');
const A1 = one(await db.query(`select id from atasamente where tip_document = 'pv_receptie_semnat'`)).id;
await atas('dir', 'punct_vedere_diriginte');
const A2 = one(await db.query(`select id from atasamente where tip_document = 'punct_vedere_diriginte'`)).id;
const semn = (user, a, ordine = 1, persoana = null) => as(user,
  `insert into semnaturi_electronice (atasament_id, proiect_id, ordine, semnatar, emitent, calificata, integra, acopera_tot, persoana_id)
   values ($1, $2, $3, 'Ion Popescu', 'CA Test', true, true, true, $4)`, [a, P, ordine, persoana]);
await ok('cel care a încărcat PV-ul semnat înregistrează semnăturile', async () => (await semn('dir', A1, 1, U.benef)).affectedRows === 1);
await refuses('altcineva nu înregistrează semnături pe documentul lui', () => semn('rte', A1, 2), 'cel care l-a încărcat');
await refuses('doar PV-urile semnate au semnături înregistrate', () => semn('dir', A2), 'procesele verbale');
await refuses('persoana recunoscută trebuie să fie din proiect', () => semn('dir', A1, 3, U.strain), 'nu face parte');
await ok('membrii proiectului văd semnăturile', async () => (await as('proi', `select id from semnaturi_electronice`)).rows.length === 1);
await ok('un străin nu le vede', async () => (await as('strain', `select id from semnaturi_electronice`)).rows.length === 0);
await refuses('semnăturile nu se modifică', () => as('dir', `update semnaturi_electronice set calificata = false`), 'permission');
await refuses('semnăturile nu se șterg', () => as('dir', `delete from semnaturi_electronice`), 'permission');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
