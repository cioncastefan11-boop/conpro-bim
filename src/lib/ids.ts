// IDS 1.0 (Information Delivery Specification, buildingSMART): regulile de informații ale modelului
// ca fișier XML pe care îl citesc programele de proiectare și verificare (Revit, Archicad, Solibri,
// BIMcollab, usBIM...). O regulă din aplicație = o specificație IDS cu o singură entitate în
// „applicability” și o singură cerință în „requirements”.

export type TipCerinta = 'atribut' | 'proprietate' | 'clasificare' | 'material' | 'nivel';
export type RegulaModel = {
  id?: string; denumire: string; clasa: string; predefinit?: string | null; tip_cerinta: TipCerinta;
  pset?: string | null; proprietate?: string | null; valoare?: string | null; obligatorie?: boolean;
  sursa?: string; ordine?: number;
};

export type ElementNeconform = { guid: string; nume: string; clasa: string; motiv: string };
export type RezultatRegula = {
  regula_id: string | null; denumire: string; obligatorie: boolean;
  verificate: number; trec: number; nu_trec: ElementNeconform[];
  /** GlobalId-urile elementelor care trec (doar în memorie, pentru colorarea modelului; nu se salvează). */
  trec_guid?: string[];
};

/** Valoarea cerută: gol = doar să existe; „a|b|c” = una dintre; altfel egalitate (fără majuscule; numerele ca numere). */
export function valoareaPotrivita(gasita: string, ceruta: string | null | undefined): boolean {
  if (!ceruta) return true;
  const g = gasita.trim().toLowerCase();
  return ceruta.split('|').map(x => x.trim().toLowerCase()).filter(Boolean).some(c => {
    if (c === g) return true;
    const a = Number(c), b = Number(g);
    return c !== '' && g !== '' && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a));
  });
}

/** Reunește rezultatele aceleiași reguli pe mai multe modele. */
export function reunesteRezultate(liste: RezultatRegula[][]): RezultatRegula[] {
  if (!liste.length) return [];
  return liste[0].map((r, i) => liste.slice(1).reduce((acc, l) => ({
    ...acc, verificate: acc.verificate + l[i].verificate, trec: acc.trec + l[i].trec, nu_trec: [...acc.nu_trec, ...l[i].nu_trec],
    trec_guid: [...(acc.trec_guid ?? []), ...(l[i].trec_guid ?? [])],
  }), { ...r, nu_trec: [...r.nu_trec], trec_guid: [...(r.trec_guid ?? [])] }));
}

/** Cifrele raportului: elementele verificate (unice) și cele care nu trec cel puțin o regulă obligatorie. */
export function sumar(rez: RezultatRegula[]) {
  const neconforme = new Set(rez.filter(r => r.obligatorie).flatMap(r => r.nu_trec.map(e => e.guid)));
  const verificate = rez.reduce((a, r) => a + r.verificate, 0);
  const trec = rez.reduce((a, r) => a + r.trec, 0);
  return { reguli: rez.length, verificari: verificate, trec, neconforme: neconforme.size, procent: verificate ? Math.round((trec / verificate) * 100) : 100 };
}

export const TIPURI_CERINTA: Record<TipCerinta, string> = {
  atribut: 'Atribut completat', proprietate: 'Proprietate', clasificare: 'Clasificare', material: 'Material', nivel: 'Pe un nivel',
};
export const ATRIBUTE = ['Name', 'Description', 'ObjectType', 'Tag', 'LongName'] as const;

/** Textul scurt al cerinței, pentru liste și rapoarte. */
export function descrieCerinta(r: RegulaModel): string {
  const val = r.valoare ? ` = ${r.valoare.split('|').join(' sau ')}` : '';
  switch (r.tip_cerinta) {
    case 'atribut': return `${r.proprietate} completat${val}`;
    case 'proprietate': return `${r.pset}.${r.proprietate}${val || ' completat'}`;
    case 'clasificare': return r.valoare ? `clasificat după ${r.valoare}` : 'are clasificare';
    case 'material': return r.valoare ? `material ${r.valoare.split('|').join(' sau ')}` : 'are material';
    case 'nivel': return r.valoare ? `pe nivelul ${r.valoare}` : 'așezat pe un nivel';
  }
}

