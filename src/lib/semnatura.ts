// Verificarea semnăturilor electronice dintr-un PDF (PAdES / adbe.pkcs7.detached).
//
// Pentru fiecare semnătură din fișier:
//  - integritatea: amprenta porțiunii semnate (ByteRange) se potrivește cu cea semnată,
//    iar semnătura se verifică cu cheia publică din certificat;
//  - semnatarul și emitentul certificatului;
//  - dacă certificatul e calificat (QCStatements: QcCompliance, dispozitiv calificat QSCD
//    sau politica QCP-n-qscd), adică semnătură electronică calificată în sensul eIDAS;
//  - momentul semnării și marca temporală, dacă există.
// Lanțul de încredere până la Lista de încredere a UE nu se verifică aici; pentru
// validarea completă se folosește instrumentul DSS al Comisiei Europene.
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

import type { SemnaturaPdf } from './semnaturaNume';
export type { SemnaturaPdf } from './semnaturaNume';
export { aceeasiPersoana, semnaturaBuna, LINK_DSS } from './semnaturaNume';

const OID = {
  cn: '2.5.4.3', prenume: '2.5.4.42', nume: '2.5.4.4', o: '2.5.4.10',
  qcStatements: '1.3.6.1.5.5.7.1.3', politici: '2.5.29.32',
  qcCompliance: '0.4.0.1862.1.1', qcSSCD: '0.4.0.1862.1.4', qcType: '0.4.0.1862.1.6', qcTypeEsign: '0.4.0.1862.1.6.1',
  qcpNQscd: '0.4.0.194112.1.2', qcpN: '0.4.0.194112.1.0',
  signingTime: '1.2.840.113549.1.9.5', marcaTemporala: '1.2.840.113549.1.9.16.2.14',
};

