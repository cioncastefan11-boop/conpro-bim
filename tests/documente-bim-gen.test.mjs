// Teste pentru generarea EIR și BEP (src/lib/documenteBim.ts).
import { build } from 'esbuild';
import fs from 'node:fs';

fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
const out = new URL('./.build/documenteBim.mjs', import.meta.url);
await build({ entryPoints: [new URL('../src/lib/documenteBim.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out.pathname, logLevel: 'silent' });
const { htmlEir, htmlBep, lipsuri, textInHtml, textSectiune, SECTIUNI_EIR, SECTIUNI_BEP } = await import(out.href);

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}
const pers = (id, nume, email, firma) => ({ id, nume, email, telefon: null, firma_id: null, firme: firma ? { denumire: firma } : null });
const membri = [
  { proiect_id: 'p', persoana_id: 'u1', rol: 'administrator', zona: null, persoane: pers('u1', 'Ștefan Cionca', 'stefan@conpro.ro', 'Conpro Solutions') },
  { proiect_id: 'p', persoana_id: 'u2', rol: 'beneficiar', zona: null, persoane: pers('u2', 'Ana Pop', 'ana@primarie.ro', 'Primăria X') },
  { proiect_id: 'p', persoana_id: 'u3', rol: 'constructor', zona: 'Corp A', persoane: pers('u3', 'Radu Marin', 'radu@constructii.ro', 'Constructii SRL') },
  { proiect_id: 'p', persoana_id: 'u4', rol: 'proiectant', zona: null, persoane: pers('u4', 'Ioana Dobre', 'ioana@arh.ro', 'Arh & Co') },
  { proiect_id: 'p', persoana_id: 'u5', rol: 'cititor', zona: null, persoane: pers('u5', 'ISC', 'isc@isc.ro', null) },
];
const proiect = { id: 'p', cod: 'BLC01', denumire: 'Bloc <P+4>', adresa: 'Str. Lungă 1, Cluj', beneficiar: 'Primăria X', stadiu_catuc: 5, clasa_consecinte: 'CC2', ac_numar: '12/2026', ac_emis_la: '2026-02-01', ac_valabil_pana: '2027-02-01', ac_prelungit_pana: null,
  standard_info: { strict: true, cifre: 4, initiatori: [{ cod: 'SP', nume: 'Proiectant general' }, { cod: 'CS', nume: 'Constructor' }], volume: [{ cod: 'CA', nume: 'Corp A' }], niveluri: [{ cod: '00', nume: 'Parter' }] } };
const momente = [{ id: 'm1', cod: 'PTE', denumire: 'Aprobarea PTE', data_planificata: '2026-06-30' }, { id: 'm2', cod: 'REC', denumire: 'Recepția', data_planificata: '2027-09-30' }];
const livrabile = [
  { id: 'l1', cod: 'BLC01-SP-CA-00-DR-A-0001', titlu: 'Plan parter', initiator: 'SP', rol: 'A', tip: 'DR', moment_id: 'm1', termen: null, responsabil: 'u4', stare_ceruta: 'publicat', nivel_informatii: 'LOD 300' },
  { id: 'l2', cod: 'BLC01-SP-ZZ-ZZ-M3-A-0001', titlu: 'Model arhitectură', initiator: 'SP', rol: 'A', tip: 'M3', moment_id: 'm1', termen: '2026-06-15', responsabil: 'u4', stare_ceruta: 'partajat', nivel_informatii: null },
  { id: 'l3', cod: 'BLC01-CS-ZZ-ZZ-M3-W-0001', titlu: 'Model as-built', initiator: 'CS', rol: 'W', tip: 'M3', moment_id: 'm2', termen: null, responsabil: 'u3', stare_ceruta: 'publicat', nivel_informatii: null },
  { id: 'l4', cod: 'BLC01-CS-ZZ-ZZ-RP-W-0001', titlu: 'Raport', initiator: 'CS', rol: 'W', tip: 'RP', moment_id: null, termen: null, responsabil: null, stare_ceruta: 'publicat', nivel_informatii: null },
];
const reguli = [
  { denumire: 'Pereții spun dacă sunt exteriori', clasa: 'IFCWALL', tip_cerinta: 'proprietate', pset: 'Pset_WallCommon', proprietate: 'IsExternal', obligatorie: true, sursa: 'EIR' },
  { denumire: 'Ușile au rezistența la foc', clasa: 'IFCDOOR', tip_cerinta: 'proprietate', pset: 'Pset_DoorCommon', proprietate: 'FireRating', valoare: 'EI 30|EI 60', obligatorie: false, sursa: 'normativ' },
];
const cerinte = [
  { id: 'c1', categorie: 'echipament', camp: 'serie', aplicabil_la: null, titlu: null, cod_document: null, capitol: null, obligatorie: true },
  { id: 'c2', categorie: 'document', camp: null, aplicabil_la: null, titlu: 'Proiectul as-built', cod_document: 'BLC01-CS-ZZ-ZZ-DR-Z-0001', capitol: 'A', obligatorie: true },
];
const D = (extra = {}) => ({ proiect, membri, momente, livrabile, reguli, cerinte, sectiuni: {}, versiune: 3, actualizat_la: '2026-11-01T10:00:00Z', actualizat_de: 'u1', ...extra });
const nrCap = h => (h.match(/<h2>/g) ?? []).length;

console.log('Texte libere');
await ok('rândurile cu „-” devin listă, restul paragrafe', () => textInHtml('Intro\n- unu\n- doi\nFinal') === '<p>Intro</p><ul><li>unu</li><li>doi</li></ul><p>Final</p>');
await ok('textul e scăpat', () => textInHtml('a <b> & c') === '<p>a &lt;b&gt; &amp; c</p>');
await ok('secțiunea necompletată ia textul implicit, cea golită rămâne goală', () => textSectiune('eir', { sectiuni: {} }, 'scop') === SECTIUNI_EIR.find(s => s.cheie === 'scop').implicit && textSectiune('eir', { sectiuni: { scop: '' } }, 'scop') === '');

console.log('EIR');
const eir = htmlEir(D({ sectiuni: { scop: 'Scop propriu:\n- recepție\n- exploatare' } }));
await ok('documentul are coperta, cuprinsul și 11 capitole (fără „Alte” golit)', () => nrCap(htmlEir(D({ sectiuni: { alte: '' } }))) === 11 && eir.includes('Cuprins'));
await ok('cu „Alte cerințe” completat, 12 capitole', () => nrCap(eir) === 12);
await ok('denumirea proiectului e scăpată', () => eir.includes('Bloc &lt;P+4&gt;') && !eir.includes('<P+4>'));
await ok('versiunea și autorizația apar', () => eir.includes('<dd>3 · 01.11.2026</dd>') && eir.includes('nr. 12/2026 din 01.02.2026'));
await ok('textul propriu înlocuiește scopul implicit', () => eir.includes('<li>recepție</li>') && !eir.includes('coordonarea disciplinelor și verificarea interferențelor'));
await ok('partea care numește: beneficiarul și administratorul, fără constructor', () => { const cap = eir.split('Partea care numește')[2].split('<h2>')[0]; return cap.includes('Ana Pop') && cap.includes('Ștefan Cionca') && !cap.includes('Radu Marin'); });
await ok('momentele, cu numărul de livrabile', () => /<code>PTE<\/code><\/td><td>Aprobarea PTE<\/td><td>30\.06\.2026<\/td><td>2<\/td>/.test(eir));
await ok('convenția: exemplul de cod și listele', () => eir.includes('BLC01-SP-CA-00-DR-S-0001') && eir.includes('<code>CS</code> Constructor') && eir.includes('Se acceptă doar codurile'));
await ok('regulile modelului, cu variantele și opționalitatea', () => eir.includes('Pset_DoorCommon.FireRating = EI 30 sau EI 60') && eir.includes('recomandată') && eir.includes('BLC01-cerinte-model.ids'));
await ok('cerințele de predare pe echipamente și documente', () => eir.includes('Seria') && eir.includes('Proiectul as-built') && eir.includes('BLC01-CS-ZZ-ZZ-DR-Z-0001'));
await ok('fără reguli și cerințe: mesajele spun unde se completează', () => { const h = htmlEir(D({ reguli: [], cerinte: [], momente: [] })); return h.includes('Model 3D → Verificarea modelului') && h.includes('Cartea tehnică → Cerințele de predare') && h.includes('Documente → Planul de livrare'); });

console.log('BEP');
const bep = htmlBep(D());
await ok('12 capitole', () => nrCap(bep) === 12);
await ok('echipa de livrare fără cititori, cu firma și zona', () => { const cap = bep.split('Echipa de livrare')[2].split('<h2>')[0]; return cap.includes('Constructii SRL') && cap.includes('Corp A') && !cap.includes('isc@isc.ro'); });
await ok('managerul: administratorul, dacă nu e scris altul', () => bep.includes('Ștefan Cionca, Conpro Solutions (stefan@conpro.ro), administrator'));
await ok('managerul scris de mână are prioritate', () => htmlBep(D({ sectiuni: { manager: 'Mihai Ion, BIM manager' } })).includes('<p>Mihai Ion, BIM manager</p>'));
await ok('matricea: echipă × disciplină pe momente, cu „fără moment”', () => { const cap = bep.split('Matricea de responsabilități')[2].split('<h2>')[0]; return cap.includes('Proiectant general') && cap.includes('Ioana Dobre') && /<td>2<\/td><td><\/td><td><\/td>/.test(cap) && cap.includes('—<br>'); });
await ok('MIDP pe momente, cu termenul livrabilului sau al momentului', () => bep.includes('PTE · Aprobarea PTE · 30.06.2026') && bep.includes('<td>15.06.2026</td>') && bep.includes('LOD 300') && bep.includes('<td>Partajat</td>'));
await ok('răspunsul la EIR: fiecare regulă și cerință cu modul de asigurare', () => bep.includes('verificată cu fișierul IDS') && bep.includes('completată de constructor în COBie') && bep.includes('publicat înainte de recepție'));
await ok('volumele și nivelurile la federare', () => bep.includes('<code>CA</code> Corp A') && bep.includes('<code>00</code> Parter'));

console.log('Ce lipsește');
await ok('proiectul complet: la EIR nimic', () => lipsuri('eir', D()).length === 0);
await ok('la BEP: software-ul implicit trebuie completat', () => { const l = lipsuri('bep', D()); return l.length === 1 && l[0].text.includes('Software'); });
await ok('cu software scris, BEP-ul e complet', () => lipsuri('bep', D({ sectiuni: { software: '- Revit 2026' } })).length === 0);
await ok('proiect gol: lipsurile spun unde se completează', () => {
  const l = lipsuri('eir', D({ proiect: { ...proiect, beneficiar: null, standard_info: null }, momente: [], reguli: [], cerinte: [] }));
  return l.length === 5 && l.some(x => x.unde === 'model/verificare') && l.some(x => x.unde === 'carte');
});
await ok('BEP fără administrator și fără manager: îl cere', () => lipsuri('bep', D({ membri: membri.filter(m => m.rol !== 'administrator'), livrabile: [] })).some(x => x.text.includes('managerul')));
await ok('fiecare secțiune are titlu și ajutor', () => [...SECTIUNI_EIR, ...SECTIUNI_BEP].every(s => s.titlu && s.ajutor));

fs.writeFileSync(new URL('./.build/eir-exemplu.html', import.meta.url), eir);
fs.writeFileSync(new URL('./.build/bep-exemplu.html', import.meta.url), bep);
console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
