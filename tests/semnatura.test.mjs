// Teste pentru verificarea semnăturilor din PDF (src/lib/semnatura.ts).
// Generează o autoritate de certificare de test, certificate (calificat și necalificat)
// și PDF-uri semnate succesiv, apoi verifică integritatea, calificarea și modificările.
import { build } from 'esbuild';
import fs from 'node:fs';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

const out = new URL('./.build/semnatura.mjs', import.meta.url);
fs.mkdirSync(new URL('./.build/', import.meta.url), { recursive: true });
await build({ entryPoints: [new URL('../src/lib/semnatura.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: out.pathname, logLevel: 'silent' });
const { verificaPdf, semnaturaBuna, aceeasiPersoana } = await import(out.href);

let pass = 0, fail = 0;
async function ok(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('rezultat neașteptat'); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '→', e.message); }
}

const crypto = globalThis.crypto;
pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto }));
const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

const nume = (cn, extra = []) => {
  const n = new pkijs.RelativeDistinguishedNames();
  n.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: '2.5.4.6', value: new asn1js.PrintableString({ value: 'RO' }) }));
  for (const [t, v] of extra) n.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: t, value: new asn1js.Utf8String({ value: v }) }));
  n.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: cn }) }));
  return n;
};
let serie = 1;
async function certificat({ cn, extra, emitent, cheieEmitent, calificat, ca }) {
  const chei = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
  const c = new pkijs.Certificate();
  c.version = 2;
  c.serialNumber = new asn1js.Integer({ value: serie++ });
  c.subject = nume(cn, extra);
  c.issuer = emitent ?? c.subject;
  c.notBefore.value = new Date('2026-01-01T00:00:00Z');
  c.notAfter.value = new Date('2029-01-01T00:00:00Z');
  c.extensions = [];
  if (ca) c.extensions.push(new pkijs.Extension({ extnID: '2.5.29.19', critical: true, extnValue: new pkijs.BasicConstraints({ cA: true }).toSchema().toBER(false) }));
  if (calificat) {
    const st = new asn1js.Sequence({ value: [
      new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: '0.4.0.1862.1.1' })] }),
      new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: '0.4.0.1862.1.4' })] }),
      new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: '0.4.0.1862.1.6' }), new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: '0.4.0.1862.1.6.1' })] })] }),
    ] });
    c.extensions.push(new pkijs.Extension({ extnID: '1.3.6.1.5.5.7.1.3', critical: false, extnValue: st.toBER(false) }));
  }
  await c.subjectPublicKeyInfo.importKey(chei.publicKey);
  await c.sign(cheieEmitent ?? chei.privateKey, 'SHA-256');
  return { cert: c, cheie: chei.privateKey };
}

const ca = await certificat({ cn: 'CA Test Calificat', ca: true });
const ion = await certificat({ cn: 'Ion Popescu', extra: [['2.5.4.42', 'Ion'], ['2.5.4.4', 'Popescu']], emitent: ca.cert.subject, cheieEmitent: ca.cheie, calificat: true });
const mihai = await certificat({ cn: 'Mihai Ionescu', emitent: ca.cert.subject, cheieEmitent: ca.cheie, calificat: true });
const simplu = await certificat({ cn: 'Andrei Stan', emitent: ca.cert.subject, cheieEmitent: ca.cheie, calificat: false });

const enc = new TextEncoder();
const LOC = 8192; // caractere hex rezervate pentru semnătură

