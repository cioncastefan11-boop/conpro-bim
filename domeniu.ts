// Denumiri și reguli din Legea 169/2026 (CATUC) și ISO 19650.

export type Rol =
  | 'administrator' | 'beneficiar' | 'diriginte' | 'constructor' | 'proiectant'
  | 'subcontractor' | 'laborator' | 'cititor' | 'administrator_cladire';

export const ROLURI: { id: Rol; nume: string; descriere: string }[] = [
  { id: 'administrator', nume: 'Administrator proiect', descriere: 'Managementul informației: echipa, standardul, cerințele' },
  { id: 'beneficiar', nume: 'Beneficiar', descriere: 'Acceptă livrabilele, urmărește lucrarea' },
  { id: 'diriginte', nume: 'Diriginte de șantier', descriere: 'Verifică, confirmă PV-uri, aprobă FAM-uri, ține Cartea tehnică' },
  { id: 'constructor', nume: 'Constructor / RTE', descriere: 'Convoacă PV-uri, depune FAM-uri, completează echipamente' },
  { id: 'proiectant', nume: 'Proiectant', descriere: 'Publică modele, avizează FAM-uri, semnează la fazele determinante' },
  { id: 'subcontractor', nume: 'Subcontractor', descriere: 'Completează datele din zona lui' },
  { id: 'laborator', nume: 'Laborator', descriere: 'Introduce rezultatele încercărilor' },
  { id: 'cititor', nume: 'Cititor', descriere: 'ISC, comisia de recepție, auditor: vede fără să modifice' },
  { id: 'administrator_cladire', nume: 'Administrator clădire', descriere: 'Exploatare: garanții, mentenanță, defecte' },
];
export const numeRol = (r: Rol) => ROLURI.find(x => x.id === r)?.nume ?? r;

// art. 479 Legea 169/2026
export const STADII = [
  'Stadiul 0 · Definirea strategică',
  'Stadiul 1 · Tema de proiectare și fezabilitatea',
  'Stadiul 2 · Conceptul proiectului',
  'Stadiul 3 · Soluțiile de bază și autorizarea (PAC)',
  'Stadiul 4 · Dezvoltarea tehnică (PTE)',
  'Stadiul 5 · Execuția construcției',
  'Stadiul 6 · Predarea, până la recepția finală',
  'Stadiul 7 · Exploatarea construcției',
];

// art. 370: echivalența cu categoriile de importanță
export const CLASE = [
  { id: 'CC1', nume: 'CC1 (fostă categoria D)' },
  { id: 'CC2', nume: 'CC2 (fostă categoria C)' },
  { id: 'CC3', nume: 'CC3 (fostă categoria B)' },
  { id: 'CC4', nume: 'CC4 (fostă categoria A)' },
];

export type TipDoc = 'autorizatie_isc' | 'atestat' | 'polita_rc' | 'legitimatie_anre' | 'alt';
export const TIPURI_DOC: { id: TipDoc; nume: string }[] = [
  { id: 'autorizatie_isc', nume: 'Autorizație ISC (diriginte / RTE)' },
  { id: 'polita_rc', nume: 'Poliță de răspundere civilă profesională' },
  { id: 'atestat', nume: 'Atestat (verificator, expert, auditor)' },
  { id: 'legitimatie_anre', nume: 'Legitimație ANRE' },
  { id: 'alt', nume: 'Alt document' },
];
export const numeTipDoc = (t: TipDoc) => TIPURI_DOC.find(x => x.id === t)?.nume ?? t;

// ---------- date ----------
const ZI = 86_400_000;
export const azi = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };
export const dinIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const laIso = (d: Date) => d.toISOString().slice(0, 10);
export const formatData = (s?: string | null) =>
  s ? dinIso(s).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—';
export const zilePana = (s: string) => Math.round((dinIso(s).getTime() - azi().getTime()) / ZI);

/** Data până la care se cere prelungirea: cu cel puțin 15 zile lucrătoare
 *  înainte de expirare (art. 310 alin. 5). Sărbătorile legale nu sunt scăzute. */
