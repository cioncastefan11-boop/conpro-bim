// Observațiile pe model (BCF): lista, fișa cu discuția și stările, importul și exportul .bcfzip.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  PRIORITATI_OBSERVATIE, ROLURI, STARI_OBSERVATIE, TIPURI_OBSERVATIE, codObservatie, formatData, numeRol, numeTipObservatie, zilePana, type Rol,
} from '../lib/domeniu';
import type { Atasament, ComentariuObservatie, Membru, Observatie, Proiect, StareObservatie } from '../lib/tipuri';
import type { TopicBcf } from '../lib/bcf';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import Atasamente, { BUCKET } from '../components/Atasamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
export type DateObs = { obs: Observatie[]; com: ComentariuObservatie[]; capturi: Atasament[] };

export async function incarcaObservatii(proiectId: string): Promise<DateObs & { eroare: string | null }> {
  const [a, b, c] = await Promise.all([
    supabase.from('observatii').select('*').eq('proiect_id', proiectId).order('numar', { ascending: false }),
    supabase.from('comentarii_observatie').select('*').eq('proiect_id', proiectId).order('creat_la'),
    supabase.from('atasamente').select('*').eq('proiect_id', proiectId).eq('entitate', 'observatie').eq('tip_document', 'captura_model'),
  ]);
  const err = a.error ?? b.error ?? c.error;
  return {
    obs: (a.data as Observatie[]) ?? [], com: (b.data as ComentariuObservatie[]) ?? [], capturi: (c.data as Atasament[]) ?? [],
    eroare: err ? (/observatii/.test(err.message) ? 'Rulați în Supabase scriptul 0018_observatii.sql.' : mesajEroare(err)) : null,
  };
}

export const EticObs = ({ o }: { o: Observatie }) => <span className={`eticheta ${STARI_OBSERVATIE[o.stare].ton}`}>{STARI_OBSERVATIE[o.stare].eticheta}</span>;
export const numeMembru = (membri: Membru[], id: string | null) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : null; };
export const cuiI = (o: Observatie, membri: Membru[]) => numeMembru(membri, o.atribuita_catre) ?? (o.atribuita_rol ? numeRol(o.atribuita_rol as Rol) : null);
export const lucreaza = (r?: Rol) => !!r && r !== 'cititor';

export default function Observatii(props: Props) {
  const [d, setD] = useState<DateObs | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => { const r = await incarcaObservatii(props.proiect.id); setEroare(r.eroare); setD(r); }, [props.proiect.id]);
  useEffect(() => { incarca(); }, [incarca]);
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  return (
    <>
      <Eroare text={eroare} />
      <Routes>
        <Route index element={<Lista {...props} d={d} onSchimbat={incarca} />} />
        <Route path=":obsId" element={<Fisa {...props} d={d} onSchimbat={incarca} />} />
      </Routes>
    </>
  );
}