/** Adaugă o semnătură (inițial sau ca actualizare incrementală) și o semnează. */
async function semneaza(pdf, { cert, cheie }, nr, data = '2026-11-12T10:00:00Z') {
  const loc = '0'.repeat(LOC);
  const br = '/ByteRange [0 0000000000 0000000000 0000000000]';
  const obiect = `\n${10 + nr} 0 obj\n<</Type/Sig/Filter/Adobe.PPKLite/SubFilter/adbe.pkcs7.detached${br}/Contents <${loc}>/M(D:20261112100000Z)/Reason(Semnat in Conpro BIM ${nr})>>\nendobj\n%%EOF\n`;
  const tot = new Uint8Array([...pdf, ...enc.encode(obiect)]);
  const t = new TextDecoder('latin1').decode(tot);
  const start = t.lastIndexOf('/Contents <') + '/Contents '.length;
  const b = start, c = start + LOC + 2, d = tot.length - c;
  const brNou = `/ByteRange [0 ${String(b).padStart(10, '0')} ${String(c).padStart(10, '0')} ${String(d).padStart(10, '0')}]`;
  tot.set(enc.encode(brNou), t.lastIndexOf('/ByteRange ['));
  const date = new Uint8Array([...tot.subarray(0, b), ...tot.subarray(c)]);
  const amprenta = await crypto.subtle.digest('SHA-256', date);
  const sd = new pkijs.SignedData({
    version: 1, encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
    signerInfos: [new pkijs.SignerInfo({
      version: 1,
      sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
      signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes: [
        new pkijs.Attribute({ type: '1.2.840.113549.1.9.3', values: [new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' })] }),
        new pkijs.Attribute({ type: '1.2.840.113549.1.9.4', values: [new asn1js.OctetString({ valueHex: amprenta })] }),
        new pkijs.Attribute({ type: '1.2.840.113549.1.9.5', values: [new asn1js.UTCTime({ valueDate: new Date(data) })] }),
      ] }),
    })],
    certificates: [cert, ca.cert],
  });
  await sd.sign(cheie, 0, 'SHA-256');
  const der = new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: sd.toSchema(true) }).toSchema().toBER(false);
  const hex = Buffer.from(der).toString('hex').toUpperCase().padEnd(LOC, '0');
  tot.set(enc.encode(hex), b + 1);
  return tot;
}

const baza = enc.encode('%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>\nendobj\ntrailer\n<</Root 1 0 R>>\n%%EOF\n');

console.log('PDF fără semnături');
await ok('un PDF nesemnat nu are semnături', async () => (await verificaPdf(baza.buffer)).length === 0);

console.log('O semnătură calificată');
const unu = await semneaza(baza, ion, 1);
const r1 = await verificaPdf(unu.slice().buffer);
await ok('găsește semnătura', () => r1.length === 1);
await ok('e integră și acoperă tot documentul', () => r1[0].integra && r1[0].acoperaTot && !r1[0].eroare);
await ok('citește semnatarul, prenumele și numele', () => r1[0].semnatar === 'Ion Popescu' && r1[0].prenume === 'Ion' && r1[0].nume === 'Popescu');
await ok('recunoaște certificatul calificat (QcCompliance + QSCD)', () => r1[0].calificata && r1[0].dispozitivCalificat && semnaturaBuna(r1[0]));
await ok('citește emitentul și momentul semnării', () => r1[0].emitent === 'CA Test Calificat' && r1[0].semnatLa === '2026-11-12T10:00:00.000Z');

console.log('Semnături succesive');
const doi = await semneaza(unu, mihai, 2, '2026-11-12T11:00:00Z');
const trei = await semneaza(doi, simplu, 3, '2026-11-12T12:00:00Z');
const r3 = await verificaPdf(trei.slice().buffer);
await ok('găsește toate cele trei semnături', () => r3.length === 3);
await ok('toate sunt integre', () => r3.every(s => s.integra));
await ok('doar ultima acoperă tot fișierul', () => !r3[0].acoperaTot && !r3[1].acoperaTot && r3[2].acoperaTot);
await ok('certificatul fără QCStatements nu e calificat', () => !r3[2].calificata && !semnaturaBuna(r3[2]));

console.log('Document modificat după semnare');
const modificat = trei.slice();
const poz = new TextDecoder('latin1').decode(modificat).indexOf('/MediaBox[0 0 595 842]');
modificat.set(enc.encode('/MediaBox[0 0 612 792]'), poz);
const rm = await verificaPdf(modificat.buffer);
await ok('modificarea paginii strică toate semnăturile', () => rm.length === 3 && rm.every(s => !s.integra && s.eroare));
const stricat = unu.slice();
const ps = new TextDecoder('latin1').decode(stricat).lastIndexOf('/Contents <') + 200;
stricat[ps] = stricat[ps] === 0x41 ? 0x42 : 0x41;
await ok('o semnătură alterată nu trece', async () => { const r = await verificaPdf(stricat.buffer); return r.length === 1 && !r[0].integra; });

console.log('Potrivirea cu persoanele din aplicație');
await ok('același nume, în altă ordine și fără diacritice', () => aceeasiPersoana('Popescu Ion', r1[0]) && aceeasiPersoana('Ion Popescu', { semnatar: 'POPESCU ION' }));
await ok('diacriticele nu contează', () => aceeasiPersoana('Ștefan Cionca', { semnatar: 'Stefan Cionca' }));
await ok('alt om nu se potrivește', () => !aceeasiPersoana('Ion Ionescu', r1[0]) && !aceeasiPersoana('Ion', r1[0]));

console.log(`\n${pass} trecute, ${fail} picate`);
process.exit(fail ? 1 : 0);
