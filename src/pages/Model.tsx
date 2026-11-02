import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { numeRolDocument, type Rol } from '../lib/domeniu';
import type { Atasament, DocumentProiect, Membru, Proiect, RevizieDocument } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import type { ControlVizualizator, ElementAles, ModelDeAfisat, ModelIncarcat } from '../components/Vizualizator';
import { BUCKET } from '../components/Atasamente';
import Observatii, { CampuriObservatie, EticObs, cuiI, incarcaObservatii, lucreaza, type CampuriObs, type DateObs } from './Observatii';
import { codFam, codObservatie, codPv } from '../lib/domeniu';
import { STARI_ELEMENT, numaraStari, stariElemente, trasabilitate, type DateExecutie, type StareElement } from '../lib/executie';
import { planificaImport, type PlanImport } from '../lib/cobieIfc';

const Vizualizator = lazy(() => import('../components/Vizualizator'));
type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };

const CULORI: Record<string, string> = { A: '#e2e8f0', S: '#94a3b8', M: '#38bdf8', H: '#f97316', E: '#facc15', P: '#22c55e', D: '#14b8a6', C: '#a78bfa' };
const culoare = (rol: string, i: number) => CULORI[rol] ?? ['#f472b6', '#60a5fa', '#34d399', '#fbbf24'][i % 4];
const MB = (b: number | null) => (b == null ? '' : `${(b / 1048576).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} MB`);

type FisierModel = { cheie: string; cod: string; titlu: string; rol: string; revizie: string; cod_stare: string; fisier: Atasament };

export default function Model(props: Props) {
  const [nObs, setNObs] = useState<number | null>(null);
  useEffect(() => { incarcaObservatii(props.proiect.id).then(r => setNObs(r.obs.filter(o => o.stare !== 'inchisa').length)); }, [props.proiect.id]);
  return (
    <>
      <nav className="subfile" aria-label="Modelul">
        <NavLink to="." end>Modelul 3D</NavLink>
        <NavLink to="observatii">Observații pe model{nObs ? ` (${nObs})` : ''}</NavLink>
      </nav>
      <Routes>
        <Route index element={<VedereModel {...props} />} />
        <Route path="observatii/*" element={<Observatii {...props} />} />
      </Routes>
    </>
  );
}

