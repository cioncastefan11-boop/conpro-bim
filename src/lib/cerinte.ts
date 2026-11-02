// Cerințele de predare (AIR / EIR): ce cere beneficiarul și cât e îndeplinit, din datele proiectului.
// Fără dependențe de browser: se testează în Node.
import type { Atasament, DocumentCarte, DocumentProiect, Echipament, RevizieDocument, TipEchipament } from './tipuri';

export type CampCerinta = 'producator' | 'model' | 'serie' | 'garantie' | 'mentenanta' | 'incapere' | 'punere_functiune' | 'fisa_tehnica' | 'instructiuni' | 'certificat_garantie';
export type CerintaPredare = {
  id: string; proiect_id: string; categorie: 'echipament' | 'document'; camp: CampCerinta | null; aplicabil_la: string | null;
  titlu: string | null; cod_document: string | null; cuvinte: string | null; capitol: 'A' | 'B' | 'C' | 'D' | null;
  sursa: 'AIR' | 'EIR'; obligatorie: boolean; ordine: number;
};
export type DateCerinte = {
  tipuri: TipEchipament[]; echipamente: Echipament[]; atasamente: Atasament[];
  documente: DocumentCarte[]; documenteProiect: DocumentProiect[]; revizii: RevizieDocument[];
};
export type RezultatCerinta = { cerinta: CerintaPredare; indeplinita: boolean; total: number; bune: number; lipsa: string[]; detalii: string };

export const CAMPURI_CERINTA: Record<CampCerinta, string> = {
  producator: 'Producătorul', model: 'Modelul', serie: 'Seria', garantie: 'Garanția (durata și începutul)', mentenanta: 'Intervalul de mentenanță',
  incapere: 'Încăperea', punere_functiune: 'Data punerii în funcțiune', fisa_tehnica: 'Fișa tehnică (atașată)', instructiuni: 'Instrucțiunile de utilizare și mentenanță',
  certificat_garantie: 'Certificatul de garanție (atașat)',
};

const are = (a: Atasament[], tipId: string, echId: string, tipuri: string[]) =>
  a.some(x => ((x.entitate === 'tip_echipament' && x.entitate_id === tipId) || (x.entitate === 'echipament' && x.entitate_id === echId)) && tipuri.includes(x.tip_document));

function campOk(c: CampCerinta, e: Echipament, t: TipEchipament | undefined, a: Atasament[]): boolean {
  switch (c) {
    case 'producator': return !!t?.producator?.trim();
    case 'model': return !!t?.model?.trim();
    case 'serie': return !!e.serie?.trim();
    case 'garantie': return t?.garantie_luni != null && !!(e.garantie_start || e.data_punere_functiune);
    case 'mentenanta': return t?.interval_mentenanta_luni != null;
    case 'incapere': return !!e.incapere_id;
    case 'punere_functiune': return !!e.data_punere_functiune;
    case 'fisa_tehnica': return are(a, e.tip_id, e.id, ['fisa_tehnica']);
    case 'instructiuni': return !!t?.instructiuni_mentenanta?.trim() || are(a, e.tip_id, e.id, ['manual', 'instructiuni']);
    case 'certificat_garantie': return are(a, e.tip_id, e.id, ['certificat_garantie']);
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function evalueazaCerinte(d: DateCerinte, cerinte: CerintaPredare[]): RezultatCerinta[] {
  return [...cerinte].sort((a, b) => a.ordine - b.ordine).map(c => {
    if (c.categorie === 'echipament' && c.camp) {
      const filtru = c.aplicabil_la ? norm(c.aplicabil_la) : null;
      const ech = d.echipamente.filter(e => { const t = d.tipuri.find(x => x.id === e.tip_id); return !filtru || norm(`${t?.categorie ?? ''} ${t?.denumire ?? ''}`).includes(filtru); });
      const lipsa = ech.filter(e => !campOk(c.camp!, e, d.tipuri.find(x => x.id === e.tip_id), d.atasamente)).map(e => e.cod);
      return { cerinta: c, total: ech.length, bune: ech.length - lipsa.length, lipsa, indeplinita: ech.length > 0 && !lipsa.length,
        detalii: !ech.length ? 'niciun echipament înregistrat' + (c.aplicabil_la ? ` din „${c.aplicabil_la}”` : '') : `${ech.length - lipsa.length} din ${ech.length} echipamente` };
    }
    // documentele: codul exact din CDE (publicat) sau cuvintele în titlurile documentelor publicate și ale Cărții tehnice
    const publicate = d.documenteProiect.filter(x => d.revizii.some(r => r.document_id === x.id && r.stare === 'publicat'));
    if (c.cod_document) {
      const doc = d.documenteProiect.find(x => x.cod === c.cod_document);
      const ok = !!doc && publicate.includes(doc);
      return { cerinta: c, total: 1, bune: ok ? 1 : 0, lipsa: ok ? [] : [c.cod_document], indeplinita: ok,
        detalii: ok ? `${doc!.cod} publicat` : doc ? `${doc.cod} există, dar nu e publicat` : `${c.cod_document} nu e în CDE` };
    }
    const cuv = (c.cuvinte || c.titlu || '').split(',').map(x => norm(x.trim())).filter(x => x.length > 2);
    const potriviri = [
      ...d.documente.filter(x => (!c.capitol || x.capitol === c.capitol) && cuv.some(w => norm(x.titlu).includes(w))).map(x => x.titlu),
      ...publicate.filter(x => cuv.some(w => norm(x.titlu).includes(w))).map(x => `${x.cod} ${x.titlu}`),
    ];
    return { cerinta: c, total: 1, bune: potriviri.length ? 1 : 0, lipsa: potriviri.length ? [] : [c.titlu ?? ''], indeplinita: potriviri.length > 0,
      detalii: potriviri.length ? potriviri.slice(0, 2).join('; ') : 'negăsit în Cartea tehnică și în documentele publicate' };
  });
}

/** Setul tip de cerințe pentru predare: datele COBie ale echipamentelor și documentele de bază. */
export const CERINTE_TIP: Omit<CerintaPredare, 'id' | 'proiect_id'>[] = [
  ...(['producator', 'model', 'serie', 'incapere', 'punere_functiune', 'garantie', 'mentenanta', 'fisa_tehnica', 'instructiuni'] as CampCerinta[])
    .map((camp, i) => ({ categorie: 'echipament' as const, camp, aplicabil_la: null, titlu: null, cod_document: null, cuvinte: null, capitol: null, sursa: 'AIR' as const, obligatorie: true, ordine: i + 1 })),
  ...[
    ['Proiectul real executat (as-built)', 'as-built, as built, real executat', 'A'],
    ['Modelul IFC as-built', 'model as-built, ifc as-built', null],
    ['Certificatele de garanție ale echipamentelor', 'certificat de garantie, certificate de garantie', 'D'],
    ['Avizele de punere în funcțiune (ISCIR, gaz, electric)', 'iscir, aviz, punere in functiune', 'C'],
    ['Programul de urmărire în timp a construcției', 'urmarire in timp, urmarire comportare', 'D'],
  ].map(([titlu, cuvinte, capitol], i) => ({ categorie: 'document' as const, camp: null, aplicabil_la: null, titlu, cod_document: null, cuvinte, capitol: capitol as CerintaPredare['capitol'],
    sursa: 'EIR' as const, obligatorie: true, ordine: 20 + i })),
];
