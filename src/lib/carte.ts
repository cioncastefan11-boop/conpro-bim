// Cartea tehnică a construcției: opisul pe capitole, manualul de utilizare și
// mentenanță, documentele PV generate și arhiva electronică (.zip).
import { supabase } from './supabase';
import type { DateProiect } from './dateProiect';
import { numeDe } from './dateProiect';
import {
  AVIZE, CAPITOLE_CARTE, STARI_FAM, TIPURI_ATASAMENT, codFam, codPv, formatData, numeIncercare, numeRol, tipPv,
} from './domeniu';
import type { Atasament, ProcesVerbal } from './tipuri';
import { genereazaCobie, lipsuriEchipament } from './cobie';
import { excelCondica, htmlCondica as htmlCondicaBetoane } from './condica';
import { fisiereReceptie, htmlReceptie } from './receptie';
import { codReceptie, DECIZII_RECEPTIE, numeCodStare, numeReceptie, numeRolDocument, numeTipDocument } from './domeniu';

export type ElementOpis = {
  id: string;
  titlu: string;
  detalii?: string;
  data?: string | null;
  fisiere: Atasament[];
  generat?: 'pv' | 'manual' | 'cobie' | 'condica' | 'fam' | 'receptie' | 'document';
  pvId?: string;
  dosar: string;                 // folderul din arhivă
};
export type CapitolOpis = { id: 'A' | 'B' | 'C' | 'D'; nume: string; continut: string; elemente: ElementOpis[] };
export type Lipsa = { text: string; unde: string };

const PV_RECEPTIE = ['receptie_stadiu_fizic', 'receptie_partiala', 'receptie_terminare', 'receptie_finala'];

