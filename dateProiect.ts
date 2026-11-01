import { supabase } from './supabase';
import type {
  Atasament, DocumentCarte, Echipament, Fam, Incapere, Incercare, LivrareFam, Membru, Nivel, ParticipantPv,
  ProcesVerbal, Proiect, TipEchipament, Turnare,
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
};

export async function incarcaDateProiect(proiect: Proiect, membri: Membru[]): Promise<DateProiect> {
  const id = proiect.id;
  const q = <T,>(t: string, ord = 'id') => supabase.from(t).select('*').eq('proiect_id', id).order(ord).then(r => {
    if (r.error) throw r.error;
    return (r.data ?? []) as T[];
  });
  const [niveluri, incaperi, tipuri, echipamente, documente, pvs, participanti, famuri, livrari, turnari, incercari, atasamente] = await Promise.all([
    q<Nivel>('niveluri', 'ordine'), q<Incapere>('incaperi', 'cod'), q<TipEchipament>('tipuri_echipament', 'denumire'),
    q<Echipament>('echipamente', 'cod'), q<DocumentCarte>('documente_carte', 'creat_la'), q<ProcesVerbal>('procese_verbale', 'numar'),
    q<ParticipantPv>('participanti_pv'), q<Fam>('fam', 'numar'), q<LivrareFam>('livrari_fam', 'data'),
    q<Turnare>('turnari', 'numar'), q<Incercare>('incercari', 'creat_la'), q<Atasament>('atasamente', 'incarcat_la'),
  ]);
  return { proiect, membri, niveluri, incaperi, tipuri, echipamente, documente, pvs, participanti, famuri, livrari, turnari, incercari, atasamente };
}

export const emailDe = (d: DateProiect, id: string | null) =>
  d.membri.find(m => m.persoana_id === id)?.persoane?.email ?? '';
export const numeDe = (d: DateProiect, id: string | null) => {
  const p = d.membri.find(m => m.persoana_id === id)?.persoane;
  return p ? (p.nume || p.email) : '—';
};