export function termenCererePrelungire(expira: string): string {
  const d = dinIso(expira);
  let ramase = 15;
  while (ramase > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const z = d.getUTCDay();
    if (z !== 0 && z !== 6) ramase--;
  }
  return laIso(d);
}

export type Stare = { eticheta: string; ton: 'ok' | 'atentie' | 'alerta' | 'neutru' };

export function stareDocument(valabilPana?: string | null): Stare {
  if (!valabilPana) return { eticheta: 'Fără termen', ton: 'neutru' };
  const z = zilePana(valabilPana);
  if (z < 0) return { eticheta: 'Expirat', ton: 'alerta' };
  if (z <= 60) return { eticheta: `Expiră în ${z} zile`, ton: 'atentie' };
  return { eticheta: 'Valabil', ton: 'ok' };
}

export function stareAutorizatie(p: { ac_valabil_pana: string | null; ac_prelungit_pana: string | null }): Stare & { detaliu?: string } {
  const pana = p.ac_prelungit_pana ?? p.ac_valabil_pana;
  if (!pana) return { eticheta: 'Autorizație neînregistrată', ton: 'neutru' };
  const z = zilePana(pana);
  if (z < 0) return { eticheta: 'Autorizație expirată', ton: 'alerta',
    detaliu: 'Pentru lucrările nefinalizate se cere o autorizație nouă (art. 310 alin. 7).' };
  if (!p.ac_prelungit_pana) {
    const termen = termenCererePrelungire(pana);
    const zt = zilePana(termen);
    if (zt < 0) return { eticheta: `Expiră în ${z} zile`, ton: 'alerta',
      detaliu: `Termenul pentru cererea de prelungire (${formatData(termen)}) a trecut.` };
    if (zt <= 30) return { eticheta: `Expiră în ${z} zile`, ton: 'atentie',
      detaliu: `Prelungirea se cere până la ${formatData(termen)}: o singură dată, cel mult 12 luni (art. 310 alin. 5).` };
    return { eticheta: `Valabilă până la ${formatData(pana)}`, ton: 'ok',
      detaliu: `Prelungirea se poate cere până la ${formatData(termen)}.` };
  }
  return { eticheta: `Prelungită până la ${formatData(pana)}`, ton: z <= 60 ? 'atentie' : 'ok',
    detaliu: 'Autorizația a fost deja prelungită; nu se mai poate prelungi.' };
}

// ---------- procese verbale (migrarea 0002) ----------
export type TipPv = 'lucrari_ascunse' | 'faza_determinanta' | 'proba' | 'punere_in_functiune'
  | 'receptie_stadiu_fizic' | 'receptie_partiala' | 'receptie_terminare' | 'receptie_finala' | 'alt';
export type StarePv = 'convocat' | 'in_semnare' | 'semnat' | 'contestat' | 'anulat';
export type DeciziePv = 'confirm' | 'confirm_cu_observatii' | 'refuz';

export const TIPURI_PV: { id: TipPv; nume: string; obligatorii: Rol[]; ordine426?: boolean; nota?: string }[] = [
  { id: 'lucrari_ascunse', nume: 'Lucrări ascunse', obligatorii: ['diriginte', 'constructor'] },
  { id: 'faza_determinanta', nume: 'Fază determinantă', obligatorii: ['diriginte', 'constructor', 'proiectant'], ordine426: true,
    nota: 'Inspectoratul în construcții se convoacă conform programului de control. Proiectantul confirmă după diriginte și RTE (art. 426 alin. 3).' },
  { id: 'proba', nume: 'Probă (presiune, etanșeitate, funcțională)', obligatorii: ['diriginte', 'constructor'] },
  { id: 'punere_in_functiune', nume: 'Punere în funcțiune', obligatorii: ['diriginte', 'constructor'] },
  { id: 'receptie_stadiu_fizic', nume: 'Recepție pe stadiu fizic', obligatorii: ['diriginte', 'beneficiar'],
    nota: 'Se consemnează starea lucrării, viciile, măsurile, termenele și măsurile de conservare (art. 527 alin. 7).' },
  { id: 'receptie_partiala', nume: 'Recepție parțială', obligatorii: ['diriginte', 'beneficiar'],
    nota: 'Pentru părți distincte fizic și funcțional, cu avizul proiectantului (art. 527 alin. 3).' },
  { id: 'receptie_terminare', nume: 'Recepție la terminarea lucrărilor', obligatorii: ['diriginte', 'beneficiar', 'constructor'], ordine426: true,
    nota: 'Proiectantul confirmă după diriginte și RTE (art. 426 alin. 3). Dosarul de recepție: art. 528.' },
  { id: 'receptie_finala', nume: 'Recepție finală', obligatorii: ['diriginte', 'beneficiar'] },
  { id: 'alt', nume: 'Alt proces verbal', obligatorii: [] },
];
export const tipPv = (t: TipPv) => TIPURI_PV.find(x => x.id === t)!;