export function construiesteOpis(d: DateProiect): CapitolOpis[] {
  const fis = (ent: Atasament['entitate'], id: string) => d.atasamente.filter(a => a.entitate === ent && a.entitate_id === id);
  const cap: Record<string, ElementOpis[]> = { A: [], B: [], C: [], D: [] };
  const p = d.proiect;

  // A · proiectare
  if (p.ac_numar) cap.A.push({ id: 'ac', titlu: `Autorizația de construire nr. ${p.ac_numar}`, detalii: p.ac_emis_la ? `emisă la ${formatData(p.ac_emis_la)}${p.ac_prelungit_pana ? `, prelungită până la ${formatData(p.ac_prelungit_pana)}` : ''}` : undefined, data: p.ac_emis_la, fisiere: [], dosar: 'A_Proiectare' });

  // A · documentele proiectului: revizia publicată a fiecăruia (CDE, ISO 19650)
  for (const doc of d.documenteProiect) {
    const r = d.revizii.filter(x => x.document_id === doc.id && x.stare === 'publicat').sort((a, b) => b.creat_la.localeCompare(a.creat_la))[0];
    if (!r) continue;
    cap.A.push({
      id: doc.id, titlu: `${doc.cod} rev. ${r.revizie} · ${doc.titlu}`, data: r.aprobat_la?.slice(0, 10),
      detalii: `${numeCodStare(r.cod_stare)} (${r.cod_stare}) · ${numeTipDocument(doc.tip)}, ${numeRolDocument(doc.rol).toLowerCase()}`,
      fisiere: fis('revizie_document', r.id), dosar: `A_Proiectare/Documente/${doc.cod}`, generat: 'document',
    });
  }

  // documentele înregistrate manual, pe capitole
  for (const doc of d.documente) {
    cap[doc.capitol].push({
      id: doc.id, titlu: doc.titlu, data: doc.data,
      detalii: [doc.numar && `nr. ${doc.numar}`, doc.emitent, doc.observatii].filter(Boolean).join(' · ') || undefined,
      fisiere: fis('document_carte', doc.id), dosar: { A: 'A_Proiectare', B: 'B_Executie/Alte_documente', C: 'C_Receptie', D: 'D_Exploatare' }[doc.capitol],
    });
  }

  // B și C · procese verbale semnate
  for (const pv of d.pvs.filter(x => x.stare === 'semnat')) {
    const rec = PV_RECEPTIE.includes(pv.tip);
    (rec ? cap.C : cap.B).push({
      id: pv.id, titlu: `${codPv(p.cod, pv.numar)} · ${tipPv(pv.tip).nume}`, detalii: pv.obiect + (pv.elemente ? ` · ${pv.elemente}` : ''),
      data: pv.data_pv, fisiere: fis('pv', pv.id), generat: 'pv', pvId: pv.id, dosar: rec ? 'C_Receptie/PV' : 'B_Executie/PV',
    });
  }

  // C · recepțiile cu decizia comisiei
  for (const rc of d.receptii.filter(x => x.decizie && x.stare !== 'anulata')) {
    const ob = d.obiectii.filter(o => o.receptie_id === rc.id);
    cap.C.push({
      id: rc.id, titlu: `${codReceptie(p.cod, rc.numar)} · ${numeReceptie(rc)}`,
      detalii: [rc.obiect, DECIZII_RECEPTIE[rc.decizie!].nume.toLowerCase(), rc.stare === 'aprobata' ? 'aprobată de beneficiar' : rc.stare === 'respinsa' ? 'respinsă' : 'la aprobarea beneficiarului',
        ob.length && `${ob.filter(o => o.stare === 'confirmata').length}/${ob.length} obiecții remediate`].filter(Boolean).join(' · '),
      data: rc.data_receptie, fisiere: fisiereReceptie(d, rc), generat: 'receptie', dosar: `C_Receptie/${codReceptie(p.cod, rc.numar)}`,
    });
  }

  // B · FAM-uri aprobate, cu livrările
  for (const f of d.famuri.filter(x => x.stare === 'aprobat' || x.stare === 'aprobat_cu_observatii')) {
    const liv = d.livrari.filter(l => l.fam_id === f.id);
    cap.B.push({
      id: f.id, titlu: `${codFam(p.cod, f.numar, f.revizie)} · ${f.material}`,
      detalii: [f.producator, f.produs, f.dop_numar && `DoP ${f.dop_numar}`, liv.length && `${liv.length} livrări verificate${liv.some(l => !l.conform) ? ', dintre care neconforme: ' + liv.filter(l => !l.conform).length : ''}`].filter(Boolean).join(' · '),
      data: f.decis_la?.slice(0, 10), fisiere: [...fis('fam', f.id), ...liv.flatMap(l => fis('livrare_fam', l.id))], dosar: 'B_Executie/FAM', generat: 'fam',
    });
  }

  // B · condica de betoane și încercări
  if (d.turnari.length) {
    const vol = d.turnari.reduce((s, t) => s + (Number(t.volum) || 0), 0);
    cap.B.push({ id: 'condica', titlu: 'Condica de betoane', detalii: `${d.turnari.length} turnări, ${vol.toLocaleString('ro-RO')} m³`, data: d.turnari[d.turnari.length - 1]?.data,
      fisiere: d.turnari.flatMap(t => fis('turnare', t.id)), generat: 'condica', dosar: 'B_Executie/Condica_betoane' });
  }
  for (const i of d.incercari) {
    const ce = i.turnare_id ? `turnarea nr. ${d.turnari.find(t => t.id === i.turnare_id)?.numar}` : (() => { const f = d.famuri.find(x => x.id === i.fam_id); return f ? codFam(p.cod, f.numar, f.revizie) : ''; })();
    cap.B.push({ id: i.id, titlu: `Buletin de încercare${i.buletin_numar ? ` nr. ${i.buletin_numar}` : ''} · ${i.descriere || numeIncercare(i.tip)}`,
      detalii: [ce, i.valoare != null && `${i.valoare} ${i.unitate ?? ''}`, i.conform ? 'conform' : 'NECONFORM', i.laborator].filter(Boolean).join(' · '),
      data: i.buletin_data, fisiere: fis('incercare', i.id), dosar: 'B_Executie/Incercari' });
  }

  // D · exploatare
  if (d.tipuri.length) {
    cap.D.push({ id: 'manual', titlu: 'Manualul de utilizare și mentenanță', detalii: `${d.tipuri.length} tipuri de echipamente, ${d.echipamente.length} bucăți (art. 528 alin. 3 lit. e)`, fisiere: [], generat: 'manual', dosar: 'D_Exploatare' });
    cap.D.push({ id: 'cobie', titlu: 'Inventarul echipamentelor (COBie)', detalii: `${d.niveluri.length} niveluri, ${d.incaperi.length} încăperi, ${d.echipamente.length} echipamente`, fisiere: [], generat: 'cobie', dosar: 'D_Exploatare' });
    for (const t of d.tipuri) {
      const f = fis('tip_echipament', t.id);
      if (f.length) cap.D.push({ id: t.id, titlu: `Documentația echipamentului · ${t.denumire}`, detalii: [t.producator, t.model].filter(Boolean).join(' · '), fisiere: [...f, ...d.echipamente.filter(e => e.tip_id === t.id).flatMap(e => fis('echipament', e.id))], dosar: 'D_Exploatare/Echipamente' });
    }
  }

  const sortat = (l: ElementOpis[]) => [...l].sort((a, b) => (a.data ?? '9999').localeCompare(b.data ?? '9999'));
  return CAPITOLE_CARTE.map(c => ({ ...c, elemente: sortat(cap[c.id]) }));
}

