import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams, NavLink } from 'react-router-dom';
import { MatriceResponsabilitati, PlanLivrare } from './PlanLivrare';
import { supabase } from '../lib/supabase';
import {
  CODURI_STARE, ROLURI_DOCUMENT, STARI_CDE, TIPURI_DOCUMENT, formatData, numeCodStare, numeRol, numeRolDocument, numeTipDocument,
  revizieUrmatoare, tonCodStare, type Rol,
} from '../lib/domeniu';
import type { Atasament, DocumentProiect, ElementConventie, Membru, Proiect, RevizieDocument } from '../lib/tipuri';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';
import Atasamente, { BUCKET, MAX, numeSigur } from '../components/Atasamente';
import { codDin, evalueaza, recunoaste, type RandIncarcare } from '../lib/incarcare';
import { descarca } from './Echipamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
const APROBATORI: Rol[] = ['beneficiar', 'diriginte', 'administrator'];

export default function Documente(props: Props) {
  return (
    <>
      <nav className="subfile" aria-label="Documentele">
        <NavLink to="." end>Documentele (CDE)</NavLink>
        <NavLink to="plan">Planul de livrare</NavLink>
        <NavLink to="matrice">Matricea de responsabilități</NavLink>
      </nav>
    <Routes>
      <Route index element={<Lista {...props} />} />
      <Route path="plan" element={<PlanLivrare {...props} />} />
      <Route path="matrice" element={<MatriceResponsabilitati {...props} />} />
      <Route path="nou" element={<Nou {...props} />} />
      <Route path="incarcare" element={<IncarcareMultipla {...props} />} />
      <Route path=":documentId" element={<Detaliu {...props} />} />
    </Routes>
    </>
  );
}

const cand = (s: string | null) => (s ? new Date(s).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : '');
const om = (membri: Membru[], id: string | null) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? (p.nume || p.email) : '—'; };
/** Revizia curentă: cea mai nouă revizie neînlocuită pe care o văd. */
const curenta = (rev: RevizieDocument[]) => rev.find(r => r.stare !== 'arhivat') ?? rev[0];
const inVigoare = (rev: RevizieDocument[]) => rev.find(r => r.stare === 'publicat');
const echipa = (d: { creat_de: string; autor_rol: Rol }, uid: string, rol?: Rol) => d.creat_de === uid || d.autor_rol === rol;

/** Inițialele firmei pentru câmpul „inițiator” (ex. Construcții Vest SRL → CV). */
export function initialeFirma(nume?: string | null) {
  const cuv = (nume ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9]+/)
    .filter(w => w && !['SC', 'SRL', 'SA', 'SNC', 'PFA', 'II', 'IF', 'SCS'].includes(w));
  const ini = cuv.length > 1 ? cuv.map(w => w[0]).join('') : (cuv[0] ?? '').slice(0, 3);
  return ini.slice(0, 6).padEnd(2, 'X');
}

function useDocumente(proiectId: string) {
  const [docs, setDocs] = useState<DocumentProiect[] | null>(null);
  const [revizii, setRevizii] = useState<RevizieDocument[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('documente_proiect').select('*').eq('proiect_id', proiectId).order('cod'),
      supabase.from('revizii_document').select('*').eq('proiect_id', proiectId).order('creat_la', { ascending: false }),
    ]);
    setEroare(mesajEroare(a.error ?? b.error));
    setDocs((a.data as DocumentProiect[]) ?? []);
    setRevizii((b.data as RevizieDocument[]) ?? []);
  }, [proiectId]);
  useEffect(() => { incarca(); }, [incarca]);
  return { docs, revizii, eroare, incarca };
}

function EtichetaRevizie({ r }: { r?: RevizieDocument }) {
  if (!r) return <span className="discret">fără revizie</span>;
  return (
    <span className="eticheta-revizie">
      <b>{r.revizie}</b>
      <Eticheta stare={{ eticheta: r.cod_stare, ton: tonCodStare(r.cod_stare) }} />
      {r.stare === 'publicare_ceruta' && <Eticheta stare={{ eticheta: 'la aprobare', ton: 'atentie' }} />}
    </span>
  );
}

