// Încărcarea mai multor documente deodată: recunoașterea codului ISO 19650 din numele
// fișierului și planul de încărcare (document nou, revizie nouă sau fișier în plus la revizia în lucru).
import type { Conventie, DocumentProiect, RevizieDocument } from './tipuri';
import { revizieUrmatoare, TIPURI_DOCUMENT, ROLURI_DOCUMENT } from './domeniu';

export type CampuriCod = { initiator: string; volum: string; nivel: string; tip: string; rol: string; numar: string };
export type FisierRecunoscut = CampuriCod & { recunoscut: boolean; revizie: string | null; titlu: string };

const TIP_DUPA_EXTENSIE: Record<string, string> = {
  ifc: 'M3', rvt: 'M3', nwd: 'M3', nwc: 'M3', skp: 'M3', dwg: 'DR', dxf: 'DR', pdf: 'DR', xlsx: 'SH', xls: 'SH', csv: 'SH',
  docx: 'RP', doc: 'RP', jpg: 'VS', jpeg: 'VS', png: 'VS',
};

/**
 * Recunoaște codul din numele fișierului, ex.
 *   BLC01-SP-ZZ-01-DR-S-0101-P02 - Plan cofraj.pdf
 *   SP-ZZ-01-DR-S-0101_C01_Plan cofraj.dwg      (fără codul proiectului)
 */
export function recunoaste(numeFisier: string, codProiect: string): FisierRecunoscut {
  const ext = numeFisier.split('.').pop()?.toLowerCase() ?? '';
  const baza = numeFisier.replace(/\.[^.]+$/, '').trim();
  const pr = codProiect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^(?:${pr}[-_])?([A-Z0-9]{2,6})[-_]([A-Z0-9]{1,4})[-_]([A-Z0-9]{2,4})[-_]([A-Z0-9]{2})[-_]([A-Z])[-_]([0-9]{4,6})(?:[-_ ]+([PC][0-9]{2}(?:\\.[0-9]{1,2})?))?(?:\\s*[-_ ]\\s*(.+))?$`, 'i');
  const m = baza.match(re);
  if (m && TIPURI_DOCUMENT.some(t => t.id === m[4].toUpperCase()) && ROLURI_DOCUMENT.some(r => r.id === m[5].toUpperCase())) {
    return {
      initiator: m[1].toUpperCase(), volum: m[2].toUpperCase(), nivel: m[3].toUpperCase(), tip: m[4].toUpperCase(), rol: m[5].toUpperCase(),
      numar: m[6], revizie: m[7] ? m[7].toUpperCase() : null, titlu: (m[8] ?? '').replace(/[_]+/g, ' ').trim(), recunoscut: true,
    };
  }
  return { initiator: '', volum: 'ZZ', nivel: 'ZZ', tip: TIP_DUPA_EXTENSIE[ext] ?? 'DR', rol: '', numar: '', revizie: null,
    titlu: baza.replace(/[_]+/g, ' ').trim(), recunoscut: false };
}

export type RandIncarcare = CampuriCod & {
  cheie: string; fisiere: File[]; titlu: string; revizie: string; recunoscut: boolean;
  actiune: 'document_nou' | 'revizie_noua' | 'adauga_la_wip' | 'eroare';
  documentId: string | null; revizieId: string | null; mesaj: string | null;
};

export const codDin = (codProiect: string, c: CampuriCod) => [codProiect, c.initiator, c.volum, c.nivel, c.tip, c.rol, c.numar].join('-');

/** Ce se întâmplă cu fiecare rând: document nou, revizie nouă sau fișier adăugat la revizia în lucru. */
export function evalueaza(r: RandIncarcare, codProiect: string, docs: DocumentProiect[], revizii: RevizieDocument[], conv: Conventie,
  echipa: (d: DocumentProiect) => boolean): RandIncarcare {
  const cod = codDin(codProiect, r);
  const lipsa = (['initiator', 'volum', 'nivel', 'tip', 'rol', 'numar'] as const).filter(k => !r[k]);
  if (lipsa.length) return { ...r, actiune: 'eroare', documentId: null, revizieId: null, mesaj: 'Completați codul documentului.' };
  if (!/^[0-9]{4,6}$/.test(r.numar)) return { ...r, actiune: 'eroare', documentId: null, revizieId: null, mesaj: 'Numărul are 4–6 cifre.' };
  if (conv.strict) {
    const in_ = (l: { cod: string }[] | undefined, v: string) => !l?.length || l.some(x => x.cod === v);
    if (!in_(conv.initiatori, r.initiator) || !in_(conv.volume, r.volum) || !in_(conv.niveluri, r.nivel))
      return { ...r, actiune: 'eroare', documentId: null, revizieId: null, mesaj: 'Codul nu respectă convenția strictă a proiectului.' };
    if (conv.cifre && r.numar.length !== conv.cifre) return { ...r, actiune: 'eroare', documentId: null, revizieId: null, mesaj: `Numărul are ${conv.cifre} cifre în convenția proiectului.` };
  }
  const d = docs.find(x => x.cod === cod);
  if (!d) {
    if (!r.titlu.trim()) return { ...r, actiune: 'eroare', documentId: null, revizieId: null, mesaj: 'Scrieți titlul documentului.' };
    return { ...r, actiune: 'document_nou', documentId: null, revizieId: null, revizie: r.revizie || 'P01', mesaj: null };
  }
  if (!echipa(d)) return { ...r, actiune: 'eroare', documentId: d.id, revizieId: null, mesaj: 'Documentul există și aparține altei echipe.' };
  const rv = revizii.filter(x => x.document_id === d.id);
  const wip = rv.find(x => x.stare === 'wip');
  if (wip) return { ...r, actiune: 'adauga_la_wip', documentId: d.id, revizieId: wip.id, revizie: wip.revizie, titlu: d.titlu, mesaj: null };
  if (rv.some(x => x.stare === 'publicare_ceruta')) return { ...r, actiune: 'eroare', documentId: d.id, revizieId: null, mesaj: 'O revizie a documentului e la aprobare.' };
  const urm = r.revizie && !rv.some(x => x.revizie === r.revizie) ? r.revizie : revizieUrmatoare(rv.map(x => x.revizie), rv.some(x => x.stare === 'publicat'));
  return { ...r, actiune: 'revizie_noua', documentId: d.id, revizieId: null, revizie: urm, titlu: d.titlu, mesaj: null };
}
