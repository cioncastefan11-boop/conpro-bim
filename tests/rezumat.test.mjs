// Teste pentru rezumatul zilnic pe e-mail (supabase/functions/rezumat-zilnic/index.ts), cu servicii simulate.
import { build } from 'esbuild';
import fs from 'node:fs';

const out = new URL('./.build/rezumat.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../supabase/functions/rezumat-zilnic/index.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: out.pathname, logLevel: 'silent' });
const { compuneRezumat, trimiteRezumate } = await import(out.href);

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}

const S = (proiect, cod, titlu, cale) => ({ proiect_id: proiect, cod_proiect: cod, denumire_proiect: `Proiect ${cod}`, tip: 'pv', titlu, cale, din: null });
const sarcini = [S('p1', 'BLC01', 'PV nr. 3 de confirmat: Armare placă', 'pv/a'), S('p1', 'BLC01', 'FAM nr. 2 de aprobat: <EPS 80>', 'fam/b'), S('p2', 'SCL02', 'Turnarea nr. 1 de vizat', 'beton/c')];

console.log('Conținutul e-mailului');
const r = compuneRezumat({ id: 'u', nume: 'Mihai Ionescu', email: 'm@x.ro' }, sarcini, 'https://conpro-bim.netlify.app/');
await ok('subiectul spune câte lucruri sunt de făcut', () => r.subiect === 'Conpro BIM: 3 lucruri de făcut azi');
await ok('salută persoana pe nume', () => r.html.includes('Bună dimineața, Mihai Ionescu!'));
await ok('grupează pe proiecte', () => r.html.indexOf('BLC01') < r.html.indexOf('SCL02') && (r.html.match(/<ul/g) ?? []).length === 2);
await ok('fiecare sarcină are legătura ei în aplicație', () => r.html.includes('https://conpro-bim.netlify.app/proiect/p1/pv/a') && r.text.includes('/proiect/p2/beton/c'));
await ok('textul din date e protejat (fără HTML injectat)', () => r.html.includes('&lt;EPS 80&gt;') && !r.html.includes('<EPS 80>'));
await ok('singular pentru o singură sarcină', () => compuneRezumat({ id: 'u', nume: '', email: 'x' }, sarcini.slice(0, 1), 'https://a').subiect === 'Conpro BIM: 1 lucru de făcut azi');

console.log('Trimiterea');
const env = new Map(Object.entries({ SUPABASE_URL: 'https://sb', SUPABASE_SERVICE_ROLE_KEY: 'srv', RESEND_API_KEY: 're_test', EMAIL_EXPEDITOR: 'Conpro BIM <n@conpro.ro>', APP_URL: 'https://app' }));
const apeluri = [];
const fals = async (url, init = {}) => {
  apeluri.push({ url, init });
  const json = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (url.includes('/rest/v1/persoane')) return json([{ id: 'u1', nume: 'Ana', email: 'ana@x.ro' }, { id: 'u2', nume: 'Dan', email: 'dan@x.ro' }]);
  if (url.includes('/rpc/sarcini_persoana')) return json(JSON.parse(init.body).p === 'u1' ? sarcini : []);
  if (url.includes('api.resend.com')) return json({ id: 'e1' });
  return { ok: false, status: 404, text: async () => '' };
};
const rez = await trimiteRezumate(env, fals);
await ok('citește doar persoanele cu rezumatul pornit', () => apeluri[0].url.includes('rezumat_zilnic=eq.true'));
await ok('trimite doar celor care au ceva de făcut', () => rez.trimise === 1 && rez.persoane === 2 && apeluri.filter(a => a.url.includes('resend')).length === 1);
await ok('e-mailul pleacă de la expeditorul configurat, către persoana potrivită', () => {
  const b = JSON.parse(apeluri.find(a => a.url.includes('resend')).init.body);
  return b.from === 'Conpro BIM <n@conpro.ro>' && b.to[0] === 'ana@x.ro' && b.html.includes('https://app/de-facut');
});
await ok('cheia de serviciu rămâne doar în apelurile către Supabase', () =>
  apeluri.filter(a => a.url.includes('resend')).every(a => !JSON.stringify(a.init).includes('srv')));
const cuEroare = await trimiteRezumate(env, async (url, init) => url.includes('resend') ? { ok: false, status: 403, text: async () => 'domeniu neverificat' } : fals(url, init));
await ok('o eroare la trimitere e raportată, nu oprește restul', () => cuEroare.trimise === 0 && cuEroare.erori[0].includes('403'));

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
