import type { Rol, TipDoc } from './domeniu';

export type Proiect = {
  id: string;
  cod: string;
  denumire: string;
  adresa: string | null;
  beneficiar: string | null;
  stadiu_catuc: number;
  clasa_consecinte: 'CC1' | 'CC2' | 'CC3' | 'CC4' | null;
  data_cerere_ac: string | null;
  regim_legal: string | null;
  ac_numar: string | null;
  ac_emis_la: string | null;
  ac_valabil_pana: string | null;
  ac_prelungit_pana: string | null;
  arhivat: boolean;
  creat_la: string;
};

export type Firma = { id: string; denumire: string; cui: string | null };

export type Persoana = {
  id: string;
  nume: string;
  email: string;
  telefon: string | null;
  firma_id: string | null;
  firme?: { denumire: string } | null;
};

export type Membru = {
  proiect_id: string;
  persoana_id: string;
  rol: Rol;
  zona: string | null;
  persoane: Persoana | null;
};

export type Invitatie = { id: string; email: string; rol: Rol; zona: string | null; creat_la: string; acceptat_la: string | null };

export type DocumentPersoana = {
  id: string;
  persoana_id: string;
  tip: TipDoc;
  domeniu: string | null;
  numar: string | null;
  emitent: string | null;
  valabil_de: string | null;
  valabil_pana: string | null;
  anulat: boolean;
};

export type IntrareJurnal = {
  id: number;
  tabel: string;
  operatie: 'INSERT' | 'UPDATE' | 'DELETE';
  inainte: Record<string, unknown> | null;
  dupa: Record<string, unknown> | null;
  autor: string | null;
  la: string;
};

export type ProcesVerbal = {
  id: string;
  proiect_id: string;
  numar: number;
  tip: import('./domeniu').TipPv;
  obiect: string;
  elemente: string | null;
  data_pv: string;
  loc: string | null;
  alti_participanti: string | null;
  stare: import('./domeniu').StarePv;
  convocat_de: string;
  convocat_la: string;
  semnat_la: string | null;
  anulat_de: string | null;
  anulat_la: string | null;
  motiv_anulare: string | null;
  descriere_lucrari: string | null;
  referinte_proiect: string | null;
  concluzii: string | null;
  completat_de: string | null;
  completat_la: string | null;
};

export type ParticipantPv = {
  id: string;
  pv_id: string;
  persoana_id: string;
  rol: Rol;
  decizie: import('./domeniu').DeciziePv | null;
  observatii: string | null;
  confirmat_la: string | null;
};

export type IntrareRegistru = {
  id: string;
  persoana_id: string;
  proiect_id: string;
  rol: Rol;
  data: string;
  tip: import('./domeniu').TipRegistru;
  descriere: string;
  pv_id: string | null;
  corecteaza_id: string | null;
  automat: boolean;
  creat_la: string;
};

export type Fam = {
  id: string; proiect_id: string; numar: number; revizie: number; fam_anterior_id: string | null;
  material: string; utilizare: string | null; cerinte_proiect: string | null;
  producator: string | null; produs: string | null; furnizor: string | null;
  performante_declarate: string | null; date_mediu: string | null;
  dop_numar: string | null; dop_data: string | null; marcaj_ce: boolean;
  agrement_numar: string | null; agrement_valabil_pana: string | null; alte_documente: string | null;
  stare: import('./domeniu').StareFam;
  creat_de: string; creat_la: string; depus_de: string | null; depus_la: string | null;
  aviz: import('./domeniu').AvizFam | null; aviz_observatii: string | null; avizat_de: string | null; avizat_la: string | null;
  decizie: import('./domeniu').DecizieFam | null; decizie_observatii: string | null; decis_de: string | null; decis_la: string | null;
};

export type LivrareFam = {
  id: string; fam_id: string; proiect_id: string; data: string; cantitate: string | null; lot: string | null;
  document_insotire: string | null; conform: boolean; observatii: string | null; verificat_de: string; creat_la: string;
};

export type Atasament = {
  id: string; proiect_id: string; entitate: 'fam' | 'livrare_fam' | 'pv' | 'turnare' | 'incercare' | 'tip_echipament' | 'echipament' | 'document_carte'; entitate_id: string;
  tip_document: string; nume_fisier: string; cale: string; marime: number | null; incarcat_de: string; incarcat_la: string;
};

export type Turnare = {
  id: string; proiect_id: string; numar: number; data: string; element: string; clasa_beton: string;
  clasa_expunere: string | null; consistenta: string | null; dmax: number | null; volum: number | null; statie: string | null;
  fam_id: string | null; pv_id: string | null; bonuri: string | null; ora_inceput: string | null; ora_sfarsit: string | null;
  temp_aer: number | null; temp_beton: number | null; mod_punere: string | null; tratare: string | null;
  probe_prelevate: number | null; coduri_probe: string | null; observatii: string | null;
  inregistrat_de: string; creat_la: string; vizat_de: string | null; vizat_la: string | null; observatii_viza: string | null;
};

export type Incercare = {
  id: string; proiect_id: string; turnare_id: string | null; fam_id: string | null; tip: string; descriere: string | null;
  laborator: string | null; buletin_numar: string | null; buletin_data: string | null; varsta_zile: number | null;
  valoare: number | null; unitate: string | null; cerinta: string | null; conform: boolean; observatii: string | null;
  introdus_de: string; creat_la: string; verificat_de: string | null; verificat_la: string | null;
};

export type Nivel = { id: string; proiect_id: string; cod: string; denumire: string; cota: number | null; ordine: number; creat_de: string };
export type Incapere = { id: string; proiect_id: string; nivel_id: string; cod: string; denumire: string; functiune: string | null; arie: number | null; creat_de: string };
export type TipEchipament = {
  id: string; proiect_id: string; denumire: string; categorie: string | null; producator: string | null; model: string | null;
  fam_id: string | null; garantie_luni: number | null; garant: string | null; interval_mentenanta_luni: number | null;
  durata_viata_ani: number | null; instructiuni_mentenanta: string | null; creat_de: string; creat_la: string;
};
export type Echipament = {
  id: string; proiect_id: string; tip_id: string; incapere_id: string | null; cod: string; serie: string | null;
  data_montaj: string | null; data_punere_functiune: string | null; pv_id: string | null; garantie_start: string | null;
  observatii: string | null; creat_de: string; creat_la: string;
};
export type DocumentCarte = {
  id: string; proiect_id: string; capitol: 'A' | 'B' | 'C' | 'D'; titlu: string; numar: string | null; data: string | null;
  emitent: string | null; observatii: string | null; creat_de: string; creat_la: string;
};
