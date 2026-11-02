// Stadiul 7 · exploatarea construcției (Legea 169/2026, ISO 19650-3):
// trecerea în exploatare după recepție și jurnalul evenimentelor.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { TIPURI_EVENIMENT, codEveniment, formatData, laIso, azi, numeEveniment, zilePana, type Rol } from '../lib/domeniu';
import type { EvenimentExploatare, Membru, Proiect, TipEveniment } from '../lib/tipuri';
import { incarcaDateProiect } from '../lib/dateProiect';
import { htmlJurnalEvenimente } from '../lib/carte';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string; onSchimbat: () => void };
type RecAprobata = { id: string; aprobat_la: string; garantie_pana: string | null };

export default function Exploatare(props: Props) {
  const [rec, setRec] = useState<RecAprobata | null | undefined>(undefined);
  const [ev, setEv] = useState<EvenimentExploatare[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const [r, e] = await Promise.all([
      supabase.rpc('receptie_terminare_aprobata', { p: props.proiect.id }),
      props.proiect.exploatare_din
        ? supabase.from('evenimente_exploatare').select('*').eq('proiect_id', props.proiect.id).order('numar', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (r.error) setEroare(r.error.message.includes('receptie_terminare_aprobata') ? 'Rulați în Supabase scriptul 0014_exploatare.sql.' : mesajEroare(r.error));
    else setEroare(mesajEroare(e.error));
    setRec(((r.data as RecAprobata[] | null) ?? [])[0] ?? null);
    setEv((e.data as EvenimentExploatare[]) ?? []);
  }, [props.proiect.id, props.proiect.exploatare_din]);
  useEffect(() => { incarca(); }, [incarca]);

  if (rec === undefined) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  if (!props.proiect.exploatare_din) return <><Eroare text={eroare} /><Trecere {...props} rec={rec} /></>;
  return (
    <>
      <Eroare text={eroare} />
      <Routes>
        <Route index element={<Jurnal {...props} rec={rec} ev={ev} />} />
        <Route path="nou" element={<EvenimentNou {...props} ev={ev} onSalvat={incarca} />} />
        <Route path=":evId" element={<Detaliu {...props} ev={ev} />} />
      </Routes>
    </>
  );
}

const poateTrece = (rol?: Rol) => rol === 'beneficiar' || rol === 'administrator';
const poateScrie = (rol?: Rol) => !!rol && rol !== 'cititor';

// --------------------------------------------------------------------- Trecerea în exploatare
function Trecere({ proiect, rolulMeu, rec, onSchimbat }: Props & { rec: RecAprobata | null }) {
  const [data, setData] = useState(laIso(azi()));
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  async function trece(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const { error } = await supabase.rpc('trece_in_exploatare', { p_proiect: proiect.id, p_data: data });
    setLucreaza(false);
    if (error) setEroare(mesajEroare(error)); else onSchimbat();
  }

  return (
    <div className="card exploatare-trecere">
      <h2>Exploatarea construcției</h2>
      <p>După recepția la terminarea lucrărilor, construcția intră în <b>stadiul 7 · exploatarea</b>. De atunci:</p>
      <ul className="lista-obligatii">
        <li>proprietarul (sau administratorul, la o asociație de proprietari) <b>păstrează Cartea tehnică și o completează la zi</b>;</li>
        <li>prevederile din Cartea tehnică despre exploatare sunt obligatorii pentru beneficiar, administrator și utilizatori;</li>
        <li>beneficiarul răspunde de <b>urmărirea comportării în timp</b> (pentru construcțiile din CC2–CC4), la intervale de cel mult un an;</li>
        <li>orice eveniment care poate afecta construcția (avarii, seisme, intervenții) se consemnează în <b>jurnalul evenimentelor</b>.</li>
      </ul>
      {!rec ? (
        <p className="mesaj info">Construcția trece în exploatare după ce recepția la terminarea lucrărilor (a întregii construcții) e admisă și aprobată de beneficiar. <Link to="../receptie">Mergeți la Recepție</Link>.</p>
      ) : poateTrece(rolulMeu) ? (
        <form className="rand-formular" onSubmit={trece}>
          <p className="discret">Recepția la terminarea lucrărilor a fost aprobată la {formatData(rec.aprobat_la.slice(0, 10))}{rec.garantie_pana ? `; garanția de bună execuție curge până la ${formatData(rec.garantie_pana)}` : ''}.</p>
          <label>Data intrării în exploatare
            <input type="date" value={data} min={rec.aprobat_la.slice(0, 10)} max={laIso(azi())} onChange={e => setData(e.target.value)} required />
          </label>
          <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se înregistrează…' : 'Trece construcția în exploatare'}</button>
        </form>
      ) : (
        <p className="mesaj info">Recepția e aprobată. Trecerea în exploatare o face beneficiarul sau administratorul proiectului.</p>
      )}
      <Eroare text={eroare} />
    </div>
  );
}

// --------------------------------------------------------------------- Jurnalul
function Jurnal({ proiect, membri, rolulMeu, rec, ev }: Props & { rec: RecAprobata | null; ev: EvenimentExploatare[] }) {
  const [tip, setTip] = useState('');
  const lista = tip ? ev.filter(e => e.tip === tip) : ev;
  const nume = (id: string) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : '—'; };
  const garantie = rec?.garantie_pana;
  const zileGarantie = garantie ? zilePana(garantie) : null;
  const expertiza = ev.filter(e => e.necesita_expertiza);

  async function tipareste() {
    const d = await incarcaDateProiect(proiect, membri);
    const url = URL.createObjectURL(new Blob([htmlJurnalEvenimente(d)], { type: 'text/html' }));
    window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <>
      <div className="rezumat-exploatare">
        <div><span>În exploatare din</span><b>{formatData(proiect.exploatare_din)}</b></div>
        <div className={zileGarantie != null && zileGarantie < 90 ? 'atentie' : ''}>
          <span>Garanția de bună execuție</span>
          <b>{garantie ? (zileGarantie! >= 0 ? `până la ${formatData(garantie)}` : `expirată la ${formatData(garantie)}`) : '—'}</b>
          {zileGarantie != null && zileGarantie >= 0 && <small>{zileGarantie} zile; defectele apărute acum se semnalează constructorului</small>}
        </div>
        <div><span>Evenimente consemnate</span><b>{ev.length}</b>{expertiza.length > 0 && <small className="alerta">{expertiza.length} cer expertiză</small>}</div>
      </div>

      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Jurnalul evenimentelor</h2>
            <p className="discret">Tot ce poate influența siguranța și durabilitatea construcției. Intrările nu se modifică; o greșeală se corectează cu o intrare nouă.</p>
          </div>
          <div className="actiuni">
            <button className="buton" onClick={tipareste}>Tipărește jurnalul</button>
            {poateScrie(rolulMeu) && <Link className="buton principal" to="nou">Eveniment nou</Link>}
          </div>
        </div>
        {ev.length > 0 && (
          <div className="filtre-punct">
            <button className={!tip ? 'activ' : ''} onClick={() => setTip('')}>Toate</button>
            {TIPURI_EVENIMENT.filter(t => ev.some(e => e.tip === t.id)).map(t =>
              <button key={t.id} className={tip === t.id ? 'activ' : ''} onClick={() => setTip(t.id)}>{t.nume}</button>)}
          </div>
        )}
        {!lista.length ? <Gol titlu="Niciun eveniment consemnat">Consemnați aici avariile, seismele, inundațiile, intervențiile și inspecțiile, cu fotografii.</Gol> : (
          <ul className="lista-evenimente">
            {lista.map(e => (
              <li key={e.id} className={`ev-${e.tip}`}>
                <Link to={e.id}>
                  <span className="cod">{codEveniment(proiect.cod, e.numar)}</span>
                  <span className="data">{formatData(e.data_eveniment)}</span>
                  <span className="tip-ev">{numeEveniment(e.tip)}</span>
                  <b>{e.titlu}</b>
                  {e.zona && <span className="discret">{e.zona}</span>}
                  {e.necesita_expertiza && <span className="eticheta alerta">Necesită expertiză</span>}
                  {e.corecteaza_id && <span className="eticheta neutru">Corecție</span>}
                  <small className="discret">{nume(e.creat_de)}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// --------------------------------------------------------------------- Eveniment nou
function EvenimentNou({ proiect, rolulMeu, ev, onSalvat }: Props & { ev: EvenimentExploatare[]; onSalvat: () => Promise<void> }) {
  const nav = useNavigate();
  const [f, setF] = useState({ tip: 'avarie' as TipEveniment, data_eveniment: laIso(azi()), titlu: '', zona: '', descriere: '', efecte: '', masuri: '', executant: '', necesita_expertiza: false, corecteaza_id: '' });
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const ajutor = useMemo(() => TIPURI_EVENIMENT.find(t => t.id === f.tip)?.ajutor, [f.tip]);

  if (!poateScrie(rolulMeu)) return <Gol titlu="Evenimentele le consemnează membrii echipei" />;

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const id = crypto.randomUUID();
    const t = (s: string) => s.trim() || null;
    const { error } = await supabase.from('evenimente_exploatare').insert({
      id, proiect_id: proiect.id, tip: f.tip, data_eveniment: f.data_eveniment, titlu: f.titlu.trim(), descriere: f.descriere.trim(),
      zona: t(f.zona), efecte: t(f.efecte), masuri: t(f.masuri), executant: t(f.executant), necesita_expertiza: f.necesita_expertiza,
      corecteaza_id: f.corecteaza_id || null,
    });
    setLucreaza(false);
    if (error) { setEroare(mesajEroare(error)); return; }
    await onSalvat();
    nav(`../${id}`);
  }

  return (
    <form className="card formular eveniment-nou" onSubmit={salveaza}>
      <h2>Eveniment nou</h2>
      <p className="discret">După salvare puteți atașa fotografii și documente (raport de expertiză, deviz, procesul verbal al intervenției).</p>
      <div className="campuri">
        <label>Tipul
          <select value={f.tip} onChange={e => set('tip', e.target.value as TipEveniment)}>
            {TIPURI_EVENIMENT.map(t => <option key={t.id} value={t.id}>{t.nume}</option>)}
          </select>
        </label>
        <label>Data evenimentului<input type="date" value={f.data_eveniment} max={laIso(azi())} onChange={e => set('data_eveniment', e.target.value)} required /></label>
        <label>Zona / elementul<input value={f.zona} onChange={e => set('zona', e.target.value)} placeholder="ex. Corp A, terasa, axele 3–5" /></label>
      </div>
      <p className="discret">{ajutor}</p>
      <label>Pe scurt<input value={f.titlu} onChange={e => set('titlu', e.target.value)} required minLength={3} placeholder="ex. Infiltrație în tavanul de la etajul 4" /></label>
      <label>Ce s-a întâmplat<textarea rows={3} value={f.descriere} onChange={e => set('descriere', e.target.value)} required minLength={5} /></label>
      <label>Efecte constatate asupra construcției<textarea rows={2} value={f.efecte} onChange={e => set('efecte', e.target.value)} placeholder="Degradări, fisuri, deplasări; sau „fără efecte vizibile”." /></label>
      <label>Măsuri luate sau propuse<textarea rows={2} value={f.masuri} onChange={e => set('masuri', e.target.value)} /></label>
      <div className="campuri">
        <label>Executantul intervenției / expertul<input value={f.executant} onChange={e => set('executant', e.target.value)} /></label>
        {ev.length > 0 && (
          <label>Corectează intrarea
            <select value={f.corecteaza_id} onChange={e => set('corecteaza_id', e.target.value)}>
              <option value="">— nu e o corecție —</option>
              {ev.map(x => <option key={x.id} value={x.id}>{codEveniment(proiect.cod, x.numar)} · {x.titlu}</option>)}
            </select>
          </label>
        )}
      </div>
      <label className="bifa"><input type="checkbox" checked={f.necesita_expertiza} onChange={e => set('necesita_expertiza', e.target.checked)} />
        Necesită expertiză tehnică (degradări care pot afecta rezistența, stabilitatea sau siguranța)</label>
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link className="buton" to="..">Renunță</Link>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se salvează…' : 'Consemnează evenimentul'}</button>
      </div>
      <p className="nota">Evenimentul nu se mai poate modifica după salvare; intră în jurnal cu numele dumneavoastră, data și ora.</p>
    </form>
  );
}

// --------------------------------------------------------------------- Detaliu
function Detaliu({ proiect, membri, rolulMeu, uid, ev }: Props & { ev: EvenimentExploatare[] }) {
  const { evId } = useParams();
  const e = ev.find(x => x.id === evId);
  if (!e) return <Gol titlu="Evenimentul nu există" />;
  const p = membri.find(m => m.persoana_id === e.creat_de)?.persoane;
  const cor = e.corecteaza_id ? ev.find(x => x.id === e.corecteaza_id) : null;
  const corectii = ev.filter(x => x.corecteaza_id === e.id);
  const poateAtasa = e.creat_de === uid || rolulMeu === 'beneficiar' || rolulMeu === 'administrator' || rolulMeu === 'administrator_cladire';
  return (
    <div className="card">
      <p><Link to="..">← Jurnalul evenimentelor</Link></p>
      <span className="cod">{codEveniment(proiect.cod, e.numar)}</span>
      <h2>{numeEveniment(e.tip)}: {e.titlu}</h2>
      {e.necesita_expertiza && <p className="mesaj alerta">Necesită expertiză tehnică.</p>}
      {corectii.map(c => <p key={c.id} className="mesaj info">Corectat prin <Link to={`../${c.id}`}>{codEveniment(proiect.cod, c.numar)}</Link>: {c.descriere}</p>)}
      <table className="tabel-detalii"><tbody>
        <tr><th>Data evenimentului</th><td>{formatData(e.data_eveniment)}</td></tr>
        {e.zona && <tr><th>Zona / elementul</th><td>{e.zona}</td></tr>}
        <tr><th>Ce s-a întâmplat</th><td className="text-lung">{e.descriere}</td></tr>
        {e.efecte && <tr><th>Efecte constatate</th><td className="text-lung">{e.efecte}</td></tr>}
        {e.masuri && <tr><th>Măsuri</th><td className="text-lung">{e.masuri}</td></tr>}
        {e.executant && <tr><th>Executant / expert</th><td>{e.executant}</td></tr>}
        {cor && <tr><th>Corectează</th><td><Link to={`../${cor.id}`}>{codEveniment(proiect.cod, cor.numar)} · {cor.titlu}</Link></td></tr>}
        <tr><th>Consemnat de</th><td>{p ? p.nume || p.email : '—'}, {new Date(e.creat_la).toLocaleString('ro-RO')}</td></tr>
      </tbody></table>
      <Atasamente proiectId={proiect.id} entitate="eveniment_exploatare" entitateId={e.id} membri={membri} poateIncarca={poateAtasa}
        tipuri={['poza', 'raport_expertiza', 'deviz_interventie', 'document']} titlu="Fotografii și documente"
        gol="Fotografiile degradărilor, raportul expertului, procesul verbal al intervenției." />
    </div>
  );
}
