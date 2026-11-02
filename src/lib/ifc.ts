// Citirea modelelor IFC cu web-ifc: structura spațială (niveluri, spații),
// echipamentele pentru COBie și proprietățile unui element.
// Nu depinde de browser: aceleași funcții se folosesc și în teste (Node).
import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

export type NivelIfc = { guid: string; expressID: number; nume: string; cota: number | null };
export type SpatiuIfc = { guid: string; expressID: number; cod: string; nume: string; nivelGuid: string | null; arie: number | null };
export type EchipamentIfc = {
  guid: string; expressID: number; clasa: string; nume: string; eticheta: string | null;
  tipGuid: string | null; tipNume: string | null; producator: string | null; model: string | null;
  nivelGuid: string | null; spatiuGuid: string | null;
};
export type StructuraIfc = {
  schema: string; proiect: string | null; unitateLungime: number;   // metri pe unitatea modelului
  niveluri: NivelIfc[]; spatii: SpatiuIfc[]; echipamente: EchipamentIfc[];
  nivelElement: Map<number, number>;     // expressID element → expressID nivel
};
export type GrupProprietati = { nume: string; valori: [string, string][] };
export type ProprietatiIfc = { expressID: number; clasa: string; guid: string; nume: string; grupuri: GrupProprietati[] };

export { CLASE_ECHIPAMENT, NUME_CLASE, numeClasa, prefixClasa } from './ifcClase';
import { CLASE_ECHIPAMENT, numeClasa } from './ifcClase';

/** Valoarea simplă dintr-un atribut web-ifc ({ type, value } sau valoare directă). */
function v(x: unknown): unknown {
  if (x && typeof x === 'object' && 'value' in (x as Record<string, unknown>)) return (x as { value: unknown }).value;
  return x;
}
const s = (x: unknown) => { const r = v(x); return r == null || r === '' ? null : String(r); };
const ids = (api: IfcAPI, model: number, tip: number) => { const l = api.GetLineIDsWithType(model, tip); const o: number[] = []; for (let i = 0; i < l.size(); i++) o.push(l.get(i)); return o; };
const refs = (x: unknown): number[] => (Array.isArray(x) ? x : x ? [x] : []).map(r => Number(v(r))).filter(n => !isNaN(n));

function unitateLungime(api: IfcAPI, model: number): number {
  for (const id of ids(api, model, WebIFC.IFCSIUNIT)) {
    const u = api.GetLine(model, id);
    if (s(u.UnitType) === 'LENGTHUNIT') {
      const p = s(u.Prefix);
      return p === 'MILLI' ? 0.001 : p === 'CENTI' ? 0.01 : p === 'DECI' ? 0.1 : 1;
    }
  }
  return 1;
}