/** Ce mai trebuie rezolvat ca dosarul să fie complet la recepție. */
export function lipsuriCarte(d: DateProiect): Lipsa[] {
  const l: Lipsa[] = [];
  const p = d.proiect;
  const n = (x: number, unu: string, multe: string) => `${x} ${x === 1 ? unu : multe}`;
  const pvDeschise = d.pvs.filter(x => x.stare === 'convocat' || x.stare === 'in_semnare');
  if (pvDeschise.length) l.push({ text: `${n(pvDeschise.length, 'proces verbal', 'procese verbale')} nesemnate de toți participanții`, unde: 'pv' });
  const contestate = d.pvs.filter(x => x.stare === 'contestat');
  if (contestate.length) l.push({ text: `${n(contestate.length, 'proces verbal contestat', 'procese verbale contestate')}, de anulat și refăcut`, unde: 'pv' });
  const famDeschise = d.famuri.filter(f => !['aprobat', 'aprobat_cu_observatii', 'respins'].includes(f.stare) || (f.stare === 'respins' && !d.famuri.some(x => x.fam_anterior_id === f.id)));
  if (famDeschise.length) l.push({ text: `${n(famDeschise.length, 'FAM nefinalizat', 'FAM-uri nefinalizate')} (${[...new Set(famDeschise.map(f => STARI_FAM[f.stare].eticheta.toLowerCase()))].join(', ')})`, unde: 'fam' });
  const neconf = d.livrari.filter(x => !x.conform);
  if (neconf.length) l.push({ text: `${n(neconf.length, 'livrare neconformă', 'livrări neconforme')}: verificați că produsele au fost înlocuite`, unde: 'fam' });
  const nevizate = d.turnari.filter(t => !t.vizat_la);
  if (nevizate.length) l.push({ text: `${n(nevizate.length, 'turnare nevizată', 'turnări nevizate')} de diriginte`, unde: 'beton' });
  const faraRezultat = d.turnari.filter(t => !d.incercari.some(i => i.turnare_id === t.id && i.tip === 'compresiune_28'));
  if (faraRezultat.length) l.push({ text: `${n(faraRezultat.length, 'turnare', 'turnări')} fără rezultat la 28 de zile`, unde: 'beton' });
  const neluate = d.incercari.filter(i => !i.verificat_la);
  if (neluate.length) l.push({ text: `${n(neluate.length, 'rezultat de încercare neluat', 'rezultate de încercări neluate')} la cunoștință`, unde: 'beton' });
  const neconfInc = d.incercari.filter(i => !i.conform);
  if (neconfInc.length) l.push({ text: `${n(neconfInc.length, 'rezultat neconform', 'rezultate neconforme')} la încercări: soluția proiectantului trebuie să fie în dosar`, unde: 'beton' });
  const cuLipsuri = d.echipamente.filter(e => lipsuriEchipament(d, e.id).length);
  if (cuLipsuri.length) l.push({ text: `${n(cuLipsuri.length, 'echipament', 'echipamente')} cu date COBie lipsă`, unde: 'echipamente' });
  if (!d.tipuri.length) l.push({ text: 'Nu sunt înregistrate echipamente, deci nici manualul de mentenanță', unde: 'echipamente' });
  if (!d.receptii.some(x => x.tip === 'terminare' && !x.partiala && x.stare === 'aprobata') && !d.pvs.some(x => x.tip === 'receptie_terminare' && x.stare === 'semnat'))
    l.push({ text: 'Procesul verbal de recepție la terminarea lucrărilor nu e încă aprobat', unde: 'receptie' });
  if (!p.ac_numar && !d.documente.some(x => x.capitol === 'A' && /autoriza/i.test(x.titlu))) l.push({ text: 'Autorizația de construire nu e înregistrată', unde: 'carte' });
  if (!d.documente.some(x => x.capitol === 'A' && /as.?built|real executat/i.test(x.titlu)) && !d.revizii.some(r => r.stare === 'publicat' && r.cod_stare === 'CR')) l.push({ text: 'Proiectul as-built (art. 528 alin. 3 lit. g) nu e înregistrat în capitolul A', unde: 'carte' });
  return l;
}