/** Seturi de reguli gata făcute, de pornire (se pot modifica după). */
export const SABLOANE: { cheie: string; titlu: string; reguli: RegulaModel[] }[] = [
  { cheie: 'spatii', titlu: 'Spații (încăperi)', reguli: [
    { denumire: 'Spațiile au cod', clasa: 'IFCSPACE', tip_cerinta: 'atribut', proprietate: 'Name' },
    { denumire: 'Spațiile au denumire', clasa: 'IFCSPACE', tip_cerinta: 'atribut', proprietate: 'LongName' },
    { denumire: 'Spațiile sunt pe un nivel', clasa: 'IFCSPACE', tip_cerinta: 'nivel' },
  ] },
  { cheie: 'arhitectura', titlu: 'Arhitectură', reguli: [
    { denumire: 'Pereții spun dacă sunt exteriori', clasa: 'IFCWALL', tip_cerinta: 'proprietate', pset: 'Pset_WallCommon', proprietate: 'IsExternal' },
    { denumire: 'Pereții spun dacă sunt portanți', clasa: 'IFCWALL', tip_cerinta: 'proprietate', pset: 'Pset_WallCommon', proprietate: 'LoadBearing' },
    { denumire: 'Pereții au material', clasa: 'IFCWALL', tip_cerinta: 'material' },
    { denumire: 'Ușile au rezistența la foc', clasa: 'IFCDOOR', tip_cerinta: 'proprietate', pset: 'Pset_DoorCommon', proprietate: 'FireRating', obligatorie: false },
    { denumire: 'Ferestrele au transmitanța termică', clasa: 'IFCWINDOW', tip_cerinta: 'proprietate', pset: 'Pset_WindowCommon', proprietate: 'ThermalTransmittance', obligatorie: false },
  ] },
  { cheie: 'structura', titlu: 'Structură', reguli: [
    { denumire: 'Stâlpii sunt pe un nivel', clasa: 'IFCCOLUMN', tip_cerinta: 'nivel' },
    { denumire: 'Stâlpii au material', clasa: 'IFCCOLUMN', tip_cerinta: 'material' },
    { denumire: 'Grinzile sunt pe un nivel', clasa: 'IFCBEAM', tip_cerinta: 'nivel' },
    { denumire: 'Grinzile au material', clasa: 'IFCBEAM', tip_cerinta: 'material' },
    { denumire: 'Plăcile au material', clasa: 'IFCSLAB', tip_cerinta: 'material' },
  ] },
  { cheie: 'instalatii', titlu: 'Instalații (pentru COBie și mentenanță)', reguli: [
    { denumire: 'Terminalele au cod (Tag)', clasa: 'IFCFLOWTERMINAL', tip_cerinta: 'atribut', proprietate: 'Tag', obligatorie: false },
    { denumire: 'Terminalele de aer au producătorul', clasa: 'IFCAIRTERMINAL', tip_cerinta: 'proprietate', pset: 'Pset_ManufacturerTypeInformation', proprietate: 'Manufacturer' },
    { denumire: 'Terminalele de aer au modelul', clasa: 'IFCAIRTERMINAL', tip_cerinta: 'proprietate', pset: 'Pset_ManufacturerTypeInformation', proprietate: 'ModelLabel' },
    { denumire: 'Ventilatoarele au producătorul', clasa: 'IFCFAN', tip_cerinta: 'proprietate', pset: 'Pset_ManufacturerTypeInformation', proprietate: 'Manufacturer' },
    { denumire: 'Pompele au producătorul', clasa: 'IFCPUMP', tip_cerinta: 'proprietate', pset: 'Pset_ManufacturerTypeInformation', proprietate: 'Manufacturer' },
  ] },
];

// ------------------------------------------------------------------ export
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
function valoareIds(tag: string, val: string, ind: string): string {
  const parti = val.split('|').map(x => x.trim()).filter(Boolean);
  if (parti.length === 1) return `${ind}<ids:${tag}><ids:simpleValue>${esc(parti[0])}</ids:simpleValue></ids:${tag}>\n`;
  return `${ind}<ids:${tag}>\n${ind}  <xs:restriction base="xs:string">\n${parti.map(p => `${ind}    <xs:enumeration value="${esc(p)}"/>\n`).join('')}${ind}  </xs:restriction>\n${ind}</ids:${tag}>\n`;
}
const tipDate = (val: string | null | undefined) => {
  if (!val) return null;
  const p = val.split('|').map(x => x.trim().toLowerCase());
  if (p.every(x => x === 'true' || x === 'false')) return 'IFCBOOLEAN';
  return null;
};

