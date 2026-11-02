// Mentenanța echipamentelor și garanțiile, în exploatare (ISO 19650-3: informațiile despre
// echipamente se țin la zi; intervalele vin din COBie, garanțiile din tipuri și din recepție).
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { TIPURI_INTERVENTIE, codInterventie, formatData, laIso, azi, numeInterventie, zilePana, type Rol } from '../lib/domeniu';
import type { Echipament, Garantie, InterventieEchipament, Membru, Proiect, ScadentaMentenanta, TipEchipament, TipInterventie } from '../lib/tipuri';
import { incarcaDateProiect } from '../lib/dateProiect';
import { htmlInterventii } from '../lib/carte';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
type Date_ = { tipuri: TipEchipament[]; echipamente: Echipament[]; interventii: InterventieEchipament[]; scadente: ScadentaMentenanta[]; garantii: Garantie[] };

const poateScrie = (r?: Rol) => !!r && r !== 'cititor';

export default function Mentenanta(props: Props) {
  const [d, setD] = useState<Date_ | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const id = props.proiect.id;
    const [t, e, i, s, g] = await Promise.all([
      supabase.from('tipuri_echipament').select('*').eq('proiect_id', id).order('denumire'),
      supabase.from('echipamente').select('*').eq('proiect_id', id).order('cod'),
      supabase.from('interventii_echipament').select('*').eq('proiect_id', id).order('numar', { ascending: false }),
      supabase.rpc('scadente_mentenanta', { p: id }),
      supabase.rpc('garantii', { p: id }),
    ]);
    const err = t.error ?? e.error ?? i.error ?? s.error ?? g.error;
    if (err) setEroare(/interventii_echipament|scadente_mentenanta|garantii/.test(err.message) ? 'Rulați în Supabase scriptul 0016_mentenanta.sql.' : mesajEroare(err));
    setD({ tipuri: (t.data as TipEchipament[]) ?? [], echipamente: (e.data as Echipament[]) ?? [], interventii: (i.data as InterventieEchipament[]) ?? [],
      scadente: (s.data as ScadentaMentenanta[]) ?? [], garantii: (g.data as Garantie[]) ?? [] });
  }, [props.proiect.id]);
  useEffect(() => { incarca(); }, [incarca]);
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  return (
    <>
      <Eroare text={eroare} />
      <Routes>
        <Route index element={<Panou {...props} d={d} />} />
        <Route path="noua" element={<InterventieNoua {...props} d={d} onSalvat={incarca} />} />
        <Route path=":intId" element={<Detaliu {...props} d={d} />} />
      </Routes>
    </>
  );
}

const numeEchip = (d: Date_, id: string) => {
  const e = d.echipamente.find(x => x.id === id);
  return e ? `${e.cod} · ${d.tipuri.find(t => t.id === e.tip_id)?.denumire ?? ''}` : '—';
};