export const STARI_PV: Record<StarePv, { eticheta: string; ton: Stare['ton'] }> = {
  convocat: { eticheta: 'Convocat', ton: 'neutru' },
  in_semnare: { eticheta: 'În semnare', ton: 'atentie' },
  semnat: { eticheta: 'Semnat', ton: 'ok' },
  contestat: { eticheta: 'Contestat', ton: 'alerta' },
  anulat: { eticheta: 'Anulat', ton: 'neutru' },
};

export const DECIZII: Record<DeciziePv, string> = {
  confirm: 'Confirmat',
  confirm_cu_observatii: 'Confirmat cu observații',
  refuz: 'Refuzat',
};

export const codPv = (codProiect: string, numar: number) => `PV-${codProiect}-${String(numar).padStart(4, '0')}`;

// ---------- registrul electronic (art. 456 lit. f, art. 459 lit. i) ----------
export type TipRegistru = 'verificare' | 'lucrari_ascunse' | 'faza_determinanta' | 'proba' | 'receptie'
  | 'neconformitate' | 'oprire_lucrari' | 'notificare_isc' | 'dispozitie_santier' | 'alt'
  | 'aprobare_fam' | 'verificare_livrare' | 'condica_betoane' | 'incercare';
export const TIPURI_REGISTRU: { id: TipRegistru; nume: string; manual: boolean }[] = [
  { id: 'verificare', nume: 'Verificare pe șantier', manual: true },
  { id: 'neconformitate', nume: 'Raport de neconformitate', manual: true },
  { id: 'oprire_lucrari', nume: 'Oprirea lucrărilor', manual: true },
  { id: 'notificare_isc', nume: 'Înștiințare ISC (24 de ore)', manual: true },
  { id: 'dispozitie_santier', nume: 'Dispoziție de șantier', manual: true },
  { id: 'lucrari_ascunse', nume: 'Lucrări ascunse', manual: false },
  { id: 'faza_determinanta', nume: 'Fază determinantă', manual: false },
  { id: 'proba', nume: 'Probă', manual: false },
  { id: 'receptie', nume: 'Recepție', manual: false },
  { id: 'aprobare_fam', nume: 'Decizie FAM', manual: false },
  { id: 'verificare_livrare', nume: 'Verificare la livrare', manual: false },
  { id: 'condica_betoane', nume: 'Condica de betoane', manual: false },
  { id: 'incercare', nume: 'Rezultat de încercare', manual: false },
  { id: 'alt', nume: 'Altă activitate', manual: true },
];
export const numeTipRegistru = (t: TipRegistru) => TIPURI_REGISTRU.find(x => x.id === t)?.nume ?? t;

// ---------- propunere de text pentru PV (fără AI: șabloane pe tip) ----------
/** Compune o propunere de descriere și de concluzii din datele PV-ului.
 *  Constructorul o verifică și o corectează înainte de salvare. */