function cerintaIds(r: RegulaModel): string {
  const card = r.obligatorie === false ? 'optional' : 'required';
  const i = '        ';
  switch (r.tip_cerinta) {
    case 'atribut':
      return `${i}<ids:attribute cardinality="${card}">\n${valoareIds('name', r.proprietate ?? 'Name', i + '  ')}${r.valoare ? valoareIds('value', r.valoare, i + '  ') : ''}${i}</ids:attribute>\n`;
    case 'proprietate': {
      const dt = tipDate(r.valoare);
      return `${i}<ids:property${dt ? ` dataType="${dt}"` : ''} cardinality="${card}">\n${valoareIds('propertySet', r.pset ?? '', i + '  ')}${valoareIds('baseName', r.proprietate ?? '', i + '  ')}${r.valoare ? valoareIds('value', dt ? r.valoare.toLowerCase() : r.valoare, i + '  ') : ''}${i}</ids:property>\n`;
    }
    case 'clasificare':
      // IDS cere sistemul; „oricare” se scrie ca tiparul .*
      return `${i}<ids:classification cardinality="${card}">\n${r.valoare ? valoareIds('system', r.valoare, i + '  ') : `${i}  <ids:system>\n${i}    <xs:restriction base="xs:string">\n${i}      <xs:pattern value=".*"/>\n${i}    </xs:restriction>\n${i}  </ids:system>\n`}${i}</ids:classification>\n`;
    case 'material':
      return `${i}<ids:material cardinality="${card}">\n${r.valoare ? valoareIds('value', r.valoare, i + '  ') : ''}${i}</ids:material>\n`;
    case 'nivel': {
      const rel = r.clasa.toUpperCase() === 'IFCSPACE' ? 'IFCRELAGGREGATES' : 'IFCRELCONTAINEDINSPATIALSTRUCTURE';
      // la partOf IDS 1.0 nu are „optional”: regula se scrie ca cerință, iar opționalitatea rămâne în descriere
      return `${i}<ids:partOf relation="${rel}" cardinality="required">\n${i}  <ids:entity>\n${valoareIds('name', 'IFCBUILDINGSTOREY', i + '    ')}${i}  </ids:entity>\n${i}</ids:partOf>\n`;
    }
  }
}

const descriere = (r: RegulaModel) => {
  const d = [r.sursa ? `Sursa: ${r.sursa}` : '', r.obligatorie === false ? 'Recomandat (neobligatoriu)' : ''].filter(Boolean).join('. ');
  return d ? ` description="${esc(d)}"` : '';
};