// --------------------------------------------------------------------- Panoul
function Panou({ proiect, membri, rolulMeu, d }: Props & { d: Date_ }) {
  const restante = d.scadente.filter(s => zilePana(s.urmatoarea) < 0);
  const curand = d.scadente.filter(s => { const z = zilePana(s.urmatoarea); return z >= 0 && z <= 30; });
  const gActive = d.garantii.filter(g => zilePana(g.garantie_pana) >= 0);
  const gExpira = gActive.filter(g => zilePana(g.garantie_pana) <= (g.ce === 'constructie' ? 90 : 60));
  const anul = String(new Date().getFullYear());
  const faraInterval = d.tipuri.filter(t => t.interval_mentenanta_luni == null && d.echipamente.some(e => e.tip_id === t.id));
  const [toateGarantiile, setToate] = useState(false);
  const garantii = toateGarantiile ? d.garantii : d.garantii.filter(g => g.ce === 'constructie' || zilePana(g.garantie_pana) >= -365);
  const nume = (id: string) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : '—'; };

  async function tipareste() {
    const dp = await incarcaDateProiect(proiect, membri);
    const url = URL.createObjectURL(new Blob([htmlInterventii(dp)], { type: 'text/html' }));
    window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <>
      <div className="rezumat-exploatare">
        <div className={restante.length ? 'alerta' : ''}><span>Mentenanță restantă</span><b>{restante.length}</b>
          <small>{restante.length ? `cea mai veche din ${formatData(restante[0].urmatoarea)}` : curand.length ? `${curand.length} în următoarele 30 de zile` : 'la zi'}</small></div>
        <div className={gExpira.length ? 'atentie' : ''}><span>Garanții care expiră curând</span><b>{gExpira.length}</b>
          <small>{gActive.length} garanții active</small></div>
        <div><span>Intervenții în {anul}</span><b>{d.interventii.filter(i => i.data.startsWith(anul)).length}</b>
          <small>{d.interventii.filter(i => i.in_garantie).length} în garanție, de la început</small></div>
      </div>

      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Mentenanța echipamentelor</h2>
            <p className="discret">Scadența vine din intervalul de mentenanță al tipului (COBie) și din ultima revizie sau verificare periodică.</p>
          </div>
          <div className="actiuni">{poateScrie(rolulMeu) && d.echipamente.length > 0 && <Link className="buton principal" to="noua">Intervenție nouă</Link>}</div>
        </div>
        {faraInterval.length > 0 && <p className="mesaj info">{faraInterval.length === 1 ? 'Un tip de echipament nu are' : `${faraInterval.length} tipuri de echipamente nu au`} interval de mentenanță ({faraInterval.map(t => t.denumire).join(', ')}). Completați-l în <Link to="../../echipamente">Echipamente</Link>.</p>}
        {!d.scadente.length ? <Gol titlu="Niciun echipament cu mentenanță planificată">Echipamentele și intervalele de mentenanță se completează în fila <Link to="../../echipamente">Echipamente</Link> (sau din modelul IFC).</Gol> : (
          <div className="tabel-wrap"><table className="tabel">
            <thead><tr><th>Echipamentul</th><th>Interval</th><th>Ultima revizie</th><th>Următoarea</th>{poateScrie(rolulMeu) && <th />}</tr></thead>
            <tbody>{d.scadente.map(s => {
              const z = zilePana(s.urmatoarea);
              return (
                <tr key={s.echipament_id}>
                  <td><b>{s.cod}</b> {s.denumire}</td>
                  <td>{s.interval_luni} {s.interval_luni === 1 ? 'lună' : 'luni'}</td>
                  <td>{s.ultima ? formatData(s.ultima) : <span className="discret">de la punerea în funcțiune</span>}</td>
                  <td>{formatData(s.urmatoarea)} {z < 0 ? <span className="eticheta alerta">restantă</span> : z <= 30 ? <span className="eticheta atentie">în {z} zile</span> : null}</td>
                  {poateScrie(rolulMeu) && <td><Link to={`noua?echipament=${s.echipament_id}&tip=revizie`}>Înregistrează revizia</Link></td>}
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Garanțiile</h2>
            <p className="discret">Garanția de bună execuție a construcției curge de la aprobarea recepției la terminarea lucrărilor; a echipamentelor, de la începutul garanției fiecăruia. Defectele apărute în garanție se semnalează constructorului sau garantului.</p>
          </div>
          {d.garantii.length !== garantii.length || toateGarantiile ? <button className="legatura" onClick={() => setToate(!toateGarantiile)}>{toateGarantiile ? 'Ascunde garanțiile expirate demult' : 'Arată toate garanțiile'}</button> : null}
        </div>
        {!garantii.length ? <Gol titlu="Nicio garanție înregistrată">Garanția echipamentelor se calculează din durata garanției tipului și din începutul garanției fiecărui echipament (fila Echipamente).</Gol> : (
          <div className="tabel-wrap"><table className="tabel">
            <thead><tr><th>Ce</th><th>Garant</th><th>De la</th><th>Până la</th></tr></thead>
            <tbody>{garantii.map(g => {
              const z = zilePana(g.garantie_pana);
              const prag = g.ce === 'constructie' ? 90 : 60;
              return (
                <tr key={g.ce + g.id} className={g.ce === 'constructie' ? 'rand-principal' : ''}>
                  <td><b>{g.denumire}</b></td>
                  <td>{g.ce === 'constructie' ? 'Constructorul' : g.garant ?? '—'}</td>
                  <td>{formatData(g.garantie_start)}</td>
                  <td>{formatData(g.garantie_pana)} {z < 0 ? <span className="eticheta neutru">expirată</span> : z <= prag ? <span className="eticheta atentie">expiră în {z} zile</span> : <span className="eticheta ok">activă</span>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="antet-card">
          <div><h2>Registrul intervențiilor</h2><p className="discret">Revizii, verificări periodice, reparații, înlocuiri, defecte. Intrările nu se modifică.</p></div>
          {d.interventii.length > 0 && <button className="buton" onClick={tipareste}>Tipărește registrul</button>}
        </div>
        {!d.interventii.length ? <Gol titlu="Nicio intervenție înregistrată" /> : (
          <ul className="lista-evenimente">
            {d.interventii.map(i => (
              <li key={i.id} className={i.tip === 'defect' ? 'ev-avarie' : i.tip === 'reparatie' || i.tip === 'inlocuire' ? 'ev-seism' : 'ev-inspectie'}>
                <Link to={i.id}>
                  <span className="cod">{codInterventie(proiect.cod, i.numar)}</span>
                  <span className="data">{formatData(i.data)}</span>
                  <span className="tip-ev">{numeInterventie(i.tip)}</span>
                  <b>{numeEchip(d, i.echipament_id)}</b>
                  {i.in_garantie && <span className="eticheta neutru">în garanție</span>}
                  {!i.functional && <span className="eticheta alerta">nefuncțional</span>}
                  <small className="discret">{i.executant ? `${i.executant} · ` : ''}{nume(i.creat_de)}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// --------------------------------------------------------------------- Intervenție nouă
function InterventieNoua({ proiect, rolulMeu, d, onSalvat }: Props & { d: Date_; onSalvat: () => Promise<void> }) {
  const nav = useNavigate();
  const [q] = useSearchParams();
  const [f, setF] = useState({
    echipament_id: q.get('echipament') ?? '', tip: (q.get('tip') as TipInterventie) || 'revizie', data: laIso(azi()),
    descriere: '', executant: '', in_garantie: false, functional: true,
  });
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const garantie = useMemo(() => d.garantii.find(g => g.ce === 'echipament' && g.id === f.echipament_id), [d, f.echipament_id]);
  const inGarantie = garantie ? zilePana(garantie.garantie_pana) >= 0 : false;
  useEffect(() => { setF(x => ({ ...x, in_garantie: inGarantie && (x.tip === 'reparatie' || x.tip === 'inlocuire' || x.tip === 'defect') })); }, [inGarantie, f.tip]);
  if (!poateScrie(rolulMeu)) return <Gol titlu="Intervențiile le înregistrează membrii echipei" />;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  const tip = d.tipuri.find(t => t.id === d.echipamente.find(e => e.id === f.echipament_id)?.tip_id);

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from('interventii_echipament').insert({ id, proiect_id: proiect.id, echipament_id: f.echipament_id, tip: f.tip, data: f.data,
      descriere: f.descriere.trim(), executant: f.executant.trim() || null, in_garantie: f.in_garantie, functional: f.functional });
    setLucreaza(false);
    if (error) { setEroare(mesajEroare(error)); return; }
    await onSalvat();
    nav(`../${id}`);
  }

  return (
    <form className="card formular eveniment-nou" onSubmit={salveaza}>
      <p><Link to="..">← Mentenanță și garanții</Link></p>
      <h2>Intervenție nouă</h2>
      <div className="campuri">
        <label>Echipamentul
          <select value={f.echipament_id} onChange={e => set('echipament_id', e.target.value)} required>
            <option value="">— alegeți —</option>
            {d.echipamente.map(e => <option key={e.id} value={e.id}>{numeEchip(d, e.id)}</option>)}
          </select>
        </label>
        <label>Intervenția
          <select value={f.tip} onChange={e => set('tip', e.target.value as TipInterventie)}>
            {TIPURI_INTERVENTIE.map(t => <option key={t.id} value={t.id}>{t.nume}</option>)}
          </select>
        </label>
        <label>Data<input type="date" value={f.data} max={laIso(azi())} onChange={e => set('data', e.target.value)} required /></label>
      </div>
      <p className="discret">{TIPURI_INTERVENTIE.find(t => t.id === f.tip)?.ajutor}</p>
      {tip?.instructiuni_mentenanta && <p className="mesaj info"><b>Instrucțiunile de mentenanță:</b> {tip.instructiuni_mentenanta}</p>}
      {garantie && <p className={`mesaj ${inGarantie ? 'info' : 'neutru'}`}>{inGarantie ? `Echipamentul e în garanție până la ${formatData(garantie.garantie_pana)}${garantie.garant ? ` (garant: ${garantie.garant})` : ''}. Reparațiile și înlocuirile le face garantul.` : `Garanția echipamentului a expirat la ${formatData(garantie.garantie_pana)}.`}</p>}
      <label>Ce s-a făcut / ce s-a constatat<textarea rows={3} value={f.descriere} onChange={e => set('descriere', e.target.value)} required minLength={3} /></label>
      <label>Executantul (firma autorizată, persoana)<input value={f.executant} onChange={e => set('executant', e.target.value)} /></label>
      <label className="bifa"><input type="checkbox" checked={f.in_garantie} onChange={e => set('in_garantie', e.target.checked)} /> Intervenție în garanție</label>
      <label className="bifa"><input type="checkbox" checked={f.functional} onChange={e => set('functional', e.target.checked)} /> Echipamentul funcționează după intervenție</label>
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link className="buton" to="..">Renunță</Link>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se înregistrează…' : 'Înregistrează'}</button>
      </div>
      <p className="nota">După înregistrare atașați fișa de intervenție, raportul de verificare (de ex. ISCIR) sau fotografiile. Intervenția nu se mai modifică.</p>
    </form>
  );
}

// --------------------------------------------------------------------- Detaliu
function Detaliu({ proiect, membri, rolulMeu, uid, d }: Props & { d: Date_ }) {
  const { intId } = useParams();
  const i = d.interventii.find(x => x.id === intId);
  if (!i) return <Gol titlu="Intervenția nu există" />;
  const p = membri.find(m => m.persoana_id === i.creat_de)?.persoane;
  const poateAtasa = i.creat_de === uid || rolulMeu === 'beneficiar' || rolulMeu === 'administrator' || rolulMeu === 'administrator_cladire';
  return (
    <div className="card">
      <p><Link to="..">← Mentenanță și garanții</Link></p>
      <span className="cod">{codInterventie(proiect.cod, i.numar)}</span>
      <h2>{numeInterventie(i.tip)}: {numeEchip(d, i.echipament_id)}</h2>
      <table className="tabel-detalii"><tbody>
        <tr><th>Data</th><td>{formatData(i.data)}</td></tr>
        <tr><th>Ce s-a făcut</th><td className="text-lung">{i.descriere}</td></tr>
        {i.executant && <tr><th>Executant</th><td>{i.executant}</td></tr>}
        <tr><th>În garanție</th><td>{i.in_garantie ? 'Da' : 'Nu'}</td></tr>
        <tr><th>După intervenție</th><td>{i.functional ? 'Funcțional' : <b>Nefuncțional</b>}</td></tr>
        <tr><th>Înregistrată de</th><td>{p ? p.nume || p.email : '—'}, {new Date(i.creat_la).toLocaleString('ro-RO')}</td></tr>
      </tbody></table>
      <Atasamente proiectId={proiect.id} entitate="interventie_echipament" entitateId={i.id} membri={membri} poateIncarca={poateAtasa}
        tipuri={['document', 'poza', 'certificat_garantie', 'altul']} titlu="Fișe și rapoarte"
        gol="Fișa de intervenție, raportul de verificare periodică, fotografii." />
    </div>
  );
}
