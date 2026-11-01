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
