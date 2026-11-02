// Teste pentru verificarea modelelor după reguli (src/lib/verificareIfc.ts) și fișierele IDS 1.0 (src/lib/ids.ts).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { IfcAPI } from 'web-ifc';
import { DOMParser } from '@xmldom/xmldom';

fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
const bundle = async (src, nume) => {
  const out = new URL(`./.build/${nume}.mjs`, import.meta.url);
  await build({ entryPoints: [new URL(`../src/lib/${src}`, import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out.pathname, logLevel: 'silent' });
  return import(out.href);
};
const { verificaModel, reunesteRezultate, sumar, valoareaPotrivita } = await bundle('verificareIfc.ts', 'verificareIfc');
const { exportaIds, importaIds, SABLOANE, descrieCerinta } = await bundle('ids.ts', 'ids');
const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}
const api = new IfcAPI();
api.SetWasmPath(path.dirname(new URL(import.meta.resolve('web-ifc')).pathname) + '/', true);
await api.Init();
const deschide = f => api.OpenModel(new Uint8Array(fs.readFileSync(new URL(`./modele/${f}`, import.meta.url))));
const M = deschide('Verificare-reguli.ifc');
const unu = r => verificaModel(api, M, [r])[0];
const neconf = r => r.nu_trec.map(x => x.guid.slice(0, 3)).sort().join(',');

console.log('Valori');
await ok('gol = doar să existe', () => valoareaPotrivita('orice', null));
await ok('fără majuscule', () => valoareaPotrivita('True', 'TRUE'));
await ok('una dintre variante', () => valoareaPotrivita('EI 60', 'EI 30|EI 60') && !valoareaPotrivita('EI 90', 'EI 30|EI 60'));
await ok('numerele se compară ca numere', () => valoareaPotrivita('18.5', '18.50') && !valoareaPotrivita('18.6', '18.5'));

console.log('Reguli pe modelul de test');
await ok('IfcWall include și IfcWallStandardCase', () => unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'nivel' }).verificate === 3);
await ok('proprietatea: pe element sau moștenită din tip', () => { const r = unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'proprietate', pset: 'Pset_WallCommon', proprietate: 'IsExternal' }); return r.trec === 2 && neconf(r) === '0W3'; });
await ok('booleanul IFC se citește true / false', () => { const r = unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'proprietate', pset: 'Pset_WallCommon', proprietate: 'IsExternal', valoare: 'true' }); return r.trec === 1 && r.nu_trec.find(x => x.guid.startsWith('0W2')).motiv.includes('false'); });
await ok('motivul spune ce lipsește', () => { const r = unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'proprietate', pset: 'Pset_WallCommon', proprietate: 'FireRating' }); return r.nu_trec.find(x => x.guid.startsWith('0W1')).motiv === 'lipsește Pset_WallCommon.FireRating' && r.nu_trec.find(x => x.guid.startsWith('0W3')).motiv === 'lipsește setul Pset_WallCommon'; });
await ok('cantitățile (Qto) se verifică la fel', () => unu({ denumire: 'x', clasa: 'IFCSPACE', tip_cerinta: 'proprietate', pset: 'Qto_SpaceBaseQuantities', proprietate: 'NetFloorArea', valoare: '18.5' }).trec === 1);
await ok('atributul necompletat', () => { const r = unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'atribut', proprietate: 'Tag' }); return neconf(r) === '0W3' && r.nu_trec[0].motiv === 'Tag necompletat'; });
await ok('LongName la spații', () => neconf(unu({ denumire: 'x', clasa: 'IFCSPACE', tip_cerinta: 'atribut', proprietate: 'LongName' })) === '0S2');
await ok('materialul: direct sau din straturi', () => neconf(unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'material' })) === '0W3');
await ok('materialul cerut, după nume', () => neconf(unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'material', valoare: 'gips|beton' })) === '0W3' && neconf(unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'material', valoare: 'gips' })) === '0W1,0W3');
await ok('clasificarea și sistemul ei', () => neconf(unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'clasificare', valoare: 'Uniclass' })) === '0W2,0W3' && unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'clasificare', valoare: 'OmniClass' }).trec === 0);
await ok('nivelul: element conținut sau spațiu agregat', () => neconf(unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'nivel' })) === '0W3' && unu({ denumire: 'x', clasa: 'IFCSPACE', tip_cerinta: 'nivel' }).trec === 2);
await ok('nivelul cerut, după nume', () => neconf(unu({ denumire: 'x', clasa: 'IFCSPACE', tip_cerinta: 'nivel', valoare: 'Parter' })) === '0S2');
await ok('GlobalId-urile care trec, pentru colorare', () => unu({ denumire: 'x', clasa: 'IFCWALL', tip_cerinta: 'nivel' }).trec_guid.map(g => g.slice(0, 3)).sort().join() === '0W1,0W2');
await ok('filtrul după PredefinedType', () => unu({ denumire: 'x', clasa: 'IFCWALL', predefinit: 'partitioning', tip_cerinta: 'atribut', proprietate: 'Name' }).verificate === 1);
await ok('clasa care lipsește din model nu dă erori', () => unu({ denumire: 'x', clasa: 'IFCPUMP', tip_cerinta: 'material' }).verificate === 0);
await ok('clasa necunoscută nici ea', () => unu({ denumire: 'x', clasa: 'IFCNIMIC', tip_cerinta: 'material' }).verificate === 0);
await ok('rezultatul păstrează regula și GlobalId-urile', () => { const r = unu({ id: 'r1', denumire: 'Pereți pe nivel', clasa: 'IFCWALL', tip_cerinta: 'nivel', obligatorie: false }); return r.regula_id === 'r1' && r.obligatorie === false && r.nu_trec[0].guid === '0W3aaaaaaaaaaaaaaaaaaa'; });
await ok('sumarul numără elementele neconforme o singură dată, doar la regulile obligatorii', () => {
  const rez = verificaModel(api, M, [
    { denumire: 'a', clasa: 'IFCWALL', tip_cerinta: 'nivel' }, { denumire: 'b', clasa: 'IFCWALL', tip_cerinta: 'atribut', proprietate: 'Tag' },
    { denumire: 'c', clasa: 'IFCWALL', tip_cerinta: 'clasificare', obligatorie: false }]);
  const s = sumar(rez); return s.neconforme === 1 && s.verificari === 9 && s.trec === 5 && s.procent === 56;
});

