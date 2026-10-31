import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const db = new PGlite();
const stub = `
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`;
await db.exec(stub);
await db.exec(fs.readFileSync(process.argv[2] ?? new URL('../supabase/migrations/0001_fundatie.sql', import.meta.url), 'utf8'));

const U = {
  stefan: '11111111-1111-1111-1111-111111111111',
  benef:  '22222222-2222-2222-2222-222222222222',
  constr: '33333333-3333-3333-3333-333333333333',
  strain: '44444444-4444-4444-4444-444444444444',
};
for (const [k, id] of Object.entries(U))
  await db.query(`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now())`,
    [id, `${k}@test.ro`, JSON.stringify({ nume: k })]);

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
async function refuses(name, fn) {
  try { await fn(); fail++; console.log('  ✗', name, '→ a trecut, dar trebuia refuzat'); }
  catch (e) { pass++; console.log('  ✓', name, '(refuzat:', e.message.slice(0, 70) + ')'); }
}
const rows = r => r.rows.length;

console.log('Persoane și firme');
await ok('profilurile s-au creat automat', async () => rows(await db.query('select * from persoane')) === 4);
await ok('Ștefan își creează firma', async () => {
  await as('stefan', `insert into firme (denumire, cui) values ('Conpro Solutions', 'RO123')`); });
await ok('Ștefan își leagă profilul de firmă', async () => {
  const r = await as('stefan', `update persoane set firma_id = (select id from firme limit 1), nume = 'Ștefan Cionca' where id = auth.uid()`);
  return r.affectedRows === 1; });
await refuses('nimeni nu-și schimbă emailul din aplicație', () =>
  as('stefan', `update persoane set email = 'altul@test.ro' where id = auth.uid()`));

console.log('Proiecte');
await ok('Ștefan creează un proiect (fără returning)', async () => {
  await as('stefan', `insert into proiecte (cod, denumire, data_cerere_ac, ac_emis_la, ac_valabil_pana, clasa_consecinte, stadiu_catuc)
                      values ('BLC01', 'Bloc locuințe Militari', '2026-09-10', '2026-09-30', '2027-09-30', 'CC2', 5)`); });
await ok('creatorul devine administrator', async () =>
  (await as('stefan', `select rol from membri_proiect`)).rows[0]?.rol === 'administrator');
await ok('regimul legal se calculează din data cererii (CATUC)', async () =>
  (await as('stefan', `select regim_legal from proiecte`)).rows[0].regim_legal === 'Legea 169/2026');
await ok('cererea din 24.08.2026 rămâne pe Legea 50/1991', async () => {
  await as('stefan', `insert into proiecte (cod, denumire, data_cerere_ac) values ('VECHI1', 'Lucrare veche', '2026-08-24')`);
  return (await as('stefan', `select regim_legal from proiecte where cod='VECHI1'`)).rows[0].regim_legal === 'Legea 50/1991'; });
await refuses('prelungirea autorizației peste 12 luni e refuzată', () =>
  as('stefan', `update proiecte set ac_prelungit_pana = '2028-10-30' where cod='BLC01'`));
await ok('prelungirea de 12 luni e acceptată', async () =>
  (await as('stefan', `update proiecte set ac_prelungit_pana = '2028-09-30' where cod='BLC01'`)).affectedRows === 1);
await ok('un străin nu vede proiectul', async () => rows(await as('strain', `select * from proiecte`)) === 0);
await ok('un străin nu-l poate modifica', async () =>
  (await as('strain', `update proiecte set denumire='hack' where cod='BLC01'`)).affectedRows === 0);
await ok('un străin nu se poate adăuga singur în echipă', async () => {
  try { await as('strain', `insert into membri_proiect (proiect_id, persoana_id, rol) select id, auth.uid(), 'administrator' from proiecte where cod='BLC01'`); }
  catch { /* refuzat */ }
  return rows(await db.query(`select * from membri_proiect where persoana_id=$1`, [U.strain])) === 0; });
await refuses('nu se poate crea proiect în numele altcuiva', () =>
  as('strain', `insert into proiecte (cod, denumire, creat_de) values ('ALTUL', 'Proiect fals', '${U.stefan}')`));

console.log('Invitații și roluri');
await ok('Ștefan invită beneficiarul și constructorul', async () => {
  await as('stefan', `insert into invitatii (proiect_id, email, rol) select id, 'benef@test.ro', 'beneficiar' from proiecte where cod='BLC01'`);
  await as('stefan', `insert into invitatii (proiect_id, email, rol) select id, 'constr@test.ro', 'constructor' from proiecte where cod='BLC01'`); });
