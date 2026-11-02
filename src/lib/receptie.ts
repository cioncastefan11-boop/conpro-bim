// Recepția construcției: verificarea dosarului, documentele cerute de art. 528 alin. 3,
// propunerea de text pentru constatări și procesul verbal de recepție, gata de tipărit.
import type { DateProiect } from './dateProiect';
import { numeDe } from './dateProiect';
import { lipsuriCarte } from './carte';
import {
  DECIZII_RECEPTIE, POZITII_COMISIE, adaugaZile, calitate, codReceptie, formatData, numeReceptie, numeRol,
} from './domeniu';
import type { Atasament, MembruComisie, ObiectieReceptie, Receptie } from './tipuri';

export type Verificare = { text: string; bine: boolean; detalii?: string; unde?: string; obligatoriu?: boolean };

const fis = (d: DateProiect, r: Receptie, tip: string) =>
  d.atasamente.filter(a => a.entitate === 'receptie' && a.entitate_id === r.id && a.tip_document === tip);

/** Documentele de recepție la terminarea lucrărilor (art. 528 alin. 3 lit. a–g). */
export function documenteReceptie(d: DateProiect, r: Receptie): Verificare[] {
  if (r.tip === 'finala') {
    const term = d.receptii.find(x => x.id === r.receptie_terminare_id);
    const obiectiiTerm = d.obiectii.filter(o => o.receptie_id === term?.id);
    return [
      { text: 'Procesul verbal de recepție la terminarea lucrărilor', bine: !!term && term.stare === 'aprobata',
        detalii: term ? `${codReceptie(d.proiect.cod, term.numar)} din ${formatData(term.data_receptie)}` : undefined },
      { text: 'Raportul beneficiarului privind comportarea construcției în exploatare', bine: fis(d, r, 'raport_comportare').length > 0,
        detalii: 'Se atașează la această recepție.' },
      { text: 'Cartea tehnică a construcției, completată', bine: lipsuriCarte(d).filter(l => !l.text.startsWith('Procesul verbal de recepție')).length === 0, unde: 'carte' },
      { text: 'Remedierea obiecțiilor și a viciilor apărute în garanție',
        bine: obiectiiTerm.every(o => o.stare === 'confirmata'),
        detalii: obiectiiTerm.length ? `${obiectiiTerm.filter(o => o.stare === 'confirmata').length} din ${obiectiiTerm.length} obiecții confirmate` : 'Nu au fost obiecții la recepția la terminare.' },
    ];
  }
  const proiectanti = d.membri.filter(m => m.rol === 'proiectant');
  const pv = fis(d, r, 'punct_vedere_proiectant');
  const asBuilt = fis(d, r, 'as_built').length > 0
    || d.documente.some(x => x.capitol === 'A' && /as.?built|real executat/i.test(x.titlu))
    || d.revizii.some(r => r.stare === 'publicat' && r.cod_stare === 'CR');
  const lipsuri = lipsuriCarte(d).filter(l => !l.text.startsWith('Procesul verbal de recepție') && !l.text.startsWith('Proiectul as-built'));
  return [
    { text: 'a) Punctul de vedere al proiectanților, pe fiecare specialitate', bine: pv.length > 0 && pv.length >= Math.min(1, proiectanti.length),
      detalii: pv.length ? `${pv.length} ${pv.length === 1 ? 'document atașat' : 'documente atașate'}` : 'Se atașează la această recepție (proiectantul îl poate încărca singur).', obligatoriu: true },
    { text: 'b) Punctul de vedere al dirigintelui de șantier', bine: fis(d, r, 'punct_vedere_diriginte').length > 0, detalii: 'Se atașează la această recepție.', obligatoriu: true },
    { text: 'c) Procesul verbal de recepție', bine: r.stare === 'aprobata' || fis(d, r, 'pv_receptie_semnat').length > 0,
      detalii: 'Se generează din aplicație după decizia comisiei; varianta semnată se atașează aici.' },
    { text: 'd) Cartea tehnică a construcției', bine: lipsuri.length === 0, unde: 'carte',
      detalii: lipsuri.length ? `Mai sunt ${lipsuri.length} ${lipsuri.length === 1 ? 'problemă' : 'probleme'} de rezolvat.` : 'Completă.', obligatoriu: true },
    { text: 'e) Manualul de utilizare și mentenanță, cu instrucțiunile de urmărire în timp', bine: d.tipuri.length > 0, unde: 'echipamente',
      detalii: d.tipuri.length ? `Generat din ${d.tipuri.length} tipuri de echipamente.` : 'Se generează din echipamente.' },
    { text: 'f) Fișele de instruire a operatorilor', bine: fis(d, r, 'fisa_instruire').length > 0, detalii: 'Se atașează la această recepție, dacă există echipamente și instalații.' },
    { text: 'g) Proiectul real executat (as-built)', bine: asBuilt, detalii: 'Se atașează aici sau se înregistrează în Cartea tehnică, capitolul A.' },
  ];
}