// ------------------------------------------------------------------ HTML
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const STIL = `body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:900px;margin:32px auto;padding:0 20px;font-size:14px;line-height:1.45}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #0f172a;padding-bottom:4px}h3{font-size:15px;margin:18px 0 6px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}
.discret{color:#64748b}.semnaturi{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin-top:8px;page-break-inside:avoid}@media print{body.pv{display:flex;flex-direction:column;min-height:252mm}body.pv .bloc-semnaturi{margin-top:auto}}.semnatura{display:flex;flex-direction:column;gap:2px}.semnatura .calitate{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b}.semnatura .linie{margin-top:38px;border-top:1px solid #0f172a;padding-top:3px;font-size:11px;color:#64748b}.semnatura small{color:#94a3b8;font-size:10px}.cod{font-family:monospace;font-weight:bold}ul{padding-left:18px}@media print{body{margin:0}}`;
const doc = (titlu: string, corp: string) => `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${esc(titlu)}</title><style>${STIL}</style></head><body>${corp}</body></html>`;

function antet(d: DateProiect, titlu: string) {
  const p = d.proiect;
  return `<p class="discret">Cartea tehnică a construcției · ${esc(p.cod)}</p><h1>${esc(titlu)}</h1>
<p>${esc(p.denumire)}${p.adresa ? `, ${esc(p.adresa)}` : ''}${p.beneficiar ? `<br>Beneficiar: ${esc(p.beneficiar)}` : ''}${p.ac_numar ? `<br>Autorizația de construire nr. ${esc(p.ac_numar)}${p.ac_emis_la ? ` din ${formatData(p.ac_emis_la)}` : ''}` : ''}${p.clasa_consecinte ? `<br>Clasa de consecințe: ${p.clasa_consecinte}` : ''}</p>`;
}

