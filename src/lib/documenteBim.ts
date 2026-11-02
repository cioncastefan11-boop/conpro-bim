// EIR (cerințele de schimb de informații, ISO 19650-2, 5.2.1) și BEP (planul de execuție BIM, 5.3.2 / 5.4.1)
// generate din datele proiectului: echipa, convenția, momentele și planul de livrare, regulile modelului,
// cerințele de predare. Textele pe care aplicația nu le are vin din secțiunile editabile (cu text implicit).
// Fără dependențe de browser: se testează în Node.
import type { Conventie, Membru, Proiect } from './tipuri';
import type { CerintaPredare } from './cerinte';
import { CAMPURI_CERINTA } from './cerinte';
import { descrieCerinta, type RegulaModel } from './ids';
import { numeClasa } from './ifcClase';
import { CODURI_STARE, ROLURI_DOCUMENT, STADII, TIPURI_DOCUMENT, numeRol, numeRolDocument, type Rol } from './domeniu';

export type TipDocBim = 'eir' | 'bep';
export type Sectiune = { cheie: string; titlu: string; ajutor: string; implicit: string; optionala?: boolean };
export type MomentDoc = { id: string; cod: string; denumire: string; data_planificata: string };
export type LivrabilDoc = {
  id: string; cod: string; titlu: string; initiator: string; rol: string; tip: string; moment_id: string | null;
  termen: string | null; responsabil: string | null; stare_ceruta: string; nivel_informatii: string | null;
};
export type DateDocBim = {
  proiect: Proiect; membri: Membru[]; momente: MomentDoc[]; livrabile: LivrabilDoc[];
  reguli: RegulaModel[]; cerinte: CerintaPredare[];
  sectiuni: Record<string, string>; versiune: number | null; actualizat_la: string | null; actualizat_de: string | null;
};

// ------------------------------------------------------------------ secțiunile editabile
export const SECTIUNI_EIR: Sectiune[] = [
  { cheie: 'descriere', titlu: 'Descrierea investiției', ajutor: 'Pe scurt: ce se construiește, regim de înălțime, suprafețe, funcțiuni.', implicit: '' , optionala: true },
  { cheie: 'scop', titlu: 'Scopul informațiilor și utilizările BIM', ajutor: 'Pentru ce are nevoie beneficiarul de informații: decizii, recepție, exploatare.',
    implicit: `Beneficiarul are nevoie de informații structurate pentru a lua deciziile din fiecare etapă, pentru a verifica execuția și pentru a administra construcția după recepție.
Utilizările cerute ale modelului informațional:
- coordonarea disciplinelor și verificarea interferențelor înainte de execuție;
- verificarea execuției: lucrările ascunse și fazele determinante legate de elementele din model;
- trasabilitatea materialelor (FAM, declarații de performanță, încercări) pe elemente;
- recepția la terminarea lucrărilor pe baza modelului as-built verificat;
- Cartea tehnică a construcției în format electronic și datele COBie pentru exploatare și mentenanță.` },
  { cheie: 'proceduri', titlu: 'Proceduri suplimentare', ajutor: 'Ce cere beneficiarul în plus față de procedurile standard de mai sus.', implicit: '', optionala: true },
  { cheie: 'referinta', titlu: 'Informații de referință și resurse partajate', ajutor: 'Ce pune beneficiarul la dispoziție: ridicări topo, studii, relevee, modele existente, șabloane.',
    implicit: `Beneficiarul pune la dispoziția echipei de livrare, în mediul comun de date (CDE) al proiectului:
- ridicarea topografică și studiul geotehnic;
- tema de proiectare și documentația aprobată în etapele anterioare;
- convenția de denumire și codurile din prezentul document;
- regulile de verificare a modelului, ca fișier IDS (anexă).` },
  { cheie: 'acceptare', titlu: 'Criterii suplimentare de acceptare', ajutor: 'Condiții proprii ale beneficiarului, în plus față de criteriile verificate automat.', implicit: '', optionala: true },
  { cheie: 'alte', titlu: 'Alte cerințe', ajutor: 'Securitatea informațiilor, confidențialitate, drepturi de autor asupra modelelor etc.',
    implicit: `Modelele și documentele produse în cadrul contractului se predau beneficiarului cu drept de utilizare pentru construcție, exploatare, întreținere și lucrări viitoare.
Informațiile cu caracter sensibil (sisteme de securitate, planuri de evacuare detaliate) se partajează doar cu membrii echipei care au nevoie de ele.` , optionala: true },
];

