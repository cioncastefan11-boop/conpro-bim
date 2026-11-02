// Preluarea în COBie a nivelurilor, încăperilor și echipamentelor din modelele IFC.
// Calculează ce e nou față de ce există deja în proiect (după GlobalId, apoi după cod),
// fără să modifice nimic; scrierea o face pagina, pas cu pas.
import type { StructuraIfc, EchipamentIfc } from './ifc';
import { numeClasa, prefixClasa } from './ifc';

type Existent = { id: string; cod: string; ifc_guid?: string | null };
type TipExistent = { id: string; denumire: string; ifc_guid?: string | null };
export type PlanImport = {
  niveluri: { guid: string; cod: string; denumire: string; cota: number | null; ordine: number }[];
  incaperi: { guid: string; cod: string; denumire: string; arie: number | null; nivelGuid: string }[];
  tipuri: { cheie: string; guid: string | null; denumire: string; categorie: string | null; producator: string | null; model: string | null }[];
  echipamente: { guid: string; cod: string; tipCheie: string; spatiuGuid: string | null }[];
  existente: { niveluri: number; incaperi: number; tipuri: number; echipamente: number };
  faraNivel: number;
};

const CATEGORII: [RegExp, string][] = [
  [/AIRTERMINAL|FAN|DAMPER|AIRTOAIR|FILTER|HUMIDIFIER|COOLEDBEAM|EVAPORATIVE/, 'Ventilare și climatizare'],
  [/BOILER|SPACEHEATER|BURNER|HEATEXCHANGER|TUBEBUNDLE|COIL/, 'Încălzire'],
  [/CHILLER|COOLINGTOWER|CONDENSER|EVAPORATOR|COMPRESSOR/, 'Răcire'],
  [/SANITARY|WASTE|INTERCEPTOR|TANK|PUMP|VALVE|FLOWMETER|STACK/, 'Instalații sanitare'],
  [/LIGHT|LAMP|OUTLET|SWITCHING|PROTECTIVE|DISTRIBUTIONBOARD|TRANSFORMER|GENERATOR|MOTOR|ELECTRIC/, 'Instalații electrice'],
  [/ALARM|SENSOR|FIRESUPPRESSION|UNITARYCONTROL/, 'Securitate la incendiu și automatizări'],
  [/TRANSPORT/, 'Transport vertical'],
  [/COMMUNICATIONS|AUDIOVISUAL/, 'Curenți slabi'],
];
const categorie = (clasa: string) => CATEGORII.find(([re]) => re.test(clasa))?.[1] ?? null;

/** Un cod scurt de nivel din denumire: „00 groundfloor” → 00, „Etaj 1” → Etaj 1. */
function codNivel(nume: string) {
  const prim = nume.trim().split(/\s+/)[0];
  return (/^[A-Z0-9.+-]{1,6}$/i.test(prim) ? prim : nume.trim()).slice(0, 12);
}
/** Eticheta e bună de cod doar dacă e scurtă și citibilă (unele programe pun acolo ID-uri interne). */
const etichetaBuna = (e: string | null) => !!e && e.length <= 20 && !/^[0-9.]{12,}$/.test(e);