function VedereModel({ proiect, membri, rolulMeu, uid }: Props) {
  const [q] = useSearchParams();
  const obsCeruta = q.get('obs');
  const legCeruta = q.get('leg');          // „pv:<id>”, „turnare:<id>”, „fam:<id>”: venit din fișa documentului
  const cerere = obsCeruta || legCeruta;
  const ctrl = useRef<ControlVizualizator>(null);
  const [selectie, setSelectie] = useState<ElementAles[]>([]);
  const [fisiere, setFisiere] = useState<FisierModel[] | null>(null);
  const [alese, setAlese] = useState<Set<string>>(new Set());
  const [modele, setModele] = useState<ModelDeAfisat[]>([]);
  const [incarcate, setIncarcate] = useState<ModelIncarcat[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [descarca, setDescarca] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from('documente_proiect').select('*').eq('proiect_id', proiect.id).order('cod'),
        supabase.from('revizii_document').select('*').eq('proiect_id', proiect.id).order('creat_la', { ascending: false }),
      ]);
      const docs = (a.data as DocumentProiect[]) ?? [], rev = (b.data as RevizieDocument[]) ?? [];
      // pentru fiecare document: revizia în vigoare sau, dacă nu există, cea mai nouă revizie neînlocuită
      const alese = docs.flatMap(d => { const r = rev.find(x => x.document_id === d.id && x.stare === 'publicat') ?? rev.find(x => x.document_id === d.id && x.stare !== 'arhivat'); return r ? [{ d, r }] : []; });
      const f = alese.length ? await supabase.from('atasamente').select('*').eq('entitate', 'revizie_document').in('entitate_id', alese.map(x => x.r.id)) : { data: [] };
      const ifc = ((f.data as Atasament[]) ?? []).filter(x => /\.ifc$/i.test(x.nume_fisier));
      const lista = ifc.map(x => { const { d, r } = alese.find(y => y.r.id === x.entitate_id)!; return { cheie: x.id, cod: d.cod, titlu: d.titlu, rol: d.rol, revizie: r.revizie, cod_stare: r.cod_stare, fisier: x }; });
      setFisiere(lista);
      setEroare(mesajEroare(a.error ?? b.error));
      // venit din fișa unei observații: se deschid toate modelele
      if (cerere && lista.length) setAlese(new Set(lista.map(f => f.cheie)));
    })();
  }, [proiect.id]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cerere && fisiere?.length && alese.size === fisiere.length && !modele.length) deschide(); }, [alese]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function deschide() {
    setEroare(null);
    const lista = (fisiere ?? []).filter(f => alese.has(f.cheie));
    const noi: ModelDeAfisat[] = [];
    for (const [i, f] of lista.entries()) {
      const exista = modele.find(m => m.cheie === f.cheie);
      if (exista) { noi.push(exista); continue; }
      setDescarca(`Se descarcă ${f.fisier.nume_fisier} (${MB(f.fisier.marime)})…`);
      const { data, error } = await supabase.storage.from('documente').download(f.fisier.cale);
      if (error || !data) { setEroare(`${f.fisier.nume_fisier}: ${error?.message ?? 'nu s-a putut descărca'}`); continue; }
      noi.push({ cheie: f.cheie, nume: `${numeRolDocument(f.rol)} · ${f.revizie}`, culoare: culoare(f.rol, i), date: await data.arrayBuffer() });
    }
    setDescarca(null);
    setModele(noi);
  }
  async function deschideLocal(lista: FileList | null) {
    if (!lista?.length) return;
    const noi = await Promise.all(Array.from(lista).map(async (f, i) => ({ cheie: `local-${f.name}-${f.size}`, nume: f.name, culoare: culoare('', i), date: await f.arrayBuffer() })));
    setModele(m => [...m.filter(x => !x.cheie.startsWith('local-')), ...noi]);
  }
  const laIncarcare = useCallback((m: ModelIncarcat[]) => setIncarcate(m), []);

  return (
    <>
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Modelul 3D</h2>
            <p className="discret">Modelele IFC din documentele proiectului, afișate împreună: arhitectura, structura și instalațiile, fiecare cu culoarea ei.</p>
          </div>
          <label className="buton buton-fisier">
            Deschide un IFC de pe calculator
            <input type="file" accept=".ifc" multiple onChange={e => deschideLocal(e.target.files)} />
          </label>
        </div>
        <Eroare text={eroare} />
        {fisiere === null ? <p className="discret">Se încarcă…</p> : fisiere.length === 0 ? (
          <Gol titlu="Niciun model IFC în documente">
            <p>Adăugați modelul în <Link to="../documente">Documente</Link>, cu tipul M3 (model 3D), și încărcați fișierul .ifc la revizie. Pe planul gratuit Supabase un fișier poate avea cel mult 50 MB: exportați modelul pe discipline.</p>
          </Gol>
        ) : (
          <>
            <ul className="lista-modele">
              {fisiere.map((f, i) => (
                <li key={f.cheie}>
                  <label className="viz-bifa">
                    <input type="checkbox" checked={alese.has(f.cheie)} onChange={e => setAlese(x => { const n = new Set(x); if (e.target.checked) n.add(f.cheie); else n.delete(f.cheie); return n; })} />
                    <span className="viz-culoare" style={{ background: culoare(f.rol, i) }} />
                    <span><b>{f.titlu}</b><small>{f.cod} · rev. {f.revizie} ({f.cod_stare}) · {f.fisier.nume_fisier} · {MB(f.fisier.marime)}</small></span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="actiuni stanga">
              <button className="buton principal" onClick={deschide} disabled={!alese.size || !!descarca}>{descarca ?? `Deschide ${alese.size > 1 ? `${alese.size} modele` : 'modelul'}`}</button>
              {!alese.size && <span className="discret">Bifați unul sau mai multe modele.</span>}
            </div>
          </>
        )}
      </div>

      {modele.length > 0 && (
        <Suspense fallback={<div className="card"><p className="discret">Se încarcă vizualizarea…</p></div>}>
          <Vizualizator ref={ctrl} modele={modele} onIncarcate={laIncarcare} onSelectie={setSelectie} />
        </Suspense>
      )}

      {incarcate.length > 0 && <PanouExecutie proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} ctrl={ctrl} selectie={selectie} legCeruta={legCeruta} />}
      {incarcate.length > 0 && <PanouObservatii proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} ctrl={ctrl} selectie={selectie} obsCeruta={obsCeruta} />}

      {incarcate.length > 0 && <ImportCobie proiect={proiect} rolulMeu={rolulMeu} modele={incarcate} />}
    </>
  );
}

