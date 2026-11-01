// Condica de betoane Conpro BIM: registrul turnărilor, generat din datele proiectului.
// Aceleași informații pe care le cere o condică de șantier, așezate pe grupe
// (turnare, element, beton, temperaturi, probe, decofrare, supraveghere, viză).
// Dacă proiectul are mai multe puncte de lucru, fiecare are secțiunea lui.
import type { Incercare, Membru, Proiect, Turnare } from './tipuri';
import { formatData } from './domeniu';

export type DateCondica = { proiect: Proiect; membri: Membru[]; turnari: Turnare[]; incercari: Incercare[] };

/** Grupele de coloane ale condicii, în ordine. */
export const GRUPE_CONDICA: { titlu: string; coloane: { cheie: string; titlu: string; latime: number }[] }[] = [
  { titlu: 'Turnarea', coloane: [{ cheie: 'nr', titlu: 'Nr.', latime: 4 }, { cheie: 'data', titlu: 'Data', latime: 10 }, { cheie: 'schimb', titlu: 'Schimb', latime: 7 }] },
  { titlu: 'Elementul betonat', coloane: [{ cheie: 'element', titlu: 'Element', latime: 16 }, { cheie: 'identificare', titlu: 'Nivel, axe, travee', latime: 18 }] },
  { titlu: 'Betonul', coloane: [{ cheie: 'clasa', titlu: 'Clasa', latime: 8 }, { cheie: 'volum', titlu: 'Volum (m³)', latime: 8 }, { cheie: 'bonuri', titlu: 'Bonuri de livrare', latime: 12 }, { cheie: 'statie', titlu: 'Stația', latime: 14 }] },
  { titlu: 'Temp. °C', coloane: [{ cheie: 'temp_aer', titlu: 'Aer', latime: 6 }, { cheie: 'temp_beton', titlu: 'Beton', latime: 6 }] },
  { titlu: 'Probe și încercări', coloane: [{ cheie: 'probe', titlu: 'Probe prelevate', latime: 16 }, { cheie: 'rezistenta', titlu: 'Rezistența pe cuburi', latime: 20 }, { cheie: 'nedistructiv', titlu: 'Nedistructive', latime: 14 }] },
  { titlu: 'După turnare', coloane: [{ cheie: 'decofrare', titlu: 'Decofrare', latime: 10 }, { cheie: 'supraveghere', titlu: 'Supravegheată de', latime: 14 }, { cheie: 'viza', titlu: 'Viza dirigintelui', latime: 14 }] },
];
export const COLOANE_CONDICA = GRUPE_CONDICA.flatMap(g => g.coloane);

export type RandCondica = Record<string, string> & { conform: string };
export type SectiuneCondica = {
  punct: string;
  randuri: RandCondica[];
  sumar: { turnari: number; volum: number; probe: number; rezultate: number; neconforme: number; decofrate: number; vizate: number };
};
export type AntetCondica = {
  cod: string; denumire: string; adresa: string; beneficiar: string; autorizatie: string;
  executant: string; rte: string; diriginte: string;
};

const nume = (m: Membru[], id: string | null | undefined) => { const p = m.find(x => x.persoana_id === id)?.persoane; return p ? (p.nume || p.email) : ''; };
const nrRo = (v: number, z = 2) => v.toLocaleString('ro-RO', { maximumFractionDigits: z });

export function antetCondica(d: DateCondica): AntetCondica {
  const p = d.proiect;
  const constructor = d.membri.find(m => m.rol === 'constructor');
  return {
    cod: p.cod,
    denumire: p.denumire,
    adresa: p.adresa ?? '',
    beneficiar: p.beneficiar ?? '',
    autorizatie: p.ac_numar ? `AC nr. ${p.ac_numar}${p.ac_emis_la ? ` din ${formatData(p.ac_emis_la)}` : ''}` : '',
    executant: constructor?.persoane?.firme?.denumire ?? '',
    rte: nume(d.membri, constructor?.persoana_id),
    diriginte: nume(d.membri, d.membri.find(m => m.rol === 'diriginte')?.persoana_id),
  };
}

