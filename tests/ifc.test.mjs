// Teste pentru citirea modelelor IFC (src/lib/ifc.ts) pe modelele de exemplu buildingSMART.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { IfcAPI } from 'web-ifc';

const out = new URL('./.build/ifc.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../src/lib/ifc.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out.pathname, logLevel: 'silent' });
const { citesteStructura, proprietati, prefixClasa } = await import(out.href);
const out2 = new URL('./.build/cobieIfc.mjs', import.meta.url);
await build({ entryPoints: [new URL('../src/lib/cobieIfc.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out2.pathname, logLevel: 'silent' });
const { planificaImport } = await import(out2.href);

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}

const api = new IfcAPI();
api.SetWasmPath(path.dirname(new URL(import.meta.resolve('web-ifc')).pathname) + '/', true);
await api.Init();
const dir = new URL('./modele/', import.meta.url);
const deschide = f => api.OpenModel(new Uint8Array(fs.readFileSync(new URL(f, dir))));

console.log('Arhitectură');
const A = deschide('Building-Architecture.ifc');
const sa = citesteStructura(api, A);
await ok('schema IFC4', () => sa.schema === 'IFC4');
await ok('găsește nivelurile, ordonate după cotă', () => sa.niveluri.length >= 1 && sa.niveluri.every((n, i, a) => i === 0 || (n.cota ?? 0) >= (a[i - 1].cota ?? 0)));
await ok('găsește spațiile și nivelul lor', () => sa.spatii.length >= 1 && sa.spatii.every(sp => sp.nivelGuid));
await ok('fiecare nivel și spațiu are GlobalId', () => [...sa.niveluri, ...sa.spatii].every(x => x.guid && x.guid.length >= 20));
await ok('elementele sunt legate de niveluri', () => sa.nivelElement.size > 0);
const perete = api.GetLineIDsWithType(A, 2391406946).get(0); // IFCWALL
await ok('proprietățile unui perete: clasa, GlobalId și seturile', async () => {
  const p = await proprietati(api, A, perete);
  return p.clasa.toUpperCase() === 'IFCWALL' && p.guid.length >= 20 && p.grupuri.length >= 2;
});

console.log('Instalații (HVAC)');
const H = deschide('Building-Hvac.ifc');
const sh = citesteStructura(api, H);
await ok('găsește gurile de aer ca echipamente pentru COBie', () => sh.echipamente.length >= 2 && sh.echipamente.every(e => e.clasa === 'IFCAIRTERMINAL'));
await ok('echipamentele au tip și nivel', () => sh.echipamente.every(e => e.tipNume && e.nivelGuid));

console.log('Structură');
const S = deschide('Building-Structural.ifc');
const ss = citesteStructura(api, S);
await ok('modelul de structură nu are echipamente', () => ss.echipamente.length === 0);
await ok('unitatea de lungime e citită', () => [0.001, 0.01, 0.1, 1].includes(ss.unitateLungime));

console.log('Preluarea în COBie');
const gol = { niveluri: [], incaperi: [], tipuri: [], echipamente: [] };
const plan = planificaImport([sa, ss, sh], gol);
await ok('același nivel din trei discipline devine un singur nivel', () => plan.niveluri.length === 1 && plan.niveluri[0].cod === '00');
await ok('spațiile devin încăperi pe nivelul lor', () => plan.incaperi.length === 2 && plan.incaperi.every(i => i.nivelGuid === plan.niveluri[0].guid));
await ok('gurile de aer devin echipamente, cu tipul lor și categoria „Ventilare”', () =>
  plan.echipamente.length === 2 && plan.tipuri.length >= 1 && plan.tipuri.every(t => t.categorie === 'Ventilare și climatizare'));
await ok('codurile echipamentelor sunt scurte și unice (etichetele lungi din model nu se folosesc)', () =>
  plan.echipamente.every(e => e.cod.length <= 20) && new Set(plan.echipamente.map(e => e.cod)).size === plan.echipamente.length);
const dupa = planificaImport([sa, ss, sh], {
  niveluri: plan.niveluri.map(n => ({ id: 'n', cod: n.cod, ifc_guid: n.guid })),
  incaperi: plan.incaperi.map(i => ({ id: 'i', cod: i.cod, ifc_guid: i.guid })),
  tipuri: plan.tipuri.map(t => ({ id: 't', denumire: t.denumire, ifc_guid: t.guid })),
  echipamente: plan.echipamente.map(e => ({ id: 'e', cod: e.cod, ifc_guid: e.guid })),
});
await ok('o a doua preluare nu dublează nimic', () => dupa.niveluri.length === 0 && dupa.incaperi.length === 0 && dupa.echipamente.length === 0
  && dupa.existente.echipamente === 2);
const cuCod = planificaImport([sa], { ...gol, incaperi: [{ id: 'x', cod: 'living room', ifc_guid: null }] });
await ok('un cod de încăpere deja folosit primește sufix', () => cuCod.incaperi.some(i => i.cod === 'living room-2'));

console.log('Diverse');
await ok('prefixe pentru coduri: IFCAIRTERMINAL → AT, IFCPUMP → PO', () => prefixClasa('IfcAirTerminal') === 'AT' && prefixClasa('IFCPUMP') === 'PO');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
