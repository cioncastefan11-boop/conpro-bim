import type { ReactNode } from 'react';
import type { Stare } from '../lib/domeniu';

export const Eticheta = ({ stare }: { stare: Stare }) =>
  <span className={`eticheta ${stare.ton}`}>{stare.eticheta}</span>;

export function Eroare({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mesaj alerta" role="alert">{text}</p>;
}

export function Gol({ titlu, children }: { titlu: string; children?: ReactNode }) {
  return <div className="gol"><h3>{titlu}</h3>{children}</div>;
}

/** Traduce erorile frecvente din baza de date în mesaje pentru utilizator. */
export function mesajEroare(e: { message?: string; code?: string } | null): string | null {
  if (!e) return null;
  const m = e.message ?? '';
  if (e.code === '23505' || m.includes('duplicate key')) return 'Există deja o înregistrare cu aceste date (de exemplu același cod de proiect sau aceeași invitație).';
  if (m.includes('row-level security') || e.code === '42501') return 'Nu aveți drept pentru această operație.';
  if (m.includes('proiecte_cod_check')) return 'Codul proiectului are 3–6 litere mari sau cifre, fără spații (ex. BLC01).';
  if (m.includes('ac_prelungire_max_12_luni')) return 'Prelungirea autorizației se face o singură dată, cu cel mult 12 luni după termenul inițial.';
  if (m.includes('ac_termen_valid')) return 'Termenul autorizației nu poate fi înaintea datei de emitere.';
  if (m.includes('check constraint')) return 'Unele valori nu sunt valide. Verificați datele introduse.';
  return m;
}
