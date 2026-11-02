// Verificarea modelelor IFC după regulile de informații ale proiectului (cerințele din EIR,
// scrise ca în IDS 1.0 – buildingSMART): pentru fiecare regulă se iau elementele clasei
// (cu subtipurile ei) și se verifică atributul, proprietatea, clasificarea, materialul sau nivelul.
// Rulează în browser, pe modelele deja deschise în vizualizator, și în teste (Node).
import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';
import { valoareaPotrivita, type ElementNeconform, type RegulaModel, type RezultatRegula } from './ids';
export { reunesteRezultate, sumar, valoareaPotrivita } from './ids';
export type { ElementNeconform, RezultatRegula } from './ids';

// subtipurile uzuale (IFC4) – o regulă pe IfcWall se aplică și pe IfcWallStandardCase etc.
const SUBTIPURI: Record<string, string[]> = {
  IFCWALL: ['IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'],
  IFCSLAB: ['IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE'],
  IFCBEAM: ['IFCBEAMSTANDARDCASE'], IFCCOLUMN: ['IFCCOLUMNSTANDARDCASE'], IFCMEMBER: ['IFCMEMBERSTANDARDCASE'],
  IFCPLATE: ['IFCPLATESTANDARDCASE'], IFCDOOR: ['IFCDOORSTANDARDCASE'], IFCWINDOW: ['IFCWINDOWSTANDARDCASE'],
  IFCOPENINGELEMENT: ['IFCOPENINGSTANDARDCASE'],
};
export const claseCuSubtipuri = (clasa: string) => [clasa.toUpperCase(), ...(SUBTIPURI[clasa.toUpperCase()] ?? [])];

function v(x: unknown): unknown {
  if (x && typeof x === 'object' && 'value' in (x as Record<string, unknown>)) return (x as { value: unknown }).value;
  return x;
}
/** Valoarea ca text, cu booleenii IFC (.T. / .F.) scriși true / false. */
function txt(x: unknown): string | null {
  const r = v(x);
  if (r == null || r === '') return null;
  if (r === true || r === 'T' || r === '.T.') return 'true';
  if (r === false || r === 'F' || r === '.F.') return 'false';
  return String(r).trim() || null;
}
const refs = (x: unknown): number[] => (Array.isArray(x) ? x : x ? [x] : []).map(r => Number(v(r))).filter(n => !isNaN(n) && n > 0);
const idsTip = (api: IfcAPI, model: number, tip: number) => { const l = api.GetLineIDsWithType(model, tip); const o: number[] = []; for (let i = 0; i < l.size(); i++) o.push(l.get(i)); return o; };
const codTip = (nume: string): number | null => { const c = (WebIFC as unknown as Record<string, unknown>)[nume]; return typeof c === 'number' ? c : null; };

type Index = {
  parinte: Map<number, number>; tipObiect: Map<number, number>; definitii: Map<number, number[]>;
  clasificari: Map<number, number[]>; materiale: Map<number, number[]>;
};
function construiesteIndex(api: IfcAPI, model: number): Index {
  const adauga = (m: Map<number, number[]>, k: number, x: number) => { const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); };
  const parinte = new Map<number, number>(), tipObiect = new Map<number, number>();
  const definitii = new Map<number, number[]>(), clasificari = new Map<number, number[]>(), materiale = new Map<number, number[]>();
  const parcurge = (tip: number, f: (l: Record<string, unknown>) => void) => { for (const id of idsTip(api, model, tip)) f(api.GetLine(model, id)); };
  parcurge(WebIFC.IFCRELAGGREGATES, r => { for (const c of refs(r.RelatedObjects)) parinte.set(c, Number(v(r.RelatingObject))); });
  parcurge(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE, r => { for (const c of refs(r.RelatedElements)) parinte.set(c, Number(v(r.RelatingStructure))); });
  parcurge(WebIFC.IFCRELDEFINESBYTYPE, r => { for (const c of refs(r.RelatedObjects)) tipObiect.set(c, Number(v(r.RelatingType))); });
  parcurge(WebIFC.IFCRELDEFINESBYPROPERTIES, r => { for (const c of refs(r.RelatedObjects)) adauga(definitii, c, Number(v(r.RelatingPropertyDefinition))); });
  parcurge(WebIFC.IFCRELASSOCIATESCLASSIFICATION, r => { for (const c of refs(r.RelatedObjects)) adauga(clasificari, c, Number(v(r.RelatingClassification))); });
  parcurge(WebIFC.IFCRELASSOCIATESMATERIAL, r => { for (const c of refs(r.RelatedObjects)) adauga(materiale, c, Number(v(r.RelatingMaterial))); });
  return { parinte, tipObiect, definitii, clasificari, materiale };
}