/** Verificări înainte de convocarea comisiei. */
export function verificariPregatire(d: DateProiect, r: Receptie): Verificare[] {
  const p = d.proiect;
  const v: Verificare[] = [];
  const comisie = d.comisii.filter(m => m.receptie_id === r.id);
  if (r.tip === 'terminare') {
    v.push({ text: 'Autorizația de construire', bine: !!p.ac_numar, detalii: p.ac_numar ? `nr. ${p.ac_numar}` : 'Fără autorizație, construcția nu se recepționează (art. 280 alin. 8).', obligatoriu: true });
    v.push({ text: 'Înștiințarea emitentului autorizației despre finalizarea lucrărilor (art. 280 alin. 10)', bine: !!r.data_finalizare_lucrari,
      detalii: r.data_finalizare_lucrari ? `lucrări finalizate la ${formatData(r.data_finalizare_lucrari)}` : 'Completați data finalizării lucrărilor.' });
    const pvDeschise = d.pvs.filter(x => x.stare === 'convocat' || x.stare === 'in_semnare' || x.stare === 'contestat');
    v.push({ text: 'Procese verbale de execuție semnate', bine: pvDeschise.length === 0, unde: 'pv',
      detalii: pvDeschise.length ? `${pvDeschise.length} nesemnate sau contestate` : 'Toate semnate.' });
    const nevizate = d.turnari.filter(t => !t.vizat_la);
    const neconf = d.incercari.filter(i => !i.conform);
    v.push({ text: 'Condica de betoane vizată, încercări conforme', bine: nevizate.length === 0 && neconf.length === 0, unde: 'beton',
      detalii: [nevizate.length && `${nevizate.length} turnări nevizate`, neconf.length && `${neconf.length} rezultate neconforme`].filter(Boolean).join(', ') || 'În regulă.' });
  }
  v.push({ text: 'Data și locul recepției', bine: !!r.data_receptie && !!r.loc?.trim(), obligatoriu: true,
    detalii: r.data_receptie ? `${formatData(r.data_receptie)}, ${r.loc ?? ''}` : undefined });
  v.push({ text: 'Președintele comisiei', bine: comisie.some(m => m.calitate === 'presedinte'), obligatoriu: true });
  v.push({ text: 'Cel puțin un specialist în comisie', bine: comisie.some(m => m.calitate === 'specialist'), obligatoriu: true });
  if (r.tip === 'terminare') {
    v.push({ text: 'Reprezentantul emitentului autorizației (art. 280 alin. 3)', bine: comisie.some(m => m.calitate === 'reprezentant_ac'), obligatoriu: true });
    v.push({ text: 'Perioada de garanție (art. 531)', bine: !!r.garantie_luni, obligatoriu: true, detalii: r.garantie_luni ? `${r.garantie_luni} luni` : undefined });
  }
  return v;
}

/** Text propus pentru constatările comisiei, pornind de la datele din aplicație. */
export function propunereConstatari(d: DateProiect, r: Receptie): string {
  const p = d.proiect;
  const ob = d.obiectii.filter(o => o.receptie_id === r.id);
  if (r.tip === 'finala') {
    return `Comisia a examinat procesul verbal de recepție la terminarea lucrărilor, raportul privind comportarea construcției în exploatare în perioada de garanție și Cartea tehnică a construcției. `
      + (ob.length ? `S-au constatat ${ob.length} ${ob.length === 1 ? 'defect' : 'defecte'}, consemnate mai jos, cu termene de remediere.` : 'Viciile apărute în perioada de garanție au fost remediate, iar construcția corespunde cerințelor de utilizare.');
  }
  const vol = d.turnari.reduce((s, t) => s + (Number(t.volum) || 0), 0);
  const pvSemnate = d.pvs.filter(x => x.stare === 'semnat').length;
  return `Comisia a examinat ${r.partiala ? `partea de construcție „${r.obiect}”` : 'construcția'} pe teren și documentele din Cartea tehnică: `
    + `autorizația de construire${p.ac_numar ? ` nr. ${p.ac_numar}` : ''}, ${pvSemnate} procese verbale de execuție semnate, `
    + `${d.famuri.filter(f => f.stare.startsWith('aprobat')).length} fișe de aprobare a materialelor, condica de betoane (${d.turnari.length} turnări, ${vol.toLocaleString('ro-RO')} m³) și rezultatele încercărilor. `
    + `Lucrările au fost executate în conformitate cu autorizația de construire, cu proiectul și cu cerințele fundamentale aplicabile. `
    + (ob.length ? `S-au formulat ${ob.length} ${ob.length === 1 ? 'obiecție' : 'obiecții'}, cu termenele de remediere de mai jos.` : 'Nu s-au formulat obiecții.');
}