export const SECTIUNI_BEP: Sectiune[] = [
  { cheie: 'manager', titlu: 'Managerul informațiilor', ajutor: 'Cine răspunde de managementul informațiilor în echipa de livrare (nume, firmă, contact).', implicit: '' },
  { cheie: 'strategie', titlu: 'Strategia de livrare a informațiilor', ajutor: 'Cum se organizează echipa: antreprenor general, subcontractori, proiectanți; cum se ajunge la momentele de livrare.',
    implicit: `Partea principală coordonează echipele de proiectare și execuție și răspunde în fața beneficiarului pentru toate livrabilele.
Fiecare echipă își produce informațiile în mediul comun de date al proiectului, le verifică intern și le partajează pentru coordonare. Partea principală le revizuiește și le autorizează înainte de fiecare moment de livrare.
Pe șantier, verificările (procese verbale, FAM-uri, turnări, încercări) se înregistrează în aplicație și se leagă de elementele din model.` },
  { cheie: 'federare', titlu: 'Strategia de federare', ajutor: 'Cum se împart modelele (pe discipline, volume, niveluri) și cum se suprapun.',
    implicit: `Câte un model IFC 4 pe disciplină și volum, cu același punct de origine și aceeași orientare, în metri.
Modelele se suprapun (federează) în vizualizatorul aplicației pentru coordonare și pentru verificarea execuției; nu se combină într-un singur fișier.` },
  { cheie: 'coordonare', titlu: 'Coordonare și verificarea calității', ajutor: 'Întâlnirile de coordonare, verificarea interferențelor, verificarea înainte de partajare.',
    implicit: `- întâlnire de coordonare BIM o dată la două săptămâni în proiectare și lunar în execuție, cu minută în CDE;
- verificarea interferențelor înainte de fiecare partajare a modelelor; problemele se transmit ca observații BCF;
- fiecare echipă își verifică modelul cu fișierul IDS al proiectului înainte de partajare;
- partea principală rulează verificarea modelului în aplicație înainte de fiecare moment de livrare și salvează raportul.` },
  { cheie: 'software', titlu: 'Software și formate', ajutor: 'Programele folosite de fiecare echipă, versiunile și formatele de schimb.',
    implicit: `- Arhitectură: (programul, versiunea) · export IFC 4
- Structură: (programul, versiunea) · export IFC 4
- Instalații: (programul, versiunea) · export IFC 4
- Coordonare, observații, verificare și CDE: Conpro BIM (BCF 2.1, IDS 1.0, COBie)` },
  { cheie: 'riscuri', titlu: 'Riscuri și măsuri', ajutor: 'Ce poate împiedica livrarea informațiilor și cum se previne.',
    implicit: `- Echipe fără experiență în export IFC: test al procedurilor de producție la începutul contractului (ISO 19650-2, 5.5.3).
- Date COBie adunate abia la final: echipamentele se completează la montaj, cu fotografia plăcuței.
- Modificări pe șantier nereflectate în model: actualizarea modelului as-built la fiecare moment de livrare.` },
];

export const SECTIUNI = { eir: SECTIUNI_EIR, bep: SECTIUNI_BEP } as const;
export const TITLU_DOC = { eir: 'Cerințele de schimb de informații (EIR)', bep: 'Planul de execuție BIM (BEP)' } as const;
export const ROLURI_DOC: Record<TipDocBim, Rol[]> = { eir: ['administrator', 'beneficiar', 'diriginte'], bep: ['administrator', 'constructor', 'proiectant'] };
export const textSectiune = (tip: TipDocBim, d: Pick<DateDocBim, 'sectiuni'>, cheie: string) => {
  const v = d.sectiuni[cheie];
  return v != null ? v : SECTIUNI[tip].find(s => s.cheie === cheie)?.implicit ?? '';
};