export function htmlOpis(d: DateProiect, capitole: CapitolOpis[]): string {
  let corp = antet(d, 'Opisul Cărții tehnice');
  corp += `<p class="discret">Generat la ${new Date().toLocaleString('ro-RO')} din Conpro BIM. Structura pe capitole urmează art. 530 din Legea 169/2026.</p>`;
  for (const c of capitole) {
    corp += `<h2>${esc(c.nume)}</h2>`;
    if (!c.elemente.length) { corp += '<p class="discret">Niciun document încă.</p>'; continue; }
    corp += '<table><tr><th>Nr.</th><th>Document</th><th>Data</th><th>Fișiere</th></tr>';
    c.elemente.forEach((e, i) => {
      corp += `<tr><td>${c.id}.${i + 1}</td><td><b>${esc(e.titlu)}</b>${e.detalii ? `<br><span class="discret">${esc(e.detalii)}</span>` : ''}</td><td>${e.data ? formatData(e.data) : ''}</td><td>${[
        e.generat === 'pv' ? `${esc(e.dosar)}/${esc(e.titlu.split(' · ')[0])}.html` : '',
        e.generat === 'manual' ? 'D_Exploatare/Manual-utilizare-mentenanta.html' : '',
        e.generat === 'cobie' ? `D_Exploatare/COBie-${esc(d.proiect.cod)}.xlsx` : '',
        e.generat === 'condica' ? 'B_Executie/Condica_betoane/Condica-betoane.html<br>B_Executie/Condica_betoane/Condica-betoane.xlsx' : '',
        e.generat === 'receptie' ? `${esc(e.dosar)}/${esc(e.titlu.split(' · ')[0])}.html` : '',
        e.generat === 'fam' ? `B_Executie/FAM/${esc(e.titlu.split(' · ')[0].replace('/', '-'))}.html` : '',
        ...e.fisiere.map(f => `${esc(e.dosar)}/${esc(numeInArhiva(f))}`),
      ].filter(Boolean).join('<br>')}</td></tr>`;
    });
    corp += '</table>';
  }
  return doc(`Opis Cartea tehnică ${d.proiect.cod}`, corp);
}