export function planificaImport(modele: StructuraIfc[], ex: { niveluri: Existent[]; incaperi: Existent[]; tipuri: TipExistent[]; echipamente: Existent[] }): PlanImport {
  const plan: PlanImport = { niveluri: [], incaperi: [], tipuri: [], echipamente: [], existente: { niveluri: 0, incaperi: 0, tipuri: 0, echipamente: 0 }, faraNivel: 0 };
  const coduriNiv = new Set(ex.niveluri.map(x => x.cod.toLowerCase()));
  const coduriInc = new Set(ex.incaperi.map(x => x.cod.toLowerCase()));
  const coduriEch = new Set(ex.echipamente.map(x => x.cod.toLowerCase()));
  const guidNiv = new Set(ex.niveluri.map(x => x.ifc_guid).filter(Boolean));
  const guidInc = new Set(ex.incaperi.map(x => x.ifc_guid).filter(Boolean));
  const guidEch = new Set(ex.echipamente.map(x => x.ifc_guid).filter(Boolean));
  const unic = (cod: string, folosite: Set<string>, max: number) => {
    let c = cod.slice(0, max), i = 2;
    while (folosite.has(c.toLowerCase())) c = `${cod.slice(0, max - 3)}-${i++}`;
    folosite.add(c.toLowerCase());
    return c;
  };

  // niveluri: din toate modelele; același nume de nivel din discipline diferite = un singur nivel
  const dupaNume = new Map<string, string>();
  const toate = modele.flatMap(m => m.niveluri).sort((a, b) => (a.cota ?? 0) - (b.cota ?? 0));
  for (const n of toate) {
    if (guidNiv.has(n.guid)) { plan.existente.niveluri++; continue; }
    const k = n.nume.trim().toLowerCase();
    if (dupaNume.has(k)) continue;
    const existent = ex.niveluri.find(x => x.cod.toLowerCase() === codNivel(n.nume).toLowerCase());
    if (existent) { plan.existente.niveluri++; dupaNume.set(k, n.guid); continue; }
    dupaNume.set(k, n.guid);
    plan.niveluri.push({ guid: n.guid, cod: unic(codNivel(n.nume), coduriNiv, 12), denumire: n.nume, cota: n.cota, ordine: plan.niveluri.length + ex.niveluri.length });
  }
  // nivelul unui obiect, raportat la nivelul unic cu același nume
  const nivelUnic = (guid: string | null) => {
    if (!guid) return null;
    const n = modele.flatMap(m => m.niveluri).find(x => x.guid === guid);
    return n ? dupaNume.get(n.nume.trim().toLowerCase()) ?? guid : guid;
  };

  for (const sp of modele.flatMap(m => m.spatii)) {
    if (guidInc.has(sp.guid)) { plan.existente.incaperi++; continue; }
    const niv = nivelUnic(sp.nivelGuid);
    if (!niv) { plan.faraNivel++; continue; }
    plan.incaperi.push({ guid: sp.guid, cod: unic(sp.cod, coduriInc, 20), denumire: sp.nume, arie: sp.arie, nivelGuid: niv });
  }

  const tipuri = new Map<string, PlanImport['tipuri'][number]>();
  const cheieTip = (e: EchipamentIfc) => e.tipGuid ?? `${e.clasa}:${e.tipNume ?? ''}`;
  const nrPeClasa = new Map<string, number>();
  for (const e of modele.flatMap(m => m.echipamente)) {
    if (guidEch.has(e.guid)) { plan.existente.echipamente++; continue; }
    const k = cheieTip(e);
    if (!tipuri.has(k)) {
      const denumire = (e.tipNume || numeClasa(e.clasa)).trim();
      const ex1 = ex.tipuri.find(t => (e.tipGuid && t.ifc_guid === e.tipGuid) || t.denumire.toLowerCase() === denumire.toLowerCase());
      if (ex1) plan.existente.tipuri++;
      tipuri.set(k, { cheie: k, guid: ex1 ? null : e.tipGuid, denumire: ex1 ? ex1.denumire : denumire, categorie: categorie(e.clasa), producator: e.producator, model: e.model });
    }
    const pref = prefixClasa(e.clasa);
    const nr = (nrPeClasa.get(pref) ?? 0) + 1; nrPeClasa.set(pref, nr);
    const cod = etichetaBuna(e.eticheta) ? e.eticheta! : `${pref}-${String(nr).padStart(2, '0')}`;
    plan.echipamente.push({ guid: e.guid, cod: unic(cod, coduriEch, 40), tipCheie: k, spatiuGuid: e.spatiuGuid });
  }
  plan.tipuri = [...tipuri.values()];
  return plan;
}