console.log('Modelele buildingSMART');
const toate = SABLOANE.flatMap(s => s.reguli);
const rezultate = ['Building-Architecture.ifc', 'Building-Structural.ifc', 'Building-Hvac.ifc'].map(f => verificaModel(api, deschide(f), toate));
await ok('șabloanele rulează pe toate modelele', () => rezultate.every(r => r.length === toate.length));
await ok('spațiile din arhitectură au cod, nume și nivel', () => rezultate[0].filter(r => r.denumire.startsWith('Spațiile')).every(r => r.verificate === 2 && r.trec === 2));
await ok('pereții lor nu au Pset_WallCommon', () => { const r = rezultate[0].find(x => x.denumire === 'Pereții spun dacă sunt exteriori'); return r.verificate === 4 && r.trec === 0; });
await ok('terminalele HVAC nu au producătorul', () => rezultate[2].find(x => x.denumire === 'Terminalele de aer au producătorul').trec === 0);
await ok('rezultatele pe mai multe modele se adună', () => { const r = reunesteRezultate(rezultate).find(x => x.denumire === 'Pereții au material'); return r.verificate === 8 && r.trec === 8 && r.trec_guid.length === 8; });

console.log('IDS 1.0');
const reguli = [
  { denumire: 'Pereții exteriori & portanți', clasa: 'IFCWALL', predefinit: 'STANDARD', tip_cerinta: 'proprietate', pset: 'Pset_WallCommon', proprietate: 'IsExternal', valoare: 'TRUE', sursa: 'EIR' },
  { denumire: 'Ușile EI', clasa: 'IFCDOOR', tip_cerinta: 'proprietate', pset: 'Pset_DoorCommon', proprietate: 'FireRating', valoare: 'EI 30|EI 60', obligatorie: false },
  { denumire: 'Spațiile au cod', clasa: 'IFCSPACE', tip_cerinta: 'atribut', proprietate: 'Name' },
  { denumire: 'Clasificare', clasa: 'IFCWALL', tip_cerinta: 'clasificare', valoare: 'Uniclass 2015' },
  { denumire: 'Material', clasa: 'IFCCOLUMN', tip_cerinta: 'material', valoare: 'Beton' },
  { denumire: 'Stâlpi pe nivel', clasa: 'IFCCOLUMN', tip_cerinta: 'nivel' },
  { denumire: 'Spații pe nivel', clasa: 'IFCSPACE', tip_cerinta: 'nivel', obligatorie: false, sursa: 'normativ' },
  { denumire: 'Orice clasificare', clasa: 'IFCSLAB', tip_cerinta: 'clasificare' },
];
const xml = exportaIds(reguli, { titlu: 'Cerințe <BLC01>', autor: 'stefan@conpro.ro', data: '2026-11-02', proiect: 'Bloc' });
const d = parse(xml);
const toateEl = n => Array.from(d.getElementsByTagName(n));
await ok('XML bine format, în spațiul de nume IDS', () => d.documentElement.localName === 'ids' && d.documentElement.namespaceURI === 'http://standards.buildingsmart.org/IDS');
await ok('o specificație pe regulă, pentru IFC2X3 și IFC4', () => toateEl('ids:specification').length === 8 && toateEl('ids:specification').every(s => s.getAttribute('ifcVersion') === 'IFC2X3 IFC4'));
await ok('caracterele speciale sunt scăpate', () => toateEl('ids:title')[0].textContent === 'Cerințe <BLC01>' && toateEl('ids:specification')[0].getAttribute('name') === 'Pereții exteriori & portanți');
await ok('booleanul are tipul IFCBOOLEAN și valoarea „true”', () => { const p = toateEl('ids:property')[0]; return p.getAttribute('dataType') === 'IFCBOOLEAN' && p.getElementsByTagName('ids:value')[0].textContent.trim() === 'true'; });
await ok('variantele devin enumerare XSD', () => toateEl('xs:enumeration').map(e => e.getAttribute('value')).join() === 'EI 30,EI 60');
await ok('regula opțională are cardinality="optional"', () => toateEl('ids:property')[1].getAttribute('cardinality') === 'optional');
await ok('nivelul: partOf IfcBuildingStorey (conținere la elemente, agregare la spații)', () => { const p = toateEl('ids:partOf'); return p[0].getAttribute('relation') === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' && p[1].getAttribute('relation') === 'IFCRELAGGREGATES'; });
await ok('ordinea elementelor din info e cea din schemă', () => Array.from(toateEl('ids:info')[0].childNodes).filter(n => n.nodeType === 1).map(n => n.localName).join() === 'title,copyright,version,author,date,purpose');
await ok('partOf rămâne „required” (IDS nu permite altceva), opționalitatea trece în descriere', () => toateEl('ids:partOf')[1].getAttribute('cardinality') === 'required' && toateEl('ids:specification')[6].getAttribute('description') === 'Sursa: normativ. Recomandat (neobligatoriu)');
await ok('clasificarea fără sistem anume: tiparul .*', () => toateEl('ids:classification')[1].getElementsByTagName('xs:pattern')[0].getAttribute('value') === '.*');
await ok('autorul invalid (nu e e-mail) nu se scrie', () => !exportaIds(reguli, { titlu: 't', autor: 'Stefan' }).includes('ids:author'));

const inapoi = importaIds(xml, parse);
await ok('importul reface toate regulile', () => inapoi.reguli.length === 8 && inapoi.ignorate.length === 0 && inapoi.titlu === 'Cerințe <BLC01>');
await ok('… cu aceleași câmpuri', () => inapoi.reguli.every((r, i) => {
  const a = reguli[i];
  return r.denumire === a.denumire && r.clasa === a.clasa && r.tip_cerinta === a.tip_cerinta && (r.pset ?? null) === (a.pset ?? null)
    && (r.proprietate ?? null) === (a.tip_cerinta === 'atribut' || a.tip_cerinta === 'proprietate' ? a.proprietate : null) && (r.obligatorie !== false) === (a.obligatorie !== false)
    && (r.valoare ?? '').toLowerCase() === (a.valoare ?? '').toLowerCase() && (r.predefinit ?? null) === (a.predefinit ?? null)
    && r.sursa === (a.sursa ?? 'EIR');
}));
const strain = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Din Solibri</title></info><specifications>
<specification name="Pereți" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
<requirements><property cardinality="required"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>LoadBearing</simpleValue></baseName></property>
<attribute cardinality="optional"><name><simpleValue>Description</simpleValue></name></attribute>
<property cardinality="required"><propertySet><xs:restriction base="xs:string"><xs:pattern value="Pset_.*"/></xs:restriction></propertySet><baseName><simpleValue>X</simpleValue></baseName></property>
<material cardinality="prohibited"/></requirements></specification>
<specification name="Toate" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><xs:restriction base="xs:string"><xs:pattern value="IFC.*"/></xs:restriction></name></entity></applicability><requirements><attribute cardinality="required"><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification>
</specifications></ids>`;
const imp = importaIds(strain, parse);
await ok('IDS din alt program, fără prefix: se preiau cerințele simple', () => imp.reguli.length === 2 && imp.reguli[0].denumire === 'Pereți (1)' && imp.reguli[1].obligatorie === false && imp.reguli[1].proprietate === 'Description');
await ok('… iar tiparele, „interzis” și clasele multiple se raportează', () => imp.ignorate.length === 3 && imp.ignorate.some(x => x.includes('interzis')) && imp.ignorate.some(x => x.includes('Toate')));
await ok('descrierea scurtă a cerinței', () => descrieCerinta(reguli[1]) === 'Pset_DoorCommon.FireRating = EI 30 sau EI 60' && descrieCerinta(reguli[5]) === 'așezat pe un nivel');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