await ok('beneficiarul își vede invitația înainte de acceptare', async () => rows(await as('benef', `select * from invitatii`)) === 1);
await ok('constructorul nu vede invitația beneficiarului', async () =>
  rows(await as('constr', `select * from invitatii where email='benef@test.ro'`)) === 0);
await ok('un cont neconfirmat pe același email nu preia invitația', async () => {
  await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [U.benef]);
  const n = (await as('benef', `select accepta_invitatiile() n`)).rows[0].n;
  const vede = rows(await as('benef', `select * from invitatii`));
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [U.benef]);
  return n === 0 && vede === 0; });
await ok('beneficiarul acceptă invitația la autentificare', async () =>
  (await as('benef', `select accepta_invitatiile() n`)).rows[0].n === 1);
await ok('constructorul acceptă invitația', async () => (await as('constr', `select accepta_invitatiile() n`)).rows[0].n === 1);
await ok('a doua acceptare nu dublează nimic', async () => (await as('benef', `select accepta_invitatiile() n`)).rows[0].n === 0);
await ok('beneficiarul vede proiectul (doar pe acesta)', async () => rows(await as('benef', `select * from proiecte`)) === 1);
await ok('beneficiarul nu modifică datele proiectului', async () =>
  (await as('benef', `update proiecte set denumire='x' where cod='BLC01'`)).affectedRows === 0);
await refuses('beneficiarul nu invită pe nimeni', () =>
  as('benef', `insert into invitatii (proiect_id, email, rol) select id, 'x@test.ro', 'cititor' from proiecte where cod='BLC01'`));
await ok('constructorul nu-și ridică singur rolul', async () =>
  (await as('constr', `update membri_proiect set rol='administrator' where persoana_id=auth.uid()`)).affectedRows === 0);
await ok('toți membrii văd echipa', async () => rows(await as('constr', `select * from membri_proiect`)) === 3);
await refuses('ultimul administrator nu-și poate schimba rolul', () =>
  as('stefan', `update membri_proiect set rol='diriginte' where persoana_id=auth.uid() and proiect_id=(select id from proiecte where cod='BLC01')`));
await refuses('ultimul administrator nu poate fi scos', () =>
  as('stefan', `delete from membri_proiect where persoana_id=auth.uid() and proiect_id=(select id from proiecte where cod='BLC01')`));
await ok('administratorul schimbă rolul altcuiva', async () =>
  (await as('stefan', `update membri_proiect set rol='diriginte' where persoana_id='${U.constr}'`)).affectedRows === 1);

console.log('Atestate și polițe');
await ok('Ștefan își adaugă autorizația ISC și polița', async () => {
  await as('stefan', `insert into documente_persoana (tip, numar, emitent, valabil_pana) values ('autorizatie_isc','12345','ISC','2029-01-01')`);
  await as('stefan', `insert into documente_persoana (tip, numar, emitent, valabil_pana) values ('polita_rc','P-77','Asigurător','2026-12-01')`); });
await ok('beneficiarul vede polița dirigintelui', async () => rows(await as('benef', `select * from documente_persoana`)) === 2);
await ok('un străin nu vede documentele', async () => rows(await as('strain', `select * from documente_persoana`)) === 0);
await refuses('nimeni nu adaugă documente în numele altcuiva', () =>
  as('benef', `insert into documente_persoana (persoana_id, tip) values ('${U.stefan}', 'atestat')`));
await ok('beneficiarul nu modifică polița altcuiva', async () =>
  (await as('benef', `update documente_persoana set valabil_pana='2099-01-01'`)).affectedRows === 0);
await ok('un străin nu vede profilul lui Ștefan', async () => rows(await as('strain', `select * from persoane where id='${U.stefan}'`)) === 0);
await ok('beneficiarul vede profilul lui Ștefan', async () => rows(await as('benef', `select * from persoane where id='${U.stefan}'`)) === 1);

console.log('Jurnal');
await ok('membrii văd istoricul proiectului', async () => rows(await as('benef', `select * from jurnal`)) > 3);
await ok('un străin nu vede istoricul', async () => rows(await as('strain', `select * from jurnal`)) === 0);
await refuses('nimeni nu scrie direct în jurnal', () => as('stefan', `insert into jurnal (tabel, operatie) values ('x','y')`));
await ok('jurnalul reține valoarea anterioară', async () => {
  const r = await as('stefan', `select inainte->>'rol' as rol from jurnal where tabel='membri_proiect' and operatie='UPDATE'`);
  return r.rows[0]?.rol === 'constructor'; });

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