// ------------------------------------------------------------------ ce lipsește
export type Lipsa = { text: string; unde: string };
export function lipsuri(tip: TipDocBim, d: DateDocBim): Lipsa[] {
  const l: Lipsa[] = [];
  const conv = (d.proiect.standard_info ?? {}) as Conventie;
  if (!d.proiect.beneficiar) l.push({ text: 'Beneficiarul proiectului nu e completat', unde: 'detalii' });
  if (!conv.initiatori?.length) l.push({ text: 'Convenția de denumire nu are inițiatorii (echipele)', unde: 'detalii' });
  if (!d.momente.length) l.push({ text: 'Nu sunt stabilite momentele de livrare', unde: 'documente/plan' });
  if (tip === 'eir') {
    if (!d.reguli.length) l.push({ text: 'Nu sunt reguli pentru informațiile din model', unde: 'model/verificare' });
    if (!d.cerinte.length) l.push({ text: 'Nu sunt cerințe de predare (AIR)', unde: 'carte' });
  } else {
    if (!d.livrabile.length) l.push({ text: 'Planul de livrare (MIDP) e gol', unde: 'documente/plan' });
    if (!textSectiune('bep', d, 'manager').trim() && !d.membri.some(m => m.rol === 'administrator')) l.push({ text: 'Nu e numit managerul informațiilor', unde: '' });
    if (/\(programul, versiunea\)/.test(textSectiune('bep', d, 'software'))) l.push({ text: 'Software-ul echipelor nu e completat', unde: '' });
  }
  return l;
}

// ------------------------------------------------------------------ HTML
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const data = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const numePers = (m?: Membru) => m?.persoane ? (m.persoane.nume || m.persoane.email) : '—';
const firma = (m?: Membru) => m?.persoane?.firme?.denumire ?? '';
/** Textul liber: paragrafe, iar rândurile care încep cu „-” devin listă. */
export function textInHtml(t: string): string {
  const out: string[] = []; let lista = false;
  for (const r of t.split('\n')) {
    const x = r.trim();
    if (/^[-•*]\s+/.test(x)) { if (!lista) { out.push('<ul>'); lista = true; } out.push(`<li>${esc(x.replace(/^[-•*]\s+/, ''))}</li>`); continue; }
    if (lista) { out.push('</ul>'); lista = false; }
    if (x) out.push(`<p>${esc(x)}</p>`);
  }
  if (lista) out.push('</ul>');
  return out.join('');
}
const tabel = (cap: string[], randuri: (string | number)[][], gol = 'Nu sunt date.') =>
  randuri.length ? `<table><thead><tr>${cap.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${randuri.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<p class="gol">${gol}</p>`;

const CSS = `@page{size:A4;margin:18mm 16mm}body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#0f172a;line-height:1.45;margin:0 auto;max-width:190mm;padding:12mm 0}
h1{font-size:22pt;margin:0 0 4mm}h2{font-size:13pt;margin:9mm 0 2mm;padding-bottom:1mm;border-bottom:1.5pt solid #f97316;page-break-after:avoid}h3{font-size:11pt;margin:5mm 0 1mm;page-break-after:avoid}
.coperta{border:1pt solid #cbd5e1;border-radius:3mm;padding:8mm;margin-bottom:8mm}.coperta .eticheta{display:inline-block;background:#0f172a;color:#fff;font-weight:bold;font-size:9pt;padding:1mm 3mm;border-radius:2mm;margin-bottom:4mm}
.coperta dl{display:grid;grid-template-columns:45mm 1fr;gap:1.5mm 4mm;margin:5mm 0 0}.coperta dt{color:#64748b}.coperta dd{margin:0;font-weight:bold}
table{border-collapse:collapse;width:100%;margin:2mm 0 3mm;font-size:9.5pt;page-break-inside:auto}th,td{border:0.6pt solid #cbd5e1;padding:1.5mm 2mm;text-align:left;vertical-align:top}th{background:#f1f5f9}tr{page-break-inside:avoid}
code{font-family:Consolas,monospace;font-size:9pt}.ref{color:#64748b;font-weight:normal;font-size:9pt}.gol{color:#b45309;font-style:italic}.nota{color:#64748b;font-size:9pt}
.cuprins ol{columns:2;font-size:10pt;padding-left:5mm}.semn{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:12mm}.semn div{border-top:0.6pt solid #0f172a;padding-top:1.5mm;font-size:9.5pt}
@media screen{body{padding:12mm 8mm}}@media print{body{max-width:none;padding:0}.nu-tipari{display:none}}
.date th{width:55mm;background:#f8fafc;font-weight:normal;color:#475569}`;