// --------------------------------------------------------------------- Lista, import, export
function Lista({ proiect, membri, rolulMeu, uid, d, onSchimbat }: Props & { d: DateObs; onSchimbat: () => Promise<void> }) {
  const [filtru, setFiltru] = useState<'deschise' | 'ale_mele' | 'toate'>('deschise');
  const [tip, setTip] = useState('');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucru, setLucru] = useState<string | null>(null);
  const rolMeu = rolulMeu as string | undefined;
  const aleMele = (o: Observatie) => o.atribuita_catre === uid || (!o.atribuita_catre && o.atribuita_rol === rolMeu) || o.creat_de === uid;
  const lista = d.obs.filter(o => (filtru === 'toate' || (filtru === 'deschise' ? o.stare !== 'inchisa' : o.stare !== 'inchisa' && aleMele(o))) && (!tip || o.tip === tip));

  async function exporta() {
    setEroare(null); setLucru('Se pregătește fișierul BCF…');
    try {
      const topicuri: TopicBcf[] = [];
      for (const o of lista) {
        const cap = d.capturi.find(a => a.entitate_id === o.id);
        let snapshot: Uint8Array | null = null;
        if (cap) { const { data } = await supabase.storage.from(BUCKET).download(cap.cale); if (data) snapshot = new Uint8Array(await data.arrayBuffer()); }
        const autor = (id: string, ext: string | null) => ext ?? membri.find(m => m.persoana_id === id)?.persoane?.email ?? '';
        topicuri.push({
          guid: o.bcf_guid, tip: o.tip, stare: o.stare, prioritate: o.prioritate, titlu: o.titlu, descriere: o.descriere, termen: o.termen,
          atribuit: membri.find(m => m.persoana_id === o.atribuita_catre)?.persoane?.email ?? (o.atribuita_rol ? numeRol(o.atribuita_rol as Rol) : null),
          creat: o.creat_la, autor: autor(o.creat_de, o.autor_extern), index: o.numar, etichete: [numeTipObservatie(o.tip), ...(o.zona ? [o.zona] : [])],
          comentarii: d.com.filter(c => c.observatie_id === o.id).map(c => ({ guid: c.bcf_guid, data: c.data_externa ?? c.creat_la, autor: autor(c.creat_de, c.autor_extern), text: c.text })),
          punct_vedere: o.punct_vedere, elemente: o.elemente.map(e => e.guid), snapshot,
        });
      }
      const { exportaBcf } = await import('../lib/bcf');
      const bin = await exportaBcf(topicuri, { id: proiect.id, nume: `${proiect.cod} ${proiect.denumire}` });
      const url = URL.createObjectURL(new Blob([bin], { type: 'application/zip' }));
      const a = document.createElement('a'); a.href = url; a.download = `${proiect.cod}-observatii-${new Date().toISOString().slice(0, 10)}.bcfzip`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMesaj(`Exportate ${topicuri.length} observații în format BCF 2.1.`);
    } catch (e) { setEroare((e as Error).message); }
    setLucru(null);
  }

  async function importa(f: File | undefined) {
    if (!f) return;
    setEroare(null); setMesaj(null); setLucru(`Se citește ${f.name}…`);
    try {
      const { importaBcf } = await import('../lib/bcf');
      const topicuri = await importaBcf(await f.arrayBuffer());
      const exista = new Set(d.obs.map(o => o.bcf_guid.toLowerCase()));
      let noi = 0, com = 0;
      for (const t of topicuri) {
        if (exista.has(t.guid)) continue;
        setLucru(`Se importă ${noi + 1} din ${topicuri.length}…`);
        const membru = t.atribuit ? membri.find(m => m.persoane?.email?.toLowerCase() === t.atribuit!.toLowerCase()) : undefined;
        const id = crypto.randomUUID();
        const { error } = await supabase.from('observatii').insert({
          id, proiect_id: proiect.id, bcf_guid: t.guid, tip: t.tip, prioritate: t.prioritate, titlu: t.titlu.slice(0, 300), descriere: t.descriere,
          stare: t.stare === 'inchisa' ? 'inchisa' : t.stare, atribuita_catre: membru?.persoana_id ?? null, termen: t.termen,
          elemente: t.elemente.map(g => ({ guid: g })), punct_vedere: t.punct_vedere, sursa: f.name, autor_extern: t.autor || null, creat_la: t.creat,
        });
        if (error) throw error;
        noi++;
        if (t.comentarii.length) {
          const { error: e2 } = await supabase.from('comentarii_observatie').insert(t.comentarii.map(c => ({
            observatie_id: id, proiect_id: proiect.id, text: c.text, autor_extern: c.autor || null, data_externa: c.data || null,
            bcf_guid: /^[0-9a-f-]{36}$/i.test(c.guid) ? c.guid : crypto.randomUUID() })));
          if (e2) throw e2; com += t.comentarii.length;
        }
        if (t.snapshot && t.stare !== 'inchisa') {
          const cale = `${proiect.id}/observatie/${id}/captura.png`;
          const up = await supabase.storage.from(BUCKET).upload(cale, new Blob([t.snapshot], { type: 'image/png' }), { contentType: 'image/png' });
          if (!up.error) await supabase.from('atasamente').insert({ proiect_id: proiect.id, entitate: 'observatie', entitate_id: id, tip_document: 'captura_model', nume_fisier: 'captura.png', cale, marime: t.snapshot.length });
        }
      }
      setMesaj(`Din ${f.name}: ${noi} observații noi${com ? `, ${com} comentarii` : ''}${topicuri.length - noi ? `; ${topicuri.length - noi} existau deja` : ''}.`);
      await onSchimbat();
    } catch (e) { setEroare(`Fișierul nu a putut fi importat: ${(e as Error).message}`); }
    setLucru(null);
  }

  return (
    <div className="card">
      <div className="antet-card">
        <div>
          <h2>Observațiile pe model</h2>
          <p className="discret">Neconformități, întrebări către proiectant, dispoziții și remedieri, fiecare pe elementele ei din model. Se deschid din <Link to="..">Modelul 3D</Link>: alegeți elementele, apoi „Observație nouă”. Circulă în format BCF cu Revit, Archicad, BIMcollab sau Solibri.</p>
        </div>
        <div className="actiuni">
          {lucreaza(rolulMeu) && <label className="buton buton-fisier">Importă BCF<input type="file" accept=".bcf,.bcfzip,.zip" onChange={e => { importa(e.target.files?.[0]); e.target.value = ''; }} /></label>}
          <button className="buton" onClick={exporta} disabled={!lista.length || !!lucru}>Exportă BCF ({lista.length})</button>
        </div>
      </div>
      {lucru && <p className="mesaj info">{lucru}</p>}
      {mesaj && <p className="mesaj ok">{mesaj}</p>}
      <Eroare text={eroare} />
      <div className="filtre-punct">
        <button className={filtru === 'deschise' ? 'activ' : ''} onClick={() => setFiltru('deschise')}>Deschise ({d.obs.filter(o => o.stare !== 'inchisa').length})</button>
        <button className={filtru === 'ale_mele' ? 'activ' : ''} onClick={() => setFiltru('ale_mele')}>Ale mele</button>
        <button className={filtru === 'toate' ? 'activ' : ''} onClick={() => setFiltru('toate')}>Toate ({d.obs.length})</button>
        <select value={tip} onChange={e => setTip(e.target.value)} aria-label="Tipul"><option value="">toate tipurile</option>{TIPURI_OBSERVATIE.map(t => <option key={t.id} value={t.id}>{t.nume}</option>)}</select>
      </div>
      {!lista.length ? <Gol titlu="Nicio observație aici" /> : (
        <ul className="lista-evenimente">
          {lista.map(o => {
            const z = o.termen && o.stare !== 'inchisa' && o.stare !== 'rezolvata' ? zilePana(o.termen) : null;
            return (
              <li key={o.id} className={o.prioritate === 'critica' || o.prioritate === 'mare' ? 'ev-avarie' : o.tip === 'intrebare' ? 'ev-interventie' : 'ev-seism'}>
                <Link to={o.id}>
                  <span className="cod">{codObservatie(proiect.cod, o.numar)}</span>
                  <span className="tip-ev">{numeTipObservatie(o.tip)}</span>
                  <b>{o.titlu}</b>
                  {o.elemente.length > 0 && <span className="discret">{o.elemente.length} {o.elemente.length === 1 ? 'element' : 'elemente'}</span>}
                  {z != null && z < 0 && <span className="eticheta alerta">termen depășit</span>}
                  <small><span className="discret">{cuiI(o, membri) ?? 'neatribuită'}{o.termen ? ` · ${formatData(o.termen)}` : ''}</span> <EticObs o={o} /></small>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --------------------------------------------------------------------- Fișa
function Fisa({ proiect, membri, rolulMeu, uid, d, onSchimbat }: Props & { d: DateObs; onSchimbat: () => Promise<void> }) {
  const { obsId } = useParams();
  const o = d.obs.find(x => x.id === obsId);
  const [text, setText] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucru, setLucru] = useState(false);
  const [captura, setCaptura] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const cap = useMemo(() => d.capturi.find(a => a.entitate_id === obsId), [d.capturi, obsId]);
  useEffect(() => {
    setCaptura(null);
    if (cap) supabase.storage.from(BUCKET).createSignedUrl(cap.cale, 600).then(r => setCaptura(r.data?.signedUrl ?? null));
  }, [cap]);
  if (!o) return <Gol titlu="Observația nu există"><Link to="..">Observațiile</Link></Gol>;

  const coordoneaza = o.creat_de === uid || rolulMeu === 'diriginte' || rolulMeu === 'administrator';
  const atribuit = o.atribuita_catre === uid || (!o.atribuita_catre && o.atribuita_rol === rolulMeu);
  const com = d.com.filter(c => c.observatie_id === o.id);
  const autor = (id: string, ext: string | null) => ext ?? numeMembru(membri, id) ?? '—';

  async function stare(s: StareObservatie) {
    setEroare(null); setLucru(true);
    const { error } = await supabase.rpc('observatie_stare', { p_id: o!.id, p_stare: s, p_comentariu: text || null });
    setLucru(false);
    if (error) setEroare(mesajEroare(error)); else { setText(''); await onSchimbat(); }
  }
  async function comenteaza(e: FormEvent) {
    e.preventDefault(); if (!text.trim()) return;
    setEroare(null);
    const { error } = await supabase.from('comentarii_observatie').insert({ observatie_id: o!.id, proiect_id: proiect.id, text: text.trim() });
    if (error) setEroare(mesajEroare(error)); else { setText(''); await onSchimbat(); }
  }

  return (
    <div className="card fisa-observatie">
      <p><Link to="..">← Observațiile</Link></p>
      <div className="antet-card">
        <div>
          <span className="cod">{codObservatie(proiect.cod, o.numar)}</span>
          <h2>{o.titlu} <EticObs o={o} /></h2>
          <p className="discret">{numeTipObservatie(o.tip)} · prioritate {PRIORITATI_OBSERVATIE.find(p => p.id === o.prioritate)?.nume.toLowerCase()}</p>
        </div>
        <div className="actiuni">
          {(o.elemente.length > 0 || o.punct_vedere) && <Link className="buton principal" to={`/proiect/${proiect.id}/model?obs=${o.id}`}>Arată în model</Link>}
          {coordoneaza && o.stare !== 'inchisa' && <button className="buton" onClick={() => setEdit(!edit)}>{edit ? 'Închide editarea' : 'Modifică'}</button>}
        </div>
      </div>
      {edit && <Editare o={o} membri={membri} onSalvat={async () => { setEdit(false); await onSchimbat(); }} />}
      <div className="obs-corp">
        <div>
          <table className="tabel-detalii"><tbody>
            {o.descriere && <tr><th>Descrierea</th><td className="text-lung">{o.descriere}</td></tr>}
            <tr><th>Atribuită</th><td>{cuiI(o, membri) ?? '—'}</td></tr>
            <tr><th>Termen</th><td>{o.termen ? formatData(o.termen) : '—'}</td></tr>
            {o.zona && <tr><th>Zona</th><td>{o.zona}</td></tr>}
            <tr><th>Elementele</th><td>{o.elemente.length ? <ul className="lista-guid">{o.elemente.map(e => <li key={e.guid}>{e.nume || e.clasa ? <b>{e.nume || e.clasa}</b> : null} <code>{e.guid}</code></li>)}</ul> : '—'}</td></tr>
            <tr><th>Deschisă de</th><td>{autor(o.creat_de, o.autor_extern)}, {new Date(o.creat_la).toLocaleString('ro-RO')}{o.sursa && o.sursa !== 'aplicatie' ? <span className="discret"> · importată din {o.sursa}</span> : null}</td></tr>
          </tbody></table>
        </div>
        {captura && <figure className="obs-captura"><img src={captura} alt="Captura punctului de vedere din model" /><figcaption className="discret">Punctul de vedere salvat</figcaption></figure>}
      </div>

      <h3>Discuția</h3>
      {!com.length ? <p className="discret">Niciun comentariu.</p> : (
        <ol className="discutie">
          {com.map(c => (
            <li key={c.id} className={c.stare_noua ? `cu-stare s-${c.stare_noua}` : ''}>
              <div className="discutie-cap"><b>{autor(c.creat_de, c.autor_extern)}</b> <span className="discret">{new Date(c.data_externa ?? c.creat_la).toLocaleString('ro-RO')}</span>
                {c.stare_noua && <span className={`eticheta ${STARI_OBSERVATIE[c.stare_noua].ton}`}>{STARI_OBSERVATIE[c.stare_noua].eticheta}</span>}</div>
              <p className="text-lung">{c.text}</p>
            </li>
          ))}
        </ol>
      )}
      {lucreaza(rolulMeu) && (
        <form className="actiuni-reclamatie" onSubmit={comenteaza}>
          <label>Comentariu{o.stare !== 'inchisa' && (atribuit || coordoneaza) ? ' (sau descrierea rezolvării, la „Marchează rezolvată”)' : ''}
            <textarea rows={3} value={text} onChange={e => setText(e.target.value)} /></label>
          <div className="actiuni">
            <button className="buton" disabled={!text.trim()}>Adaugă comentariul</button>
            {o.stare === 'deschisa' && (atribuit || coordoneaza) && <button type="button" className="buton" disabled={lucru} onClick={() => stare('in_lucru')}>Preiau</button>}
            {(o.stare === 'deschisa' || o.stare === 'in_lucru') && (atribuit || coordoneaza) && <button type="button" className="buton principal" disabled={lucru} onClick={() => stare('rezolvata')}>Marchează rezolvată</button>}
            {o.stare === 'rezolvata' && coordoneaza && <button type="button" className="buton principal" disabled={lucru} onClick={() => stare('inchisa')}>Verificat, închide</button>}
            {(o.stare === 'rezolvata' || o.stare === 'inchisa') && (coordoneaza || atribuit) && <button type="button" className="buton" disabled={lucru} onClick={() => stare('deschisa')}>Redeschide</button>}
          </div>
          <Eroare text={eroare} />
        </form>
      )}
      <Atasamente proiectId={proiect.id} entitate="observatie" entitateId={o.id} membri={membri} poateIncarca={lucreaza(rolulMeu) && o.stare !== 'inchisa'}
        tipuri={['poza', 'document']} titlu="Fotografii și documente" gol="Fotografii de pe șantier, schițe, detaliul transmis de proiectant." excludeTipuri={['captura_model']} />
    </div>
  );
}

function Editare({ o, membri, onSalvat }: { o: Observatie; membri: Membru[]; onSalvat: () => Promise<void> }) {
  const [f, setF] = useState({ tip: o.tip, prioritate: o.prioritate, titlu: o.titlu, descriere: o.descriere ?? '', termen: o.termen ?? '', zona: o.zona ?? '',
    atribuire: o.atribuita_catre ? `p:${o.atribuita_catre}` : o.atribuita_rol ? `r:${o.atribuita_rol}` : '' });
  const [eroare, setEroare] = useState<string | null>(null);
  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('observatii').update({
      tip: f.tip, prioritate: f.prioritate, titlu: f.titlu.trim(), descriere: f.descriere.trim() || null, termen: f.termen || null, zona: f.zona.trim() || null,
      atribuita_catre: f.atribuire.startsWith('p:') ? f.atribuire.slice(2) : null, atribuita_rol: f.atribuire.startsWith('r:') ? f.atribuire.slice(2) : null,
    }).eq('id', o.id);
    if (error) setEroare(mesajEroare(error)); else await onSalvat();
  }
  return (
    <form className="formular eveniment-nou cadru-editare" onSubmit={salveaza}>
      <CampuriObservatie f={f} set={(k, v) => setF({ ...f, [k]: v })} membri={membri} />
      <Eroare text={eroare} />
      <div className="actiuni"><button className="buton principal">Salvează</button></div>
    </form>
  );
}

export type CampuriObs = { tip: string; prioritate: string; titlu: string; descriere: string; termen: string; zona: string; atribuire: string };
/** Câmpurile comune formularului nou (din model) și editării. */
export function CampuriObservatie({ f, set, membri }: { f: CampuriObs; set: (k: keyof CampuriObs, v: string) => void; membri: Membru[] }) {
  const roluri = ROLURI.filter(r => !['cititor'].includes(r.id));
  return (
    <>
      <div className="campuri">
        <label>Tipul<select value={f.tip} onChange={e => set('tip', e.target.value)}>{TIPURI_OBSERVATIE.map(t => <option key={t.id} value={t.id}>{t.nume}</option>)}</select></label>
        <label>Prioritatea<select value={f.prioritate} onChange={e => set('prioritate', e.target.value)}>{PRIORITATI_OBSERVATIE.map(t => <option key={t.id} value={t.id}>{t.nume}</option>)}</select></label>
        <label>Termen<input type="date" value={f.termen} onChange={e => set('termen', e.target.value)} /></label>
      </div>
      <p className="discret">{TIPURI_OBSERVATIE.find(t => t.id === f.tip)?.ajutor}</p>
      <label>Pe scurt<input value={f.titlu} onChange={e => set('titlu', e.target.value)} required minLength={3} placeholder="ex. Acoperire cu beton insuficientă la grinda G3" /></label>
      <label>Descrierea<textarea rows={3} value={f.descriere} onChange={e => set('descriere', e.target.value)} /></label>
      <div className="campuri">
        <label>Cine răspunde
          <select value={f.atribuire} onChange={e => set('atribuire', e.target.value)}>
            <option value="">— nimeni anume —</option>
            <optgroup label="Un rol (oricine are rolul)">{roluri.map(r => <option key={r.id} value={`r:${r.id}`}>{r.nume}</option>)}</optgroup>
            <optgroup label="O persoană">{membri.filter(m => m.rol !== 'cititor').map(m => <option key={m.persoana_id} value={`p:${m.persoana_id}`}>{m.persoane?.nume || m.persoane?.email} · {numeRol(m.rol)}</option>)}</optgroup>
          </select>
        </label>
        <label>Zona<input value={f.zona} onChange={e => set('zona', e.target.value)} placeholder="ex. Etaj 1, axele 3–4" /></label>
      </div>
    </>
  );
}
