// Teste pentru încărcarea mai multor documente (src/lib/incarcare.ts).
import { build } from 'esbuild';
import fs from 'node:fs';

const out = new URL('./.build/incarcare.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../src/lib/incarcare.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out.pathname, logLevel: 'silent' });
const { recunoaste, evalueaza } = await import(out.href);

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}

console.log('Recunoașterea codului din numele fișierului');
const a = recunoaste('BLC01-SP-ZZ-01-DR-S-0101-P02 - Plan cofraj placă.pdf', 'BLC01');
await ok('cod complet, cu revizie și titlu', () => a.recunoscut && a.initiator === 'SP' && a.nivel === '01' && a.tip === 'DR' && a.rol === 'S' && a.numar === '0101' && a.revizie === 'P02' && a.titlu === 'Plan cofraj placă');
const b = recunoaste('sp_zz_00_m3_a_0001_C01_Model_arhitectura.ifc', 'BLC01');
await ok('fără codul proiectului, cu liniuțe jos și litere mici', () => b.recunoscut && b.tip === 'M3' && b.revizie === 'C01' && b.titlu === 'Model arhitectura');
const c = recunoaste('BLC01-CV-A-B1-SH-W-000123.xlsx', 'BLC01');
await ok('fără revizie și fără titlu, număr de 6 cifre', () => c.recunoscut && c.volum === 'A' && c.nivel === 'B1' && c.numar === '000123' && c.revizie === null && c.titlu === '');
const d = recunoaste('Releveu fatada nord.dwg', 'BLC01');
await ok('un nume fără cod nu e recunoscut; tipul se propune după extensie', () => !d.recunoscut && d.tip === 'DR' && d.titlu === 'Releveu fatada nord');
await ok('un model .ifc fără cod devine M3', () => recunoaste('model.ifc', 'BLC01').tip === 'M3');
await ok('tipurile și disciplinele inexistente nu sunt luate drept cod', () => !recunoaste('BLC01-SP-ZZ-01-QQ-S-0101.pdf', 'BLC01').recunoscut);

console.log('Ce se întâmplă cu fiecare fișier');
const rand = (x) => ({ initiator: 'SP', volum: 'ZZ', nivel: '01', tip: 'DR', rol: 'S', numar: '0101', titlu: 'Plan', revizie: '', recunoscut: true, cheie: 'k', fisiere: [], actiune: 'eroare', documentId: null, revizieId: null, mesaj: null, ...x });
const doc = { id: 'd1', cod: 'BLC01-SP-ZZ-01-DR-S-0101', titlu: 'Plan cofraj', creat_de: 'u1', autor_rol: 'proiectant' };
const rv = (stare, revizie) => ({ id: 'r-' + revizie, document_id: 'd1', revizie, stare });
const echipaMea = () => true;
await ok('cod nou → document nou, cu P01', () => { const r = evalueaza(rand({ numar: '0102' }), 'BLC01', [doc], [], {}, echipaMea); return r.actiune === 'document_nou' && r.revizie === 'P01'; });
await ok('document existent, ultima publicată → revizie nouă C', () => { const r = evalueaza(rand({}), 'BLC01', [doc], [rv('publicat', 'C01')], {}, echipaMea); return r.actiune === 'revizie_noua' && r.revizie === 'C02'; });
await ok('revizia din numele fișierului e păstrată dacă e liberă', () => evalueaza(rand({ revizie: 'P05' }), 'BLC01', [doc], [rv('partajat', 'P01')], {}, echipaMea).revizie === 'P05');
await ok('există o revizie în lucru → fișierul se adaugă la ea', () => { const r = evalueaza(rand({}), 'BLC01', [doc], [rv('wip', 'P02')], {}, echipaMea); return r.actiune === 'adauga_la_wip' && r.revizieId === 'r-P02'; });
await ok('documentul altei echipe nu se modifică', () => evalueaza(rand({}), 'BLC01', [doc], [], {}, () => false).actiune === 'eroare');
await ok('o revizie la aprobare blochează încărcarea', () => evalueaza(rand({}), 'BLC01', [doc], [rv('publicare_ceruta', 'P02')], {}, echipaMea).actiune === 'eroare');
const strict = { strict: true, cifre: 4, initiatori: [{ cod: 'SP', nume: '' }], niveluri: [{ cod: '00', nume: '' }] };
await ok('convenția strictă se aplică și aici', () => evalueaza(rand({ numar: '0102' }), 'BLC01', [], [], strict, echipaMea).mesaj?.includes('convenția'));
await ok('un document nou fără titlu cere titlul', () => evalueaza(rand({ numar: '0109', titlu: ' ' }), 'BLC01', [], [], {}, echipaMea).mesaj === 'Scrieți titlul documentului.');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