function antetComun(tip: TipDocBim, d: DateDocBim, capitole: string[]): string {
  const p = d.proiect;
  const azi = new Date().toISOString().slice(0, 10);
  return `<div class="coperta"><span class="eticheta">${tip.toUpperCase()} · ${esc(p.cod)}</span>
<h1>${TITLU_DOC[tip]}</h1><p>${esc(p.denumire)}</p>
<dl><dt>Beneficiar</dt><dd>${esc(p.beneficiar ?? '—')}</dd><dt>Amplasament</dt><dd>${esc(p.adresa ?? '—')}</dd>
<dt>Stadiul</dt><dd>${esc(STADII[p.stadiu_catuc] ?? '—')}</dd>
<dt>Versiunea</dt><dd>${d.versiune ?? 1} · ${data(d.actualizat_la ?? azi)}</dd><dt>Generat</dt><dd>${data(azi)}, din Conpro BIM</dd>
<dt>Referință</dt><dd>SR EN ISO 19650-2, ${tip === 'eir' ? '5.2.1 (cerințele de schimb de informații)' : '5.3.2 și 5.4.1 (planul de execuție BIM)'}</dd></dl></div>
<div class="cuprins"><h3>Cuprins</h3><ol>${capitole.map(c => `<li>${esc(c)}</li>`).join('')}</ol></div>`;
}