/** Fișierul IDS 1.0 pentru regulile date. */
export function exportaIds(reguli: RegulaModel[], info: { titlu: string; autor?: string | null; data?: string; scop?: string; proiect?: string }): string {
  const data = info.data ?? new Date().toISOString().slice(0, 10);
  const autor = info.autor && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(info.autor) ? `    <ids:author>${esc(info.autor)}</ids:author>\n` : '';
  const spec = reguli.map((r, k) => `    <ids:specification name="${esc(r.denumire)}" ifcVersion="IFC2X3 IFC4" identifier="${k + 1}"${descriere(r)}>
      <ids:applicability minOccurs="0" maxOccurs="unbounded">
        <ids:entity>
${valoareIds('name', r.clasa.toUpperCase(), '          ')}${r.predefinit ? valoareIds('predefinedType', r.predefinit.toUpperCase(), '          ') : ''}        </ids:entity>
      </ids:applicability>
      <ids:requirements>
${cerintaIds(r)}      </ids:requirements>
    </ids:specification>
`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
  <ids:info>
    <ids:title>${esc(info.titlu)}</ids:title>
${info.proiect ? `    <ids:copyright>${esc(info.proiect)}</ids:copyright>\n` : ''}    <ids:version>${esc(data)}</ids:version>
${autor}    <ids:date>${esc(data)}</ids:date>
    <ids:purpose>${esc(info.scop ?? 'Cerințele de informații ale modelului (EIR)')}</ids:purpose>
  </ids:info>
  <ids:specifications>
${spec}  </ids:specifications>
</ids:ids>
`;
}

// ------------------------------------------------------------------ import
type ParserXml = (xml: string) => Document;
const parserImplicit: ParserXml = xml => new DOMParser().parseFromString(xml, 'application/xml');
const local = (n: Node) => (n as Element).localName ?? (n as Element).nodeName.replace(/^.*:/, '');
const copiiDirecti = (n: Element, nume: string) => Array.from(n.childNodes).filter(c => c.nodeType === 1 && local(c) === nume) as Element[];
const descendenti = (n: Element | Document, nume: string) => Array.from(n.getElementsByTagName('*')).filter(e => local(e) === nume);
/** Valoarea unui câmp IDS: simpleValue sau enumerarea (unite cu „|”); null dacă e un tipar pe care nu-l reproducem. */
function valoareDin(n: Element | undefined): string | null | undefined {
  if (!n) return undefined;
  const sv = copiiDirecti(n, 'simpleValue')[0];
  if (sv) return sv.textContent?.trim() ?? '';
  const en = descendenti(n, 'enumeration').map(e => e.getAttribute('value') ?? '').filter(Boolean);
  if (en.length) return en.join('|');
  const tipare = descendenti(n, 'pattern').map(e => e.getAttribute('value') ?? '');
  if (tipare.length === 1 && (tipare[0] === '.*' || tipare[0] === '.+')) return '';
  return null;
}

const sursaDin = (d: string | null) => (d?.match(/Sursa: (EIR|AIR|BEP|normativ)/)?.[1] ?? 'EIR');

export type ImportIds = { titlu: string | null; reguli: RegulaModel[]; ignorate: string[] };

/** Citește un fișier IDS (1.0 / 0.9.x): fiecare cerință a fiecărei specificații devine o regulă. */
export function importaIds(xml: string, parse: ParserXml = parserImplicit): ImportIds {
  const doc = parse(xml);
  const titlu = descendenti(doc, 'title')[0]?.textContent?.trim() ?? null;
  const reguli: RegulaModel[] = []; const ignorate: string[] = [];
  for (const sp of descendenti(doc, 'specification')) {
    const nume = sp.getAttribute('name')?.trim() || 'Regulă din IDS';
    const apl = copiiDirecti(sp, 'applicability')[0];
    const ent = apl ? copiiDirecti(apl, 'entity')[0] : undefined;
    const clasa = valoareDin(ent ? copiiDirecti(ent, 'name')[0] : undefined);
    if (!clasa || clasa.includes('|') || !/^IFC[A-Z]+$/i.test(clasa)) { ignorate.push(`${nume}: se aplică altor elemente decât unei singure clase IFC`); continue; }
    const pred = valoareDin(ent ? copiiDirecti(ent, 'predefinedType')[0] : undefined) || null;
    const cer = copiiDirecti(sp, 'requirements')[0];
    const fatete = cer ? Array.from(cer.childNodes).filter(c => c.nodeType === 1) as Element[] : [];
    fatete.forEach((f, k) => {
      const card = f.getAttribute('cardinality') ?? (f.getAttribute('minOccurs') === '0' ? 'optional' : 'required');
      const recomandat = /Recomandat \(neobligatoriu\)/.test(sp.getAttribute('description') ?? '');
      if (card === 'prohibited' || f.getAttribute('maxOccurs') === '0') { ignorate.push(`${nume}: cerințele „interzis” nu sunt încă preluate`); return; }
      const baza: RegulaModel = { denumire: fatete.length > 1 ? `${nume} (${k + 1})` : nume, clasa: clasa.toUpperCase(), predefinit: pred ? pred.toUpperCase() : null, tip_cerinta: 'atribut', obligatorie: card !== 'optional' && !recomandat, sursa: sursaDin(sp.getAttribute('description')) };
      const camp = (t: string) => valoareDin(copiiDirecti(f, t)[0]);
      const tip = local(f);
      if (tip === 'attribute') {
        const a = camp('name');
        const potrivit = ['Name', 'Description', 'ObjectType', 'Tag', 'LongName'].find(x => x.toLowerCase() === (a ?? '').toLowerCase());
        if (!potrivit) { ignorate.push(`${nume}: atributul ${a ?? '?'} nu e preluat`); return; }
        const val = camp('value'); if (val === null) { ignorate.push(`${nume}: tiparul valorii nu e preluat`); return; }
        reguli.push({ ...baza, tip_cerinta: 'atribut', proprietate: potrivit, valoare: val || null });
      } else if (tip === 'property') {
        const ps = camp('propertySet'), pn = camp('baseName') ?? camp('name'), val = camp('value');
        if (!ps || !pn || val === null) { ignorate.push(`${nume}: proprietatea are tipare pe care nu le preluăm`); return; }
        reguli.push({ ...baza, tip_cerinta: 'proprietate', pset: ps, proprietate: pn, valoare: val || null });
      } else if (tip === 'classification') {
        const sist = camp('system'); if (sist === null) { ignorate.push(`${nume}: tiparul sistemului nu e preluat`); return; }
        reguli.push({ ...baza, tip_cerinta: 'clasificare', valoare: sist || null });
      } else if (tip === 'material') {
        const val = camp('value'); if (val === null) { ignorate.push(`${nume}: tiparul materialului nu e preluat`); return; }
        reguli.push({ ...baza, tip_cerinta: 'material', valoare: val || null });
      } else if (tip === 'partOf') {
        const e = copiiDirecti(f, 'entity')[0];
        const parinte = valoareDin(e ? copiiDirecti(e, 'name')[0] : undefined);
        if ((parinte ?? '').toUpperCase() !== 'IFCBUILDINGSTOREY') { ignorate.push(`${nume}: „parte din ${parinte ?? '?'}” nu e preluat (doar niveluri)`); return; }
        reguli.push({ ...baza, tip_cerinta: 'nivel' });
      } else ignorate.push(`${nume}: cerința „${tip}” nu e preluată`);
    });
    if (!fatete.length) ignorate.push(`${nume}: fără cerințe`);
  }
  return { titlu, reguli, ignorate };
}
