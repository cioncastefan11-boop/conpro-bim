// Teste pentru evaluarea cerințelor de predare (src/lib/cerinte.ts).
import { build } from 'esbuild';
import fs from 'node:fs';
const out = new URL('./.build/cerinte.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../src/lib/cerinte.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out.pathname, logLevel: 'silent' });
const { evalueazaCerinte, CERINTE_TIP } = await import(out.href);
let pass = 0, fail = 0;
async function ok(name, fn) { try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '→', e.message); } }
const c = (x) => ({ id: Math.random() + '', proiect_id: 'p', camp: null, aplicabil_la: null, titlu: null, cod_document: null, cuvinte: null, capitol: null, sursa: 'AIR', obligatorie: true, ordine: 0, ...x });
const d = {
  tipuri: [{ id: 't1', denumire: 'Centrală termică', categorie: 'Încălzire', producator: 'X', model: null, garantie_luni: 24, interval_mentenanta_luni: 12, instructiuni_mentenanta: null },
           { id: 't2', denumire: 'Ventilator', categorie: 'Ventilare', producator: null, model: 'V1', garantie_luni: null, interval_mentenanta_luni: null, instructiuni_mentenanta: 'Curățare anuală' }],
  echipamente: [{ id: 'e1', tip_id: 't1', cod: 'CT-01', serie: 'S1', incapere_id: 'i1', data_punere_functiune: '2026-10-01', garantie_start: null },
                { id: 'e2', tip_id: 't2', cod: 'VE-01', serie: null, incapere_id: null, data_punere_functiune: null, garantie_start: null }],
  atasamente: [{ entitate: 'tip_echipament', entitate_id: 't1', tip_document: 'fisa_tehnica' }, { entitate: 'echipament', entitate_id: 'e2', tip_document: 'manual' }],
  documente: [{ id: 'dc1', capitol: 'A', titlu: 'Proiect As-Built arhitectură' }],
  documenteProiect: [{ id: 'd1', cod: 'BLC01-SP-ZZ-ZZ-M3-A-0090', titlu: 'Model as-built' }, { id: 'd2', cod: 'BLC01-SP-ZZ-ZZ-DR-A-0001', titlu: 'Plan parter' }],
  revizii: [{ document_id: 'd1', stare: 'partajat' }, { document_id: 'd2', stare: 'publicat' }],
};
const r = (x) => evalueazaCerinte(d, [c(x)])[0];
console.log('Echipamente');
await ok('seria: 1 din 2, lipsește VE-01', async () => { const x = r({ categorie: 'echipament', camp: 'serie' }); return x.bune === 1 && x.lipsa.join() === 'VE-01' && !x.indeplinita; });
await ok('garanția ia începutul din punerea în funcțiune', async () => r({ categorie: 'echipament', camp: 'garantie', aplicabil_la: 'incalzire' }).indeplinita);
await ok('filtrul pe categorie, fără diacritice', async () => r({ categorie: 'echipament', camp: 'producator', aplicabil_la: 'Încălzire' }).total === 1);
await ok('fișa tehnică atașată la tip contează', async () => r({ categorie: 'echipament', camp: 'fisa_tehnica' }).lipsa.join() === 'VE-01');
await ok('instrucțiunile: text la tip sau manual atașat', async () => r({ categorie: 'echipament', camp: 'instructiuni' }).lipsa.join() === 'CT-01');
await ok('fără echipamente în categorie, cerința nu e îndeplinită', async () => !r({ categorie: 'echipament', camp: 'serie', aplicabil_la: 'lift' }).indeplinita);
console.log('Documente');
await ok('după cuvinte, în Cartea tehnică', async () => r({ categorie: 'document', titlu: 'As-built', cuvinte: 'as-built', capitol: 'A' }).indeplinita);
await ok('capitolul greșit nu se potrivește', async () => !r({ categorie: 'document', titlu: 'As-built', cuvinte: 'as-built, xx', capitol: 'D' }).indeplinita);
await ok('codul exact: există, dar doar partajat', async () => { const x = r({ categorie: 'document', titlu: 'Model', cod_document: 'BLC01-SP-ZZ-ZZ-M3-A-0090' }); return !x.indeplinita && /nu e publicat/.test(x.detalii); });
await ok('codul exact publicat', async () => r({ categorie: 'document', titlu: 'Plan', cod_document: 'BLC01-SP-ZZ-ZZ-DR-A-0001' }).indeplinita);
await ok('setul tip are 9 câmpuri COBie și 5 documente', async () => CERINTE_TIP.filter(x => x.categorie === 'echipament').length === 9 && CERINTE_TIP.filter(x => x.categorie === 'document').length === 5);
console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