export function propunereContinutPv(d: {
  tip: TipPv; obiect: string; elemente?: string | null; referinte?: string | null;
  proiect?: { denumire: string; adresa?: string | null; ac_numar?: string | null; ac_emis_la?: string | null };
}): { descriere: string; concluzii: string } {
  const ob = d.obiect.trim().replace(/\.$/, '');
  const obMic = ob.charAt(0).toLowerCase() + ob.slice(1);
  const la = d.elemente?.trim() ? ` la ${d.elemente.trim().replace(/\.$/, '')}` : '';
  const ref = d.referinte?.trim()
    ? `documentația de referință (${d.referinte.trim().replace(/\.$/, '')})`
    : 'proiectul tehnic de execuție și detaliile de execuție';
  const ac = d.proiect?.ac_numar ? `, autorizată prin autorizația de construire nr. ${d.proiect.ac_numar}${d.proiect.ac_emis_la ? ` din ${formatData(d.proiect.ac_emis_la)}` : ''}` : '';
  const lucrarea = d.proiect ? ` în cadrul lucrării „${d.proiect.denumire}”${ac}` : '';
  const conform = `în conformitate cu ${ref} și cu reglementările tehnice în vigoare`;
  const materiale = 'Materialele puse în operă sunt cele aprobate prin fișele de aprobare a materialelor (FAM) și au documentele de calitate aferente.';

  switch (d.tip) {
    case 'lucrari_ascunse':
      return {
        descriere: `S-au executat lucrările de ${obMic}${la}${lucrarea}, ${conform}. ${materiale}`,
        concluzii: 'Lucrările verificate sunt executate conform proiectului și pot fi acoperite. Se admite continuarea lucrărilor.',
      };
    case 'faza_determinanta':
      return {
        descriere: `S-a verificat faza determinantă „${ob}”${la}${lucrarea}, prevăzută în programul de control al calității lucrărilor. Lucrările au fost executate ${conform}. ${materiale}`,
        concluzii: 'Faza determinantă este realizată conform proiectului și programului de control al calității. Se admite trecerea la faza următoare de execuție.',
      };
    case 'proba':
      return {
        descriere: `S-a efectuat proba de ${obMic}${la}${lucrarea}, ${conform}. Parametrii de probă și rezultatele sunt cele din buletinul de probă atașat.`,
        concluzii: 'Proba s-a desfășurat cu rezultate corespunzătoare cerințelor proiectului. Se admite continuarea lucrărilor.',
      };
    case 'punere_in_functiune':
      return {
        descriere: `S-a realizat punerea în funcțiune a ${obMic}${la}${lucrarea}, ${conform} și cu instrucțiunile producătorului.`,
        concluzii: 'Echipamentele și instalațiile funcționează la parametrii prevăzuți în proiect. Se admite punerea în funcțiune.',
      };
    case 'receptie_stadiu_fizic':
      return {
        descriere: `S-a constatat stadiul fizic de execuție pentru ${obMic}${la}${lucrarea}. Starea lucrărilor executate, viciile constatate, măsurile și termenele de remediere și măsurile de conservare sunt consemnate mai jos.`,
        concluzii: 'Se preia partea de construcție în stadiul fizic constatat, cu măsurile de remediere și de conservare consemnate.',
      };
    case 'receptie_partiala':
      return {
        descriere: `Partea de construcție „${ob}”${la}${lucrarea} este distinctă din punct de vedere fizic și funcțional, a fost executată ${conform} și poate fi exploatată în condiții de siguranță.`,
        concluzii: 'Se admite recepția parțială pentru partea de construcție descrisă.',
      };
    case 'receptie_terminare':
      return {
        descriere: `Lucrările ${obMic}${lucrarea} au fost finalizate ${conform}. Documentele recepției sunt cele prevăzute la art. 528 din Legea 169/2026 și sunt cuprinse în cartea tehnică a construcției.`,
        concluzii: 'Se admite recepția la terminarea lucrărilor.',
      };
    case 'receptie_finala':
      return {
        descriere: `La expirarea perioadei de garanție s-a verificat comportarea lucrărilor ${obMic}${lucrarea}. Viciile apărute în perioada de garanție au fost remediate.`,
        concluzii: 'Se admite recepția finală.',
      };
    default:
      return {
        descriere: `S-au verificat lucrările de ${obMic}${la}${lucrarea}, ${conform}.`,
        concluzii: 'Lucrările verificate sunt conforme cu proiectul.',
      };
  }
}

