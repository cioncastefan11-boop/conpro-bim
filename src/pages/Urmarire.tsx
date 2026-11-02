// Urmărirea comportării în timp (Legea 169/2026; urmărirea curentă la cel mult un an):
// programul, scadențele, inspecțiile și raportul anual.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PROGRAM_TIP_URMARIRE, STARI_CONSTATARE, codInspectie, formatData, laIso, azi, stareConstatare, zilePana, type Rol } from '../lib/domeniu';
import type { ConstatareInspectie, InspectieUrmarire, Membru, Proiect, PunctUrmarire, StareConstatare } from '../lib/tipuri';
import { incarcaDateProiect } from '../lib/dateProiect';
import { htmlUrmarire } from '../lib/carte';
import { scadente } from '../lib/urmarire';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string; onEveniment: () => Promise<void> };
type Date_ = { puncte: PunctUrmarire[]; inspectii: InspectieUrmarire[]; constatari: ConstatareInspectie[] };

const poatePrograma = (r?: Rol) => r === 'beneficiar' || r === 'administrator' || r === 'administrator_cladire' || r === 'proiectant';
const poateInspecta = (r?: Rol) => !!r && r !== 'cititor';
const Ton = ({ stare }: { stare: string }) => { const s = stareConstatare(stare); return <span className={`eticheta ${s.ton}`}>{s.nume}</span>; };

export default function Urmarire(props: Props) {
  const [d, setD] = useState<Date_ | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const id = props.proiect.id;
    const [a, b, c] = await Promise.all([
      supabase.from('puncte_urmarire').select('*').eq('proiect_id', id).order('ordine').order('creat_la'),
      supabase.from('inspectii_urmarire').select('*').eq('proiect_id', id).order('numar', { ascending: false }),
      supabase.from('constatari_inspectie').select('*').eq('proiect_id', id),
    ]);
    const err = a.error ?? b.error ?? c.error;
    if (err) setEroare(err.message.includes('puncte_urmarire') ? 'Rulați în Supabase scriptul 0015_urmarire.sql.' : mesajEroare(err));
    setD({ puncte: (a.data as PunctUrmarire[]) ?? [], inspectii: (b.data as InspectieUrmarire[]) ?? [], constatari: (c.data as ConstatareInspectie[]) ?? [] });
  }, [props.proiect.id]);
  useEffect(() => { incarca(); }, [incarca]);
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  return (
    <>
      <Eroare text={eroare} />
      <Routes>
        <Route index element={<Panou {...props} d={d} />} />
        <Route path="program" element={<Program {...props} d={d} onSalvat={incarca} />} />
        <Route path="inspectie-noua" element={<InspectieNoua {...props} d={d} onSalvat={async () => { await incarca(); await props.onEveniment(); }} />} />
        <Route path=":inspId" element={<DetaliuInspectie {...props} d={d} />} />
      </Routes>
    </>
  );
}

