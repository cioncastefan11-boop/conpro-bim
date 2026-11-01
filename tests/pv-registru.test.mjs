// Teste pentru procesele verbale și registrul electronic (migrarea 0002).
// Rulare: npm run test:db
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
`);
for (const f of ['0001_fundatie.sql', '0002_procese_verbale.sql'])
  await db.exec(fs.readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'));

const U = {
  admin:  '11111111-1111-1111-1111-111111111111',
  dir:    '22222222-2222-2222-2222-222222222222',
  rte:    '33333333-3333-3333-3333-333333333333',
  proi:   '44444444-4444-4444-4444-444444444444',
  benef:  '55555555-5555-5555-5555-555555555555',
  lab:    '66666666-6666-6666-6666-666666666666',
  strain: '77777777-7777-7777-7777-777777777777',
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
const rows = r => r.rows.length;
const one = r => r.rows[0];

// --- pregătire: proiect cu echipă completă ---
await as('admin', `insert into proiecte (cod, denumire) values ('BLC01', 'Bloc test')`);
const P = one(await db.query(`select id from proiecte where cod='BLC01'`)).id;
for (const [u, rol] of [['dir', 'diriginte'], ['rte', 'constructor'], ['proi', 'proiectant'], ['benef', 'beneficiar'], ['lab', 'laborator']])
  await as('admin', `insert into invitatii (proiect_id, email, rol) values ($1, $2, $3)`, [P, `${u}@test.ro`, rol]);
for (const u of ['dir', 'rte', 'proi', 'benef', 'lab']) await as(u, `select accepta_invitatiile()`);

const convoaca = (user, tip, participanti, obiect = 'Armare fundații axele A–C') =>
  as(user, `select convoaca_pv($1, $2, $3, 'Fundații F1–F6', '2026-11-03', 'Șantier', $4::uuid[], 'Inspector ISC') as id`,
     [P, tip, obiect, participanti.map(x => U[x])]).then(one).then(r => r.id);
const confirma = (user, pv, decizie = 'confirm', obs = null) =>
  as(user, `select confirma_pv($1, $2, $3) as s`, [pv, decizie, obs]).then(one).then(r => r.s);

console.log('Convocare');
let FD;
await ok('constructorul convoacă o fază determinantă', async () => { FD = await convoaca('rte', 'faza_determinanta', ['dir', 'rte', 'proi']); return !!FD; });
await ok('PV-ul primește numărul 1 și codul PV-BLC01-0001', async () =>
  one(await as('dir', `select numar, cod_pv(id) c from procese_verbale where id=$1`, [FD])).c === 'PV-BLC01-0001');
await refuses('faza determinantă fără proiectant e refuzată', () => convoaca('rte', 'faza_determinanta', ['dir', 'rte']), 'proiectant');
await refuses('beneficiarul nu convoacă PV-uri', () => convoaca('benef', 'lucrari_ascunse', ['dir', 'rte']), 'convoacă');
await refuses('laboratorul nu convoacă PV-uri', () => convoaca('lab', 'lucrari_ascunse', ['dir', 'rte']));
await refuses('un străin nu poate fi participant', () => convoaca('rte', 'lucrari_ascunse', ['dir', 'rte', 'strain']), 'echipa');
await refuses('nimeni nu scrie direct în tabelul de PV-uri', () =>
  as('admin', `insert into procese_verbale (proiect_id, numar, tip, obiect, data_pv) values ($1, 99, 'alt', 'test', '2026-11-01')`, [P]));
await ok('membrii văd PV-ul și participanții', async () =>
  rows(await as('benef', `select * from procese_verbale`)) === 1 && rows(await as('benef', `select * from participanti_pv`)) === 3);
await ok('un străin nu vede PV-urile', async () => rows(await as('strain', `select * from procese_verbale`)) === 0);

console.log('Ordinea de semnare, art. 426 alin. 3');
await refuses('proiectantul nu poate semna primul', () => confirma('proi', FD), 'art. 426');
await ok('dirigintele confirmă → PV în semnare', async () => (await confirma('dir', FD)) === 'in_semnare');
await refuses('proiectantul nu poate semna nici după diriginte, înainte de RTE', () => confirma('proi', FD), 'art. 426');
await ok('RTE-ul confirmă', async () => (await confirma('rte', FD)) === 'in_semnare');
await ok('proiectantul confirmă ultimul → PV semnat', async () => (await confirma('proi', FD)) === 'semnat');
await refuses('o confirmare nu se repetă', () => confirma('dir', FD), 'semnat');
await refuses('beneficiarul nu confirmă un PV la care nu e participant', () => confirma('benef', FD), 'participant');
await refuses('un PV semnat nu se anulează', () => as('rte', `select anuleaza_pv($1, 'greșeală')`, [FD]), 'semnat');
await ok('nimeni nu modifică direct o confirmare', async () =>
  (await as('dir', `update participanti_pv set decizie='refuz' where pv_id=$1`, [FD]).catch(() => ({ affectedRows: 0 }))).affectedRows === 0);

console.log('Alte situații');
let LA;
await ok('la lucrări ascunse ordinea e liberă', async () => {
  LA = await convoaca('dir', 'lucrari_ascunse', ['dir', 'rte'], 'Hidroizolație subsol');
  return (await confirma('rte', LA)) === 'in_semnare'; });
await refuses('refuzul cere motiv', () => confirma('dir', LA, 'refuz', ''), 'motiv');
await ok('refuzul cu motiv → PV contestat', async () => (await confirma('dir', LA, 'refuz', 'Suprapunere insuficientă la membrană')) === 'contestat');
await ok('cine a convocat anulează PV-ul contestat', async () => { await as('dir', `select anuleaza_pv($1, 'Se refac lucrările')`, [LA]); return true; });
await refuses('un PV anulat nu mai primește confirmări', () => confirma('rte', LA), 'anulat');
let RT;
await ok('recepția la terminare cere și beneficiarul', async () => {
  try { await convoaca('rte', 'receptie_terminare', ['dir', 'rte', 'proi']); return false; } catch { /* corect */ }
  RT = await convoaca('rte', 'receptie_terminare', ['dir', 'rte', 'proi', 'benef'], 'Recepția la terminarea lucrărilor');
  return !!RT; });
await ok('la recepție, beneficiarul poate confirma oricând', async () => (await confirma('benef', RT, 'confirm_cu_observatii', 'Remedieri la fațadă până la 15.12')) === 'in_semnare');
await refuses('pe un PV deschis, o confirmare dată nu se repetă', () => confirma('benef', RT), 'deja');
await refuses('la recepția la terminare proiectantul semnează tot după diriginte și RTE', () => confirma('proi', RT), 'art. 426');
await refuses('altcineva decât convocatorul sau administratorul nu anulează', () => as('benef', `select anuleaza_pv($1, 'nu vreau')`, [RT]), 'Doar');
await ok('numerotarea continuă: 1, 2, 3', async () =>
  (await as('admin', `select array_agg(numar order by numar) n from procese_verbale`)).rows[0].n.join(',') === '1,2,3');

console.log('Registrul electronic');
await ok('confirmările dirigintelui intră automat în registrul lui', async () =>
  rows(await as('dir', `select * from registru_intrari where persoana_id=auth.uid() and automat`)) === 2);
await ok('RTE-ul are și el intrările lui', async () =>
  rows(await as('rte', `select * from registru_intrari where persoana_id=auth.uid()`)) === 2);
await ok('confirmarea proiectantului nu intră în registru', async () =>
  rows(await db.query(`select * from registru_intrari where persoana_id=$1`, [U.proi])) === 0);
await ok('intrarea automată citează codul PV-ului', async () =>
  (await as('dir', `select descriere from registru_intrari where pv_id=$1`, [FD])).rows[0].descriere.startsWith('PV-BLC01-0001 confirmat'));
await ok('dirigintele adaugă o intrare manuală', async () =>
  (await as('dir', `insert into registru_intrari (proiect_id, rol, tip, descriere) values ($1, 'beneficiar', 'verificare', 'Verificare cofraje stâlpi etaj 1')`, [P])).affectedRows === 1);
await ok('rolul intrării manuale e cel real, nu cel trimis', async () =>
  one(await as('dir', `select rol from registru_intrari where descriere like 'Verificare cofraje%'`)).rol === 'diriginte');
await refuses('beneficiarul nu scrie în registru', () =>
  as('benef', `insert into registru_intrari (proiect_id, rol, tip, descriere) values ($1, 'beneficiar', 'verificare', 'test registru')`, [P]), 'Registrul');
await refuses('nimeni nu scrie în registrul altcuiva', () =>
  as('rte', `insert into registru_intrari (persoana_id, proiect_id, rol, tip, descriere) values ($1, $2, 'diriginte', 'verificare', 'fals')`, [U.dir, P]));
await refuses('nimeni nu creează intrări „automate” false', () =>
  as('dir', `insert into registru_intrari (proiect_id, rol, tip, descriere, automat) values ($1, 'diriginte', 'verificare', 'fals automat', true)`, [P]));
await refuses('RTE-ul nu „corectează” intrările dirigintelui', async () => {
  const id = one(await db.query(`select id from registru_intrari where persoana_id=$1 limit 1`, [U.dir])).id;
  await as('rte', `insert into registru_intrari (proiect_id, rol, tip, descriere, corecteaza_id) values ($1, 'constructor', 'verificare', 'corectură falsă', $2)`, [P, id]);
}, 'propriul registru');
await ok('intrările nu se modifică', async () =>
  (await as('dir', `update registru_intrari set descriere='altceva'`).catch(() => ({ affectedRows: 0 }))).affectedRows === 0);
await ok('intrările nu se șterg', async () =>
  (await as('dir', `delete from registru_intrari`).catch(() => ({ affectedRows: 0 }))).affectedRows === 0
  && rows(await db.query(`select * from registru_intrari where persoana_id=$1`, [U.dir])) === 3);
await ok('RTE-ul nu vede registrul dirigintelui', async () =>
  rows(await as('rte', `select * from registru_intrari where persoana_id=$1`, [U.dir])) === 0);
await ok('beneficiarul vede registrele de pe proiectul lui', async () =>
  rows(await as('benef', `select * from registru_intrari`)) === 5);
await ok('laboratorul nu vede registrele', async () => rows(await as('lab', `select * from registru_intrari`)) === 0);

console.log('Jurnal');
await ok('confirmările apar în istoricul proiectului', async () =>
  rows(await as('benef', `select * from jurnal where tabel='participanti_pv' and operatie='UPDATE'`)) >= 6);

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