/** Rulează regulile pe un model deschis. */
export function verificaModel(api: IfcAPI, model: number, reguli: RegulaModel[]): RezultatRegula[] {
  const ix = construiesteIndex(api, model);
  const linii = new Map<number, Record<string, unknown>>();
  const linie = (id: number) => { let l = linii.get(id); if (!l) { l = api.GetLine(model, id) as Record<string, unknown>; linii.set(id, l); } return l; };
  const clasaDe = (id: number) => api.GetNameFromTypeCode(api.GetLineType(model, id)).toUpperCase();

  // seturile de proprietăți: ale elementului, apoi ale tipului (elementul are prioritate)
  const seturi = (id: number): number[] => {
    const t = ix.tipObiect.get(id);
    const dinTip = t ? refs(linie(t).HasPropertySets) : [];
    return [...(ix.definitii.get(id) ?? []), ...dinTip];
  };
  const proprietate = (id: number, pset: string, prop: string): { gasit: boolean; valoare: string | null } => {
    let setGasit = false;
    for (const sid of seturi(id)) {
      const set = linie(sid);
      if ((txt(set.Name) ?? '').toLowerCase() !== pset.toLowerCase()) continue;
      setGasit = true;
      for (const pid of refs(set.HasProperties ?? set.Quantities)) {
        const p = linie(pid);
        if ((txt(p.Name) ?? '').toLowerCase() !== prop.toLowerCase()) continue;
        const ev = Array.isArray(p.EnumerationValues) ? p.EnumerationValues.map(txt).filter(Boolean).join(', ') : null;
        const lv = Array.isArray(p.ListValues) ? p.ListValues.map(txt).filter(Boolean).join(', ') : null;
        const val = txt(p.NominalValue) ?? (ev || null) ?? (lv || null)
          ?? txt(p.LengthValue) ?? txt(p.AreaValue) ?? txt(p.VolumeValue) ?? txt(p.CountValue) ?? txt(p.WeightValue) ?? txt(p.TimeValue);
        return { gasit: true, valoare: val };
      }
    }
    return { gasit: setGasit, valoare: null };
  };
  const asociate = (m: Map<number, number[]>, id: number) => { const t = ix.tipObiect.get(id); return [...(m.get(id) ?? []), ...(t ? m.get(t) ?? [] : [])]; };
  const sistemClasificare = (cid: number, pas = 0): string[] => {
    if (pas > 6) return [];
    const c = linie(cid); const cls = clasaDe(cid);
    if (cls === 'IFCCLASSIFICATION') return [txt(c.Name) ?? ''];
    if (cls === 'IFCCLASSIFICATIONREFERENCE') {
      const src = refs(c.ReferencedSource)[0];
      return [txt(c.Identification) ?? txt(c.ItemReference) ?? '', txt(c.Name) ?? '', ...(src ? sistemClasificare(src, pas + 1) : [])];
    }
    return [];
  };
  const numeMateriale = (mid: number, pas = 0): string[] => {
    if (pas > 6) return [];
    const m = linie(mid); const r: string[] = [];
    if (clasaDe(mid) === 'IFCMATERIAL') r.push(txt(m.Name) ?? '');
    else if (txt(m.Name) || txt(m.LayerSetName)) r.push(txt(m.Name) ?? txt(m.LayerSetName)!);
    for (const camp of ['ForLayerSet', 'MaterialLayers', 'Material', 'Materials', 'MaterialConstituents', 'ForProfileSet', 'MaterialProfiles'])
      for (const x of refs(m[camp])) r.push(...numeMateriale(x, pas + 1));
    return r.filter(Boolean);
  };
  const nivelDe = (id: number): string | null => {
    let c = ix.parinte.get(id); let pas = 0;
    while (c != null && pas++ < 20) { if (clasaDe(c) === 'IFCBUILDINGSTOREY') { const l = linie(c); return txt(l.Name) ?? txt(l.LongName) ?? `#${c}`; } c = ix.parinte.get(c); }
    return null;
  };
  const tipPredefinit = (id: number): string | null => {
    const l = linie(id); let p = txt(l.PredefinedType);
    if (!p || p === 'NOTDEFINED') { const t = ix.tipObiect.get(id); if (t) p = txt(linie(t).PredefinedType) ?? p; }
    if (p === 'USERDEFINED') p = txt(l.ObjectType) ?? p;
    return p ? p.toUpperCase() : null;
  };

  const elementeClasa = new Map<string, number[]>();
  const elementele = (clasa: string) => {
    const k = clasa.toUpperCase();
    if (!elementeClasa.has(k)) elementeClasa.set(k, claseCuSubtipuri(k).flatMap(c => { const cod = codTip(c); return cod == null ? [] : idsTip(api, model, cod); }));
    return elementeClasa.get(k)!;
  };

  return reguli.map(r => {
    let ids = elementele(r.clasa);
    if (r.predefinit) ids = ids.filter(id => tipPredefinit(id) === r.predefinit!.toUpperCase());
    const nu_trec: ElementNeconform[] = []; const trec_guid: string[] = [];
    for (const id of ids) {
      const motiv = verificaElement(id); const l = linie(id); const guid = txt(l.GlobalId) ?? `#${id}`;
      if (motiv) nu_trec.push({ guid, nume: txt(l.Name) ?? '', clasa: clasaDe(id), motiv }); else trec_guid.push(guid);
    }
    return { regula_id: r.id ?? null, denumire: r.denumire, obligatorie: r.obligatorie !== false, verificate: ids.length, trec: ids.length - nu_trec.length, nu_trec, trec_guid };

    function verificaElement(id: number): string | null {
      const ceruta = r.valoare ?? null;
      switch (r.tip_cerinta) {
        case 'atribut': {
          const a = r.proprietate ?? 'Name';
          const val = txt(linie(id)[a]);
          if (!val) return `${a} necompletat`;
          return valoareaPotrivita(val, ceruta) ? null : `${a} = „${val}”, se cere „${ceruta}”`;
        }
        case 'proprietate': {
          const { gasit, valoare } = proprietate(id, r.pset ?? '', r.proprietate ?? '');
          if (!gasit) return `lipsește setul ${r.pset}`;
          if (!valoare) return `lipsește ${r.pset}.${r.proprietate}`;
          return valoareaPotrivita(valoare, ceruta) ? null : `${r.proprietate} = „${valoare}”, se cere „${ceruta}”`;
        }
        case 'clasificare': {
          const sist = asociate(ix.clasificari, id).flatMap(c => sistemClasificare(c)).filter(Boolean);
          if (!sist.length) return 'fără clasificare';
          if (!ceruta) return null;
          return sist.some(x => x.toLowerCase().includes(ceruta.toLowerCase())) ? null : `nu e clasificat după ${ceruta}`;
        }
        case 'material': {
          const asoc = asociate(ix.materiale, id);
          if (!asoc.length) return 'fără material';
          if (!ceruta) return null;
          const nume = asoc.flatMap(m => numeMateriale(m));
          const variante = ceruta.split('|').map(x => x.trim().toLowerCase()).filter(Boolean);
          return nume.some(n => variante.some(c => n.toLowerCase().includes(c))) ? null : `material „${nume[0] ?? '?'}”, se cere „${ceruta}”`;
        }
        case 'nivel': {
          const n = nivelDe(id);
          if (!n) return 'nu e pe niciun nivel';
          return valoareaPotrivita(n, ceruta) ? null : `pe nivelul „${n}”, se cere „${ceruta}”`;
        }
      }
      return null;
    }
  });
}

