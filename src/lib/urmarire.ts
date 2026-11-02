// Urmărirea comportării în timp: scadențele punctelor din program (aceeași regulă ca în baza de date,
// scadente_urmarire_intern): ultima verificare (sau intrarea în exploatare) plus intervalul în luni.
import type { ConstatareInspectie, InspectieUrmarire, Proiect, PunctUrmarire, ScadentaUrmarire } from './tipuri';

/** Adaugă luni unei date ISO, ca în Postgres: ziua se oprește la sfârșitul lunii (31.01 + 1 lună = 28/29.02). */
export function plusLuni(iso: string, luni: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + luni, 1));
  const ultima = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, ultima));
  return t.toISOString().slice(0, 10);
}

export function scadente(p: Proiect, puncte: PunctUrmarire[], inspectii: InspectieUrmarire[], constatari: ConstatareInspectie[]): ScadentaUrmarire[] {
  if (!p.exploatare_din) return [];
  const data = new Map(inspectii.map(i => [i.id, i.data_inspectiei]));
  return puncte.filter(x => x.activ).map(x => {
    const ultima = constatari.filter(c => c.punct_id === x.id && c.stare !== 'neverificat')
      .map(c => data.get(c.inspectie_id) ?? '').filter(Boolean).sort().pop() ?? null;
    return { punct_id: x.id, ce: x.ce, interval_luni: x.interval_luni, ultima, urmatoarea: plusLuni(ultima ?? p.exploatare_din!, x.interval_luni) };
  }).sort((a, b) => a.urmatoarea.localeCompare(b.urmatoarea));
}