/** Citește structura spațială și echipamentele unui model deschis. */
export function citesteStructura(api: IfcAPI, model: number): StructuraIfc {
  const unit = unitateLungime(api, model);
  const guid = new Map<number, string>();
  const g = (id: number) => { if (!guid.has(id)) guid.set(id, s(api.GetLine(model, id).GlobalId) ?? String(id)); return guid.get(id)!; };

  // părintele fiecărui obiect: din agregare (spațiu în nivel) și din conținere (element în nivel sau spațiu)
  const parinte = new Map<number, number>();
  for (const id of ids(api, model, WebIFC.IFCRELAGGREGATES)) {
    const r = api.GetLine(model, id);
    for (const c of refs(r.RelatedObjects)) parinte.set(c, Number(v(r.RelatingObject)));
  }
  for (const id of ids(api, model, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const r = api.GetLine(model, id);
    for (const c of refs(r.RelatedElements)) parinte.set(c, Number(v(r.RelatingStructure)));
  }
  const tipObiect = new Map<number, number>();
  for (const id of ids(api, model, WebIFC.IFCRELDEFINESBYTYPE)) {
    const r = api.GetLine(model, id);
    for (const c of refs(r.RelatedObjects)) tipObiect.set(c, Number(v(r.RelatingType)));
  }
  // seturile de proprietăți și cantități ale fiecărui obiect
  const definitii = new Map<number, number[]>();
  for (const id of ids(api, model, WebIFC.IFCRELDEFINESBYPROPERTIES)) {
    const r = api.GetLine(model, id);
    for (const c of refs(r.RelatedObjects)) definitii.set(c, [...(definitii.get(c) ?? []), Number(v(r.RelatingPropertyDefinition))]);
  }
  const valoareDin = (setIds: number[], numeSet: RegExp | null, numeProp: RegExp): string | null => {
    for (const sid of setIds) {
      const set = api.GetLine(model, sid);
      if (numeSet && !numeSet.test(s(set.Name) ?? '')) continue;
      for (const pid of refs(set.HasProperties ?? set.Quantities)) {
        const p = api.GetLine(model, pid);
        if (numeProp.test(s(p.Name) ?? '')) {
          const val = s(p.NominalValue) ?? s(p.AreaValue) ?? s(p.LengthValue) ?? s(p.VolumeValue);
          if (val) return val;
        }
      }
    }
    return null;
  };
  const tipLinie = (id: number) => api.GetNameFromTypeCode(api.GetLineType(model, id)).toUpperCase();
  const nivelDe = (id: number): number | null => {
    let c: number | undefined = id; let pas = 0;
    while (c != null && pas++ < 20) { if (tipLinie(c) === 'IFCBUILDINGSTOREY') return c; c = parinte.get(c); }
    return null;
  };
  const spatiuDe = (id: number): number | null => {
    let c: number | undefined = parinte.get(id); let pas = 0;
    while (c != null && pas++ < 20) { const t = tipLinie(c); if (t === 'IFCSPACE') return c; if (t === 'IFCBUILDINGSTOREY') return null; c = parinte.get(c); }
    return null;
  };

  const niveluri: NivelIfc[] = ids(api, model, WebIFC.IFCBUILDINGSTOREY).map(id => {
    const l = api.GetLine(model, id);
    const cota = v(l.Elevation);
    return { guid: g(id), expressID: id, nume: s(l.Name) ?? s(l.LongName) ?? `Nivel ${id}`, cota: cota == null ? null : Math.round(Number(cota) * unit * 100) / 100 };
  }).sort((a, b) => (a.cota ?? 0) - (b.cota ?? 0));

  const spatii: SpatiuIfc[] = ids(api, model, WebIFC.IFCSPACE).map(id => {
    const l = api.GetLine(model, id);
    const arie = valoareDin(definitii.get(id) ?? [], null, /^(NetFloorArea|GrossFloorArea|NetArea|Area)$/i);
    const nv = nivelDe(id);
    return {
      guid: g(id), expressID: id, cod: s(l.Name) ?? String(id), nume: s(l.LongName) ?? s(l.Name) ?? 'Spațiu',
      nivelGuid: nv ? g(nv) : null, arie: arie ? Math.round(Number(arie) * 100) / 100 : null,
    };
  });

  const echipamente: EchipamentIfc[] = [];
  const vazute = new Set<number>();
  for (const clasa of CLASE_ECHIPAMENT) {
    const cod = (WebIFC as unknown as Record<string, number>)[clasa];
    if (typeof cod !== 'number') continue;
    for (const id of ids(api, model, cod)) {
      if (vazute.has(id)) continue;
      vazute.add(id);
      const l = api.GetLine(model, id);
      const t = tipObiect.get(id);
      const tl = t != null ? api.GetLine(model, t) : null;
      const seturi = [...(definitii.get(id) ?? []), ...refs(tl?.HasPropertySets)];
      const nv = nivelDe(id), sp = spatiuDe(id);
      echipamente.push({
        guid: g(id), expressID: id, clasa, nume: s(l.Name) ?? numeClasa(clasa), eticheta: s(l.Tag),
        tipGuid: t != null ? g(t) : null, tipNume: tl ? s(tl.Name) : null,
        producator: valoareDin(seturi, /Manufacturer/i, /^Manufacturer$/i),
        model: valoareDin(seturi, /Manufacturer/i, /^(ModelLabel|ModelReference)$/i),
        nivelGuid: nv ? g(nv) : null, spatiuGuid: sp ? g(sp) : null,
      });
    }
  }

  const nivelElement = new Map<number, number>();
  for (const [c] of parinte) { const n = nivelDe(c); if (n != null) nivelElement.set(c, n); }
  const proiect = ids(api, model, WebIFC.IFCPROJECT)[0];
  return {
    schema: api.GetModelSchema(model), proiect: proiect != null ? s(api.GetLine(model, proiect).Name) : null,
    unitateLungime: unit, niveluri, spatii, echipamente, nivelElement,
  };
}

/** Proprietățile unui element: atributele de bază și seturile de proprietăți / cantități. */
export async function proprietati(api: IfcAPI, model: number, id: number): Promise<ProprietatiIfc> {
  const l = api.GetLine(model, id);
  const clasa = api.GetNameFromTypeCode(api.GetLineType(model, id));
  const grupuri: GrupProprietati[] = [];
  const baza: [string, string][] = [['Clasa IFC', clasa], ['GlobalId', s(l.GlobalId) ?? '—']];
  for (const k of ['Name', 'LongName', 'Description', 'ObjectType', 'Tag', 'PredefinedType']) { const x = s(l[k]); if (x) baza.push([k, x]); }
  grupuri.push({ nume: 'Element', valori: baza });
  // seturile elementului, apoi ale tipului lui (citite separat: unele tipuri nu au seturi deloc)
  const seturi: Record<string, unknown>[] = [];
  try { seturi.push(...(await api.properties.getPropertySets(model, id, true)) as Record<string, unknown>[]); } catch { /* fără seturi */ }
  try {
    for (const t of (await api.properties.getTypeProperties(model, id, true)) as Record<string, unknown>[]) {
      for (const set of ((t.HasPropertySets ?? []) as Record<string, unknown>[])) if (set && typeof set === 'object') seturi.push(set);
    }
  } catch { /* tip fără seturi */ }
  {
    for (const set of seturi) {
      const val: [string, string][] = [];
      for (const p of ((set.HasProperties ?? set.Quantities ?? []) as Record<string, unknown>[])) {
        const nume = s(p.Name); if (!nume) continue;
        const x = s(p.NominalValue) ?? s(p.AreaValue) ?? s(p.LengthValue) ?? s(p.VolumeValue) ?? s(p.CountValue) ?? s(p.WeightValue);
        if (x != null) val.push([nume, x]);
      }
      if (val.length) grupuri.push({ nume: s(set.Name) ?? 'Proprietăți', valori: val });
    }
  }
  return { expressID: id, clasa, guid: s(l.GlobalId) ?? '', nume: s(l.Name) ?? numeClasa(clasa), grupuri };
}

