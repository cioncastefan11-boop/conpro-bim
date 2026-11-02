// BCF 2.1 (BIM Collaboration Format, buildingSMART): exportul și importul observațiilor pe model,
// ca să circule între Conpro BIM și Revit, Archicad, BIMcollab, Solibri, Navisworks.
// Un fișier .bcfzip conține bcf.version și câte un dosar pe topic: markup.bcf, viewpoint.bcfv, snapshot.png.
import JSZip from 'jszip';

/** Camera în coordonatele IFC (Z în sus), ca în BCF. */
export type PunctVedere = { camera_view_point: [number, number, number]; camera_direction: [number, number, number]; camera_up_vector: [number, number, number]; field_of_view: number };
export type ComentariuBcf = { guid: string; data: string; autor: string; text: string };
export type TopicBcf = {
  guid: string; tip: string; stare: string; prioritate: string; titlu: string; descriere: string | null; termen: string | null;
  atribuit: string | null; creat: string; autor: string; index: number | null; etichete: string[];
  comentarii: ComentariuBcf[]; punct_vedere: PunctVedere | null; elemente: string[]; snapshot: Uint8Array | null;
};

// corespondența cu valorile uzuale din BCF (lista exactă o stabilește fiecare proiect în extensions.xsd)
const TIP: Record<string, string> = { neconformitate: 'Issue', intrebare: 'Request', dispozitie: 'Remark', remediere: 'Fault', comentariu: 'Comment' };
const STARE: Record<string, string> = { deschisa: 'Open', in_lucru: 'In Progress', rezolvata: 'Resolved', inchisa: 'Closed' };
const PRIO: Record<string, string> = { mica: 'Low', normala: 'Normal', mare: 'High', critica: 'Critical' };
const invers = (m: Record<string, string>, v: string | null | undefined, impl: string, sinonime: Record<string, string> = {}) => {
  if (!v) return impl;
  const k = v.trim().toLowerCase();
  return Object.entries(m).find(([, x]) => x.toLowerCase() === k)?.[0] ?? sinonime[k] ?? impl;
};
export const tipDinBcf = (v?: string | null) => invers(TIP, v, 'neconformitate', { error: 'neconformitate', clash: 'neconformitate', warning: 'neconformitate', question: 'intrebare', rfi: 'intrebare', info: 'comentariu', request: 'intrebare', unknown: 'neconformitate' });
export const stareDinBcf = (v?: string | null) => invers(STARE, v, 'deschisa', { active: 'deschisa', new: 'deschisa', reopened: 'deschisa', inprogress: 'in_lucru', done: 'rezolvata', fixed: 'rezolvata', closed: 'inchisa', approved: 'inchisa', inactive: 'inchisa' });
export const prioritateDinBcf = (v?: string | null) => invers(PRIO, v, 'normala', { minor: 'mica', medium: 'normala', major: 'mare', blocker: 'critica', severe: 'critica' });

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const el = (nume: string, v: unknown) => (v == null || v === '' ? '' : `<${nume}>${esc(v)}</${nume}>`);
const xyz = (nume: string, p: [number, number, number]) => `<${nume}><X>${p[0]}</X><Y>${p[1]}</Y><Z>${p[2]}</Z></${nume}>`;
const dataIso = (s: string) => new Date(s).toISOString().replace(/\.\d{3}Z$/, 'Z');
const guidValid = (g: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(g);
const guidNou = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

export function markup(t: TopicBcf, vpGuid: string | null): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<Topic Guid="${esc(t.guid)}" TopicType="${esc(TIP[t.tip] ?? t.tip)}" TopicStatus="${esc(STARE[t.stare] ?? t.stare)}">
${el('Title', t.titlu)}${el('Priority', PRIO[t.prioritate] ?? t.prioritate)}${t.index != null ? el('Index', t.index) : ''}${t.etichete.map(x => el('Labels', x)).join('')}
${el('CreationDate', dataIso(t.creat))}${el('CreationAuthor', t.autor)}${t.termen ? el('DueDate', `${t.termen}T00:00:00Z`) : ''}${el('AssignedTo', t.atribuit)}${el('Description', t.descriere)}
</Topic>
${t.comentarii.map(c => `<Comment Guid="${esc(c.guid)}">${el('Date', dataIso(c.data))}${el('Author', c.autor)}${el('Comment', c.text)}${vpGuid ? `<Viewpoint Guid="${vpGuid}"/>` : ''}</Comment>`).join('\n')}
${vpGuid ? `<Viewpoints Guid="${vpGuid}"><Viewpoint>viewpoint.bcfv</Viewpoint>${t.snapshot ? '<Snapshot>snapshot.png</Snapshot>' : ''}</Viewpoints>` : ''}
</Markup>`;
}

export function vizualizare(t: TopicBcf, vpGuid: string): string {
  const c = t.punct_vedere;
  return `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${vpGuid}" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<Components>${t.elemente.length ? `<Selection>${t.elemente.map(g => `<Component IfcGuid="${esc(g)}"/>`).join('')}</Selection>` : ''}<Visibility DefaultVisibility="true"/></Components>
${c ? `<PerspectiveCamera>${xyz('CameraViewPoint', c.camera_view_point)}${xyz('CameraDirection', c.camera_direction)}${xyz('CameraUpVector', c.camera_up_vector)}<FieldOfView>${c.field_of_view}</FieldOfView></PerspectiveCamera>` : ''}
</VisualizationInfo>`;
}

/** Fișierul .bcfzip pentru topicurile date. */
export async function exportaBcf(topicuri: TopicBcf[], proiect: { id: string; nume: string }): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('bcf.version', `<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><DetailedVersion>2.1</DetailedVersion></Version>`);
  zip.file('project.bcfp', `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension><Project ProjectId="${esc(proiect.id)}">${el('Name', proiect.nume)}</Project><ExtensionSchema></ExtensionSchema></ProjectExtension>`);
  for (const t of topicuri) {
    const d = zip.folder(t.guid)!;
    const vp = t.punct_vedere || t.elemente.length || t.snapshot ? guidNou() : null;
    d.file('markup.bcf', markup(t, vp));
    if (vp) d.file('viewpoint.bcfv', vizualizare(t, vp));
    if (vp && t.snapshot) d.file('snapshot.png', t.snapshot);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ------------------------------------------------------------------ import
type ParserXml = (xml: string) => Document;
const parserImplicit: ParserXml = xml => new DOMParser().parseFromString(xml, 'application/xml');
const copii = (n: Element | Document, nume: string) => Array.from(n.getElementsByTagName(nume));
const text = (n: Element | Document | undefined, nume: string): string | null => {
  const x = n ? copii(n, nume)[0] : undefined; const v = x?.textContent?.trim(); return v ? v : null;
};
const punct = (n: Element | undefined): [number, number, number] | null => {
  if (!n) return null;
  const v = ['X', 'Y', 'Z'].map(k => Number(text(n, k)));
  return v.every(Number.isFinite) ? (v as [number, number, number]) : null;
};

/** Citește un .bcfzip (BCF 2.0 / 2.1 / 3.0, partea comună). */
export async function importaBcf(date: ArrayBuffer | Uint8Array, parse: ParserXml = parserImplicit): Promise<TopicBcf[]> {
  const zip = await JSZip.loadAsync(date);
  const dosare = new Set(Object.keys(zip.files).filter(n => /(^|\/)markup\.bcf$/i.test(n)).map(n => n.replace(/markup\.bcf$/i, '')));
  const rez: TopicBcf[] = [];
  for (const dir of dosare) {
    const m = parse(await zip.file(`${dir}markup.bcf`)!.async('string'));
    const topic = copii(m, 'Topic')[0];
    if (!topic) continue;
    const guid = topic.getAttribute('Guid') ?? '';
    // primul punct de vedere: viewpoint.bcfv (sau cel indicat în markup) și captura lui
    const vpNod = copii(m, 'Viewpoints')[0];
    const vpFis = (vpNod && text(vpNod, 'Viewpoint')) || (zip.file(`${dir}viewpoint.bcfv`) ? 'viewpoint.bcfv' : null);
    const snFis = (vpNod && text(vpNod, 'Snapshot')) || (zip.file(`${dir}snapshot.png`) ? 'snapshot.png' : null);
    let pv: PunctVedere | null = null; let elemente: string[] = [];
    if (vpFis && zip.file(`${dir}${vpFis}`)) {
      const v = parse(await zip.file(`${dir}${vpFis}`)!.async('string'));
      const cam = copii(v, 'PerspectiveCamera')[0];
      if (cam) {
        const a = punct(copii(cam, 'CameraViewPoint')[0]), b = punct(copii(cam, 'CameraDirection')[0]), c = punct(copii(cam, 'CameraUpVector')[0]);
        if (a && b && c) pv = { camera_view_point: a, camera_direction: b, camera_up_vector: c, field_of_view: Number(text(cam, 'FieldOfView')) || 60 };
      }
      const sel = copii(v, 'Selection')[0];
      elemente = sel ? copii(sel, 'Component').map(x => x.getAttribute('IfcGuid') ?? '').filter(Boolean) : [];
    }
    const snapshot = snFis && zip.file(`${dir}${snFis}`) ? await zip.file(`${dir}${snFis}`)!.async('uint8array') : null;
    const due = text(topic, 'DueDate');
    rez.push({
      guid: guidValid(guid) ? guid.toLowerCase() : guidNou(),
      tip: tipDinBcf(topic.getAttribute('TopicType')), stare: stareDinBcf(topic.getAttribute('TopicStatus')),
      prioritate: prioritateDinBcf(text(topic, 'Priority')), titlu: text(topic, 'Title') ?? '(fără titlu)', descriere: text(topic, 'Description'),
      termen: due ? due.slice(0, 10) : null, atribuit: text(topic, 'AssignedTo'), creat: text(topic, 'CreationDate') ?? new Date().toISOString(),
      autor: text(topic, 'CreationAuthor') ?? '', index: text(topic, 'Index') ? Number(text(topic, 'Index')) : null,
      etichete: copii(topic, 'Labels').map(x => x.textContent?.trim() ?? '').filter(Boolean),
      comentarii: copii(m, 'Comment').filter(c => c.parentNode && (c.parentNode as Element).tagName !== 'Topic' && c.getAttribute('Guid'))
        .map(c => ({ guid: c.getAttribute('Guid')!, data: text(c, 'Date') ?? '', autor: text(c, 'Author') ?? '', text: (copii(c, 'Comment')[0]?.textContent ?? '').trim() }))
        .filter(c => c.text),
      punct_vedere: pv, elemente, snapshot,
    });
  }
  return rez;
}
