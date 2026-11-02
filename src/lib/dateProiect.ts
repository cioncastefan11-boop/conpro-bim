import { supabase } from './supabase';
import type {
  Atasament, DocumentCarte, Echipament, Fam, Incapere, Incercare, LivrareFam, Membru, Nivel, ParticipantPv,
  ProcesVerbal, Proiect, TipEchipament, EvenimentExploatare, PunctUrmarire, InspectieUrmarire, ConstatareInspectie, InterventieEchipament, Turnare, Receptie, MembruComisie, ObiectieReceptie, DocumentProiect, RevizieDocument,
} from './tipuri';

/** Toate datele unui proiect, pentru COBie, Cartea tehnică și arhivă. */
export type DateProiect = {
  proiect: Proiect;
  membri: Membru[];
  niveluri: Nivel[];
  incaperi: Incapere[];
  tipuri: TipEchipament[];
  echipamente: Echipament[];
  documente: DocumentCarte[];
  pvs: ProcesVerbal[];
  participanti: ParticipantPv[];
  famuri: Fam[];
  livrari: LivrareFam[];
  turnari: Turnare[];
  incercari: Incercare[];
  atasamente: Atasament[];
  receptii: Receptie[];
  comisii: MembruComisie[];
  obiectii: ObiectieReceptie[];
  documenteProiect: DocumentProiect[];
  revizii: RevizieDocument[];
  evenimente: EvenimentExploatare[];
  puncte: PunctUrmarire[];
  inspectii: InspectieUrmarire[];
  constatari: ConstatareInspectie[];
  interventii: InterventieEchipament[];
  legaturi: { entitate: string; entitate_id: string; guid: string; nume: string | null; clasa: string | null }[];
  cerinte: import('./cerinte').CerintaPredare[];
};

export async function incarcaDateProiect(proiect: Proiect, membri: Membru[]): Promise<DateProiect> {
  const id = proiect.id;
  const q = <T,>(t: string, ord = 'id') => supabase.from(t).select('*').eq('proiect_id', id).order(ord).then(r => {
    if (r.error) throw r.error;
    return (r.data ?? []) as T[];
  });
  const [niveluri, incaperi, tipuri, echipamente, documente, pvs, participanti, famuri, livrari, turnari, incercari, atasamente, receptii, comisii, obiectii, documenteProiect, revizii, evenimente, puncte, inspectii, constatari, interventii, legaturi, cerinte] = await Promise.all([
    q<Nivel>('niveluri', 'ordine'), q<Incapere>('incaperi', 'cod'), q<TipEchipament>('tipuri_echipament', 'denumire'),
    q<Echipament>('echipamente', 'cod'), q<DocumentCarte>('documente_carte', 'creat_la'), q<ProcesVerbal>('procese_verbale', 'numar'),
    q<ParticipantPv>('participanti_pv'), q<Fam>('fam', 'numar'), q<LivrareFam>('livrari_fam', 'data'),
    q<Turnare>('turnari', 'numar'), q<Incercare>('incercari', 'creat_la'), q<Atasament>('atasamente', 'incarcat_la'),
    q<Receptie>('receptii', 'numar'), q<MembruComisie>('comisie_receptie', 'ordine'), q<ObiectieReceptie>('obiectii_receptie', 'numar'),
    q<DocumentProiect>('documente_proiect', 'cod'), q<RevizieDocument>('revizii_document', 'creat_la'),
    proiect.exploatare_din ? q<EvenimentExploatare>('evenimente_exploatare', 'numar') : Promise.resolve([] as EvenimentExploatare[]),
    proiect.exploatare_din ? q<PunctUrmarire>('puncte_urmarire', 'ordine') : Promise.resolve([] as PunctUrmarire[]),
    proiect.exploatare_din ? q<InspectieUrmarire>('inspectii_urmarire', 'numar') : Promise.resolve([] as InspectieUrmarire[]),
    proiect.exploatare_din ? q<ConstatareInspectie>('constatari_inspectie', 'inspectie_id') : Promise.resolve([] as ConstatareInspectie[]),
    proiect.exploatare_din ? q<InterventieEchipament>('interventii_echipament', 'numar') : Promise.resolve([] as InterventieEchipament[]),
    // legăturile cu modelul (migrarea 0019); dacă scriptul nu e rulat încă, lista rămâne goală
    supabase.from('elemente_legate').select('entitate, entitate_id, guid, nume, clasa').eq('proiect_id', id).then(r => (r.data ?? []) as DateProiect['legaturi']),
    supabase.from('cerinte_predare').select('*').eq('proiect_id', id).order('ordine').then(r => (r.data ?? []) as DateProiect['cerinte']),
  ]);
  return { proiect, membri, niveluri, incaperi, tipuri, echipamente, documente, pvs, participanti, famuri, livrari, turnari, incercari, atasamente, receptii, comisii, obiectii, documenteProiect, revizii, evenimente, puncte, inspectii, constatari, interventii, legaturi, cerinte };
}

export const emailDe = (d: DateProiect, id: string | null) =>
  d.membri.find(m => m.persoana_id === id)?.persoane?.email ?? '';
export const numeDe = (d: DateProiect, id: string | null) => {
  const p = d.membri.find(m => m.persoana_id === id)?.persoane;
  return p ? (p.nume || p.email) : '—';
};