export function htmlPv(d: DateProiect, pv: ProcesVerbal): string {
  const parti = d.participanti.filter(x => x.pv_id === pv.id);
  const t = tipPv(pv.tip);
  let corp = antet(d, `Proces verbal ${codPv(d.proiect.cod, pv.numar)} · ${t.nume}`);
  corp += `<table><tr><th>Obiectul</th><td>${esc(pv.obiect)}</td></tr>${pv.elemente ? `<tr><th>Elementele / zona</th><td>${esc(pv.elemente)}</td></tr>` : ''}
<tr><th>Data</th><td>${formatData(pv.data_pv)}</td></tr>${pv.loc ? `<tr><th>Locul</th><td>${esc(pv.loc)}</td></tr>` : ''}
${pv.alti_participanti ? `<tr><th>Alți participanți</th><td>${esc(pv.alti_participanti)}</td></tr>` : ''}</table>`;
  if (pv.referinte_proiect) corp += `<h3>Documentația de referință</h3><p>${esc(pv.referinte_proiect)}</p>`;
  if (pv.descriere_lucrari) corp += `<h3>Descrierea lucrărilor</h3><p>${esc(pv.descriere_lucrari)}</p>`;
  if (pv.concluzii) corp += `<h3>Concluzii</h3><p><b>${esc(pv.concluzii)}</b></p>`;
  if (t.ordine426) corp += '<p class="discret">Proiectantul a confirmat după dirigintele de șantier și responsabilul tehnic cu execuția (art. 426 alin. 3 din Legea 169/2026).</p>';
  // semnăturile, în ordinea art. 426: diriginte, RTE, ceilalți, proiectantul la final
  const ord = (r: string) => (r === 'diriginte' ? 0 : r === 'constructor' ? 1 : r === 'proiectant' && t.ordine426 ? 9 : 5);
  const firma = (id: string) => d.membri.find(m => m.persoana_id === id)?.persoane?.firme?.denumire ?? '';
  const cuObs = parti.filter(x => x.observatii?.trim()).sort((a, b) => ord(a.rol) - ord(b.rol));
  if (cuObs.length) corp += `<h3>Observații</h3><ul>${cuObs.map(x => `<li><b>${esc(numeDe(d, x.persoana_id))}</b> (${esc(x.rol === 'constructor' ? 'Constructor / RTE' : numeRol(x.rol))}): ${esc(x.observatii)}</li>`).join('')}</ul>`;
  corp += '<div class="bloc-semnaturi"><h3>Semnături</h3><div class="semnaturi">';
  for (const x of [...parti].sort((a, b) => ord(a.rol) - ord(b.rol))) {
    corp += `<div class="semnatura"><span class="calitate">${esc(x.rol === 'constructor' ? 'Constructor / RTE' : numeRol(x.rol))}</span><b>${esc(numeDe(d, x.persoana_id))}</b>${firma(x.persoana_id) ? `<span>${esc(firma(x.persoana_id))}</span>` : ''}<div class="linie">Semnătura</div>${x.decizie === 'confirm_cu_observatii' ? '<small>Confirmă cu observații</small>' : x.decizie === 'refuz' ? '<small>A refuzat confirmarea</small>' : ''}${x.confirmat_la ? `<small>Confirmat în Conpro BIM la ${new Date(x.confirmat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}</small>` : ''}</div>`;
  }
  corp += '</div></div>';
  return doc(codPv(d.proiect.cod, pv.numar), corp).replace('<body>', '<body class="pv">');
}

export function htmlManual(d: DateProiect): string {
  let corp = antet(d, 'Manualul de utilizare și mentenanță');
  corp += '<p class="discret">Generat din datele echipamentelor completate la montaj (art. 528 alin. 3 lit. e din Legea 169/2026). Instrucțiunile producătorilor, atașate fiecărui tip, fac parte din manual.</p>';
  const categorii = [...new Set(d.tipuri.map(t => t.categorie || 'Altele'))];
  corp += '<h2>Planul de mentenanță</h2><table><tr><th>Echipament</th><th>Bucăți</th><th>Interval</th><th>Garanție</th><th>Durată de viață</th></tr>';
  for (const t of d.tipuri) {
    corp += `<tr><td><b>${esc(t.denumire)}</b><br><span class="discret">${esc([t.producator, t.model].filter(Boolean).join(' · '))}</span></td><td>${d.echipamente.filter(e => e.tip_id === t.id).length}</td><td>${t.interval_mentenanta_luni ? `la ${t.interval_mentenanta_luni} luni` : '—'}</td><td>${t.garantie_luni != null ? `${t.garantie_luni} luni${t.garant ? `, ${esc(t.garant)}` : ''}` : '—'}</td><td>${t.durata_viata_ani ? `${t.durata_viata_ani} ani` : '—'}</td></tr>`;
  }
  corp += '</table>';
  for (const cat of categorii) {
    corp += `<h2>${esc(cat)}</h2>`;
    for (const t of d.tipuri.filter(x => (x.categorie || 'Altele') === cat)) {
      const buc = d.echipamente.filter(e => e.tip_id === t.id);
      const docs = d.atasamente.filter(a => a.entitate === 'tip_echipament' && a.entitate_id === t.id);
      corp += `<h3>${esc(t.denumire)}</h3>`;
      if (t.instructiuni_mentenanta) corp += `<p>${esc(t.instructiuni_mentenanta)}</p>`;
      if (docs.length) corp += `<p class="discret">Documentația producătorului: ${docs.map(a => `${esc(TIPURI_ATASAMENT[a.tip_document] ?? a.tip_document)} (${esc(a.nume_fisier)})`).join('; ')}</p>`;
      if (buc.length) {
        corp += '<table><tr><th>Etichetă</th><th>Încăpere</th><th>Serie</th><th>Montaj</th><th>Punere în funcțiune</th><th>Garanție până la</th></tr>';
        for (const e of buc) {
          const inc = d.incaperi.find(i => i.id === e.incapere_id);
          let g = '';
          if (e.garantie_start && t.garantie_luni != null) { const x = new Date(e.garantie_start); x.setMonth(x.getMonth() + t.garantie_luni); g = formatData(x.toISOString().slice(0, 10)); }
          corp += `<tr><td class="cod">${esc(e.cod)}</td><td>${inc ? `${esc(inc.cod)} · ${esc(inc.denumire)}` : ''}</td><td>${esc(e.serie ?? '')}</td><td>${formatData(e.data_montaj)}</td><td>${formatData(e.data_punere_functiune)}</td><td>${g}</td></tr>`;
        }
        corp += '</table>';
      }
    }
  }
  return doc(`Manual de utilizare și mentenanță ${d.proiect.cod}`, corp);
}

export function htmlCondica(d: DateProiect): string {
  return htmlCondicaBetoane(d);
}

export function htmlFam(d: DateProiect, famId: string): string {
  const f = d.famuri.find(x => x.id === famId)!;
  let corp = antet(d, `${codFam(d.proiect.cod, f.numar, f.revizie)} · Fișă de aprobare a materialului`);
  const r = (k: string, v: unknown) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '');
  corp += `<table>${r('Materialul', f.material)}${r('Utilizare', f.utilizare)}${r('Cerințe proiect', f.cerinte_proiect)}${r('Producător', f.producator)}${r('Produs', f.produs)}${r('Furnizor', f.furnizor)}${r('Performanțe declarate', f.performante_declarate)}${r('Date de mediu', f.date_mediu)}${r('Declarația de performanță', f.dop_numar)}${r('Agrement tehnic', f.agrement_numar)}${r('Alte documente', f.alte_documente)}</table>`;
  // observațiile, doar dacă există; semnăturile în josul paginii
  const obs = [f.aviz_observatii?.trim() && `<li><b>${esc(numeDe(d, f.avizat_de))}</b> (Proiectant): ${esc(f.aviz_observatii)}</li>`,
    f.decizie_observatii?.trim() && `<li><b>${esc(numeDe(d, f.decis_de))}</b> (Diriginte de șantier): ${esc(f.decizie_observatii)}</li>`].filter(Boolean);
  const fara = !d.membri.some(m => m.rol === 'proiectant');
  const firma = (id: string | null) => d.membri.find(m => m.persoana_id === id)?.persoane?.firme?.denumire ?? '';
  const semn = [
    { rol: 'constructor', eticheta: 'Întocmit · Constructor / RTE', cine: f.depus_de, cand: f.depus_la, mentiune: '' },
    ...(fara ? [] : [{ rol: 'proiectant', eticheta: 'Avizat · Proiectant', cine: f.avizat_de, cand: f.avizat_la, mentiune: f.aviz ? AVIZE[f.aviz] : '' }]),
    { rol: 'diriginte', eticheta: 'Aprobat · Diriginte de șantier', cine: f.decis_de, cand: f.decis_la, mentiune: f.decizie ? STARI_FAM[f.decizie].eticheta : '' },
  ];
  let bloc = obs.length ? `<h3>Observații</h3><ul>${obs.join('')}</ul>` : '';
  bloc += `<div class="bloc-semnaturi"><h3>Semnături</h3><div class="semnaturi" style="grid-template-columns:repeat(${semn.length},1fr)">`;
  for (const x of semn) {
    const id = x.cine ?? d.membri.find(m => m.rol === x.rol)?.persoana_id ?? null;
    bloc += `<div class="semnatura"><span class="calitate">${x.eticheta}</span><b>${esc(id ? numeDe(d, id) : '—')}</b>${firma(id) ? `<span>${esc(firma(id))}</span>` : ''}<div class="linie">Semnătura</div>${x.mentiune ? `<small>${esc(x.mentiune)}</small>` : ''}${x.cand ? `<small>Înregistrat în Conpro BIM la ${new Date(x.cand).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}</small>` : ''}</div>`;
  }
  bloc += '</div></div>';
  const liv = d.livrari.filter(l => l.fam_id === f.id);
  if (liv.length) {
    corp += '<h3>Verificarea la livrare</h3><table><tr><th>Data</th><th>Cantitate</th><th>Lot</th><th>Document</th><th>Rezultat</th></tr>';
    for (const l of liv) corp += `<tr><td>${formatData(l.data)}</td><td>${esc(l.cantitate ?? '')}</td><td>${esc(l.lot ?? '')}</td><td>${esc(l.document_insotire ?? '')}</td><td>${l.conform ? 'conform' : 'NECONFORM'}${l.observatii ? `<br>${esc(l.observatii)}` : ''}</td></tr>`;
    corp += '</table>';
  }
  corp += bloc;
  return doc(codFam(d.proiect.cod, f.numar, f.revizie), corp).replace('<body>', '<body class="pv">');
}

