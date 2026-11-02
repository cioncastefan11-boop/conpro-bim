// Părțile ușoare ale verificării semnăturilor (tipul, potrivirea numelor), fără PKI.js,
// ca pagina să nu încarce biblioteca de criptografie decât când chiar verifică un PDF.

export type SemnaturaPdf = {
  ordine: number;
  semnatar: string;
  prenume?: string;
  nume?: string;
  organizatie?: string;
  emitent: string;
  serieCertificat: string;
  certificatValabilDe?: string;
  certificatValabilPana?: string;
  calificata: boolean;
  dispozitivCalificat: boolean;
  integra: boolean;
  acoperaTot: boolean;
  marcaTemporala: boolean;
  semnatLa?: string;           // ISO
  motiv?: string;
  eroare?: string;
};

/** O semnătură e bună dacă e integră, calificată și fără alte probleme. */
export const semnaturaBuna = (s: SemnaturaPdf) => s.integra && s.calificata && !s.eroare;

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(t => t.length > 1);

/** Numele persoanei din aplicație se regăsește în certificat (toate cuvintele, în orice ordine). */
export function aceeasiPersoana(numeAplicatie: string | null | undefined, s: Pick<SemnaturaPdf, 'semnatar' | 'prenume' | 'nume'>): boolean {
  const a = norm(numeAplicatie ?? '');
  if (a.length < 2) return false;
  const b = new Set([...norm(s.semnatar), ...norm(s.prenume ?? ''), ...norm(s.nume ?? '')]);
  return a.every(t => b.has(t));
}

export const LINK_DSS = 'https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo';