function capProiect(d: DateDocBim): string {
  const p = d.proiect;
  const r: [string, string][] = [
    ['Cod proiect', `<code>${esc(p.cod)}</code>`], ['Denumire', esc(p.denumire)], ['Beneficiar', esc(p.beneficiar ?? '—')], ['Amplasament', esc(p.adresa ?? '—')],
    ['Autorizația de construire', p.ac_numar ? `nr. ${esc(p.ac_numar)}${p.ac_emis_la ? ` din ${data(p.ac_emis_la)}` : ''}${p.ac_valabil_pana ? `, valabilă până la ${data(p.ac_prelungit_pana ?? p.ac_valabil_pana)}` : ''}` : '—'],
    ['Clasa de consecințe', esc(p.clasa_consecinte ?? '—')], ['Stadiul (CATUC)', esc(STADII[p.stadiu_catuc] ?? '—')],
  ];
  return `<table class="date"><tbody>${r.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;
}

function capMomente(d: DateDocBim): string {
  return tabel(['Cod', 'Momentul de livrare', 'Data planificată', 'Livrabile planificate'],
    d.momente.map(m => [`<code>${esc(m.cod)}</code>`, esc(m.denumire), data(m.data_planificata), d.livrabile.filter(l => l.moment_id === m.id).length || '—']),
    'Momentele de livrare nu sunt încă stabilite (Documente → Planul de livrare).');
}

function capStandard(d: DateDocBim): string {
  const c = (d.proiect.standard_info ?? {}) as Conventie;
  const lista = (x?: { cod: string; nume: string }[]) => (x?.length ? x.map(e => `<code>${esc(e.cod)}</code> ${esc(e.nume)}`).join('; ') : '<span class="gol">necompletat</span>');
  return `<p>Fiecare document și model are un cod unic, format din câmpuri separate prin cratimă (SR EN ISO 19650-2, anexa națională):</p>
<p><code>PROIECT-INIȚIATOR-VOLUM-NIVEL-TIP-DISCIPLINĂ-NUMĂR</code>, de exemplu <code>${esc(d.proiect.cod)}-${esc(c.initiatori?.[0]?.cod ?? 'SP')}-${esc(c.volume?.[0]?.cod ?? 'ZZ')}-${esc(c.niveluri?.[0]?.cod ?? '01')}-DR-S-${'0'.repeat(Math.max(0, (c.cifre ?? 4) - 1))}1</code>. ${c.strict ? 'Se acceptă doar codurile din listele de mai jos.' : ''}</p>
${tabel(['Câmpul', 'Valori permise'], [
    ['Inițiatorul (echipa)', lista(c.initiatori)], ['Volumul / zona', lista(c.volume) + ' · <code>ZZ</code> toate'], ['Nivelul', lista(c.niveluri) + ' · <code>ZZ</code> toate'],
    ['Tipul', TIPURI_DOCUMENT.map(t => `<code>${t.id}</code> ${esc(t.nume)}`).join('; ')], ['Disciplina', ROLURI_DOCUMENT.map(t => `<code>${t.id}</code> ${esc(t.nume)}`).join('; ')],
    ['Numărul', `${c.cifre ?? 4} cifre`],
  ])}
<h3>Stările informațiilor în CDE și codurile de stare</h3>
${tabel(['Starea CDE', 'Semnificație'], [['În lucru (WIP)', 'vizibil doar echipei care produce'], ['Partajat', 'pentru coordonare, cu un cod de stare S1–S4'], ['Publicat', 'aprobat de beneficiar pentru utilizare (A, B) sau as-built (CR)'], ['Arhivat', 'revizii înlocuite, păstrate ca istoric']])}
${tabel(['Cod', 'Semnificație'], Object.entries(CODURI_STARE).map(([k, v]) => [`<code>${k}</code>`, esc(v.nume)]))}
<p>Reviziile: <code>P01, P02…</code> pentru informațiile preliminare (partajate) și <code>C01, C02…</code> pentru cele contractuale (publicate).</p>`;
}

const PROCEDURI = `<ul>
<li><b>Mediul comun de date (CDE):</b> toate informațiile proiectului se schimbă prin Conpro BIM, cu stările În lucru → Partajat → Publicat → Arhivat. Trecerea în Publicat o aprobă beneficiarul sau administratorul proiectului.</li>
<li><b>Observații pe model:</b> problemele de coordonare și neconformitățile se deschid pe elementele din model, cu punct de vedere și captură, și se schimbă cu alte programe în format BCF 2.1.</li>
<li><b>Verificarea modelului:</b> regulile de informații ale proiectului se rulează automat pe modele (capitolul despre cerințele modelului); raportul se păstrează ca dovadă.</li>
<li><b>Execuția:</b> procesele verbale de lucrări ascunse și faze determinante, turnările și FAM-urile se leagă de elementele din model; modelul arată starea fiecărui element.</li>
<li><b>Predarea:</b> echipamentele se completează în COBie pe parcurs, la montaj; Cartea tehnică se generează din aplicație (Legea 169/2026, art. 529–530).</li>
</ul>`;

const FORMATE = tabel(['Informația', 'Formatul de schimb'], [
  ['Modele 3D', 'IFC 4 (SR EN ISO 16739-1), câte un fișier pe disciplină și volum; plus formatul nativ, la cerere'],
  ['Planșe și documente', 'PDF (PDF/A pentru arhivare), cu semnătura electronică acolo unde legea o cere'],
  ['Observații și coordonare', 'BCF 2.1 (buildingSMART)'], ['Cerințele de informații ale modelului', 'IDS 1.0 (buildingSMART)'],
  ['Datele pentru exploatare', 'COBie (Excel), generat din aplicație'], ['Tabele, liste, antemăsurători', 'XLSX / CSV'],
]);

function capReguli(d: DateDocBim): string {
  if (!d.reguli.length) return '<p class="gol">Nu sunt stabilite reguli pentru informațiile din model (Model 3D → Verificarea modelului).</p>';
  return `<p>Elementele din modele trebuie să aibă informațiile de mai jos. Regulile se predau și ca fișier IDS 1.0 (anexă), cu care fiecare echipă își verifică modelul înainte de partajare; aceleași reguli le verifică automat aplicația înainte de fiecare moment de livrare.</p>
${tabel(['Nr.', 'Elementele', 'Cerința', 'Obligatorie', 'Sursa'], d.reguli.map((r, i) => [i + 1, `${esc(numeClasa(r.clasa))}<br><span class="ref">${esc(r.clasa)}${r.predefinit ? ` · ${esc(r.predefinit)}` : ''}</span>`, `<b>${esc(r.denumire)}</b><br><span class="ref">${esc(descrieCerinta(r))}</span>`, r.obligatorie === false ? 'recomandată' : 'da', esc(r.sursa ?? 'EIR')]))}`;
}

function capAir(d: DateDocBim): string {
  if (!d.cerinte.length) return '<p class="gol">Nu sunt stabilite cerințele de predare (Cartea tehnică → Cerințele de predare).</p>';
  const ech = d.cerinte.filter(c => c.categorie === 'echipament'), doc = d.cerinte.filter(c => c.categorie === 'document');
  return `${ech.length ? `<h3>Datele echipamentelor (COBie)</h3>${tabel(['Informația', 'Se aplică la', 'Obligatorie'], ech.map(c => [esc(CAMPURI_CERINTA[c.camp!] ?? c.camp), esc(c.aplicabil_la ? `echipamentele „${c.aplicabil_la}”` : 'toate echipamentele'), c.obligatorie ? 'da' : 'nu']))}` : ''}
${doc.length ? `<h3>Documentele de predat</h3>${tabel(['Documentul', 'Capitolul din Cartea tehnică', 'Cod în CDE', 'Obligatoriu'], doc.map(c => [esc(c.titlu), c.capitol ?? '—', c.cod_document ? `<code>${esc(c.cod_document)}</code>` : '—', c.obligatorie ? 'da' : 'nu']))}` : ''}`;
}

const sectiuneLibera = (tip: TipDocBim, d: DateDocBim, cheie: string) => textInHtml(textSectiune(tip, d, cheie));
const subsol = (d: DateDocBim) => `<p class="nota">Document generat din Conpro BIM pe baza datelor proiectului ${esc(d.proiect.cod)}. Tabelele se actualizează la fiecare generare; versiunea crește când se modifică textele.</p>`;

export function htmlEir(d: DateDocBim): string {
  const capitole = ['Informații despre proiect', 'Scopul informațiilor și utilizările BIM', 'Partea care numește (beneficiarul)', 'Momentele de livrare a informațiilor',
    'Standardul informațiilor', 'Metode și proceduri de producție', 'Cerințele de informații pentru model', 'Cerințele de informații pentru predare (AIR)',
    'Formatele de schimb', 'Informații de referință și resurse partajate', 'Criterii de acceptare', ...(textSectiune('eir', d, 'alte').trim() ? ['Alte cerințe'] : [])];
  const numeste = d.membri.filter(m => ['beneficiar', 'administrator', 'diriginte', 'administrator_cladire'].includes(m.rol));
  let n = 0; const h2 = (t: string, ref = '') => `<h2>${++n}. ${esc(t)}${ref ? ` <span class="ref">${ref}</span>` : ''}</h2>`;
  const descriere = textSectiune('eir', d, 'descriere').trim();
  let h = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>EIR ${esc(d.proiect.cod)}</title><style>${CSS}</style></head><body>${antetComun('eir', d, capitole)}`;
  h += h2('Informații despre proiect') + capProiect(d) + (descriere ? textInHtml(descriere) : '');
  h += h2('Scopul informațiilor și utilizările BIM', 'ISO 19650-2, 5.2.1') + sectiuneLibera('eir', d, 'scop');
  h += h2('Partea care numește (beneficiarul)', '5.1.1') + tabel(['Rolul', 'Persoana', 'Firma', 'Contact'], numeste.map(m => [esc(numeRol(m.rol)), esc(numePers(m)), esc(firma(m)), esc(m.persoane?.email ?? '')]));
  h += h2('Momentele de livrare a informațiilor', '5.1.3') + capMomente(d);
  h += h2('Standardul informațiilor', '5.1.4') + capStandard(d);
  h += h2('Metode și proceduri de producție', '5.1.5') + PROCEDURI + sectiuneLibera('eir', d, 'proceduri');
  h += h2('Cerințele de informații pentru model', '5.2.1') + capReguli(d);
  h += h2('Cerințele de informații pentru predare (AIR)', 'ISO 19650-1; ISO 19650-3') + capAir(d);
  h += h2('Formatele de schimb') + FORMATE;
  h += h2('Informații de referință și resurse partajate', '5.1.6') + sectiuneLibera('eir', d, 'referinta');
  h += h2('Criterii de acceptare', '5.2.1') + `<p>Un livrabil se acceptă la momentul de livrare dacă:</p><ul>
<li>are codul conform standardului informațiilor și starea cerută în planul de livrare (Partajat sau Publicat);</li>
<li>modelele trec regulile obligatorii din capitolul 7, iar raportul de verificare e salvat în aplicație;</li>
<li>la predare, cerințele obligatorii din capitolul 8 sunt îndeplinite, verificat automat în Cartea tehnică;</li>
<li>nu rămân observații pe model deschise fără termen și responsabil.</li></ul>` + sectiuneLibera('eir', d, 'acceptare');
  if (textSectiune('eir', d, 'alte').trim()) h += h2('Alte cerințe') + sectiuneLibera('eir', d, 'alte');
  h += `<h3>Anexe</h3><ul><li>Fișierul IDS cu regulile modelului: <code>${esc(d.proiect.cod)}-cerinte-model.ids</code></li></ul>`;
  h += `<div class="semn"><div>Întocmit,<br>${esc(numeste.find(m => m.rol === 'administrator')?.persoane?.nume ?? '')}</div><div>Aprobat, beneficiar<br>${esc(d.proiect.beneficiar ?? '')}</div></div>`;
  return h + subsol(d) + '</body></html>';
}