// ------------------------------------------------------------------ Arhiva
export const numeInArhiva = (a: Atasament) => {
  const curat = a.nume_fisier.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._ -]+/g, '-');
  return `${a.id.slice(0, 6)}-${curat}`;
};

export async function genereazaArhiva(d: DateProiect, progres: (text: string) => void): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const capitole = construiesteOpis(d);
  const radacina = zip.folder(`Cartea-tehnica-${d.proiect.cod}`)!;

  radacina.file('Opis.html', htmlOpis(d, capitole));
  progres('Documentele generate…');
  for (const c of capitole) for (const e of c.elemente) {
    if (e.generat === 'pv' && e.pvId) {
      const pv = d.pvs.find(x => x.id === e.pvId)!;
      radacina.file(`${e.dosar}/${codPv(d.proiect.cod, pv.numar)}.html`, htmlPv(d, pv));
    }
  }
  for (const rc of d.receptii.filter(x => x.decizie && x.stare !== 'anulata')) {
    radacina.file(`C_Receptie/${codReceptie(d.proiect.cod, rc.numar)}/${codReceptie(d.proiect.cod, rc.numar)}.html`, htmlReceptie(d, rc));
  }
  for (const f of d.famuri.filter(x => x.stare === 'aprobat' || x.stare === 'aprobat_cu_observatii')) {
    radacina.file(`B_Executie/FAM/${codFam(d.proiect.cod, f.numar, f.revizie).replace('/', '-')}.html`, htmlFam(d, f.id));
  }
  if (d.turnari.length) {
    radacina.file('B_Executie/Condica_betoane/Condica-betoane.html', htmlCondica(d));
    radacina.file('B_Executie/Condica_betoane/Condica-betoane.xlsx', await excelCondica(d));
  }
  if (d.tipuri.length) {
    radacina.file('D_Exploatare/Manual-utilizare-mentenanta.html', htmlManual(d));
    progres('Fișierul COBie…');
    radacina.file(`D_Exploatare/COBie-${d.proiect.cod}.xlsx`, await genereazaCobie(d));
  }

  const toate = capitole.flatMap(c => c.elemente.flatMap(e => e.fisiere.map(f => ({ f, dosar: e.dosar }))));
  let i = 0;
  for (const { f, dosar } of toate) {
    i++;
    progres(`Fișiere ${i} din ${toate.length}…`);
    const { data, error } = await supabase.storage.from('documente').download(f.cale);
    if (error || !data) { radacina.file(`${dosar}/LIPSA-${numeInArhiva(f)}.txt`, `Fișierul nu a putut fi descărcat: ${error?.message ?? ''}`); continue; }
    radacina.file(`${dosar}/${numeInArhiva(f)}`, data);
  }
  progres('Se arhivează…');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