// --------------------------------------------------------------------- Lista
function Lista({ proiect, membri, rolulMeu }: Props) {
  const { docs, revizii, eroare } = useDocumente(proiect.id);
  const [cauta, setCauta] = useState('');
  const [tip, setTip] = useState('');
  const [rol, setRol] = useState('');
  const [stare, setStare] = useState('');
  const pe = useMemo(() => {
    const m = new Map<string, RevizieDocument[]>();
    for (const r of revizii) m.set(r.document_id, [...(m.get(r.document_id) ?? []), r]);
    return m;
  }, [revizii]);

  if (!docs) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  const q = cauta.trim().toLowerCase();
  const vizibile = docs.filter(d => {
    const c = curenta(pe.get(d.id) ?? []);
    return (!q || d.cod.toLowerCase().includes(q) || d.titlu.toLowerCase().includes(q))
      && (!tip || d.tip === tip) && (!rol || d.rol === rol) && (!stare || c?.stare === stare);
  });
  const deAprobat = APROBATORI.includes(rolulMeu as Rol) ? revizii.filter(r => r.stare === 'publicare_ceruta') : [];
  const poateAdauga = !!rolulMeu && rolulMeu !== 'cititor';
  const tipuriFolosite = [...new Set(docs.map(d => d.tip))];
  const roluriFolosite = [...new Set(docs.map(d => d.rol))];

  async function registru() {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Registrul documentelor', { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.getCell('A1').value = `Registrul documentelor · ${proiect.cod} · ${proiect.denumire}`;
    ws.getCell('A1').font = { size: 14, bold: true };
    ws.getCell('A2').value = `Generat din Conpro BIM la ${new Date().toLocaleString('ro-RO')} · coduri ISO 19650`;
    ws.getCell('A2').font = { size: 9, color: { argb: 'FF64748B' } };
    const cap = ['Cod', 'Titlu', 'Tip', 'Disciplina', 'Revizia curentă', 'Cod stare', 'Starea', 'Data', 'Autor', 'Revizia în vigoare', 'Aprobată de', 'Aprobată la'];
    ws.getRow(3).values = cap;
    ws.getRow(3).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    ws.columns = [32, 40, 22, 22, 12, 10, 26, 16, 22, 14, 22, 16].map(w => ({ width: w }));
    for (const d of docs!) {
      const rv = pe.get(d.id) ?? [];
      const c = curenta(rv), v = inVigoare(rv);
      ws.addRow([d.cod, d.titlu, numeTipDocument(d.tip), numeRolDocument(d.rol), c?.revizie ?? '', c?.cod_stare ?? '', c ? `${STARI_CDE[c.stare].eticheta} · ${numeCodStare(c.cod_stare)}` : '',
        c ? new Date(c.partajat_la ?? c.creat_la).toLocaleDateString('ro-RO') : '', c ? om(membri, c.creat_de) : '',
        v ? `${v.revizie} (${v.cod_stare})` : '', v ? om(membri, v.aprobat_de) : '', v?.aprobat_la ? new Date(v.aprobat_la).toLocaleDateString('ro-RO') : '']);
    }
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + docs!.length, column: cap.length } };
    const buf = await wb.xlsx.writeBuffer();
    descarca(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Registrul-documentelor-${proiect.cod}.xlsx`);
  }

  return (
    <>
      {deAprobat.length > 0 && (
        <div className="mesaj atentie-bloc">
          <b>De aprobat pentru publicare:</b>{' '}
          {deAprobat.map((r, i) => { const d = docs.find(x => x.id === r.document_id); return d ? <span key={r.id}>{i > 0 && ', '}<Link to={d.id}>{d.cod} {r.revizie}</Link></span> : null; })}
        </div>
      )}
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Documentele proiectului</h2>
            <p className="discret">Mediul comun de date (CDE) după ISO 19650: fiecare planșă, model sau raport are un cod standard și revizii care trec prin stările în lucru → partajat → publicat → arhivat.</p>
          </div>
          <div className="actiuni-antet">
            {docs.length > 0 && <button className="buton" onClick={registru}>Registrul (Excel)</button>}
            {poateAdauga && <Link className="buton" to="incarcare">Încarcă mai multe</Link>}
            {poateAdauga && <Link className="buton principal" to="nou">Document nou</Link>}
          </div>
        </div>
        <Eroare text={eroare} />
        {docs.length === 0 ? (
          <Gol titlu="Niciun document încă"><p>Proiectantul adaugă planșele și modelele; constructorul, procedurile și graficele. Fiecare revizie se partajează, iar cea aprobată se publică pentru execuție.</p></Gol>
        ) : (
          <>
            <div className="filtre-documente">
              <input placeholder="Caută după cod sau titlu" value={cauta} onChange={e => setCauta(e.target.value)} />
              <select value={tip} onChange={e => setTip(e.target.value)}>
                <option value="">Toate tipurile</option>
                {TIPURI_DOCUMENT.filter(t => tipuriFolosite.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.id} · {t.nume}</option>)}
              </select>
              <select value={rol} onChange={e => setRol(e.target.value)}>
                <option value="">Toate disciplinele</option>
                {ROLURI_DOCUMENT.filter(t => roluriFolosite.includes(t.id)).map(t => <option key={t.id} value={t.id}>{t.id} · {t.nume}</option>)}
              </select>
              <select value={stare} onChange={e => setStare(e.target.value)}>
                <option value="">Toate stările</option>
                {(['wip', 'partajat', 'publicare_ceruta', 'publicat'] as const).map(s => <option key={s} value={s}>{STARI_CDE[s].eticheta}</option>)}
              </select>
            </div>
            <div className="tabel-wrap">
              <table className="tabel stivuit">
                <thead><tr><th>Cod</th><th>Titlu</th><th>Revizia curentă</th><th>În vigoare</th><th>Actualizat</th></tr></thead>
                <tbody>
                  {vizibile.map(d => {
                    const rv = pe.get(d.id) ?? [];
                    const c = curenta(rv), v = inVigoare(rv);
                    return (
                      <tr key={d.id}>
                        <td data-eticheta="Cod"><Link to={d.id} className="cod-link cod-document">{d.cod}</Link></td>
                        <td data-eticheta="Titlu">{d.titlu}<small className="linia2">{numeTipDocument(d.tip)} · {numeRolDocument(d.rol)}</small></td>
                        <td data-eticheta="Revizia curentă"><EtichetaRevizie r={c} />{c && <small className="linia2">{STARI_CDE[c.stare].eticheta}</small>}</td>
                        <td data-eticheta="În vigoare">{v ? <span className="eticheta-revizie"><b>{v.revizie}</b><Eticheta stare={{ eticheta: v.cod_stare, ton: 'ok' }} /></span> : <span className="discret">—</span>}</td>
                        <td data-eticheta="Actualizat" className="fara-rupere">{c ? formatData((c.aprobat_la ?? c.partajat_la ?? c.creat_la).slice(0, 10)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {vizibile.length === 0 && <p className="discret">Niciun document nu corespunde filtrului.</p>}
          </>
        )}
      </div>
      <details className="card ajutor-cod">
        <summary>Cum se citește codul unui document</summary>
        <p><code>{proiect.cod}-CVS-ZZ-01-DR-S-0101</code> = proiect · inițiator (firma) · volum / corp (ZZ = toate) · nivel (01, B1; ZZ = mai multe) · tip (DR planșă, M3 model 3D, RP raport…) · disciplină (A arhitectură, S structură, M instalații…) · număr.</p>
        <p>Stările: <b>S0</b> în lucru · <b>S1–S4</b> partajat pentru {['coordonare', 'informare', 'verificare și comentarii', 'aprobarea etapei'].join(', ')} · <b>A</b> aprobat pentru execuție · <b>B</b> aprobat parțial, cu comentarii · <b>CR</b> ca executat (as-built).</p>
      </details>
    </>
  );
}

// ----------------------------------------------------------------------- Nou
/** Un câmp al codului: listă din convenția proiectului sau text liber (cu „alt cod” când convenția nu e strictă). */
function CampConventie({ eticheta, lista, strict, valoare, onChange, ajutor, min, max }: {
  eticheta: string; lista?: ElementConventie[]; strict: boolean; valoare: string; onChange: (v: string) => void; ajutor: string; min: number; max: number;
}) {
  const [liber, setLiber] = useState(!!lista?.length && !lista.some(x => x.cod === valoare));
  const curat = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!lista?.length || (liber && !strict)) {
    return (
      <label>{eticheta}
        <input value={valoare} onChange={e => onChange(curat(e.target.value))} required minLength={min} maxLength={max} />
        <small>{ajutor}{lista?.length ? <> <button type="button" className="legatura" onClick={() => { setLiber(false); onChange(lista[0].cod); }}>Alege din convenție</button></> : null}</small>
      </label>
    );
  }
  return (
    <label>{eticheta}
      <select value={valoare} onChange={e => { if (e.target.value === '__alt') { setLiber(true); onChange(''); } else onChange(e.target.value); }}>
        {lista.map(x => <option key={x.cod} value={x.cod}>{x.cod}{x.nume ? ` · ${x.nume}` : ''}</option>)}
        {!strict && <option value="__alt">Alt cod…</option>}
      </select>
      <small>{strict ? 'Din convenția proiectului.' : 'Din convenția proiectului; se poate și alt cod.'}</small>
    </label>
  );
}

function Nou({ proiect, membri, rolulMeu, uid }: Props) {
  const nav = useNavigate();
  const eu = membri.find(m => m.persoana_id === uid);
  const rolImplicit = rolulMeu === 'constructor' ? 'W' : rolulMeu === 'subcontractor' ? 'X' : rolulMeu === 'beneficiar' ? 'K' : rolulMeu === 'administrator' || rolulMeu === 'diriginte' ? 'Z' : 'A';
  const conv = proiect.standard_info ?? {};
  const cifre = conv.cifre && conv.cifre >= 4 && conv.cifre <= 6 ? conv.cifre : 4;
  const ini = initialeFirma(eu?.persoane?.firme?.denumire);
  const implicit = (l: ElementConventie[] | undefined, dorit: string) => (!l?.length || l.some(x => x.cod === dorit) ? dorit : l[0].cod);
  const [c, setC] = useState({ initiator: implicit(conv.initiatori, ini), volum: implicit(conv.volume, 'ZZ'), nivel: implicit(conv.niveluri, 'ZZ'), tip: 'DR', rol: rolImplicit, numar: '', titlu: '', descriere: '', modificari: 'Prima emitere' });
  const [existente, setExistente] = useState<DocumentProiect[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  useEffect(() => { supabase.from('documente_proiect').select('*').eq('proiect_id', proiect.id).then(({ data }) => setExistente((data as DocumentProiect[]) ?? [])); }, [proiect.id]);
  const urmator = useMemo(() => {
    const n = existente.filter(d => d.tip === c.tip && d.rol === c.rol).map(d => parseInt(d.numar, 10)).reduce((a, b) => Math.max(a, b), 0);
    return String(n + 1).padStart(cifre, '0');
  }, [existente, c.tip, c.rol, cifre]);
  if (!rolulMeu || rolulMeu === 'cititor') return <Gol titlu="Documentele le adaugă echipa de proiect" />;

  const s = (k: keyof typeof c, mari = false) => ({ value: c[k], onChange: (e: { target: { value: string } }) => setC({ ...c, [k]: mari ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') : e.target.value }) });
  const numar = c.numar || urmator;
  const cod = [proiect.cod, c.initiator, c.volum, c.nivel, c.tip, c.rol, numar].join('-');

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const ins = await supabase.from('documente_proiect').insert({ proiect_id: proiect.id, initiator: c.initiator, volum: c.volum, nivel: c.nivel, tip: c.tip, rol: c.rol, numar, titlu: c.titlu.trim(), descriere: c.descriere.trim() || null });
    if (ins.error) { setLucreaza(false); setEroare(ins.error.message.includes('duplicate') ? `Codul ${cod} există deja. Schimbați numărul.` : mesajEroare(ins.error)); return; }
    const { data } = await supabase.from('documente_proiect').select('id').eq('proiect_id', proiect.id).eq('cod', cod).single();
    if (data) await supabase.from('revizii_document').insert({ document_id: data.id, revizie: 'P01', modificari: c.modificari.trim() || null });
    setLucreaza(false);
    nav(data ? `../${data.id}` : '..');
  }

  return (
    <form className="card formular" onSubmit={salveaza}>
      <p><Link to=".." className="inapoi">← Documentele proiectului</Link></p>
      <h2>Document nou</h2>
      <div className="previzualizare-cod"><span>Codul documentului</span><code>{cod}</code></div>
      <div className="campuri">
        <CampConventie eticheta="Inițiator (firma)" lista={conv.initiatori} strict={!!conv.strict} valoare={c.initiator} min={2} max={6}
          onChange={x => setC({ ...c, initiator: x })} ajutor="2–6 litere, ex. inițialele firmei." />
        <CampConventie eticheta="Volum / corp" lista={conv.volume} strict={!!conv.strict} valoare={c.volum} min={1} max={4}
          onChange={x => setC({ ...c, volum: x })} ajutor="ZZ = toate corpurile." />
        <CampConventie eticheta="Nivel" lista={conv.niveluri} strict={!!conv.strict} valoare={c.nivel} min={2} max={4}
          onChange={x => setC({ ...c, nivel: x })} ajutor="00, 01, B1; ZZ = mai multe; XX = niciunul." />
        <label>Tipul
          <select {...s('tip')}>{TIPURI_DOCUMENT.map(t => <option key={t.id} value={t.id}>{t.id} · {t.nume}</option>)}</select>
        </label>
        <label>Disciplina
          <select {...s('rol')}>{ROLURI_DOCUMENT.map(t => <option key={t.id} value={t.id}>{t.id} · {t.nume}</option>)}</select>
        </label>
        <label>Număr<input {...s('numar', true)} placeholder={urmator} inputMode="numeric" pattern={conv.strict ? `[0-9]{${cifre}}` : '[0-9]{4,6}'} maxLength={6} /><small>Următorul liber: {urmator}.</small></label>
        <label className="lat">Titlu<input {...s('titlu')} required minLength={3} placeholder="ex. Plan cofraj placă peste parter" /></label>
        <label className="lat">Descriere (opțional)<textarea {...s('descriere')} rows={2} /></label>
        <label className="lat">Prima revizie: P01<input {...s('modificari')} /><small>Revizia începe în lucru (S0); fișierul îl încărcați pe pagina documentului, apoi îl partajați.</small></label>
      </div>
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link to=".." className="buton">Renunță</Link>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se creează…' : 'Creează documentul'}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------- Detaliu
function Detaliu({ proiect, membri, rolulMeu, uid }: Props) {
  const { documentId = '' } = useParams();
  const [d, setD] = useState<DocumentProiect | null>(null);
  const [rev, setRev] = useState<RevizieDocument[]>([]);
  const [fis, setFis] = useState<Atasament[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [negasit, setNegasit] = useState(false);
  const [scop, setScop] = useState('S2');
  const [codPub, setCodPub] = useState('A1');
  const [obs, setObs] = useState('');
  const [nouaRev, setNouaRev] = useState<{ cod: string; modificari: string } | null>(null);
  const [titlu, setTitlu] = useState('');

  const incarca = useCallback(async () => {
    const a = await supabase.from('documente_proiect').select('*').eq('id', documentId).maybeSingle();
    if (!a.data) { setNegasit(!a.error); setEroare(mesajEroare(a.error)); return; }
    const b = await supabase.from('revizii_document').select('*').eq('document_id', documentId).order('creat_la', { ascending: false });
    const r = (b.data as RevizieDocument[]) ?? [];
    const f = r.length ? await supabase.from('atasamente').select('*').eq('entitate', 'revizie_document').in('entitate_id', r.map(x => x.id)).order('incarcat_la') : { data: [] };
    setD(a.data as DocumentProiect); setTitlu((a.data as DocumentProiect).titlu); setRev(r); setFis((f.data as Atasament[]) ?? []);
  }, [documentId]);
  useEffect(() => { incarca(); }, [incarca]);

  if (negasit) return <Gol titlu="Documentul nu există" />;
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;

  const eaEchipa = echipa(d, uid, rolulMeu);
  const aprobator = APROBATORI.includes(rolulMeu as Rol);
  const deschisa = rev.find(r => r.stare === 'wip' || r.stare === 'publicare_ceruta');
  const v = inVigoare(rev);
  const c = curenta(rev);

  const rpc = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setEroare(null); setMesaj(null);
    const { error } = await supabase.rpc(fn, args);
    if (error) setEroare(mesajEroare(error)); else { setMesaj(ok); setObs(''); incarca(); }
  };
  async function creeazaRevizie() {
    if (!nouaRev) return;
    setEroare(null);
    const { error } = await supabase.from('revizii_document').insert({ document_id: d!.id, revizie: nouaRev.cod.trim().toUpperCase(), modificari: nouaRev.modificari.trim() || null });
    if (error) setEroare(mesajEroare(error)); else { setNouaRev(null); setMesaj('Revizia a fost creată, în lucru. Încărcați fișierul.'); incarca(); }
  }
  async function salveazaTitlu() {
    const { error } = await supabase.from('documente_proiect').update({ titlu: titlu.trim() }).eq('id', d!.id);
    if (error) setEroare(mesajEroare(error)); else incarca();
  }
  async function deschide(a: Atasament) {
    const { data, error } = await supabase.storage.from('documente').createSignedUrl(a.cale, 120);
    if (error || !data) { setEroare(error?.message ?? 'Fișierul nu se poate deschide.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <>
      <p><Link to=".." className="inapoi">← Documentele proiectului</Link></p>
      <article className="card">
        <header className="antet-pv">
          <div>
            <span className="cod cod-mare">{d.cod}</span>
            {eaEchipa ? (
              <div className="titlu-editabil"><input value={titlu} onChange={e => setTitlu(e.target.value)} aria-label="Titlu" />{titlu !== d.titlu && <button className="buton mic" onClick={salveazaTitlu}>Salvează</button>}</div>
            ) : <h2>{d.titlu}</h2>}
            <p className="discret">{numeTipDocument(d.tip)} · {numeRolDocument(d.rol)} · volum {d.volum} · nivel {d.nivel} · produs de {numeRol(d.autor_rol).toLowerCase()} ({om(membri, d.creat_de)})</p>
          </div>
          <div className="stare-document">
            {v ? <><span className="discret">În vigoare</span><b>{v.revizie} · {v.cod_stare}</b><small>{numeCodStare(v.cod_stare)}</small></>
              : <><span className="discret">În vigoare</span><b>—</b><small>nicio revizie publicată</small></>}
          </div>
        </header>
        <Eroare text={eroare} />
        {mesaj && <p className="mesaj ok">{mesaj}</p>}

        {/* revizia deschisă: în lucru sau la aprobare */}
        {deschisa?.stare === 'wip' && (
          <section className="revizie-activa">
            <h3>Revizia {deschisa.revizie} · în lucru (S0)</h3>
            {!eaEchipa && <p className="discret">O vede doar echipa care o produce.</p>}
            {deschisa.modificari && <p>{deschisa.modificari}</p>}
            <Atasamente proiectId={proiect.id} entitate="revizie_document" entitateId={deschisa.id} membri={membri} poateIncarca={eaEchipa}
              tipuri={['document']} titlu="Fișierele reviziei" gol="Încărcați fișierul (PDF, DWG, IFC…). După partajare nu se mai schimbă." />
            {eaEchipa && (
              <div className="rand-actiune">
                <select value={scop} onChange={e => setScop(e.target.value)}>
                  {['S1', 'S2', 'S3', 'S4'].map(k => <option key={k} value={k}>{k} · {CODURI_STARE[k].nume}</option>)}
                </select>
                <button className="buton principal" onClick={() => rpc('revizie_partajeaza', { p_rev: deschisa.id, p_cod_stare: scop }, `Revizia ${deschisa.revizie} a fost partajată cu tot proiectul.`)}>Partajează</button>
                <small className="discret">După verificarea internă a echipei (ISO 19650-2, 5.6).</small>
              </div>
            )}
          </section>
        )}
        {deschisa?.stare === 'publicare_ceruta' && (
          <section className="revizie-activa">
            <h3>Revizia {deschisa.revizie} · cerere de publicare ca {deschisa.cod_stare_cerut} ({numeCodStare(deschisa.cod_stare_cerut ?? '')})</h3>
            <p className="discret">Cerută de {om(membri, deschisa.publicare_ceruta_de)}, {cand(deschisa.publicare_ceruta_la)}.</p>
            {aprobator ? (
              <div className="rand-actiune">
                <input placeholder="Observații (obligatorii la refuz)" value={obs} onChange={e => setObs(e.target.value)} />
                <button className="buton principal" onClick={() => rpc('revizie_aproba_publicarea', { p_rev: deschisa.id, p_aproba: true, p_observatii: obs || null }, `Revizia ${deschisa.revizie} a fost publicată.`)}>Aprob publicarea</button>
                <button className="buton" onClick={() => rpc('revizie_aproba_publicarea', { p_rev: deschisa.id, p_aproba: false, p_observatii: obs }, 'Publicarea a fost refuzată; revizia rămâne partajată.')}>Refuz</button>
              </div>
            ) : <p className="mesaj info">Se așteaptă aprobarea beneficiarului, a dirigintelui sau a administratorului proiectului.</p>}
          </section>
        )}
        {c?.stare === 'partajat' && !deschisa && eaEchipa && (
          <section className="revizie-activa">
            <h3>Revizia {c.revizie} · partajată ({c.cod_stare})</h3>
            {c.observatii_aprobare && <p className="mesaj atentie-bloc">Publicarea a fost refuzată: {c.observatii_aprobare}</p>}
            <div className="rand-actiune">
              <select value={codPub} onChange={e => setCodPub(e.target.value)}>
                <option value="A1">A1 · Aprobat pentru execuție</option>
                <option value="B1">B1 · Aprobat parțial, cu comentarii</option>
                <option value="CR">CR · Ca executat (as-built)</option>
              </select>
              <button className="buton principal" onClick={() => rpc('revizie_cere_publicarea', { p_rev: c.id, p_cod_stare: codPub }, 'Cererea de publicare a fost trimisă.')}>Cere publicarea</button>
            </div>
          </section>
        )}
        {eaEchipa && !deschisa && (
          nouaRev ? (
            <div className="rand-actiune">
              <input value={nouaRev.cod} onChange={e => setNouaRev({ ...nouaRev, cod: e.target.value })} style={{ maxWidth: 90 }} aria-label="Revizia" />
              <input placeholder="Ce se schimbă" value={nouaRev.modificari} onChange={e => setNouaRev({ ...nouaRev, modificari: e.target.value })} />
              <button className="buton principal" onClick={creeazaRevizie}>Creează revizia</button>
              <button className="buton" onClick={() => setNouaRev(null)}>Renunță</button>
            </div>
          ) : <div className="actiuni stanga"><button className="buton" onClick={() => setNouaRev({ cod: revizieUrmatoare(rev.map(r => r.revizie), !!v), modificari: '' })}>Revizie nouă</button></div>
        )}

        <h3>Istoricul reviziilor</h3>
        <div className="tabel-wrap">
          <table className="tabel stivuit">
            <thead><tr><th>Revizia</th><th>Stare</th><th>Ce s-a schimbat</th><th>Fișiere</th><th>Circuit</th></tr></thead>
            <tbody>
              {rev.map(r => (
                <tr key={r.id} className={r.stare === 'arhivat' ? 'arhivat' : ''}>
                  <td data-eticheta="Revizia"><b>{r.revizie}</b></td>
                  <td data-eticheta="Stare"><Eticheta stare={{ eticheta: `${r.cod_stare} · ${numeCodStare(r.cod_stare)}`, ton: r.stare === 'arhivat' ? 'neutru' : tonCodStare(r.cod_stare) }} /><small className="linia2">{STARI_CDE[r.stare].eticheta}</small></td>
                  <td data-eticheta="Ce s-a schimbat">{r.modificari || <span className="discret">—</span>}</td>
                  <td data-eticheta="Fișiere">{fis.filter(a => a.entitate_id === r.id).map(a => <div key={a.id}><button className="legatura" onClick={() => deschide(a)}>{a.nume_fisier}</button></div>)}
                    {!fis.some(a => a.entitate_id === r.id) && <span className="discret">—</span>}</td>
                  <td data-eticheta="Circuit"><small>
                    creată de {om(membri, r.creat_de)}, {cand(r.creat_la)}
                    {r.partajat_la && <><br />partajată {cand(r.partajat_la)}</>}
                    {r.aprobat_la && <><br />publicată de {om(membri, r.aprobat_de)}, {cand(r.aprobat_la)}{r.observatii_aprobare ? `: ${r.observatii_aprobare}` : ''}</>}
                    {r.arhivat_la && <><br />înlocuită {cand(r.arhivat_la)}</>}
                  </small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rev.length === 0 && <p className="discret">Nicio revizie vizibilă încă: revizia în lucru o vede doar echipa care o produce.</p>}
      </article>
    </>
  );
}

// --------------------------------------------------------- Încărcare multiplă
function IncarcareMultipla({ proiect, membri, rolulMeu, uid }: Props) {
  const { docs, revizii, incarca } = useDocumente(proiect.id);
  const [randuri, setRanduri] = useState<RandIncarcare[]>([]);
  const [partajare, setPartajare] = useState('');
  const [lucreaza, setLucreaza] = useState(false);
  const [stari, setStari] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [peste, setPeste] = useState(false);
  const conv = proiect.standard_info ?? {};
  const eu = membri.find(m => m.persoana_id === uid);
  const rolImplicit = rolulMeu === 'constructor' ? 'W' : rolulMeu === 'subcontractor' ? 'X' : rolulMeu === 'beneficiar' ? 'K' : rolulMeu === 'administrator' || rolulMeu === 'diriginte' ? 'Z' : 'A';
  const iniImplicit = (() => { const i = initialeFirma(eu?.persoane?.firme?.denumire); return !conv.initiatori?.length || conv.initiatori.some(x => x.cod === i) ? i : conv.initiatori[0].cod; })();
  const cifre = conv.cifre && conv.cifre >= 4 && conv.cifre <= 6 ? conv.cifre : 4;
  if (!rolulMeu || rolulMeu === 'cititor') return <Gol titlu="Documentele le adaugă echipa de proiect" />;
  if (!docs) return <p className="discret">Se încarcă…</p>;
  const eaEchipa = (d: DocumentProiect) => echipa(d, uid, rolulMeu);
  const reevalueaza = (l: RandIncarcare[]) => l.map(r => evalueaza(r, proiect.cod, docs, revizii, conv, eaEchipa));

  function adauga(lista: FileList | File[]) {
    const noi = [...randuri];
    const urmator = new Map<string, number>();
    const nr = (tip: string, rol: string) => {
      const k = `${tip}-${rol}`;
      const max = Math.max(urmator.get(k) ?? 0, ...docs!.filter(d => d.tip === tip && d.rol === rol).map(d => parseInt(d.numar, 10)), ...noi.filter(x => x.tip === tip && x.rol === rol).map(x => parseInt(x.numar, 10) || 0), 0);
      urmator.set(k, max + 1);
      return String(max + 1).padStart(cifre, '0');
    };
    for (const f of Array.from(lista)) {
      if (f.size > MAX) { setStari(s => ({ ...s, ['mare-' + f.name]: { ok: false, text: `${f.name} are peste 50 MB (limita planului gratuit Supabase).` } })); continue; }
      const c = recunoaste(f.name, proiect.cod);
      const existent = c.recunoscut ? noi.find(x => codDin(proiect.cod, x) === codDin(proiect.cod, c) && (x.revizie === (c.revizie ?? x.revizie))) : undefined;
      if (existent) { existent.fisiere = [...existent.fisiere, f]; continue; }
      const rol = c.rol || rolImplicit;
      noi.push({ ...c, initiator: c.initiator || iniImplicit, rol, numar: c.numar || nr(c.tip, rol), cheie: crypto.randomUUID(), fisiere: [f], revizie: c.revizie ?? '',
        actiune: 'eroare', documentId: null, revizieId: null, mesaj: null });
    }
    setRanduri(reevalueaza(noi));
  }
  const schimba = (cheie: string, k: keyof RandIncarcare, v: string) => setRanduri(reevalueaza(randuri.map(r => (r.cheie === cheie ? { ...r, [k]: k === 'titlu' ? v : v.toUpperCase().replace(/[^A-Z0-9.]/g, '') } : r))));
  const scoate = (cheie: string) => setRanduri(randuri.filter(r => r.cheie !== cheie));

  async function urca(revId: string, f: File) {
    const cale = `${proiect.id}/revizie_document/${revId}/${crypto.randomUUID().slice(0, 8)}-${numeSigur(f.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(cale, f, { contentType: f.type || undefined, upsert: false });
    if (up.error) throw new Error(`${f.name}: ${up.error.message}`);
    const { error } = await supabase.from('atasamente').insert({ proiect_id: proiect.id, entitate: 'revizie_document', entitate_id: revId, tip_document: 'document', nume_fisier: f.name, cale, marime: f.size });
    if (error) throw error;
  }
  async function porneste() {
    setLucreaza(true);
    for (const r of randuri.filter(x => x.actiune !== 'eroare' && !stari[x.cheie]?.ok)) {
      const st = (ok: boolean, text: string) => setStari(s => ({ ...s, [r.cheie]: { ok, text } }));
      try {
        st(true, 'Se încarcă…');
        let docId = r.documentId, revId = r.revizieId;
        if (r.actiune === 'document_nou') {
          const { error } = await supabase.from('documente_proiect').insert({ proiect_id: proiect.id, initiator: r.initiator, volum: r.volum, nivel: r.nivel, tip: r.tip, rol: r.rol, numar: r.numar, titlu: r.titlu.trim() });
          if (error) throw error;
          docId = (await supabase.from('documente_proiect').select('id').eq('proiect_id', proiect.id).eq('cod', codDin(proiect.cod, r)).single()).data?.id ?? null;
        }
        if (r.actiune === 'document_nou' || r.actiune === 'revizie_noua') {
          const { error } = await supabase.from('revizii_document').insert({ document_id: docId, revizie: r.revizie, modificari: r.actiune === 'document_nou' ? 'Prima emitere' : null });
          if (error) throw error;
          revId = (await supabase.from('revizii_document').select('id').eq('document_id', docId).eq('revizie', r.revizie).single()).data?.id ?? null;
        }
        if (!revId) throw new Error('Revizia nu a putut fi creată.');
        for (const f of r.fisiere) await urca(revId, f);
        if (partajare) { const { error } = await supabase.rpc('revizie_partajeaza', { p_rev: revId, p_cod_stare: partajare }); if (error) throw error; }
        st(true, partajare ? `Încărcat și partajat (${partajare}).` : 'Încărcat, în lucru.');
      } catch (e) {
        st(false, mesajEroare(e as { message?: string }) ?? 'Eroare');
      }
    }
    setLucreaza(false);
    incarca();
  }

  const valide = randuri.filter(r => r.actiune !== 'eroare');
  const gata = randuri.length > 0 && randuri.every(r => stari[r.cheie]?.ok && stari[r.cheie].text !== 'Se încarcă…');
  const ETICHETE = { document_nou: { eticheta: 'Document nou', ton: 'ok' }, revizie_noua: { eticheta: 'Revizie nouă', ton: 'atentie' }, adauga_la_wip: { eticheta: 'La revizia în lucru', ton: 'neutru' }, eroare: { eticheta: 'De corectat', ton: 'alerta' } } as const;

  return (
    <div className="card formular">
      <p><Link to=".." className="inapoi">← Documentele proiectului</Link></p>
      <h2>Încarcă mai multe documente</h2>
      <p className="discret">Dacă numele fișierelor încep cu codul documentului (ex. <code>{proiect.cod}-SP-ZZ-01-DR-S-0101-P02 - Plan cofraj.pdf</code>), aplicația recunoaște codul, revizia și titlul. Fișierele cu același cod (ex. PDF și DWG) intră în aceeași revizie. Pentru celelalte, completați codul în tabel.</p>
      <label className={`zona-fisiere ${peste ? 'peste' : ''}`}
        onDragOver={e => { e.preventDefault(); setPeste(true); }} onDragLeave={() => setPeste(false)}
        onDrop={e => { e.preventDefault(); setPeste(false); adauga(e.dataTransfer.files); }}>
        <b>Trageți fișierele aici</b> sau dați clic pentru a le alege
        <input type="file" multiple onChange={e => { if (e.target.files) adauga(e.target.files); e.target.value = ''; }} />
      </label>
      {Object.entries(stari).filter(([k]) => k.startsWith('mare-')).map(([k, v]) => <p key={k} className="mesaj alerta">{v.text}</p>)}
      {randuri.length > 0 && (
        <>
          <div className="tabel-wrap">
            <table className="tabel stivuit tabel-incarcare">
              <thead><tr><th>Fișiere</th><th>Cod</th><th>Titlu</th><th>Revizia</th><th>Ce se întâmplă</th><th /></tr></thead>
              <tbody>
                {randuri.map(r => {
                  const s = stari[r.cheie];
                  const blocat = lucreaza || !!s?.ok;
                  return (
                    <tr key={r.cheie}>
                      <td data-eticheta="Fișiere">{r.fisiere.map(f => <div key={f.name} className="nume-fisier">{f.name}</div>)}</td>
                      <td data-eticheta="Cod">
                        <div className="cod-editabil">
                          <span>{proiect.cod}</span>
                          {(['initiator', 'volum', 'nivel', 'tip', 'rol', 'numar'] as const).map(k => (
                            <input key={k} value={r[k]} disabled={blocat} onChange={e => schimba(r.cheie, k, e.target.value)} aria-label={k} title={k}
                              style={{ width: `${Math.max(2, r[k].length) + 1.5}ch` }} />
                          ))}
                        </div>
                        {r.recunoscut && <small className="linia2">recunoscut din numele fișierului</small>}
                      </td>
                      <td data-eticheta="Titlu"><input value={r.titlu} disabled={blocat || r.actiune !== 'document_nou'} onChange={e => schimba(r.cheie, 'titlu', e.target.value)} /></td>
                      <td data-eticheta="Revizia"><b>{r.revizie || '—'}</b></td>
                      <td data-eticheta="Ce se întâmplă">
                        {s ? <span className={s.ok ? 'stare-ok' : 'stare-eroare'}>{s.text}</span>
                          : <><Eticheta stare={ETICHETE[r.actiune]} />{r.mesaj && <small className="linia2">{r.mesaj}</small>}</>}
                      </td>
                      <td>{!blocat && <button className="buton mic" onClick={() => scoate(r.cheie)}>Scoate</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="actiuni stanga">
            <label className="fara-eticheta">După încărcare
              <select value={partajare} onChange={e => setPartajare(e.target.value)} disabled={lucreaza}>
                <option value="">rămân în lucru (S0), le verific și partajez după</option>
                {['S1', 'S2', 'S3', 'S4'].map(k => <option key={k} value={k}>partajează direct: {k} · {CODURI_STARE[k].nume}</option>)}
              </select>
            </label>
            {gata ? <Link className="buton principal" to="..">Gata, înapoi la documente</Link>
              : <button className="buton principal" onClick={porneste} disabled={lucreaza || valide.length === 0}>{lucreaza ? 'Se încarcă…' : `Încarcă ${valide.length} ${valide.length === 1 ? 'document' : 'documente'}`}</button>}
            {randuri.length > valide.length && !gata && <small className="discret">{randuri.length - valide.length} de corectat în tabel</small>}
          </div>
        </>
      )}
    </div>
  );
}