// --------------------------------------------------------------------- Panoul
function Panou({ proiect, membri, rolulMeu, d }: Props & { d: Date_ }) {
  const sc = useMemo(() => scadente(proiect, d.puncte, d.inspectii, d.constatari), [proiect, d]);
  const restante = sc.filter(s => zilePana(s.urmatoarea) < 0);
  const curand = sc.filter(s => zilePana(s.urmatoarea) >= 0 && zilePana(s.urmatoarea) <= 30);
  const ultima = d.inspectii[0];
  const ani = [...new Set([new Date().getFullYear(), ...d.inspectii.map(i => Number(i.data_inspectiei.slice(0, 4)))])].sort((a, b) => b - a);
  const [an, setAn] = useState(ani[0]);
  const nume = (id: string) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : '—'; };

  async function raport() {
    const dp = await incarcaDateProiect(proiect, membri);
    const url = URL.createObjectURL(new Blob([htmlUrmarire(dp, an)], { type: 'text/html' }));
    window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return (
    <>
      <div className="rezumat-exploatare">
        <div className={restante.length ? 'alerta' : ''}>
          <span>Verificări restante</span><b>{restante.length}</b>
          <small>{restante.length ? `cea mai veche din ${formatData(restante[0].urmatoarea)}` : curand.length ? `${curand.length} în următoarele 30 de zile` : 'programul e la zi'}</small>
        </div>
        <div><span>Ultima inspecție</span><b>{ultima ? formatData(ultima.data_inspectiei) : '—'}</b>{ultima && <small><Ton stare={ultima.stare} /></small>}</div>
        <div><span>Puncte urmărite</span><b>{d.puncte.filter(x => x.activ).length}</b><small>{proiect.clasa_consecinte ?? ''}{proiect.clasa_consecinte === 'CC1' ? ' · urmărirea nu e obligatorie' : ' · urmărire curentă, cel mult anual'}</small></div>
      </div>

      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Programul de urmărire</h2>
            <p className="discret">Ce se urmărește, cum și cât de des. Îl stabilește proiectantul (în caietul de sarcini) sau, la construcțiile existente, un expert tehnic.</p>
          </div>
          <div className="actiuni">
            {poatePrograma(rolulMeu) && <Link className="buton" to="program">{d.puncte.length ? 'Modifică programul' : 'Stabilește programul'}</Link>}
            {poateInspecta(rolulMeu) && sc.length > 0 && <Link className="buton principal" to="inspectie-noua">Inspecție nouă</Link>}
          </div>
        </div>
        {!sc.length ? <Gol titlu="Programul de urmărire nu e introdus">{poatePrograma(rolulMeu) ? 'Porniți de la programul tip pentru urmărirea curentă și adaptați-l după caietul de sarcini al proiectantului.' : 'Îl introduce proiectantul, beneficiarul sau administratorul clădirii.'}</Gol> : (
          <div className="tabel-wrap"><table className="tabel">
            <thead><tr><th>Ce se urmărește</th><th>Interval</th><th>Ultima verificare</th><th>Următoarea</th></tr></thead>
            <tbody>{sc.map(s => {
              const x = d.puncte.find(p => p.id === s.punct_id)!;
              const z = zilePana(s.urmatoarea);
              return (
                <tr key={s.punct_id}>
                  <td><b>{x.ce}</b>{x.zona && <><br /><span className="discret">{x.zona}</span></>}{x.categorie === 'speciala' && <> <span className="eticheta neutru">specială</span></>}</td>
                  <td>{x.interval_luni} {x.interval_luni === 1 ? 'lună' : 'luni'}</td>
                  <td>{s.ultima ? formatData(s.ultima) : <span className="discret">niciodată</span>}</td>
                  <td>{formatData(s.urmatoarea)} {z < 0 ? <span className="eticheta alerta">restantă</span> : z <= 30 ? <span className="eticheta atentie">în {z} zile</span> : null}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Inspecțiile</h2>
            <p className="discret">Fiecare inspecție intră și în jurnalul evenimentelor. Nu se modifică după înregistrare.</p>
          </div>
          <div className="actiuni rand-formular">
            <label>Anul<select value={an} onChange={e => setAn(Number(e.target.value))}>{ani.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
            <button className="buton" onClick={raport}>Raportul anual</button>
          </div>
        </div>
        {!d.inspectii.length ? <Gol titlu="Nicio inspecție înregistrată" /> : (
          <ul className="lista-evenimente">
            {d.inspectii.map(i => (
              <li key={i.id} className={i.stare === 'alarma' ? 'ev-avarie' : i.stare === 'atentie' ? 'ev-seism' : 'ev-inspectie'}>
                <Link to={i.id}>
                  <span className="cod">{codInspectie(proiect.cod, i.numar)}</span>
                  <span className="data">{formatData(i.data_inspectiei)}</span>
                  <Ton stare={i.stare} />
                  <b>{i.concluzii.length > 90 ? i.concluzii.slice(0, 90) + '…' : i.concluzii}</b>
                  <small className="discret">{i.efectuata_de} · înregistrată de {nume(i.creat_de)}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// --------------------------------------------------------------------- Programul
function Program({ proiect, rolulMeu, d, onSalvat }: Props & { d: Date_; onSalvat: () => Promise<void> }) {
  const gol = { ce: '', zona: '', metoda: 'Examinare vizuală directă', interval_luni: 12, prag_alarma: '', categorie: 'curenta' as 'curenta' | 'speciala' };
  const [f, setF] = useState(gol);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  if (!poatePrograma(rolulMeu)) return <Gol titlu="Programul îl stabilesc proiectantul, beneficiarul sau administratorul" />;
  const urmOrdine = () => Math.max(0, ...d.puncte.map(x => x.ordine)) + 1;

  async function programTip() {
    setEroare(null); setLucreaza(true);
    const { error } = await supabase.from('puncte_urmarire').insert(PROGRAM_TIP_URMARIRE.map((x, i) => ({ ...x, proiect_id: proiect.id, ordine: i + 1, interval_luni: 12, categorie: 'curenta' })));
    setLucreaza(false);
    if (error) setEroare(mesajEroare(error)); else await onSalvat();
  }
  async function adauga(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const t = (s: string) => s.trim() || null;
    const { error } = await supabase.from('puncte_urmarire').insert({ proiect_id: proiect.id, ordine: urmOrdine(), ce: f.ce.trim(), zona: t(f.zona), metoda: t(f.metoda),
      interval_luni: f.interval_luni, prag_alarma: t(f.prag_alarma), categorie: f.categorie });
    if (error) setEroare(mesajEroare(error)); else { setF(gol); await onSalvat(); }
  }
  async function schimba(x: PunctUrmarire, v: Partial<PunctUrmarire>) {
    setEroare(null);
    const { error } = await supabase.from('puncte_urmarire').update(v).eq('id', x.id);
    if (error) setEroare(mesajEroare(error)); else await onSalvat();
  }

  return (
    <>
      <div className="card">
        <p><Link to="..">← Urmărirea în timp</Link></p>
        <h2>Programul de urmărire</h2>
        <p className="discret">Intervalul e de cel mult 12 luni (urmărirea curentă). Punctele nu se șterg: un punct scos din program rămâne în rapoartele vechi. Orice modificare apare în Istoric.</p>
        {!d.puncte.length && (
          <div className="mesaj info">
            <p>Porniți de la <b>programul tip pentru urmărirea curentă</b> ({PROGRAM_TIP_URMARIRE.length} puncte: fisuri, tasări, rosturi, infiltrații, hidroizolație, fațade, coroziune, trotuar de gardă, pierderi din instalații, modificări față de proiect), anual, prin examinare vizuală. Apoi îl adaptați după caietul de sarcini al proiectantului.</p>
            <button className="buton principal" onClick={programTip} disabled={lucreaza}>Adaugă programul tip</button>
          </div>
        )}
        {d.puncte.length > 0 && (
          <div className="tabel-wrap"><table className="tabel">
            <thead><tr><th>Ce se urmărește</th><th>Metoda și pragul de alarmă</th><th>Interval</th><th /></tr></thead>
            <tbody>{d.puncte.map(x => (
              <tr key={x.id} className={x.activ ? '' : 'inactiv'}>
                <td><b>{x.ce}</b>{x.zona && <><br /><span className="discret">{x.zona}</span></>}</td>
                <td className="discret">{x.metoda}{x.prag_alarma && <><br /><b>Alarmă:</b> {x.prag_alarma}</>}</td>
                <td>
                  <select value={x.interval_luni} disabled={!x.activ} aria-label="Intervalul" onChange={e => schimba(x, { interval_luni: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n} {n === 1 ? 'lună' : 'luni'}</option>)}
                  </select>
                </td>
                <td><button className={`legatura${x.activ ? ' alerta' : ''}`} onClick={() => schimba(x, { activ: !x.activ })}>{x.activ ? 'Scoate din program' : 'Repune'}</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Eroare text={eroare} />
      </div>

      <form className="card formular eveniment-nou" onSubmit={adauga}>
        <h3>Adăugați un punct</h3>
        <div className="campuri">
          <label>Categoria
            <select value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value as 'curenta' })}>
              <option value="curenta">Urmărire curentă</option><option value="speciala">Urmărire specială</option>
            </select>
          </label>
          <label>Intervalul
            <select value={f.interval_luni} onChange={e => setF({ ...f, interval_luni: Number(e.target.value) })}>
              {[1, 2, 3, 4, 6, 12].map(n => <option key={n} value={n}>{n} {n === 1 ? 'lună' : 'luni'}</option>)}
            </select>
          </label>
          <label>Zona / elementele<input value={f.zona} onChange={e => setF({ ...f, zona: e.target.value })} /></label>
        </div>
        <label>Ce se urmărește<input value={f.ce} onChange={e => setF({ ...f, ce: e.target.value })} required minLength={3} placeholder="ex. Deplasarea pe orizontală a peretelui de sprijin" /></label>
        <label>Metoda<input value={f.metoda} onChange={e => setF({ ...f, metoda: e.target.value })} placeholder="ex. măsurători topografice pe reperii R1–R4" /></label>
        <label>Pragul de alarmă<input value={f.prag_alarma} onChange={e => setF({ ...f, prag_alarma: e.target.value })} placeholder="ex. deplasare mai mare de 5 mm față de citirea inițială" /></label>
        <div className="actiuni"><button className="buton principal">Adaugă</button></div>
      </form>
    </>
  );
}

// --------------------------------------------------------------------- Inspecție nouă
function InspectieNoua({ proiect, membri, uid, rolulMeu, d, onSalvat }: Props & { d: Date_; onSalvat: () => Promise<void> }) {
  const nav = useNavigate();
  const eu = membri.find(m => m.persoana_id === uid)?.persoane;
  const active = d.puncte.filter(x => x.activ);
  const [data, setData] = useState(laIso(azi()));
  const [cine, setCine] = useState(eu ? [eu.nume, eu.firme?.denumire].filter(Boolean).join(', ') : '');
  const [stari, setStari] = useState<Record<string, { stare: StareConstatare; observatii: string }>>(
    Object.fromEntries(active.map(x => [x.id, { stare: 'normal' as StareConstatare, observatii: '' }])));
  const [concluzii, setConcluzii] = useState('');
  const [masuri, setMasuri] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  if (!poateInspecta(rolulMeu)) return <Gol titlu="Inspecțiile le înregistrează membrii echipei" />;
  if (!active.length) return <Gol titlu="Introduceți întâi programul de urmărire"><Link to="../program">Programul de urmărire</Link></Gol>;

  const grav = Object.values(stari).some(s => s.stare === 'alarma') ? 'alarma' : Object.values(stari).some(s => s.stare === 'atentie') ? 'atentie' : 'normal';
  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const { data: id, error } = await supabase.rpc('inregistreaza_inspectie', {
      p_proiect: proiect.id, p_data: data, p_efectuata_de: cine, p_concluzii: concluzii, p_masuri: masuri || null,
      p_constatari: active.map(x => ({ punct_id: x.id, stare: stari[x.id].stare, observatii: stari[x.id].observatii })),
    });
    setLucreaza(false);
    if (error) { setEroare(mesajEroare(error)); return; }
    await onSalvat();
    nav(`../${id as string}`);
  }

  return (
    <form className="card formular eveniment-nou" onSubmit={salveaza}>
      <p><Link to="..">← Urmărirea în timp</Link></p>
      <h2>Inspecție nouă</h2>
      <div className="campuri">
        <label>Data inspecției<input type="date" value={data} min={proiect.exploatare_din ?? undefined} max={laIso(azi())} onChange={e => setData(e.target.value)} required /></label>
        <label>Efectuată de (nume, calitate)<input value={cine} onChange={e => setCine(e.target.value)} required minLength={3} placeholder="ex. Ing. Ion Pop, expert tehnic atestat" /></label>
      </div>
      <h3>Constatări</h3>
      <ol className="constatari">
        {active.map(x => (
          <li key={x.id} className={`c-${stari[x.id].stare}`}>
            <div className="constatare-sus">
              <div><b>{x.ce}</b>{x.zona && <span className="discret"> · {x.zona}</span>}{x.prag_alarma && <small className="discret">Alarmă: {x.prag_alarma}</small>}</div>
              <div className="comutator" role="radiogroup" aria-label={x.ce}>
                {STARI_CONSTATARE.map(s => (
                  <button type="button" key={s.id} role="radio" aria-checked={stari[x.id].stare === s.id}
                    className={stari[x.id].stare === s.id ? `activ ${s.ton}` : ''}
                    onClick={() => setStari({ ...stari, [x.id]: { ...stari[x.id], stare: s.id } })}>{s.nume}</button>
                ))}
              </div>
            </div>
            {(stari[x.id].stare === 'atentie' || stari[x.id].stare === 'alarma' || stari[x.id].observatii) && (
              <textarea rows={2} value={stari[x.id].observatii} placeholder="Ce s-a constatat, unde, dimensiuni"
                required={stari[x.id].stare === 'atentie' || stari[x.id].stare === 'alarma'}
                onChange={e => setStari({ ...stari, [x.id]: { ...stari[x.id], observatii: e.target.value } })} />
            )}
          </li>
        ))}
      </ol>
      <label>Concluzii<textarea rows={3} value={concluzii} onChange={e => setConcluzii(e.target.value)} required minLength={3}
        placeholder={grav === 'normal' ? 'ex. Construcția se comportă normal; nu s-au constatat degradări.' : 'Ce înseamnă constatările pentru siguranța construcției.'} /></label>
      <label>Măsuri propuse<textarea rows={2} value={masuri} onChange={e => setMasuri(e.target.value)} placeholder={grav === 'alarma' ? 'ex. Se solicită expertiză tehnică; se restricționează accesul în zonă.' : ''} /></label>
      {grav === 'alarma' && <p className="mesaj alerta">Cel puțin un punct e în alarmă: inspecția intră în jurnal marcată „necesită expertiză tehnică”.</p>}
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link className="buton" to="..">Renunță</Link>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se înregistrează…' : 'Înregistrează inspecția'}</button>
      </div>
      <p className="nota">După înregistrare puteți atașa fotografiile și raportul. Inspecția nu se mai modifică.</p>
    </form>
  );
}

// --------------------------------------------------------------------- Detaliu
function DetaliuInspectie({ proiect, membri, rolulMeu, uid, d }: Props & { d: Date_ }) {
  const { inspId } = useParams();
  const i = d.inspectii.find(x => x.id === inspId);
  if (!i) return <Gol titlu="Inspecția nu există" />;
  const cs = d.constatari.filter(c => c.inspectie_id === i.id);
  const p = membri.find(m => m.persoana_id === i.creat_de)?.persoane;
  const poateAtasa = i.creat_de === uid || rolulMeu === 'beneficiar' || rolulMeu === 'administrator' || rolulMeu === 'administrator_cladire';
  return (
    <div className="card">
      <p><Link to="..">← Urmărirea în timp</Link></p>
      <span className="cod">{codInspectie(proiect.cod, i.numar)}</span>
      <h2>Inspecția din {formatData(i.data_inspectiei)} <Ton stare={i.stare} /></h2>
      <table className="tabel-detalii"><tbody>
        <tr><th>Efectuată de</th><td>{i.efectuata_de}</td></tr>
        <tr><th>Concluzii</th><td className="text-lung">{i.concluzii}</td></tr>
        {i.masuri && <tr><th>Măsuri</th><td className="text-lung">{i.masuri}</td></tr>}
        <tr><th>Înregistrată de</th><td>{p ? p.nume || p.email : '—'}, {new Date(i.creat_la).toLocaleString('ro-RO')}</td></tr>
        {i.eveniment_id && <tr><th>În jurnal</th><td><Link to={`../../${i.eveniment_id}`}>evenimentul corespunzător</Link></td></tr>}
      </tbody></table>
      <h3>Constatări</h3>
      <div className="tabel-wrap"><table className="tabel">
        <thead><tr><th>Ce s-a urmărit</th><th>Starea</th><th>Constatări</th></tr></thead>
        <tbody>{cs.map(c => (
          <tr key={c.punct_id}><td>{d.puncte.find(x => x.id === c.punct_id)?.ce}</td><td><Ton stare={c.stare} /></td><td className="text-lung">{c.observatii}</td></tr>
        ))}</tbody>
      </table></div>
      <Atasamente proiectId={proiect.id} entitate="inspectie_urmarire" entitateId={i.id} membri={membri} poateIncarca={poateAtasa}
        tipuri={['poza', 'raport_comportare', 'raport_expertiza', 'document']} titlu="Fotografii și rapoarte"
        gol="Fotografiile constatărilor, fișa inspecției semnată, măsurătorile." />
    </div>
  );
}
