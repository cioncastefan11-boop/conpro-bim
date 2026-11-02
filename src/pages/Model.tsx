import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { numeRolDocument, type Rol } from '../lib/domeniu';
import type { Atasament, DocumentProiect, Membru, Proiect, RevizieDocument } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import type { ModelDeAfisat, ModelIncarcat } from '../components/Vizualizator';
import { planificaImport, type PlanImport } from '../lib/cobieIfc';

const Vizualizator = lazy(() => import('../components/Vizualizator'));
type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };

const CULORI: Record<string, string> = { A: '#e2e8f0', S: '#94a3b8', M: '#38bdf8', H: '#f97316', E: '#facc15', P: '#22c55e', D: '#14b8a6', C: '#a78bfa' };
const culoare = (rol: string, i: number) => CULORI[rol] ?? ['#f472b6', '#60a5fa', '#34d399', '#fbbf24'][i % 4];
const MB = (b: number | null) => (b == null ? '' : `${(b / 1048576).toLocaleString('ro-RO', { maximumFractionDigits: 1 })} MB`);

type FisierModel = { cheie: string; cod: string; titlu: string; rol: string; revizie: string; cod_stare: string; fisier: Atasament };

export default function Model({ proiect, rolulMeu }: Props) {
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
      setFisiere(ifc.map(x => { const { d, r } = alese.find(y => y.r.id === x.entitate_id)!; return { cheie: x.id, cod: d.cod, titlu: d.titlu, rol: d.rol, revizie: r.revizie, cod_stare: r.cod_stare, fisier: x }; }));
      setEroare(mesajEroare(a.error ?? b.error));
    })();
  }, [proiect.id]);

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
          <Vizualizator modele={modele} onIncarcate={laIncarcare} />
        </Suspense>
      )}

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
