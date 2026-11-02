// Teste pentru exportul și importul BCF 2.1 (src/lib/bcf.ts): dus-întors și un fișier scris de alt program.
import { build } from 'esbuild';
import fs from 'node:fs';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const out = new URL('./.build/bcf.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../src/lib/bcf.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out.pathname, logLevel: 'silent', packages: 'external' });
const { exportaBcf, importaBcf, tipDinBcf, stareDinBcf } = await import(out.href);
const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}

const t = {
  guid: '6f9f8a2e-3b1c-4c55-9d1e-0a1b2c3d4e5f', tip: 'intrebare', stare: 'in_lucru', prioritate: 'mare', titlu: 'Golul din placă & grinda <G3>',
  descriere: 'Se poate muta golul cu 30 cm spre axul 4?', termen: '2026-12-01', atribuit: 'ana@studio.ro', creat: '2026-11-02T09:15:00Z',
  autor: 'radu@constructii.ro', index: 7, etichete: ['Structură', 'Etaj 1'],
  comentarii: [{ guid: '11111111-2222-3333-4444-555555555555', data: '2026-11-02T10:00:00Z', autor: 'ana@studio.ro', text: 'Da, cu bordajul din detaliul D7.' }],
  punct_vedere: { camera_view_point: [12.5, -4, 9.25], camera_direction: [-0.6, 0.7, -0.38], camera_up_vector: [0, 0, 1], field_of_view: 55 },
  elemente: ['2O2Fr$t4X7Zf8NOew3FLOH', '1hOSvn6df7F8_7GcBWlRGQ'], snapshot: new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
};

console.log('Exportul');
const bin = await exportaBcf([t, { ...t, guid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', titlu: 'Fără vedere', punct_vedere: null, elemente: [], snapshot: null, comentarii: [] }], { id: 'p1', nume: 'Bloc test' });
const zip = await JSZip.loadAsync(bin);
await ok('are bcf.version 2.1 și câte un dosar pe topic', async () => (await zip.file('bcf.version').async('string')).includes('VersionId="2.1"') && !!zip.file(`${t.guid}/markup.bcf`) && !!zip.file('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/markup.bcf'));
await ok('markup-ul e XML valid, cu caracterele speciale escapate', async () => {
  const x = await zip.file(`${t.guid}/markup.bcf`).async('string');
  const d = parse(x); return d.getElementsByTagName('Title')[0].textContent === 'Golul din placă & grinda <G3>' && x.includes('TopicType="Request"') && x.includes('TopicStatus="In Progress"');
});
await ok('vederea are camera, elementele selectate și captura', async () => {
  const v = await zip.file(`${t.guid}/viewpoint.bcfv`).async('string');
  return v.includes('<FieldOfView>55</FieldOfView>') && v.includes('IfcGuid="2O2Fr$t4X7Zf8NOew3FLOH"') && !!zip.file(`${t.guid}/snapshot.png`);
});
await ok('topicul fără vedere nu are viewpoint', async () => !zip.file('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/viewpoint.bcfv'));

console.log('Dus-întors');
const inapoi = await importaBcf(bin, parse);
const r = inapoi.find(x => x.guid === t.guid);
await ok('se citesc ambele topicuri', async () => inapoi.length === 2);
await ok('câmpurile se păstrează', async () => r.titlu === t.titlu && r.tip === 'intrebare' && r.stare === 'in_lucru' && r.prioritate === 'mare' && r.termen === '2026-12-01'
  && r.atribuit === 'ana@studio.ro' && r.autor === t.autor && r.index === 7 && r.etichete.join() === 'Structură,Etaj 1' && r.descriere === t.descriere);
await ok('comentariile se păstrează', async () => r.comentarii.length === 1 && r.comentarii[0].text === 'Da, cu bordajul din detaliul D7.' && r.comentarii[0].autor === 'ana@studio.ro');
await ok('camera și elementele se păstrează', async () => JSON.stringify(r.punct_vedere) === JSON.stringify(t.punct_vedere) && r.elemente.join() === t.elemente.join());
await ok('captura se păstrează', async () => r.snapshot && r.snapshot.length === 7 && r.snapshot[0] === 137);

console.log('Fișier scris de alt program');
const strain = new JSZip();
strain.file('bcf.version', '<Version VersionId="2.0"/>');
strain.file('ABC/markup.bcf', `<?xml version="1.0"?><Markup><Header><File IfcProject="x"><Filename>Arh.ifc</Filename></File></Header>
<Topic Guid="ABC" TopicType="Clash" TopicStatus="Active"><Title>Conductă prin grindă</Title><CreationDate>2026-10-01T08:00:00+02:00</CreationDate><CreationAuthor>Navisworks</CreationAuthor></Topic>
<Comment Guid="c1"><Date>2026-10-01T08:00:00+02:00</Date><Author>ion</Author><Comment>Verificați cota.</Comment><Topic Guid="ABC"/></Comment>
<Viewpoints Guid="v1"><Viewpoint>v1.bcfv</Viewpoint><Snapshot>v1.png</Snapshot></Viewpoints></Markup>`);
strain.file('ABC/v1.bcfv', `<VisualizationInfo Guid="v1"><Components><Selection><Component IfcGuid="3cUkl32yn9qRSPvBJVyWYp"><OriginatingSystem>Revit</OriginatingSystem></Component></Selection></Components>
<PerspectiveCamera><CameraViewPoint><X>1</X><Y>2</Y><Z>3</Z></CameraViewPoint><CameraDirection><X>0</X><Y>1</Y><Z>0</Z></CameraDirection><CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector><FieldOfView>45</FieldOfView></PerspectiveCamera></VisualizationInfo>`);
strain.file('ABC/v1.png', new Uint8Array([1, 2]));
const s = (await importaBcf(await strain.generateAsync({ type: 'uint8array' }), parse))[0];
await ok('BCF 2.0 cu nume de fișiere proprii se citește', async () => s.titlu === 'Conductă prin grindă' && s.elemente[0] === '3cUkl32yn9qRSPvBJVyWYp' && s.punct_vedere.field_of_view === 45 && s.snapshot.length === 2);
await ok('tipurile și stările necunoscute se traduc rezonabil', async () => s.tip === 'neconformitate' && s.stare === 'deschisa' && tipDinBcf('RFI') === 'intrebare' && stareDinBcf('Done') === 'rezolvata');
await ok('un GUID care nu e UUID primește unul nou', async () => /^[0-9a-f-]{36}$/.test(s.guid));
await ok('comentariul se citește', async () => s.comentarii.length === 1 && s.comentarii[0].text === 'Verificați cota.');

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
