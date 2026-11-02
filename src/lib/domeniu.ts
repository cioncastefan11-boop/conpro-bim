// Denumiri și reguli din Legea 169/2026 (CATUC) și ISO 19650.
import type { CalitateComisie, DecizieReceptie, Receptie, StareReceptie } from './tipuri';

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
  pv_semnat: 'PV semnat electronic',
  pv_scanat: 'PV semnat olograf (scan)',
  bon_livrare: 'Bonuri de livrare beton',
  manual: 'Manual de utilizare și mentenanță',
  certificat_garantie: 'Certificat de garanție',
  document: 'Document',
  buletin: 'Buletin de încercare',
  punct_vedere_proiectant: 'Punctul de vedere al proiectantului',
  punct_vedere_diriginte: 'Punctul de vedere al dirigintelui',
  pv_receptie_semnat: 'PV de recepție semnat',
  fisa_instruire: 'Fișă de instruire a operatorilor',
  as_built: 'Proiectul as-built',
  instiintare_finalizare: 'Înștiințarea emitentului AC',
  raport_comportare: 'Raportul privind comportarea în exploatare',
  dovada_remediere: 'Dovada remedierii',
  altul: 'Alt document',
};

// ---------- condica de betoane și încercări (migrarea 0005) ----------
export const TIPURI_INCERCARE: { id: string; nume: string; unitate?: string; varsta?: number }[] = [
  { id: 'compresiune_28', nume: 'Rezistența la compresiune la 28 de zile', unitate: 'MPa', varsta: 28 },
  { id: 'compresiune_7', nume: 'Rezistența la compresiune la 7 zile', unitate: 'MPa', varsta: 7 },
  { id: 'consistenta', nume: 'Consistența (tasarea conului)', unitate: 'mm' },
  { id: 'permeabilitate', nume: 'Adâncimea de pătrundere a apei', unitate: 'mm' },
  { id: 'nedistructiv', nume: 'Încercare nedistructivă (sclerometru, ultrasunete)' },
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

// ---------- echipamente și Cartea tehnică (migrarea 0006) ----------
export const CATEGORII_ECHIPAMENT = ['Încălzire', 'Răcire', 'Ventilare', 'Sanitare', 'Electrice', 'Iluminat', 'Curenți slabi',
  'Securitate la incendiu', 'Lifturi', 'Tâmplărie și uși', 'Altele'];
export const CAPITOLE_CARTE: { id: 'A' | 'B' | 'C' | 'D'; nume: string; continut: string }[] = [
  { id: 'A', nume: 'A · Documentația privind proiectarea', continut: 'Certificatul de urbanism, autorizația, avizele, proiectul tehnic actualizat la recepție, as-built, dispozițiile de șantier ale proiectantului.' },
  { id: 'B', nume: 'B · Documentația privind execuția', continut: 'Procesele verbale de lucrări ascunse și faze determinante, FAM-urile și livrările, condica de betoane, încercările, probele.' },
  { id: 'C', nume: 'C · Documentația privind recepția', continut: 'Procesele verbale de recepție, punctele de vedere ale proiectanților și dirigintelui, fișele de instruire.' },
  { id: 'D', nume: 'D · Exploatarea, întreținerea și urmărirea comportării', continut: 'Manualul de utilizare și mentenanță, inventarul echipamentelor (COBie), garanțiile, programul de urmărire în timp.' },
];

// ---------- recepția (migrarea 0008) ----------

export const STARI_RECEPTIE: Record<StareReceptie, { eticheta: string; ton: Stare['ton'] }> = {
  pregatire: { eticheta: 'În pregătire', ton: 'neutru' },
  convocata: { eticheta: 'Comisie convocată', ton: 'atentie' },
  decisa: { eticheta: 'La aprobarea beneficiarului', ton: 'atentie' },
  aprobata: { eticheta: 'Aprobată', ton: 'ok' },
  respinsa: { eticheta: 'Respinsă', ton: 'alerta' },
  anulata: { eticheta: 'Anulată', ton: 'neutru' },
};
export const DECIZII_RECEPTIE: Record<DecizieReceptie, { nume: string; ton: Stare['ton']; doarFinala?: boolean }> = {
  admitere: { nume: 'Admiterea recepției', ton: 'ok' },
  admitere_cu_obiectii: { nume: 'Admiterea recepției cu obiecții', ton: 'ok' },
  suspendare: { nume: 'Suspendarea recepției', ton: 'atentie' },
  respingere: { nume: 'Respingerea recepției', ton: 'alerta' },
  prelungire_garantie: { nume: 'Prelungirea perioadei de garanție', ton: 'atentie', doarFinala: true },
};
export const CALITATI_COMISIE: { id: CalitateComisie; nume: string; veto?: boolean; invitat?: boolean }[] = [
  { id: 'presedinte', nume: 'Președinte (reprezentantul investitorului)' },
  { id: 'reprezentant_ac', nume: 'Reprezentantul emitentului autorizației', veto: true },
  { id: 'specialist', nume: 'Specialist' },
  { id: 'isc', nume: 'Inspectoratul de Stat în Construcții', veto: true },
  { id: 'isu', nume: 'Inspectoratul pentru Situații de Urgență', veto: true },
  { id: 'cultura', nume: 'Direcția pentru cultură', veto: true },
  { id: 'ordonator_credite', nume: 'Ordonatorul principal de credite', veto: true },
  { id: 'invitat_executant', nume: 'Invitat · executantul', invitat: true },
  { id: 'invitat_proiectant', nume: 'Invitat · proiectantul', invitat: true },
  { id: 'invitat_altul', nume: 'Invitat', invitat: true },
];
export const calitate = (c: CalitateComisie) => CALITATI_COMISIE.find(x => x.id === c)!;
export const POZITII_COMISIE = { de_acord: 'De acord', obiectii: 'De acord, cu obiecții', veto: 'Veto: propune respingerea' } as const;

/** Garanția minimă după clasa de consecințe, în luni (art. 531 alin. 6). */
export const garantieMinima = (cc: string | null) => ({ CC1: 12, CC2: 36, CC3: 60, CC4: 60 } as Record<string, number>)[cc ?? ''] ?? null;
export const numeReceptie = (r: Pick<Receptie, 'tip' | 'partiala'>) =>
  (r.tip === 'terminare' ? 'Recepția la terminarea lucrărilor' : 'Recepția finală') + (r.partiala ? ' (parțială)' : '');
export const codReceptie = (proiect: string, numar: number) => `REC-${proiect}-${String(numar).padStart(2, '0')}`;
export const adaugaZile = (iso: string, zile: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + zile); return d.toISOString().slice(0, 10); };

