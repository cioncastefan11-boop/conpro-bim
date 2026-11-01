// Exportul COBie 2.4 (foile principale) din datele proiectului.
// Pentru predarea oficială se recomandă verificarea fișierului cu un instrument COBie QC.
import type { DateProiect } from './dateProiect';
import { emailDe } from './dateProiect';
import { numeRol } from './domeniu';

const iso = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 19) : '');
const na = (v: unknown) => (v == null || v === '' ? 'n/a' : String(v));

/** Câmpurile obligatorii lipsă, pe echipament. Folosit și în interfață. */
export function lipsuriEchipament(d: DateProiect, echipamentId: string): string[] {
  const e = d.echipamente.find(x => x.id === echipamentId);
  if (!e) return [];
  const t = d.tipuri.find(x => x.id === e.tip_id);
  const l: string[] = [];
  if (!e.incapere_id) l.push('încăperea');
  if (!e.serie) l.push('seria');
  if (!e.data_montaj) l.push('data montajului');
  if (!e.garantie_start) l.push('începutul garanției');
  if (t) {
    if (!t.producator) l.push('producătorul (tip)');
    if (!t.model) l.push('modelul (tip)');
    if (t.garantie_luni == null) l.push('durata garanției (tip)');
    if (t.interval_mentenanta_luni == null) l.push('intervalul de mentenanță (tip)');
    if (!d.atasamente.some(a => a.entitate === 'tip_echipament' && a.entitate_id === t.id)) l.push('fișa tehnică sau manualul (tip)');
  }
  return l;
}

export async function genereazaCobie(d: DateProiect): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Conpro BIM';
  wb.created = new Date();
  const creat = (id: string | null) => emailDe(d, id) || 'necunoscut@conpro.ro';

  const foaie = (nume: string, coloane: string[], randuri: (string | number)[][]) => {
    const ws = wb.addWorksheet(nume);
    ws.addRow(coloane);
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    randuri.forEach(r => ws.addRow(r));
    ws.columns.forEach(c => { c.width = 22; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const p = d.proiect;
  const administrator = d.membri.find(m => m.rol === 'administrator');

  foaie('Contact', ['Email', 'CreatedBy', 'CreatedOn', 'Category', 'Company', 'Phone', 'GivenName'],
    d.membri.filter(m => m.persoane?.email).map(m => [
      m.persoane!.email, creat(administrator?.persoana_id ?? null), iso(p.creat_la), numeRol(m.rol),
      na(m.persoane?.firme?.denumire), na(m.persoane?.telefon), na(m.persoane?.nume),
    ]));

  foaie('Facility', ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'ProjectName', 'SiteName', 'LinearUnits', 'AreaUnits', 'CurrencyUnit', 'AreaMeasurement', 'Description'],
    [[p.denumire, creat(administrator?.persoana_id ?? null), iso(p.creat_la), na(p.clasa_consecinte), p.cod, na(p.adresa),
      'meters', 'square meters', 'RON', 'Arie utilă', na(p.beneficiar)]]);

  foaie('Floor', ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'Description', 'Elevation'],
    d.niveluri.map(n => [n.cod, creat(n.creat_de), iso(p.creat_la), 'Floor', n.denumire, n.cota ?? 'n/a']));

  foaie('Space', ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'FloorName', 'Description', 'GrossArea'],
    d.incaperi.map(i => [i.cod, creat(i.creat_de), iso(p.creat_la), na(i.functiune),
      d.niveluri.find(n => n.id === i.nivel_id)?.cod ?? 'n/a', i.denumire, i.arie ?? 'n/a']));

  foaie('Type', ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'Description', 'AssetType', 'Manufacturer', 'ModelNumber',
    'WarrantyGuarantorParts', 'WarrantyDurationParts', 'WarrantyGuarantorLabor', 'WarrantyDurationLabor', 'WarrantyDurationUnit',
    'ExpectedLife', 'DurationUnit'],
    d.tipuri.map(t => [t.denumire, creat(t.creat_de), iso(t.creat_la), na(t.categorie), t.denumire, 'Fixed', na(t.producator),
      na(t.model), na(t.garant), t.garantie_luni ?? 'n/a', na(t.garant), t.garantie_luni ?? 'n/a', 'month',
      t.durata_viata_ani ?? 'n/a', 'year']));

  foaie('Component', ['Name', 'CreatedBy', 'CreatedOn', 'TypeName', 'Space', 'Description', 'SerialNumber', 'InstallationDate', 'WarrantyStartDate', 'TagNumber'],
    d.echipamente.map(e => [e.cod, creat(e.creat_de), iso(e.creat_la), d.tipuri.find(t => t.id === e.tip_id)?.denumire ?? 'n/a',
      d.incaperi.find(i => i.id === e.incapere_id)?.cod ?? 'n/a', na(e.observatii), na(e.serie),
      e.data_montaj ?? 'n/a', e.garantie_start ?? 'n/a', e.cod]));

  foaie('Job', ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'Status', 'TypeName', 'Description', 'Duration', 'DurationUnit', 'Frequency', 'FrequencyUnit', 'TaskNumber'],
    d.tipuri.filter(t => t.interval_mentenanta_luni).map((t, i) => [`Mentenanță ${t.denumire}`, creat(t.creat_de), iso(t.creat_la),
      'PM', 'Not Yet Started', t.denumire, na(t.instructiuni_mentenanta), 'n/a', 'hour', t.interval_mentenanta_luni!, 'month', String(i + 1)]));

  const docRanduri: (string | number)[][] = [];
  for (const a of d.atasamente.filter(x => x.entitate === 'tip_echipament' || x.entitate === 'echipament')) {
    const sheet = a.entitate === 'tip_echipament' ? 'Type' : 'Component';
    const row = a.entitate === 'tip_echipament' ? d.tipuri.find(t => t.id === a.entitate_id)?.denumire : d.echipamente.find(e => e.id === a.entitate_id)?.cod;
    docRanduri.push([a.nume_fisier, creat(a.incarcat_de), iso(a.incarcat_la), a.tip_document, 'Approved', sheet, na(row),
      `D_Exploatare/echipamente`, a.nume_fisier]);
  }
  foaie('Document', ['Name', 'CreatedBy', 'CreatedOn', 'Category', 'ApprovalBy', 'SheetName', 'RowName', 'Directory', 'File'], docRanduri);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