export const puncteLucru = (turnari: Turnare[]) =>
  [...new Set(turnari.map(t => t.punct_lucru?.trim() || ''))].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true }));

export function sectiuniCondica(d: DateCondica, doarPunct?: string): SectiuneCondica[] {
  return puncteLucru(d.turnari).filter(x => doarPunct === undefined || x === doarPunct).map(punct => {
    const lista = d.turnari.filter(t => (t.punct_lucru?.trim() || '') === punct)
      .sort((a, b) => a.data.localeCompare(b.data) || a.numar - b.numar);
    let rezultate = 0, neconforme = 0;
    const randuri = lista.map((t, i): RandCondica => {
      const inc = d.incercari.filter(x => x.turnare_id === t.id);
      const comp = inc.filter(x => x.tip.startsWith('compresiune') && x.valoare != null);
      const nedis = inc.filter(x => x.tip === 'nedistructiv');
      rezultate += inc.length; neconforme += inc.filter(x => !x.conform).length;
      return {
        nr: String(i + 1),
        data: formatData(t.data),
        schimb: t.schimb ?? '',
        element: t.element,
        identificare: t.identificare ?? '',
        clasa: t.clasa_beton,
        volum: t.volum != null ? nrRo(Number(t.volum)) : '',
        bonuri: t.bonuri ?? '',
        statie: t.statie ?? '',
        temp_aer: t.temp_aer != null ? nrRo(Number(t.temp_aer), 1) : '',
        temp_beton: t.temp_beton != null ? nrRo(Number(t.temp_beton), 1) : '',
        probe: [t.probe_prelevate ? `${t.probe_prelevate} ${t.probe_prelevate === 1 ? 'set' : 'seturi'}` : '', t.coduri_probe ?? ''].filter(Boolean).join(' · '),
        rezistenta: comp.map(x => `${nrRo(Number(x.valoare), 1)} MPa (${nrRo(Math.round(Number(x.valoare) * 10), 0)} daN/cm²) · ${x.varsta_zile ?? '—'} zile${x.buletin_numar ? ` · bul. ${x.buletin_numar}` : ''}`).join('\n'),
        nedistructiv: nedis.map(x => [x.valoare != null ? `${nrRo(Number(x.valoare), 1)} ${x.unitate ?? ''}`.trim() : '', x.buletin_numar ? `bul. ${x.buletin_numar}` : ''].filter(Boolean).join(' · ')).join('\n'),
        decofrare: t.data_decofrare ? formatData(t.data_decofrare) : '',
        supraveghere: t.supravegheat_de || nume(d.membri, t.inregistrat_de),
        viza: t.vizat_la ? `${nume(d.membri, t.vizat_de)}\n${formatData(t.vizat_la.slice(0, 10))}` : '',
        conform: inc.some(x => !x.conform) ? 'nu' : inc.length ? 'da' : '',
      };
    });
    return {
      punct, randuri,
      sumar: {
        turnari: lista.length,
        volum: lista.reduce((s, t) => s + (Number(t.volum) || 0), 0),
        probe: lista.reduce((s, t) => s + (t.probe_prelevate ?? 0), 0),
        rezultate, neconforme,
        decofrate: lista.filter(t => t.data_decofrare).length,
        vizate: lista.filter(t => t.vizat_la).length,
      },
    };
  });
}

// ------------------------------------------------------------------ HTML (tipărire)
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)).replace(/\n/g, '<br>');

