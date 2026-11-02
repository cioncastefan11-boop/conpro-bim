// Teste pentru starea execuției pe model (src/lib/executie.ts).
import { build } from 'esbuild';
import fs from 'node:fs';
const out = new URL('./.build/executie.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../src/lib/executie.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out.pathname, logLevel: 'silent' });
const { stariElemente, trasabilitate, numaraStari } = await import(out.href);
let pass = 0, fail = 0;
async function ok(name, fn) { try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '→', e.message); } }

const d = {
  pvs: [{ id: 'pv1', numar: 1, stare: 'semnat' }, { id: 'pv2', numar: 2, stare: 'in_semnare' }, { id: 'pv3', numar: 3, stare: 'anulat' }],
  turnari: [{ id: 't1', numar: 5 }],
  legaturi: [
    { entitate: 'pv', entitate_id: 'pv1', guid: 'A' }, { entitate: 'turnare', entitate_id: 't1', guid: 'A' },
    { entitate: 'pv', entitate_id: 'pv2', guid: 'B' }, { entitate: 'turnare', entitate_id: 't1', guid: 'C' },
    { entitate: 'pv', entitate_id: 'pv3', guid: 'D' }, { entitate: 'fam', entitate_id: 'f1', guid: 'E' },
  ],
  executate: [{ guid: 'F', executat_la: '2026-10-01' }, { guid: 'B', executat_la: '2026-10-02' }],
  observatii: [{ id: 'o1', numar: 1, stare: 'deschisa', elemente: [{ guid: 'A' }] }, { id: 'o2', numar: 2, stare: 'inchisa', elemente: [{ guid: 'C' }] }],
};
const m = stariElemente(d);
console.log('Starea execuției');
await ok('observația deschisă are prioritate față de PV-ul semnat', async () => m.get('A') === 'observatie');
await ok('PV-ul în semnare = în verificare (peste marcajul executat)', async () => m.get('B') === 'in_verificare');
await ok('turnarea = executat; observația închisă nu mai contează', async () => m.get('C') === 'executat');
await ok('PV-ul anulat și FAM-ul nu dau stare', async () => !m.has('D') && !m.has('E'));
await ok('marcajul executat', async () => m.get('F') === 'executat');
await ok('fără observație, PV-ul semnat = verificat', async () => stariElemente({ ...d, observatii: [] }).get('A') === 'verificat');
await ok('legenda numără corect', async () => { const n = numaraStari(m); return n.observatie === 1 && n.in_verificare === 1 && n.executat === 2 && n.verificat === 0; });
await ok('trasabilitatea unui element', async () => { const t = trasabilitate(d, 'A'); return t.pvs[0].numar === 1 && t.turnari[0].numar === 5 && t.observatii.length === 1 && t.executat === null; });
console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
