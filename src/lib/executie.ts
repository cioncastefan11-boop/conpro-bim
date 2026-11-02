// Starea execuției pe model: din legăturile elementelor cu PV-uri, turnări și FAM-uri,
// din marcajele „executat” și din observațiile deschise (harta BIM, linia IFC).
export type StareElement = 'observatie' | 'verificat' | 'in_verificare' | 'executat';
export type Legatura = { entitate: 'pv' | 'turnare' | 'fam'; entitate_id: string; guid: string; nume?: string | null; clasa?: string | null };
export type DateExecutie = {
  legaturi: Legatura[];
  pvs: { id: string; numar: number; stare: string }[];
  turnari: { id: string; numar: number }[];
  executate: { guid: string; executat_la: string }[];
  observatii: { id: string; numar: number; stare: string; elemente: { guid: string }[] }[];
};

export const STARI_ELEMENT: Record<StareElement, { nume: string; culoare: string; ordine: number }> = {
  observatie: { nume: 'Cu observație deschisă', culoare: '#dc2626', ordine: 0 },
  verificat: { nume: 'Verificat (PV semnat)', culoare: '#16a34a', ordine: 1 },
  in_verificare: { nume: 'În verificare (PV în curs)', culoare: '#eab308', ordine: 2 },
  executat: { nume: 'Executat', culoare: '#2563eb', ordine: 3 },
};

/** Starea fiecărui element (după GlobalId), cu cea mai importantă stare câștigând. */
export function stariElemente(d: DateExecutie): Map<string, StareElement> {
  const r = new Map<string, StareElement>();
  const pune = (g: string, s: StareElement) => { const v = r.get(g); if (!v || STARI_ELEMENT[s].ordine < STARI_ELEMENT[v].ordine) r.set(g, s); };
  const pv = new Map(d.pvs.map(p => [p.id, p.stare]));
  for (const l of d.legaturi) {
    if (l.entitate === 'pv') {
      const s = pv.get(l.entitate_id);
      if (s === 'semnat') pune(l.guid, 'verificat');
      else if (s === 'convocat' || s === 'in_semnare' || s === 'contestat') pune(l.guid, 'in_verificare');
    } else if (l.entitate === 'turnare') pune(l.guid, 'executat');
  }
  for (const e of d.executate) pune(e.guid, 'executat');
  for (const o of d.observatii) if (o.stare !== 'inchisa') for (const e of o.elemente) pune(e.guid, 'observatie');
  return r;
}

/** Ce știe aplicația despre un element: PV-urile, turnările, FAM-urile, observațiile. */
export function trasabilitate(d: DateExecutie, guid: string) {
  const leg = d.legaturi.filter(l => l.guid === guid);
  return {
    pvs: leg.filter(l => l.entitate === 'pv').map(l => d.pvs.find(p => p.id === l.entitate_id)).filter(Boolean) as DateExecutie['pvs'],
    turnari: leg.filter(l => l.entitate === 'turnare').map(l => d.turnari.find(t => t.id === l.entitate_id)).filter(Boolean) as DateExecutie['turnari'],
    fam: leg.filter(l => l.entitate === 'fam').map(l => l.entitate_id),
    executat: d.executate.find(e => e.guid === guid)?.executat_la ?? null,
    observatii: d.observatii.filter(o => o.elemente.some(e => e.guid === guid)),
  };
}

/** Numărul de elemente pe stări, pentru legendă. */
export function numaraStari(m: Map<string, StareElement>): Record<StareElement, number> {
  const n: Record<StareElement, number> = { observatie: 0, verificat: 0, in_verificare: 0, executat: 0 };
  m.forEach(s => { n[s]++; });
  return n;
}