export function htmlCondica(d: DateCondica, doarPunct?: string): string {
  const a = antetCondica(d);
  const sectiuni = sectiuniCondica(d, doarPunct);
  const generat = new Date().toLocaleDateString('ro-RO');
  const stil = `@page{size:landscape;margin:10mm}
*{box-sizing:border-box}html{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;font-size:11px;margin:0;padding:22px 26px}
.pagina{page-break-after:always}.pagina:last-child{page-break-after:auto}
@media screen{.pagina+.pagina{margin-top:40px;padding-top:30px;border-top:2px dashed #cbd5e1}}
.cap{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f172a;padding-bottom:10px}
.cap h1{margin:0;font-size:22px;letter-spacing:.5px}.cap h1 span{color:#f97316}
.cap .sub{color:#64748b;font-size:12px;margin-top:3px}
.cod{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0f172a;color:#fff;border-radius:5px;padding:3px 8px;font-size:12px;font-weight:700}
.date{display:grid;grid-template-columns:2.2fr 1.4fr 1.4fr 1.4fr;gap:8px;margin:14px 0 12px}.date div:first-child{grid-row:span 2}
.date div{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px}
.date b{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#64748b;font-weight:600;margin-bottom:2px}
.punct{display:flex;align-items:center;gap:10px;margin:4px 0 10px}
.punct h2{margin:0;font-size:15px}
.sumar{display:flex;gap:6px;flex-wrap:wrap}.sumar span{background:#f1f5f9;border-radius:999px;padding:3px 10px;font-size:11px}
.sumar span.ok{background:#dcfce7;color:#15803d}.sumar span.rau{background:#fee2e2;color:#b91c1c}
table{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
th,td{padding:5px 6px;text-align:left;vertical-align:top;word-wrap:break-word;border-right:1px solid #e2e8f0}
th:last-child,td:last-child{border-right:0}
thead tr.grupe th{background:#0f172a;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.6px;text-align:center;border-right-color:#334155}
thead tr.col th{background:#e2e8f0;font-size:10px;font-weight:600;color:#334155;border-bottom:1px solid #cbd5e1}
tbody td{border-bottom:1px solid #e2e8f0;font-size:11px;line-height:1.35}
tbody tr:nth-child(even) td{background:#f8fafc}tbody tr:last-child td{border-bottom:0}
td.c{text-align:center}td.n{text-align:right;font-variant-numeric:tabular-nums}
td.slab{color:#64748b}tr.neconform td{background:#fef2f2!important}
.fara{color:#94a3b8}
.semnaturi{display:flex;justify-content:space-between;gap:40px;margin-top:26px}
.semnaturi div{flex:1;max-width:320px}.semnaturi b{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#64748b;margin-bottom:2px}
.semnaturi .linie{margin-top:30px;border-top:1px solid #0f172a;padding-top:3px;font-size:10px;color:#64748b}
.subsol{margin-top:16px;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between}
.gol{padding:30px;text-align:center;color:#64748b}`;
  const totalLatime = COLOANE_CONDICA.reduce((s, c) => s + c.latime, 0);
  const aliniere: Record<string, string> = { nr: 'c', schimb: 'c', volum: 'n', temp_aer: 'n', temp_beton: 'n', clasa: 'c', data: 'c', decofrare: 'c' };
  const date = [['Lucrarea', a.denumire], ['Adresa', a.adresa], ['Beneficiar', a.beneficiar], ['Autorizația de construire', a.autorizatie],
    ['Executant', a.executant], ['Responsabil tehnic cu execuția', a.rte], ['Diriginte de șantier', a.diriginte]].filter(x => x[1]);
  const pagina = (s: SectiuneCondica) => {
    const m = s.sumar;
    return `<section class="pagina">
<div class="cap"><div><h1>Condica de betoane<span>.</span></h1><div class="sub">Registrul turnărilor de beton, cu probele, încercările și decofrarea</div></div><span class="cod">${esc(a.cod)}</span></div>
<div class="date">${date.map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('')}</div>
<div class="punct">${s.punct ? `<h2>${esc(s.punct)}</h2>` : ''}<div class="sumar">
<span>${m.turnari} ${m.turnari === 1 ? 'turnare' : 'turnări'}</span><span>${nrRo(m.volum)} m³</span><span>${m.probe} ${m.probe === 1 ? 'set de probe' : 'seturi de probe'}</span>
${m.rezultate ? `<span class="${m.neconforme ? 'rau' : 'ok'}">${m.neconforme ? `${m.neconforme} ${m.neconforme === 1 ? 'rezultat neconform' : 'rezultate neconforme'}` : `${m.rezultate} ${m.rezultate === 1 ? 'rezultat conform' : 'rezultate conforme'}`}</span>` : ''}
<span>decofrate ${m.decofrate}/${m.turnari}</span><span>vizate ${m.vizate}/${m.turnari}</span></div></div>
<table><colgroup>${COLOANE_CONDICA.map(c => `<col style="width:${(c.latime / totalLatime * 100).toFixed(2)}%">`).join('')}</colgroup>
<thead><tr class="grupe">${GRUPE_CONDICA.map(g => `<th colspan="${g.coloane.length}">${esc(g.titlu)}</th>`).join('')}</tr>
<tr class="col">${COLOANE_CONDICA.map(c => `<th>${esc(c.titlu)}</th>`).join('')}</tr></thead>
<tbody>${s.randuri.map(r => `<tr${r.conform === 'nu' ? ' class="neconform"' : ''}>${COLOANE_CONDICA.map(c => {
      const v = r[c.cheie] ?? '';
      return `<td class="${aliniere[c.cheie] ?? ''}">${v ? esc(v) : '<span class="fara">—</span>'}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table>
<div class="semnaturi">
<div><b>Responsabil tehnic cu execuția</b>${esc(a.rte)}<div class="linie">semnătura</div></div>
<div><b>Diriginte de șantier</b>${esc(a.diriginte)}<div class="linie">semnătura</div></div>
</div>
<div class="subsol"><span>${esc(a.cod)} · Condica de betoane${s.punct ? ` · ${esc(s.punct)}` : ''}</span><span>Generată din Conpro BIM la ${generat}</span></div>
</section>`;
  };
  const corp = sectiuni.length ? sectiuni.map(pagina).join('') : '<p class="gol">Nicio turnare înregistrată.</p>';
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Condica de betoane ${esc(a.cod)}</title><style>${stil}</style></head><body>${corp}</body></html>`;
}

// ------------------------------------------------------------------ Excel
/** O singură foaie, cu toate turnările, filtre pe coloane și antetul pe grupe. */
export async function excelCondica(d: DateCondica): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const a = antetCondica(d);
  const sectiuni = sectiuniCondica(d);
  const cuPunct = sectiuni.some(s => s.punct);
  const grupe = cuPunct
    ? [{ titlu: 'Punct de lucru', coloane: [{ cheie: 'punct', titlu: 'Punct de lucru', latime: 14 }] }, ...GRUPE_CONDICA]
    : GRUPE_CONDICA;
  const coloane = grupe.flatMap(g => g.coloane);
  const n = coloane.length;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Conpro BIM';
  const ws = wb.addWorksheet('Condica de betoane', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '9:10' },
    headerFooter: { oddFooter: `&L${a.cod} · Condica de betoane&RPagina &P din &N` },
    views: [{ state: 'frozen', ySplit: 10, showGridLines: false }],
  });
  ws.columns = coloane.map(c => ({ width: c.latime * 0.95 + 2 }));
  const navy = 'FF0F172A', gri = 'FFE2E8F0', linie = 'FFCBD5E1';
  const subtire = { style: 'thin', color: { argb: linie } } as const;
  const chenar = { top: subtire, left: subtire, bottom: subtire, right: subtire };

  ws.getCell(1, 1).value = 'Condica de betoane';
  ws.getCell(1, 1).font = { name: 'Calibri', size: 18, bold: true, color: { argb: navy } };
  ws.getCell(1, n).value = a.cod;
  ws.getCell(1, n).font = { name: 'Consolas', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell(1, n).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
  ws.getCell(1, n).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;
  const info = [['Lucrarea', a.denumire], ['Adresa', a.adresa], ['Beneficiar', a.beneficiar], ['Autorizația de construire', a.autorizatie],
    ['Executant', a.executant], ['Responsabil tehnic cu execuția', a.rte], ['Diriginte de șantier', a.diriginte]].filter(x => x[1]);
  info.forEach(([k, v], i) => {
    const r = 3 + Math.floor(i / 2), c = i % 2 === 0 ? 1 : Math.ceil(n / 2) + 1;
    ws.getCell(r, c).value = { richText: [{ text: `${k}: `, font: { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } } }, { text: v, font: { name: 'Calibri', size: 10, bold: true } }] };
  });

  const r1 = 9, r2 = 10;
  let col = 1;
  for (const g of grupe) {
    const c = ws.getCell(r1, col);
    c.value = g.titlu.toUpperCase();
    if (g.coloane.length > 1) ws.mergeCells(r1, col, r1, col + g.coloane.length - 1);
    col += g.coloane.length;
  }
  coloane.forEach((c, i) => { ws.getCell(r2, i + 1).value = c.titlu; });
  for (let i = 1; i <= n; i++) {
    const g = ws.getCell(r1, i), h = ws.getCell(r2, i);
    g.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    g.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } };
    g.alignment = { horizontal: 'center', vertical: 'middle' };
    h.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF334155' } };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gri } };
    h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    g.border = chenar; h.border = chenar;
  }
  ws.getRow(r1).height = 18; ws.getRow(r2).height = 30;

  const numerice = new Set(['nr', 'volum', 'temp_aer', 'temp_beton']);
  let r = r2 + 1, total = 0;
  for (const s of sectiuni) {
    s.randuri.forEach((rand, k) => {
      const row = ws.getRow(r);
      coloane.forEach((c, i) => {
        const x = row.getCell(i + 1);
        const v = c.cheie === 'punct' ? s.punct : rand[c.cheie] ?? '';
        x.value = numerice.has(c.cheie) && v !== '' ? Number(v.replace(/\./g, '').replace(',', '.')) : v;
        x.font = { name: 'Calibri', size: 10, color: rand.conform === 'nu' ? { argb: 'FFB91C1C' } : undefined };
        x.alignment = { vertical: 'top', wrapText: true, horizontal: numerice.has(c.cheie) || ['data', 'schimb', 'clasa', 'decofrare'].includes(c.cheie) ? 'center' : 'left' };
        x.border = chenar;
        if (k % 2 === 1) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        if (c.cheie === 'volum') x.numFmt = '0.##';
      });
      r++;
    });
    total += s.sumar.volum;
  }
  ws.autoFilter = { from: { row: r2, column: 1 }, to: { row: Math.max(r2, r - 1), column: n } };
  const iv = coloane.findIndex(c => c.cheie === 'volum') + 1;
  ws.getCell(r, iv - 1).value = 'Total';
  ws.getCell(r, iv - 1).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(r, iv - 1).alignment = { horizontal: 'right' };
  ws.getCell(r, iv).value = Math.round(total * 100) / 100;
  ws.getCell(r, iv).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(r, iv).alignment = { horizontal: 'center' };
  ws.getCell(r, iv).border = { top: { style: 'medium', color: { argb: navy } } };

  const rs = r + 3;
  const semn = (c: number, rol: string, cine: string) => {
    ws.getCell(rs, c).value = rol; ws.getCell(rs, c).font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };
    ws.getCell(rs + 1, c).value = cine; ws.getCell(rs + 1, c).font = { name: 'Calibri', size: 11, bold: true };
    ws.getCell(rs + 3, c).value = 'semnătura ______________________'; ws.getCell(rs + 3, c).font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } };
  };
  semn(2, 'Responsabil tehnic cu execuția', a.rte);
  semn(Math.ceil(n / 2) + 2, 'Diriginte de șantier', a.diriginte);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