function ImportCobie({ proiect, rolulMeu, modele }: { proiect: Proiect; rolulMeu?: Rol; modele: ModelIncarcat[] }) {
  const [plan, setPlan] = useState<PlanImport | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const poateSpatii = ['administrator', 'proiectant', 'constructor'].includes(rolulMeu ?? '');
  const poateEchip = ['administrator', 'constructor', 'subcontractor'].includes(rolulMeu ?? '');

  const existente = useCallback(async () => {
    const q = (t: string, c: string) => supabase.from(t).select(c).eq('proiect_id', proiect.id);
    const [n, i, t, e] = await Promise.all([q('niveluri', 'id, cod, ifc_guid'), q('incaperi', 'id, cod, ifc_guid'), q('tipuri_echipament', 'id, denumire, ifc_guid'), q('echipamente', 'id, cod, ifc_guid')]);
    const er = n.error ?? i.error ?? t.error ?? e.error;
    if (er) throw er;
    return { niveluri: n.data as never[], incaperi: i.data as never[], tipuri: t.data as never[], echipamente: e.data as never[] };
  }, [proiect.id]);

  const structuri = useMemo(() => modele.map(m => m.structura), [modele]);
  useEffect(() => {
    existente().then(ex => setPlan(planificaImport(structuri, ex))).catch(e => setEroare(
      String(e.message).includes('ifc_guid') ? 'Rulați în Supabase scriptul 0011_model_ifc.sql ca să puteți prelua datele din model.' : mesajEroare(e)));
  }, [structuri, existente]);

  if (!poateSpatii && !poateEchip) return null;

  async function preia() {
    if (!plan) return;
    setLucreaza(true); setEroare(null); setMesaj(null);
    try {
      let nNiv = 0, nInc = 0, nTip = 0, nEch = 0;
      if (poateSpatii && plan.niveluri.length) {
        const { error } = await supabase.from('niveluri').insert(plan.niveluri.map(n => ({ proiect_id: proiect.id, cod: n.cod, denumire: n.denumire, cota: n.cota, ordine: n.ordine, ifc_guid: n.guid })));
        if (error) throw error; nNiv = plan.niveluri.length;
      }
      const ex = await existente();
      const nivel = (guid: string) => (ex.niveluri as { id: string; ifc_guid: string }[]).find(x => x.ifc_guid === guid)?.id;
      if (poateSpatii && plan.incaperi.length) {
        const rand = plan.incaperi.filter(i => nivel(i.nivelGuid)).map(i => ({ proiect_id: proiect.id, nivel_id: nivel(i.nivelGuid), cod: i.cod, denumire: i.denumire, arie: i.arie, ifc_guid: i.guid }));
        if (rand.length) { const { error } = await supabase.from('incaperi').insert(rand); if (error) throw error; nInc = rand.length; }
      }
      if (poateEchip && plan.echipamente.length) {
        const noi = plan.tipuri.filter(t => !(ex.tipuri as { denumire: string }[]).some(x => x.denumire.toLowerCase() === t.denumire.toLowerCase()));
        if (noi.length) {
          const { error } = await supabase.from('tipuri_echipament').insert(noi.map(t => ({ proiect_id: proiect.id, denumire: t.denumire, categorie: t.categorie, producator: t.producator, model: t.model, ifc_guid: t.guid })));
          if (error) throw error; nTip = noi.length;
        }
        const ex2 = await existente();
        const tip = (k: string) => { const t = plan.tipuri.find(x => x.cheie === k)!; return (ex2.tipuri as { id: string; denumire: string }[]).find(x => x.denumire.toLowerCase() === t.denumire.toLowerCase())?.id; };
        const inc = (g: string | null) => (g ? (ex2.incaperi as { id: string; ifc_guid: string }[]).find(x => x.ifc_guid === g)?.id ?? null : null);
        const { error } = await supabase.from('echipamente').insert(plan.echipamente.map(e => ({ proiect_id: proiect.id, tip_id: tip(e.tipCheie), incapere_id: inc(e.spatiuGuid), cod: e.cod, ifc_guid: e.guid })));
        if (error) throw error; nEch = plan.echipamente.length;
      }
      setMesaj(`Preluate în COBie: ${nNiv} niveluri, ${nInc} încăperi, ${nTip} tipuri și ${nEch} echipamente. Completați producătorul, garanția și mentenanța în tabul Echipamente.`);
      setPlan(planificaImport(structuri, await existente()));
    } catch (e) {
      setEroare(mesajEroare(e as { message?: string }));
    }
    setLucreaza(false);
  }

  const total = plan ? (poateSpatii ? plan.niveluri.length + plan.incaperi.length : 0) + (poateEchip ? plan.echipamente.length : 0) : 0;
  return (
    <div className="card">
      <h2>Preluare în COBie</h2>
      <p className="discret">Nivelurile, spațiile și echipamentele din modelele deschise trec în inventarul pentru exploatare (tabul Echipamente), fără să le mai introduceți de mână. Fiecare păstrează identificatorul din model, deci o nouă preluare adaugă doar ce e nou.</p>
      <Eroare text={eroare} />
      {mesaj && <p className="mesaj ok">{mesaj}</p>}
      {plan && (
        <>
          <div className="kpi-rand">
            {poateSpatii && <div className="kpi"><span>Niveluri noi</span><b>{plan.niveluri.length}</b><small>{plan.existente.niveluri} deja în proiect</small></div>}
            {poateSpatii && <div className="kpi"><span>Încăperi noi</span><b>{plan.incaperi.length}</b><small>{plan.existente.incaperi} deja în proiect{plan.faraNivel ? `, ${plan.faraNivel} fără nivel` : ''}</small></div>}
            {poateEchip && <div className="kpi"><span>Echipamente noi</span><b>{plan.echipamente.length}</b><small>{plan.tipuri.length} tipuri · {plan.existente.echipamente} deja în proiect</small></div>}
          </div>
          {poateEchip && plan.echipamente.length > 0 && (
            <details className="previzualizare-import">
              <summary>Ce se preia</summary>
              <ul>{plan.tipuri.map(t => <li key={t.cheie}><b>{t.denumire}</b>{t.categorie ? ` · ${t.categorie}` : ''}: {plan.echipamente.filter(e => e.tipCheie === t.cheie).map(e => e.cod).join(', ')}</li>)}</ul>
            </details>
          )}
          <div className="actiuni stanga">
            <button className="buton principal" onClick={preia} disabled={lucreaza || total === 0}>{lucreaza ? 'Se preia…' : total ? 'Preia în COBie' : 'Nimic nou de preluat'}</button>
            {!poateEchip && <small className="discret">Echipamentele le preia constructorul.</small>}
            {!poateSpatii && <small className="discret">Nivelurile și încăperile le preia proiectantul sau constructorul.</small>}
          </div>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- Observațiile, lângă model
function PanouObservatii({ proiect, membri, rolulMeu, ctrl, selectie, obsCeruta }: Props & {
  ctrl: React.RefObject<ControlVizualizator>; selectie: ElementAles[]; obsCeruta: string | null;
}) {
  const [d, setD] = useState<DateObs | null>(null);
  const [nou, setNou] = useState(false);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const gol: CampuriObs = { tip: 'neconformitate', prioritate: 'normala', titlu: '', descriere: '', termen: '', zona: '', atribuire: 'r:proiectant' };
  const [f, setF] = useState<CampuriObs>(gol);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucru, setLucru] = useState(false);
  const [activa, setActiva] = useState<string | null>(null);
  const incarca = useCallback(async () => { const r = await incarcaObservatii(proiect.id); setD(r); if (r.eroare) setEroare(r.eroare); }, [proiect.id]);
  useEffect(() => { incarca(); }, [incarca]);

  const arata = useCallback(async (id: string) => {
    const o = d?.obs.find(x => x.id === id); if (!o || !ctrl.current) return;
    setActiva(id);
    const n = await ctrl.current.arata(o.punct_vedere, o.elemente.map(e => e.guid));
    setMesaj(o.elemente.length && n < o.elemente.length ? `${n} din ${o.elemente.length} elemente găsite în modelele deschise (deschideți și celelalte discipline).` : null);
  }, [d, ctrl]);
  // venit din fișa observației: o arătăm imediat ce modelele sunt gata
  useEffect(() => { if (obsCeruta && d && ctrl.current && activa !== obsCeruta) arata(obsCeruta); }, [obsCeruta, d, arata, activa, ctrl]);

  async function salveaza(e: FormEvent) {
    e.preventDefault(); if (!ctrl.current) return;
    setEroare(null); setLucru(true);
    try {
      const { punct_vedere, captura } = ctrl.current.capteaza();
      const id = crypto.randomUUID();
      const { error } = await supabase.from('observatii').insert({
        id, proiect_id: proiect.id, tip: f.tip, prioritate: f.prioritate, titlu: f.titlu.trim(), descriere: f.descriere.trim() || null, termen: f.termen || null,
        zona: f.zona.trim() || null, atribuita_catre: f.atribuire.startsWith('p:') ? f.atribuire.slice(2) : null, atribuita_rol: f.atribuire.startsWith('r:') ? f.atribuire.slice(2) : null,
        elemente: selectie.map(x => ({ guid: x.guid, nume: x.nume, clasa: x.clasa })), punct_vedere,
      });
      if (error) throw error;
      const png = await captura();
      if (png) {
        const cale = `${proiect.id}/observatie/${id}/captura.png`;
        const up = await supabase.storage.from(BUCKET).upload(cale, png, { contentType: 'image/png' });
        if (!up.error) await supabase.from('atasamente').insert({ proiect_id: proiect.id, entitate: 'observatie', entitate_id: id, tip_document: 'captura_model', nume_fisier: 'captura.png', cale, marime: png.size });
      }
      setF(gol); setNou(false); setMesaj('Observația a fost deschisă, cu punctul de vedere și captura.');
      await incarca();
    } catch (er) { setEroare(mesajEroare(er as { message?: string })); }
    setLucru(false);
  }

  const deschise = (d?.obs ?? []).filter(o => o.stare !== 'inchisa');
  return (
    <div className="card panou-observatii">
      <div className="antet-card">
        <div>
          <h2>Observații pe model</h2>
          <p className="discret">Alegeți elementele în model (Shift sau Ctrl + clic pentru mai multe), așezați vederea, apoi deschideți observația: se salvează elementele, camera și o captură.</p>
        </div>
        <div className="actiuni">
          <Link className="buton" to="observatii">Toate observațiile</Link>
          {lucreaza(rolulMeu) && !nou && <button className="buton principal" onClick={() => { setNou(true); setMesaj(null); }}>Observație nouă{selectie.length ? ` (${selectie.length} ${selectie.length === 1 ? 'element' : 'elemente'})` : ''}</button>}
        </div>
      </div>
      {mesaj && <p className="mesaj info">{mesaj}</p>}
      <Eroare text={eroare} />
      {nou && (
        <form className="formular eveniment-nou cadru-editare" onSubmit={salveaza}>
          <p className="discret">{selectie.length ? <>Elementele alese: <b>{selectie.map(x => x.nume || x.clasa).join(', ')}</b></> : 'Niciun element ales: observația se leagă doar de punctul de vedere.'}</p>
          <CampuriObservatie f={f} set={(k, v) => setF({ ...f, [k]: v })} membri={membri} />
          <div className="actiuni">
            <button type="button" className="buton" onClick={() => setNou(false)}>Renunță</button>
            <button className="buton principal" disabled={lucru}>{lucru ? 'Se salvează…' : 'Deschide observația'}</button>
          </div>
        </form>
      )}
      {!deschise.length ? <p className="discret">Nicio observație deschisă.</p> : (
        <ul className="lista-evenimente">
          {deschise.map(o => (
            <li key={o.id} className={activa === o.id ? 'ev-avarie activa' : 'ev-seism'}>
              <div className="rand-obs">
                <span className="cod">{codObservatie(proiect.cod, o.numar)}</span>
                <b>{o.titlu}</b>
                <small className="discret">{cuiI(o, membri) ?? 'neatribuită'}</small>
                <EticObs o={o} />
                <span className="actiuni-mici">
                  {(o.elemente.length > 0 || o.punct_vedere) && <button className="legatura" onClick={() => arata(o.id)}>Arată</button>}
                  <Link to={`observatii/${o.id}`}>Fișa</Link>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- Execuția pe model și legăturile
type DocLegabil = { id: string; eticheta: string };
function PanouExecutie({ proiect, rolulMeu, ctrl, selectie, legCeruta }: Props & {
  ctrl: React.RefObject<ControlVizualizator>; selectie: ElementAles[]; legCeruta: string | null;
}) {
  const [d, setD] = useState<DateExecutie | null>(null);
  const [docs, setDocs] = useState<{ pv: DocLegabil[]; turnare: DocLegabil[]; fam: DocLegabil[] }>({ pv: [], turnare: [], fam: [] });
  const [colorat, setColorat] = useState(false);
  const [tinta, setTinta] = useState<string>('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [aratat, setAratat] = useState<string | null>(null);

  const incarca = useCallback(async () => {
    const id = proiect.id;
    const [l, e, p, t, f, o] = await Promise.all([
      supabase.from('elemente_legate').select('entitate, entitate_id, guid, nume, clasa').eq('proiect_id', id),
      supabase.from('elemente_executate').select('guid, executat_la').eq('proiect_id', id),
      supabase.from('procese_verbale').select('id, numar, tip, obiect, stare').eq('proiect_id', id).order('numar', { ascending: false }),
      supabase.from('turnari').select('id, numar, element, data').eq('proiect_id', id).order('numar', { ascending: false }),
      supabase.from('fam').select('id, numar, revizie, material, stare').eq('proiect_id', id).order('numar', { ascending: false }),
      supabase.from('observatii').select('id, numar, stare, elemente').eq('proiect_id', id),
    ]);
    const err = l.error ?? e.error;
    if (err) { setEroare(/elemente_/.test(err.message) ? 'Rulați în Supabase scriptul 0019_legaturi_model.sql ca să legați elementele de documente.' : mesajEroare(err)); return; }
    type Pv = { id: string; numar: number; tip: string; obiect: string; stare: string };
    type Tu = { id: string; numar: number; element: string; data: string };
    type Fa = { id: string; numar: number; revizie: number; material: string; stare: string };
    const pvs = (p.data as Pv[]) ?? [], tu = (t.data as Tu[]) ?? [], fa = (f.data as Fa[]) ?? [];
    setD({ legaturi: (l.data as DateExecutie['legaturi']) ?? [], executate: (e.data as DateExecutie['executate']) ?? [], pvs, turnari: tu,
      observatii: ((o.data as DateExecutie['observatii']) ?? []) });
    setDocs({
      pv: pvs.filter(x => x.stare !== 'anulat').map(x => ({ id: x.id, eticheta: `${codPv(proiect.cod, x.numar)} · ${x.obiect}` })),
      turnare: tu.map(x => ({ id: x.id, eticheta: `Turnarea nr. ${x.numar} · ${x.element}` })),
      fam: fa.map(x => ({ id: x.id, eticheta: `${codFam(proiect.cod, x.numar, x.revizie)} · ${x.material}` })),
    });
  }, [proiect.id, proiect.cod]);
  useEffect(() => { incarca(); }, [incarca]);

  const stari = useMemo(() => (d ? stariElemente(d) : new Map<string, StareElement>()), [d]);
  const numar = numaraStari(stari);
  useEffect(() => {
    ctrl.current?.coloreaza(colorat ? new Map([...stari].map(([g, s]) => [g, STARI_ELEMENT[s].culoare])) : null);
  }, [colorat, stari, ctrl]);

  // venit din fișa unui PV / turnări / FAM: arătăm elementele lui
  useEffect(() => {
    if (!legCeruta || !d || !ctrl.current || aratat === legCeruta) return;
    const [ent, id] = legCeruta.split(':');
    const g = d.legaturi.filter(x => x.entitate === ent && x.entitate_id === id).map(x => x.guid);
    setAratat(legCeruta);
    ctrl.current.arata(null, g).then(n => setMesaj(`${n} din ${g.length} elemente legate găsite în modelele deschise.`));
  }, [legCeruta, d, ctrl, aratat]);

  const poateExecuta = rolulMeu === 'constructor' || rolulMeu === 'subcontractor' || rolulMeu === 'diriginte';
  const poateLega = !!rolulMeu && !['beneficiar', 'cititor', 'laborator', 'administrator_cladire'].includes(rolulMeu);
  const optiuni: { grup: string; ent: 'pv' | 'turnare' | 'fam'; lista: DocLegabil[] }[] = [
    { grup: 'Procese verbale', ent: 'pv', lista: docs.pv },
    ...(rolulMeu !== 'proiectant' ? [{ grup: 'Turnări (condica de betoane)', ent: 'turnare' as const, lista: docs.turnare }] : []),
    { grup: 'Materiale (FAM)', ent: 'fam', lista: docs.fam },
  ];

  async function leaga() {
    if (!tinta || !selectie.length) return;
    setEroare(null); setMesaj(null);
    const [ent, id] = tinta.split(':');
    const deja = new Set(d?.legaturi.filter(x => x.entitate === ent && x.entitate_id === id).map(x => x.guid));
    const noi = selectie.filter(x => x.guid && !deja.has(x.guid));
    if (!noi.length) { setMesaj('Elementele alese sunt deja legate de acest document.'); return; }
    const { error } = await supabase.from('elemente_legate').insert(noi.map(x => ({ proiect_id: proiect.id, entitate: ent, entitate_id: id, guid: x.guid, nume: x.nume || null, clasa: x.clasa || null })));
    if (error) { setEroare(mesajEroare(error)); return; }
    setMesaj(`${noi.length} ${noi.length === 1 ? 'element legat' : 'elemente legate'} de ${optiuni.flatMap(o => o.lista).find(x => x.id === id)?.eticheta}.`);
    await incarca();
  }
  async function executa() {
    setEroare(null); setMesaj(null);
    const deja = new Set(d?.executate.map(x => x.guid));
    const noi = selectie.filter(x => x.guid && !deja.has(x.guid));
    if (!noi.length) { setMesaj('Elementele alese sunt deja marcate executate.'); return; }
    const { error } = await supabase.from('elemente_executate').insert(noi.map(x => ({ proiect_id: proiect.id, guid: x.guid, nume: x.nume || null })));
    if (error) { setEroare(mesajEroare(error)); return; }
    setMesaj(`${noi.length} ${noi.length === 1 ? 'element marcat executat' : 'elemente marcate executate'}.`);
    await incarca();
  }

  const unul = selectie.length === 1 && d ? trasabilitate(d, selectie[0].guid) : null;
  const famLegate = unul ? unul.fam.map(id => docs.fam.find(x => x.id === id)).filter(Boolean) as DocLegabil[] : [];

  return (
    <div className="card panou-executie">
      <div className="antet-card">
        <div>
          <h2>Execuția pe model</h2>
          <p className="discret">Elementele legate de procese verbale, turnări și FAM-uri, și starea lor: verificat (PV semnat), în verificare, executat, cu observație deschisă.</p>
        </div>
        <label className="bifa"><input type="checkbox" checked={colorat} onChange={e => setColorat(e.target.checked)} /> Colorează modelul după starea execuției</label>
      </div>
      {colorat && (
        <div className="legenda-executie">
          {(Object.keys(STARI_ELEMENT) as StareElement[]).map(k => <span key={k}><i style={{ background: STARI_ELEMENT[k].culoare }} />{STARI_ELEMENT[k].nume} <b>{numar[k]}</b></span>)}
          <span><i className="fantoma" />Fără informații</span>
        </div>
      )}
      {mesaj && <p className="mesaj info">{mesaj}</p>}
      <Eroare text={eroare} />

      {!selectie.length ? <p className="discret">Alegeți unul sau mai multe elemente în model (Shift / Ctrl + clic) ca să le legați de un document sau să vedeți ce documente are fiecare.</p> : (
        <div className="executie-selectie">
          <p><b>{selectie.length === 1 ? selectie[0].nume || 'Elementul ales' : `${selectie.length} elemente alese`}</b>
            {selectie.length === 1 && stari.get(selectie[0].guid) && <> · <span style={{ color: STARI_ELEMENT[stari.get(selectie[0].guid)!].culoare, fontWeight: 600 }}>{STARI_ELEMENT[stari.get(selectie[0].guid)!].nume}</span></>}</p>
          {unul && (
            <ul className="trasabilitate">
              {unul.pvs.map(p => <li key={p.id}>Proces verbal <Link to={`../pv/${p.id}`}>{codPv(proiect.cod, p.numar)}</Link> <span className="discret">({p.stare === 'semnat' ? 'semnat' : p.stare.replace('_', ' ')})</span></li>)}
              {unul.turnari.map(t => <li key={t.id}>Turnarea <Link to={`../beton/${t.id}`}>nr. {t.numar}</Link></li>)}
              {famLegate.map(f => <li key={f.id}>Material: <Link to={`../fam/${f.id}`}>{f.eticheta}</Link></li>)}
              {unul.executat && <li>Marcat executat la {new Date(unul.executat).toLocaleDateString('ro-RO')}</li>}
              {unul.observatii.map(o => <li key={o.id}>Observație <Link to={`observatii/${o.id}`}>{codObservatie(proiect.cod, o.numar)}</Link> <span className="discret">({o.stare === 'inchisa' ? 'închisă' : 'deschisă'})</span></li>)}
              {!unul.pvs.length && !unul.turnari.length && !famLegate.length && !unul.executat && !unul.observatii.length && <li className="discret">Niciun document legat încă.</li>}
            </ul>
          )}
          {(poateLega || poateExecuta) && (
            <div className="rand-formular">
              {poateLega && <>
                <label>Leagă de
                  <select value={tinta} onChange={e => setTinta(e.target.value)}>
                    <option value="">— alegeți documentul —</option>
                    {optiuni.map(o => <optgroup key={o.ent} label={o.grup}>{o.lista.map(x => <option key={x.id} value={`${o.ent}:${x.id}`}>{x.eticheta}</option>)}</optgroup>)}
                  </select>
                </label>
                <button className="buton principal" disabled={!tinta} onClick={leaga}>Leagă</button>
              </>}
              {poateExecuta && <button className="buton" onClick={executa}>Marchează executate</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