// ---------- FAM (migrarea 0004) ----------
export type StareFam = 'ciorna' | 'depus' | 'completari' | 'avizat' | 'aprobat' | 'aprobat_cu_observatii' | 'respins';
export type AvizFam = 'conform' | 'echivalent' | 'neconform';
export type DecizieFam = 'aprobat' | 'aprobat_cu_observatii' | 'respins';

export const STARI_FAM: Record<StareFam, { eticheta: string; ton: Stare['ton']; cine?: string }> = {
  ciorna: { eticheta: 'Ciornă', ton: 'neutru', cine: 'constructor' },
  depus: { eticheta: 'La avizul proiectantului', ton: 'atentie', cine: 'proiectant' },
  completari: { eticheta: 'De completat', ton: 'atentie', cine: 'constructor' },
  avizat: { eticheta: 'La decizia dirigintelui', ton: 'atentie', cine: 'diriginte' },
  aprobat: { eticheta: 'Aprobat', ton: 'ok' },
  aprobat_cu_observatii: { eticheta: 'Aprobat cu observații', ton: 'ok' },
  respins: { eticheta: 'Respins', ton: 'alerta', cine: 'constructor' },
};
export const AVIZE: Record<AvizFam, string> = {
  conform: 'Conform cu proiectul', echivalent: 'Echivalent cu produsul din proiect', neconform: 'Neconform, de completat',
};
export const codFam = (codProiect: string, numar: number, revizie: number) =>
  `FAM-${codProiect}-${String(numar).padStart(3, '0')}/R${revizie}`;

export const TIPURI_ATASAMENT: Record<string, string> = {
  fisa_tehnica: 'Fișă tehnică',
  dop: 'Declarație de performanță',
  agrement: 'Agrement tehnic',
  certificat: 'Certificat / declarație de conformitate',
  instructiuni: 'Instrucțiuni de utilizare',
  aviz_insotire: 'Aviz de însoțire / certificat de lot',
  poza: 'Fotografie',
  pv_semnat: 'PV semnat (scan sau semnat electronic)',
  bon_livrare: 'Bonuri de livrare beton',
  buletin: 'Buletin de încercare',
  altul: 'Alt document',
};

// ---------- condica de betoane și încercări (migrarea 0005) ----------
export const TIPURI_INCERCARE: { id: string; nume: string; unitate?: string; varsta?: number }[] = [
  { id: 'compresiune_28', nume: 'Rezistența la compresiune la 28 de zile', unitate: 'MPa', varsta: 28 },
  { id: 'compresiune_7', nume: 'Rezistența la compresiune la 7 zile', unitate: 'MPa', varsta: 7 },
  { id: 'consistenta', nume: 'Consistența (tasarea conului)', unitate: 'mm' },
  { id: 'permeabilitate', nume: 'Adâncimea de pătrundere a apei', unitate: 'mm' },
  { id: 'gelivitate', nume: 'Rezistența la îngheț-dezgheț' },
  { id: 'altul', nume: 'Altă încercare' },
];
export const numeIncercare = (t: string) => TIPURI_INCERCARE.find(x => x.id === t)?.nume ?? t;

/** Din clasa betonului (ex. C25/30) rezultă rezistența caracteristică pe cilindri și pe cuburi. */
export function rezistenteClasa(clasa: string): { fck: number; fckCub: number } | null {
  const m = /^L?C(\d{1,3})\/(\d{1,3})$/.exec(clasa.trim().toUpperCase());
  return m ? { fck: Number(m[1]), fckCub: Number(m[2]) } : null;
}
export const CLASE_BETON = ['C8/10', 'C12/15', 'C16/20', 'C20/25', 'C25/30', 'C30/37', 'C35/45', 'C40/50', 'C45/55', 'C50/60'];