const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };
const hexInBytes = (h: string) => { const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
const hexDin = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

function atribut(n: pkijs.RelativeDistinguishedNames, oid: string): string | undefined {
  const t = n.typesAndValues.find(x => x.type === oid);
  return t ? String((t.value.valueBlock as { value?: unknown }).value ?? '') : undefined;
}

/** Data PDF „D:20261112100000+02'00'” în ISO. */
function dataPdf(s?: string): string | undefined {
  const m = s?.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?/);
  if (!m) return undefined;
  const [, y, mo, d, h = '00', mi = '00', se = '00', z, oh, om] = m;
  const fus = !z || z === 'Z' ? 'Z' : `${z}${oh ?? '00'}:${om ?? '00'}`;
  const t = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}${fus}`);
  return isNaN(t.getTime()) ? undefined : t.toISOString();
}

function calificare(cert: pkijs.Certificate) {
  let conformitate = false, qscd = false, esign = false, politicaQscd = false;
  for (const ext of cert.extensions ?? []) {
    if (ext.extnID === OID.qcStatements) {
      const a = asn1js.fromBER(ext.extnValue.valueBlock.valueHexView);
      const lista = (a.result as asn1js.Sequence).valueBlock.value ?? [];
      for (const st of lista) {
        const el = (st as asn1js.Sequence).valueBlock.value ?? [];
        const id = (el[0] as asn1js.ObjectIdentifier)?.valueBlock?.toString();
        if (id === OID.qcCompliance) conformitate = true;
        if (id === OID.qcSSCD) qscd = true;
        if (id === OID.qcType) {
          const tipuri = ((el[1] as asn1js.Sequence)?.valueBlock?.value ?? []).map(x => (x as asn1js.ObjectIdentifier).valueBlock.toString());
          if (tipuri.includes(OID.qcTypeEsign)) esign = true;
        }
      }
    }
    if (ext.extnID === OID.politici) {
      const p = ext.parsedValue as pkijs.CertificatePolicies | undefined;
      if (p?.certificatePolicies?.some(x => x.policyIdentifier === OID.qcpNQscd)) politicaQscd = true;
    }
  }
  return { calificata: (conformitate && (qscd || esign)) || politicaQscd, dispozitivCalificat: qscd || politicaQscd };
}

/** Găsește și verifică toate semnăturile dintr-un PDF. */
export async function verificaPdf(fisier: ArrayBuffer): Promise<SemnaturaPdf[]> {
  const bytes = new Uint8Array(fisier);
  const text = latin1(bytes);
  const rez: SemnaturaPdf[] = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const vazute = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [a, b, c, d] = m.slice(1, 5).map(Number);
    const cheie = `${a}-${b}-${c}-${d}`;
    if (vazute.has(cheie)) continue;
    vazute.add(cheie);
    const s: SemnaturaPdf = { ordine: rez.length + 1, semnatar: '—', emitent: '—', serieCertificat: '', calificata: false, dispozitivCalificat: false, integra: false, acoperaTot: c + d === bytes.length, marcaTemporala: false };
    rez.push(s);
    try {
      if (a !== 0 || b <= 0 || c <= b || c + d > bytes.length) throw new Error('Intervalul semnat (ByteRange) nu e valid.');
      const gol = text.slice(b, c).trim();
      if (!gol.startsWith('<') || !gol.endsWith('>')) throw new Error('Nu am găsit conținutul semnăturii.');
      let hex = gol.slice(1, -1).replace(/\s+/g, '');
      if (hex.length % 2) hex += '0';   // umplutura cu zerouri de la final e ignorată la citirea DER
      // dicționarul semnăturii: data (/M) și motivul (/Reason), căutate în jurul ei
      const zona = text.slice(Math.max(0, b - 3000), Math.min(text.length, c + 3000));
      const mM = zona.match(/\/M\s*\((D:[^)]+)\)/);
      const mR = zona.match(/\/Reason\s*\(([^)]*)\)/);
      if (mR) s.motiv = mR[1];

      const der = hexInBytes(hex);
      const asn = asn1js.fromBER(der);
      if (asn.offset === -1) throw new Error('Semnătura nu poate fi citită (nu e CMS / PKCS#7).');
      const ci = new pkijs.ContentInfo({ schema: asn.result });
      if (ci.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new Error('Conținutul nu e o semnătură CMS.');
      const sd = new pkijs.SignedData({ schema: ci.content });
      const date = new Uint8Array(b + d);
      date.set(bytes.subarray(0, b), 0);
      date.set(bytes.subarray(c, c + d), b);

      const si = sd.signerInfos[0];
      const sid = si.sid as pkijs.IssuerAndSerialNumber;
      const cert = (sd.certificates ?? []).find((x): x is pkijs.Certificate => x instanceof pkijs.Certificate
        && (!(sid instanceof pkijs.IssuerAndSerialNumber) || (x.serialNumber.isEqual(sid.serialNumber) && x.issuer.isEqual(sid.issuer))));
      if (cert) {
        s.semnatar = atribut(cert.subject, OID.cn) ?? '—';
        s.prenume = atribut(cert.subject, OID.prenume);
        s.nume = atribut(cert.subject, OID.nume);
        s.organizatie = atribut(cert.subject, OID.o);
        s.emitent = atribut(cert.issuer, OID.cn) ?? atribut(cert.issuer, OID.o) ?? '—';
        s.serieCertificat = hexDin(cert.serialNumber.valueBlock.valueHexView.slice().buffer);
        s.certificatValabilDe = cert.notBefore.value.toISOString();
        s.certificatValabilPana = cert.notAfter.value.toISOString();
        Object.assign(s, calificare(cert));
      }
      const timp = si.signedAttrs?.attributes.find(x => x.type === OID.signingTime);
      const t0 = timp?.values[0] as asn1js.UTCTime | asn1js.GeneralizedTime | undefined;
      s.semnatLa = t0 ? t0.toDate().toISOString() : dataPdf(mM?.[1]);
      s.marcaTemporala = !!si.unsignedAttrs?.attributes.some(x => x.type === OID.marcaTemporala);

      const v = await sd.verify({ signer: 0, data: date.buffer, checkChain: false, extendedMode: true }).catch((e: { message?: string; signatureVerified?: boolean }) => e);
      s.integra = !!(v as { signatureVerified?: boolean }).signatureVerified;
      if (!s.integra) s.eroare = 'Documentul a fost modificat după semnare sau semnătura nu corespunde certificatului.';
      if (s.integra && s.semnatLa && s.certificatValabilDe && s.certificatValabilPana
          && (s.semnatLa < s.certificatValabilDe || s.semnatLa > s.certificatValabilPana)) {
        s.eroare = 'Certificatul nu era valabil la momentul semnării.';
      }
    } catch (e) {
      s.eroare = (e as Error).message || 'Semnătura nu poate fi verificată.';
    }
  }
  return rez;
}