// ---------- documentele proiectului după ISO 19650 (migrarea 0010) ----------
// Codurile din anexa națională la ISO 19650-2 (tipuri, roluri, stări), cu denumiri în română.
export const TIPURI_DOCUMENT: { id: string; nume: string }[] = [
  { id: 'DR', nume: 'Planșă (desen)' }, { id: 'M3', nume: 'Model 3D' }, { id: 'M2', nume: 'Model 2D' },
  { id: 'SP', nume: 'Caiet de sarcini / specificație' }, { id: 'RP', nume: 'Raport' }, { id: 'CA', nume: 'Calcule' },
  { id: 'SH', nume: 'Tabel / listă' }, { id: 'BQ', nume: 'Antemăsurătoare' }, { id: 'SU', nume: 'Studiu, ridicare topo, geotehnic' },
  { id: 'MS', nume: 'Procedură / metodă de execuție' }, { id: 'PR', nume: 'Grafic de execuție' }, { id: 'RI', nume: 'Cerere de informații (RFI)' },
  { id: 'MI', nume: 'Minută de ședință' }, { id: 'CO', nume: 'Corespondență' }, { id: 'HS', nume: 'Sănătate și securitate' },
  { id: 'VS', nume: 'Vizualizare / randare' }, { id: 'CR', nume: 'Raport de coordonare (clash)' }, { id: 'IE', nume: 'Fișier de schimb (IFC, COBie)' },
];
export const ROLURI_DOCUMENT: { id: string; nume: string }[] = [
  { id: 'A', nume: 'Arhitectură' }, { id: 'S', nume: 'Rezistență (structură)' }, { id: 'M', nume: 'Instalații mecanice (HVAC)' },
  { id: 'E', nume: 'Instalații electrice' }, { id: 'P', nume: 'Instalații sanitare' }, { id: 'H', nume: 'Încălzire și ventilare' },
  { id: 'C', nume: 'Inginerie civilă, drumuri' }, { id: 'D', nume: 'Canalizare, drenaj' }, { id: 'G', nume: 'Topografie, geotehnică' },
  { id: 'L', nume: 'Peisagistică' }, { id: 'I', nume: 'Design interior' }, { id: 'Q', nume: 'Devize, cantități' },
  { id: 'F', nume: 'Administrare clădire' }, { id: 'K', nume: 'Beneficiar' }, { id: 'W', nume: 'Constructor' },
  { id: 'X', nume: 'Subcontractor' }, { id: 'Y', nume: 'Proiectant de specialitate' }, { id: 'Z', nume: 'General (mai multe discipline)' },
];
export const CODURI_STARE: Record<string, { nume: string; ton: Stare['ton'] }> = {
  S0: { nume: 'Lucru în curs', ton: 'neutru' },
  S1: { nume: 'Pentru coordonare', ton: 'atentie' },
  S2: { nume: 'Pentru informare', ton: 'atentie' },
  S3: { nume: 'Pentru verificare și comentarii', ton: 'atentie' },
  S4: { nume: 'Pentru aprobarea etapei', ton: 'atentie' },
  A: { nume: 'Aprobat pentru execuție', ton: 'ok' },
  B: { nume: 'Aprobat parțial, cu comentarii', ton: 'ok' },
  CR: { nume: 'Ca executat (as-built)', ton: 'ok' },
};
export const numeCodStare = (c: string) => CODURI_STARE[c]?.nume ?? CODURI_STARE[c.replace(/[0-9]+$/, '')]?.nume ?? c;
export const tonCodStare = (c: string): Stare['ton'] => CODURI_STARE[c]?.ton ?? CODURI_STARE[c.replace(/[0-9]+$/, '')]?.ton ?? 'neutru';
export const STARI_CDE: Record<import('./tipuri').StareRevizie, { eticheta: string; ton: Stare['ton'] }> = {
  wip: { eticheta: 'În lucru', ton: 'neutru' },
  partajat: { eticheta: 'Partajat', ton: 'atentie' },
  publicare_ceruta: { eticheta: 'La aprobare', ton: 'atentie' },
  publicat: { eticheta: 'Publicat', ton: 'ok' },
  arhivat: { eticheta: 'Arhivat', ton: 'neutru' },
};
export const numeTipDocument = (t: string) => TIPURI_DOCUMENT.find(x => x.id === t)?.nume ?? t;
export const numeRolDocument = (r: string) => ROLURI_DOCUMENT.find(x => x.id === r)?.nume ?? r;
/** Următoarea revizie: P01 → P02 în lucru și partajare; C01, C02 după publicare. */
export function revizieUrmatoare(existente: string[], publicata: boolean): string {
  const nr = (pref: string) => existente.filter(r => r.startsWith(pref)).map(r => parseInt(r.slice(1, 3), 10)).reduce((a, b) => Math.max(a, b), 0);
  return publicata ? `C${String(nr('C') + 1).padStart(2, '0')}` : `P${String(nr('P') + 1).padStart(2, '0')}`;
}