// ------------------------------------------------------------------ PV de recepție
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/\n/g, '<br>');

export function htmlReceptie(d: DateProiect, r: Receptie): string {
  const p = d.proiect;
  const comisie = d.comisii.filter(m => m.receptie_id === r.id).sort((a, b) => a.ordine - b.ordine);
  const membri = comisie.filter(m => !calitate(m.calitate).invitat);
  const invitati = comisie.filter(m => calitate(m.calitate).invitat);
  const ob = d.obiectii.filter(o => o.receptie_id === r.id);
  const docs = documenteReceptie(d, r).filter(x => !x.text.startsWith('c)'));
  const firma = (rol: string) => d.membri.filter(m => m.rol === rol).map(m => m.persoane?.firme?.denumire || m.persoane?.nume || m.persoane?.email).filter(Boolean).join(', ');
  const term = r.tip === 'finala' ? d.receptii.find(x => x.id === r.receptie_terminare_id) : undefined;
  const titlu = r.tip === 'terminare' ? 'Proces verbal de recepție la terminarea lucrărilor' : 'Proces verbal de recepție finală';
  const dec = r.decizie ? DECIZII_RECEPTIE[r.decizie].nume : 'Decizia comisiei nu este încă consemnată';
  const date = [
    ['Lucrarea', `${p.denumire}${r.partiala ? ` · partea recepționată: ${r.obiect}` : ''}`],
    ['Adresa', p.adresa ?? ''],
    ['Autorizația de construire', p.ac_numar ? `nr. ${p.ac_numar}${p.ac_emis_la ? ` din ${formatData(p.ac_emis_la)}` : ''}` : ''],
    ['Beneficiar / investitor', p.beneficiar ?? firma('beneficiar')],
    ['Executant', firma('constructor')],
    ['Proiectant', firma('proiectant')],
    ['Diriginte de șantier', d.membri.filter(m => m.rol === 'diriginte').map(m => m.persoane?.nume || m.persoane?.email).join(', ')],
    ['Clasa de consecințe', p.clasa_consecinte ?? ''],
  ].filter(x => x[1]);
  const stil = `@page{size:A4;margin:16mm}*{box-sizing:border-box}
body{font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;font-size:12.5px;line-height:1.5;max-width:820px;margin:0 auto;padding:28px 22px}
.cap{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f172a;padding-bottom:10px;margin-bottom:14px}
h1{font-size:19px;margin:0;line-height:1.25}.sub{color:#64748b;margin-top:4px}
.cod{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0f172a;color:#fff;border-radius:5px;padding:3px 8px;font-size:12px;font-weight:700;white-space:nowrap}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:#334155;margin:20px 0 6px}
dl{display:grid;grid-template-columns:190px 1fr;gap:3px 12px;margin:0}dt{color:#64748b}dd{margin:0}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#f1f5f9;font-size:11px;font-weight:600}.ok{color:#15803d}.nu{color:#b91c1c}
.decizie{border:2px solid #0f172a;border-radius:8px;padding:10px 14px;margin-top:6px}.decizie b{font-size:15px}
.semn td{height:46px}.discret{color:#64748b}.subsol{margin-top:22px;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}`;
  const corp = `
<div class="cap"><div><h1>${esc(titlu)}${r.partiala ? ' (parțială)' : ''}</h1>
<div class="sub">nr. ${r.numar}${r.data_receptie ? ` din ${formatData(r.data_receptie)}` : ''}${r.loc ? ` · ${esc(r.loc)}` : ''}</div></div>
<span class="cod">${esc(codReceptie(p.cod, r.numar))}</span></div>
<dl>${date.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}
${r.data_finalizare_lucrari ? `<dt>Lucrări finalizate la</dt><dd>${formatData(r.data_finalizare_lucrari)}</dd>` : ''}
${term ? `<dt>Recepția la terminare</dt><dd>${esc(codReceptie(p.cod, term.numar))} din ${formatData(term.data_receptie)}</dd>` : ''}</dl>

<h2>Comisia de recepție</h2>
<table><tr><th style="width:28%">Nume</th><th style="width:34%">Calitatea</th><th>Instituția</th><th style="width:22%">Poziția</th></tr>
${membri.map(m => `<tr><td>${esc(m.nume)}</td><td>${esc(calitate(m.calitate).nume)}</td><td>${esc(m.institutie)}</td><td>${m.pozitie ? esc(POZITII_COMISIE[m.pozitie]) + (m.motivare ? `<br><span class="discret">${esc(m.motivare)}</span>` : '') : '<span class="discret">—</span>'}</td></tr>`).join('')}</table>
${invitati.length ? `<p class="discret">Au participat ca invitați: ${invitati.map(m => esc(`${m.nume}${m.institutie ? ` (${m.institutie})` : ''}`)).join(', ')}.</p>` : ''}

<h2>Documentele examinate</h2>
<table>${docs.map(x => `<tr><td>${esc(x.text)}</td><td style="width:90px" class="${x.bine ? 'ok' : 'nu'}">${x.bine ? 'prezent' : 'lipsă'}</td></tr>`).join('')}</table>

<h2>Constatările comisiei</h2>
<p>${esc(r.constatari || '—')}</p>

${ob.length ? `<h2>Obiecții și termene de remediere</h2>
<table><tr><th style="width:36px">Nr.</th><th>Obiecția</th><th style="width:90px">Termen</th><th style="width:130px">Responsabil</th><th style="width:110px">Stare</th></tr>
${ob.map((o: ObiectieReceptie) => `<tr><td>${o.numar}</td><td>${esc(o.descriere)}</td><td>${formatData(o.termen)}</td><td>${esc(o.responsabil)}</td><td>${o.stare === 'confirmata' ? `<span class="ok">remediată, confirmată ${formatData(o.confirmat_la?.slice(0, 10))}</span>` : o.stare === 'remediata' ? 'remediată, de confirmat' : 'deschisă'}</td></tr>`).join('')}</table>` : ''}

<h2>Decizia comisiei</h2>
<div class="decizie"><b>${esc(dec)}</b>${r.motivare_decizie ? `<p>${esc(r.motivare_decizie)}</p>` : ''}
${r.tip === 'terminare' && r.garantie_luni ? `<p>Perioada de garanție: <b>${r.garantie_luni} luni</b>, de la data semnării prezentului proces verbal${r.garantie_pana ? `, până la <b>${formatData(r.garantie_pana)}</b>` : ''} (art. 531 alin. 9). Recepția finală se organizează în cel mult 10 zile de la expirarea garanției (art. 532 alin. 4).</p>` : ''}
${r.decizie === 'prelungire_garantie' && r.garantie_pana ? `<p>Garanția se prelungește până la <b>${formatData(r.garantie_pana)}</b>, pentru remedierea defectelor (art. 532 alin. 3).</p>` : ''}</div>
${r.aprobat_la ? `<p>Beneficiarul / investitorul a ${r.stare === 'aprobata' ? 'aprobat' : 'respins'} recepția la ${formatData(r.aprobat_la.slice(0, 10))} (${esc(numeDe(d, r.aprobat_de))})${r.observatii_beneficiar ? `: ${esc(r.observatii_beneficiar)}` : '.'}</p>` : ''}

<h2>Semnături</h2>
<table class="semn"><tr><th style="width:34%">Nume</th><th style="width:36%">Calitatea</th><th>Semnătura</th></tr>
${membri.map((m: MembruComisie) => `<tr><td>${esc(m.nume)}</td><td>${esc(calitate(m.calitate).nume)}</td><td></td></tr>`).join('')}
<tr><td>${esc(d.membri.filter(m => m.rol === 'diriginte').map(m => m.persoane?.nume || m.persoane?.email).join(', '))}</td><td>Secretariatul comisiei · ${esc(numeRol('diriginte'))}</td><td></td></tr></table>
<div class="subsol"><span>${esc(p.cod)} · ${esc(numeReceptie(r))}</span><span>Generat din Conpro BIM la ${new Date().toLocaleDateString('ro-RO')}</span></div>`;
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${esc(codReceptie(p.cod, r.numar))}</title><style>${stil}</style></head><body>${corp}</body></html>`;
}

/** Termenul recepției finale: cel mult 10 zile după expirarea garanției (art. 532 alin. 4). */
export const termenReceptieFinala = (r: Receptie) => (r.garantie_pana ? adaugaZile(r.garantie_pana, 10) : null);

export const fisiereReceptie = (d: DateProiect, r: Receptie): Atasament[] =>
  d.atasamente.filter(a => (a.entitate === 'receptie' && a.entitate_id === r.id)
    || (a.entitate === 'obiectie_receptie' && d.obiectii.some(o => o.id === a.entitate_id && o.receptie_id === r.id)));