export function htmlBep(d: DateDocBim): string {
  const capitole = ['Informații despre proiect', 'Echipa de livrare', 'Managerul informațiilor', 'Strategia de livrare a informațiilor', 'Strategia de federare',
    'Matricea de responsabilități', 'Planul general de livrare a informațiilor (MIDP)', 'Metode și proceduri', 'Coordonare și verificarea calității',
    'Răspunsul la cerințele beneficiarului (EIR)', 'Software și formate', 'Riscuri și măsuri'];
  let n = 0; const h2 = (t: string, ref = '') => `<h2>${++n}. ${esc(t)}${ref ? ` <span class="ref">${ref}</span>` : ''}</h2>`;
  const c = (d.proiect.standard_info ?? {}) as Conventie;
  const echipa = d.membri.filter(m => !['cititor'].includes(m.rol)).sort((a, b) => a.rol.localeCompare(b.rol));
  const persoana = (id: string | null) => numePers(d.membri.find(m => m.persoana_id === id));
  const manager = textSectiune('bep', d, 'manager').trim();
  const admini = d.membri.filter(m => m.rol === 'administrator');

  let h = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>BEP ${esc(d.proiect.cod)}</title><style>${CSS}</style></head><body>${antetComun('bep', d, capitole)}`;
  h += h2('Informații despre proiect') + capProiect(d);
  h += h2('Echipa de livrare', '5.3.2; 5.3.3') + tabel(['Rolul în proiect', 'Persoana', 'Firma', 'Zona de lucru', 'Contact'],
    echipa.map(m => [esc(numeRol(m.rol)), esc(numePers(m)), esc(firma(m)), esc(m.zona ?? '—'), esc([m.persoane?.email, m.persoane?.telefon].filter(Boolean).join(' · '))]));
  if (c.initiatori?.length) h += `<h3>Echipele (inițiatorii din convenție)</h3>` + tabel(['Cod', 'Echipa'], c.initiatori.map(x => [`<code>${esc(x.cod)}</code>`, esc(x.nume)]));
  h += h2('Managerul informațiilor', '5.3.2') + (manager ? textInHtml(manager)
    : admini.length ? `<p>${admini.map(m => `${esc(numePers(m))}${firma(m) ? `, ${esc(firma(m))}` : ''} (${esc(m.persoane?.email ?? '')})`).join('; ')}, administrator al proiectului în Conpro BIM.</p>` : '<p class="gol">Nenumit.</p>');
  h += h2('Strategia de livrare a informațiilor', '5.3.2') + sectiuneLibera('bep', d, 'strategie');
  h += h2('Strategia de federare', '5.3.2') + sectiuneLibera('bep', d, 'federare')
    + (c.volume?.length || c.niveluri?.length ? tabel(['Împărțirea', 'Codurile'], [
      ...(c.volume?.length ? [['Volume / zone', c.volume.map(x => `<code>${esc(x.cod)}</code> ${esc(x.nume)}`).join('; ')]] : []),
      ...(c.niveluri?.length ? [['Niveluri', c.niveluri.map(x => `<code>${esc(x.cod)}</code> ${esc(x.nume)}`).join('; ')]] : []),
    ]) : '');

  // matricea: echipa × disciplina, pe momente
  const grup = new Map<string, LivrabilDoc[]>();
  d.livrabile.forEach(l => { const k = `${l.initiator}|${l.rol}`; grup.set(k, [...(grup.get(k) ?? []), l]); });
  const coloane = [...d.momente, ...(d.livrabile.some(l => !l.moment_id) ? [{ id: '', cod: '—', denumire: 'fără moment', data_planificata: '' }] : [])];
  h += h2('Matricea de responsabilități', '5.3.2; 5.4.2') + tabel(['Echipa · disciplina', 'Responsabili', ...coloane.map(m => `${esc(m.cod)}<br><span class="ref">${m.data_planificata ? data(m.data_planificata) : ''}</span>`)],
    [...grup.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, ls]) => {
      const [ini, rol] = k.split('|');
      return [`<b>${esc(ini)}</b> ${esc(c.initiatori?.find(x => x.cod === ini)?.nume ?? '')}<br>${esc(numeRolDocument(rol))}`,
        esc([...new Set(ls.map(l => persoana(l.responsabil)).filter(x => x !== '—'))].join(', ') || '—'),
        ...coloane.map(m => { const nr = ls.filter(l => (l.moment_id ?? '') === m.id).length; return nr ? String(nr) : ''; })];
    }), 'Planul de livrare e gol (Documente → Planul de livrare).');

  h += h2('Planul general de livrare a informațiilor (MIDP)', '5.4.4; 5.4.5');
  if (!d.livrabile.length) h += '<p class="gol">Planul de livrare e gol (Documente → Planul de livrare).</p>';
  for (const m of coloane) {
    const ls = d.livrabile.filter(l => (l.moment_id ?? '') === m.id);
    if (!ls.length) continue;
    h += `<h3>${esc(m.cod)} · ${esc(m.denumire)}${m.data_planificata ? ` · ${data(m.data_planificata)}` : ''}</h3>` + tabel(['Codul', 'Titlul', 'Termen', 'Responsabil', 'Starea cerută'],
      ls.map(l => [`<code>${esc(l.cod)}</code>`, `${esc(l.titlu)}${l.nivel_informatii ? `<br><span class="ref">${esc(l.nivel_informatii)}</span>` : ''}`, data(l.termen ?? m.data_planificata), esc(persoana(l.responsabil)), l.stare_ceruta === 'partajat' ? 'Partajat' : 'Publicat']));
  }
  h += h2('Metode și proceduri', '5.3.2; 5.4.1') + PROCEDURI + `<p>Codificarea documentelor și stările din CDE sunt cele din EIR (standardul informațiilor), cu inițiatorii de mai sus.</p>`;
  h += h2('Coordonare și verificarea calității', '5.6.3; 5.6.5') + sectiuneLibera('bep', d, 'coordonare');
  h += h2('Răspunsul la cerințele beneficiarului (EIR)', '5.3.2; 5.4.1');
  h += d.reguli.length ? `<h3>Cerințele pentru model</h3>` + tabel(['Cerința', 'Cum se asigură'], d.reguli.map(r => [`${esc(r.denumire)}<br><span class="ref">${esc(numeClasa(r.clasa))}: ${esc(descrieCerinta(r))}</span>`, 'completată în modelul disciplinei; verificată cu fișierul IDS înainte de partajare și în aplicație înainte de livrare'])) : '<p class="gol">EIR-ul nu are reguli pentru model.</p>';
  h += d.cerinte.length ? `<h3>Cerințele de predare (AIR)</h3>` + tabel(['Cerința', 'Cum se asigură'], d.cerinte.map(c2 => c2.categorie === 'echipament'
    ? [`${esc(CAMPURI_CERINTA[c2.camp!] ?? c2.camp)}${c2.aplicabil_la ? ` · ${esc(c2.aplicabil_la)}` : ''}`, 'completată de constructor în COBie la montaj; verificată automat în Cartea tehnică']
    : [esc(c2.titlu), `încărcat în CDE${c2.cod_document ? ` cu codul <code>${esc(c2.cod_document)}</code>` : ''} și publicat înainte de recepție`])) : '';
  h += h2('Software și formate', '5.3.2') + sectiuneLibera('bep', d, 'software') + FORMATE;
  h += h2('Riscuri și măsuri', '5.3.6') + sectiuneLibera('bep', d, 'riscuri');
  h += `<div class="semn"><div>Întocmit, partea principală<br>${esc(admini[0]?.persoane?.nume ?? '')}</div><div>Acceptat, beneficiar<br>${esc(d.proiect.beneficiar ?? '')}</div></div>`;
  return h + subsol(d) + '</body></html>';
}

export const htmlDocument = (tip: TipDocBim, d: DateDocBim) => (tip === 'eir' ? htmlEir(d) : htmlBep(d));
