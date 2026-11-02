import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  DECIZII, STARI_PV, TIPURI_PV, codPv, formatData, laIso, azi, numeRol, propunereContinutPv, tipPv,
  type DeciziePv, type Rol, type TipPv,
} from '../lib/domeniu';
import type { Membru, ParticipantPv, ProcesVerbal, Proiect } from '../lib/tipuri';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';
import DocumentSemnat from '../components/DocumentSemnat';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
const POT_CONVOCA: Rol[] = ['constructor', 'diriginte', 'administrator'];

export default function ProceseVerbale(props: Props) {
  return (
    <Routes>
      <Route index element={<Lista {...props} />} />
      <Route path="nou" element={<Convocare {...props} />} />
      <Route path=":pvId" element={<Detaliu {...props} />} />
    </Routes>
  );
}

/** Poate persoana confirma acum? Aplică ordinea din art. 426 alin. (3). */
function poateConfirma(pv: ProcesVerbal, parti: ParticipantPv[], uid: string): { da: boolean; motiv?: string } {
  const eu = parti.find(p => p.persoana_id === uid);
  if (!eu || eu.confirmat_la) return { da: false };
  if (pv.stare !== 'convocat' && pv.stare !== 'in_semnare') return { da: false };
  if (!pv.descriere_lucrari || !pv.concluzii) return { da: false, motiv: 'Confirmarea devine posibilă după ce constructorul (RTE) completează descrierea lucrărilor și concluziile.' };
  if (tipPv(pv.tip).ordine426 && eu.rol === 'proiectant'
      && parti.some(p => (p.rol === 'diriginte' || p.rol === 'constructor') && (!p.confirmat_la || p.decizie === 'refuz'))) {
    return { da: false, motiv: 'Confirmați după diriginte și RTE (art. 426 alin. 3 din Legea 169/2026).' };
  }
  return { da: true };
}

// --------------------------------------------------------------------- Lista
function Lista({ proiect, rolulMeu, uid }: Props) {
  const [pvs, setPvs] = useState<ProcesVerbal[] | null>(null);
  const [parti, setParti] = useState<ParticipantPv[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [filtru, setFiltru] = useState<'toate' | 'deschise' | 'ale_mele'>('toate');

  useEffect(() => {
    Promise.all([
      supabase.from('procese_verbale').select('*').eq('proiect_id', proiect.id).order('numar', { ascending: false }),
      supabase.from('participanti_pv').select('*').eq('proiect_id', proiect.id),
    ]).then(([a, b]) => {
      setEroare(mesajEroare(a.error ?? b.error));
      setPvs((a.data as ProcesVerbal[]) ?? []);
      setParti((b.data as ParticipantPv[]) ?? []);
    });
  }, [proiect.id]);

  const dePe = useCallback((pv: string) => parti.filter(p => p.pv_id === pv), [parti]);
  const deConfirmat = (pvs ?? []).filter(pv => poateConfirma(pv, dePe(pv.id), uid).da);
  const vizibile = (pvs ?? []).filter(pv =>
    filtru === 'toate' ? true
    : filtru === 'deschise' ? pv.stare === 'convocat' || pv.stare === 'in_semnare' || pv.stare === 'contestat'
    : dePe(pv.id).some(p => p.persoana_id === uid));

  return (
    <>
      {deConfirmat.length > 0 && (
        <div className="mesaj atentie-bloc">
          <b>Așteaptă confirmarea dumneavoastră:</b>{' '}
          {deConfirmat.map((pv, i) => (
            <span key={pv.id}>{i > 0 && ', '}<Link to={pv.id}>{codPv(proiect.cod, pv.numar)}</Link></span>
          ))}
        </div>
      )}
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Procese verbale</h2>
            <p className="discret">Fiecare participant confirmă cu contul lui. Ce s-a semnat nu se mai modifică.</p>
          </div>
          {rolulMeu && POT_CONVOCA.includes(rolulMeu) && <Link className="buton principal" to="nou">Convoacă un PV</Link>}
        </div>
        <div className="filtre" role="group" aria-label="Filtru">
          {(['toate', 'deschise', 'ale_mele'] as const).map(f => (
            <button key={f} className={`pastila${filtru === f ? ' activ' : ''}`} onClick={() => setFiltru(f)}>
              {{ toate: 'Toate', deschise: 'Deschise', ale_mele: 'La care particip' }[f]}
            </button>
          ))}
        </div>
        <Eroare text={eroare} />
        {pvs === null ? <p className="discret">Se încarcă…</p> : vizibile.length === 0 ? (
          <Gol titlu="Niciun proces verbal">
            <p>{filtru === 'toate' ? 'Primul PV se convoacă de constructor, de diriginte sau de administrator.' : 'Schimbați filtrul ca să vedeți și alte procese verbale.'}</p>
          </Gol>
        ) : (
          <div className="tabel-wrap">
            <table className="tabel stivuit">
              <thead><tr><th>Cod</th><th>Tip</th><th>Obiect</th><th>Data</th><th>Confirmări</th><th>Stare</th></tr></thead>
              <tbody>
                {vizibile.map(pv => {
                  const p = dePe(pv.id);
                  const st = STARI_PV[pv.stare];
                  return (
                    <tr key={pv.id} className={pv.stare === 'anulat' ? 'estompat' : ''}>
                      <td data-eticheta="Cod"><Link to={pv.id} className="cod-link">{codPv(proiect.cod, pv.numar)}</Link></td>
                      <td data-eticheta="Tip">{tipPv(pv.tip).nume}</td>
                      <td data-eticheta="Obiect">{pv.obiect}</td>
                      <td data-eticheta="Data">{formatData(pv.data_pv)}</td>
                      <td data-eticheta="Confirmări">{p.filter(x => x.confirmat_la).length} / {p.length}</td>
                      <td data-eticheta="Stare"><Eticheta stare={st} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ----------------------------------------------------------------- Convocare
function Convocare({ proiect, membri, rolulMeu, uid }: Props) {
  const nav = useNavigate();
  const [tip, setTip] = useState<TipPv>('lucrari_ascunse');
  const [obiect, setObiect] = useState('');
  const [elemente, setElemente] = useState('');
  const [data, setData] = useState(laIso(azi()));
  const [loc, setLoc] = useState('Pe șantier');
  const [alti, setAlti] = useState('');
  const [alesi, setAlesi] = useState<Set<string>>(new Set());
  const [continut, setContinut] = useState<Continut>({ descriere: '', referinte: '', concluzii: '' });
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const t = tipPv(tip);

  // La schimbarea tipului se bifează automat rolurile obligatorii (și cel care convoacă).
  useEffect(() => {
    setAlesi(new Set(membri.filter(m => t.obligatorii.includes(m.rol) || m.persoana_id === uid && m.rol !== 'administrator')
      .map(m => m.persoana_id)));
  }, [tip, membri, uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const lipsa = useMemo(() => t.obligatorii.filter(r => !membri.some(m => m.rol === r && alesi.has(m.persoana_id))), [t, membri, alesi]);
  const lipsaDinEchipa = t.obligatorii.filter(r => !membri.some(m => m.rol === r));

  if (!rolulMeu || !POT_CONVOCA.includes(rolulMeu)) return <Gol titlu="Procesele verbale le convoacă constructorul, dirigintele sau administratorul" />;

  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const { data: id, error } = await supabase.rpc('convoaca_pv', {
      p_proiect: proiect.id, p_tip: tip, p_obiect: obiect, p_elemente: elemente, p_data: data,
      p_loc: loc, p_participanti: [...alesi], p_alti: alti,
    });
    if (error) { setLucreaza(false); setEroare(mesajEroare(error)); return; }
    // conținutul se salvează imediat dacă a fost completat la convocare
    if (continut.descriere.trim() || continut.concluzii.trim()) {
      const r = await supabase.rpc('completeaza_pv', { p_pv: id, p_descriere: continut.descriere, p_referinte: continut.referinte, p_concluzii: continut.concluzii });
      if (r.error) { setLucreaza(false); nav(`../${id}`, { state: { eroareContinut: mesajEroare(r.error) } }); return; }
    }
    setLucreaza(false);
    nav(`../${id}`);
  }

  const comuta = (id: string) => setAlesi(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <form className="card formular" onSubmit={trimite}>
      <p><Link to=".." className="inapoi">← Procese verbale</Link></p>
      <h2>Convocați un proces verbal</h2>
      <div className="campuri">
        <label>Tip
          <select value={tip} onChange={e => setTip(e.target.value as TipPv)}>
            {TIPURI_PV.filter(x => !['receptie_partiala', 'receptie_terminare', 'receptie_finala'].includes(x.id)).map(x => <option key={x.id} value={x.id}>{x.nume}</option>)}
          </select>
          <small>Recepția la terminare, parțială și finală se fac din tabul Recepție.</small>
        </label>
        <label>Data<input type="date" value={data} onChange={e => setData(e.target.value)} required /></label>
        <label>Locul<input value={loc} onChange={e => setLoc(e.target.value)} /></label>
        <label className="lat">Obiectul
          <input value={obiect} onChange={e => setObiect(e.target.value)} required minLength={3}
            placeholder={tip === 'faza_determinanta' ? 'ex. Armarea fundațiilor înainte de turnarea betonului' : 'ex. Hidroizolația pereților subsolului, axele 1–4'} />
        </label>
        <label className="lat">Elementele sau zona
          <input value={elemente} onChange={e => setElemente(e.target.value)} placeholder="ex. Fundații F1–F6, axele A–C" />
          <small>Legătura directă cu elementele din modelul IFC vine odată cu modulul de model.</small>
        </label>
      </div>
      {t.nota && <p className="mesaj info">{t.nota}</p>}

      <h3>Participanți din echipă</h3>
      {lipsaDinEchipa.length > 0 && (
        <p className="mesaj alerta">Echipa nu are încă: {lipsaDinEchipa.map(numeRol).join(', ')}. Invitați-i la fila Echipa înainte de convocare.</p>
      )}
      <div className="lista-bife">
        {membri.map(m => (
          <label key={m.persoana_id} className="bifa-rand">
            <input type="checkbox" checked={alesi.has(m.persoana_id)} onChange={() => comuta(m.persoana_id)} />
            <span><b>{m.persoane?.nume || m.persoane?.email}</b> · {numeRol(m.rol)}{t.obligatorii.includes(m.rol) && <span className="obligatoriu"> obligatoriu</span>}</span>
          </label>
        ))}
      </div>
      <label>Alți participanți, fără cont în aplicație
        <input value={alti} onChange={e => setAlti(e.target.value)} placeholder="ex. inspector ISC, membri ai comisiei de recepție" />
        <small>Semnează pe hârtie; scanul se atașează odată cu modulul de documente.</small>
      </label>
      <h3>Conținutul procesului verbal</h3>
      <p className="discret">Îl completează constructorul (RTE). Se poate lăsa și pentru după convocare, dar fără el nimeni nu poate confirma.</p>
      <CampuriContinut valoare={continut} onChange={setContinut}
        propune={() => propunereContinutPv({ tip, obiect, elemente, referinte: continut.referinte, proiect })} poatePropune={obiect.trim().length >= 3} />
      {lipsa.length > 0 && lipsaDinEchipa.length === 0 && <p className="mesaj alerta">Lipsește de pe listă: {lipsa.map(numeRol).join(', ')}.</p>}
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link to=".." className="buton">Renunță</Link>
        <button className="buton principal" disabled={lucreaza || lipsa.length > 0 || alesi.size === 0}>
          {lucreaza ? 'Se convoacă…' : 'Convoacă'}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------- Detaliu
function Detaliu({ proiect, membri, rolulMeu, uid }: Props) {
  const { pvId = '' } = useParams();
  const eroareContinut = (useLocation().state as { eroareContinut?: string } | null)?.eroareContinut ?? null;
  const [pv, setPv] = useState<ProcesVerbal | null>(null);
  const [parti, setParti] = useState<ParticipantPv[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [negasit, setNegasit] = useState(false);

  const incarca = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('procese_verbale').select('*').eq('id', pvId).maybeSingle(),
      supabase.from('participanti_pv').select('*').eq('pv_id', pvId),
    ]);
    setEroare(mesajEroare(a.error ?? b.error));
    if (!a.data && !a.error) setNegasit(true);
    setPv(a.data as ProcesVerbal | null);
    setParti((b.data as ParticipantPv[]) ?? []);
  }, [pvId]);
  useEffect(() => { incarca(); }, [incarca]);

  const om = (id: string | null) => {
    const p = membri.find(m => m.persoana_id === id)?.persoane;
    return p ? (p.nume || p.email) : '—';
  };
  const firma = (id: string) => membri.find(m => m.persoana_id === id)?.persoane?.firme?.denumire;

  if (negasit) return <Gol titlu="Procesul verbal nu există" />;
  if (!pv) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;

  const t = tipPv(pv.tip);
  const cod = codPv(proiect.cod, pv.numar);
  const pot = poateConfirma(pv, parti, uid);
  const potCompleta = pv.stare === 'convocat' && !parti.some(p => p.confirmat_la)
    && (pv.convocat_de === uid || parti.some(p => p.persoana_id === uid && p.rol === 'constructor'));
  const eu = parti.find(p => p.persoana_id === uid);
  const potAnula = (pv.convocat_de === uid || rolulMeu === 'administrator') && pv.stare !== 'semnat' && pv.stare !== 'anulat';
  // ordinea de afișare: diriginte și RTE, ceilalți, proiectantul la final când se aplică art. 426
  const ord = (r: Rol) => (r === 'diriginte' ? 0 : r === 'constructor' ? 1 : r === 'proiectant' && t.ordine426 ? 9 : 5);
  const sortati = [...parti].sort((a, b) => ord(a.rol) - ord(b.rol));

  return (
    <>
      <p className="nu-tipari"><Link to=".." className="inapoi">← Procese verbale</Link></p>
      <article className="card document-pv">
        <header className="antet-pv">
          <div>
            <span className="cod">{cod}</span>
            <h2>Proces verbal · {t.nume}</h2>
            <p className="discret">{proiect.denumire}{proiect.adresa ? `, ${proiect.adresa}` : ''}</p>
          </div>
          <Eticheta stare={STARI_PV[pv.stare]} />
        </header>

        <dl className="date-pv">
          <div><dt>Obiectul</dt><dd>{pv.obiect}</dd></div>
          {pv.elemente && <div><dt>Elementele / zona</dt><dd>{pv.elemente}</dd></div>}
          <div><dt>Data</dt><dd>{formatData(pv.data_pv)}</dd></div>
          {pv.loc && <div><dt>Locul</dt><dd>{pv.loc}</dd></div>}
          <div><dt>Convocat de</dt><dd>{om(pv.convocat_de)}, {new Date(pv.convocat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}</dd></div>
          {proiect.ac_numar && <div><dt>Autorizația de construire</dt><dd>nr. {proiect.ac_numar}{proiect.ac_emis_la ? ` din ${formatData(proiect.ac_emis_la)}` : ''}</dd></div>}
          {pv.alti_participanti && <div><dt>Alți participanți</dt><dd>{pv.alti_participanti}</dd></div>}
        </dl>
        {pv.descriere_lucrari ? (
          <section className="continut-pv">
            {pv.referinte_proiect && <><h3>Documentația de referință</h3><p>{pv.referinte_proiect}</p></>}
            <h3>Descrierea lucrărilor</h3>
            <p>{pv.descriere_lucrari}</p>
            <h3>Concluzii</h3>
            <p className="concluzii">{pv.concluzii}</p>
            {pv.completat_de && <p className="nota">Completat de {om(pv.completat_de)}{pv.completat_la ? `, ${new Date(pv.completat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.</p>}
          </section>
        ) : <p className="mesaj atentie-bloc nu-tipari">Descrierea lucrărilor și concluziile nu sunt încă completate.</p>}
        {t.ordine426 && <p className="nota">La acest tip de proces verbal, proiectantul confirmă după dirigintele de șantier și responsabilul tehnic cu execuția (art. 426 alin. 3 din Legea 169/2026).</p>}

        <h3>Confirmări</h3>
        <div className="tabel-wrap">
          <table className="tabel">
            <thead><tr><th>Participant</th><th>Calitatea</th><th>Decizia</th><th>Observații</th><th>Data și ora</th></tr></thead>
            <tbody>
              {sortati.map(p => (
                <tr key={p.id}>
                  <td><b>{om(p.persoana_id)}</b>{firma(p.persoana_id) && <><br /><span className="discret">{firma(p.persoana_id)}</span></>}</td>
                  <td>{p.rol === 'constructor' ? 'Constructor / RTE' : numeRol(p.rol)}</td>
                  <td>{p.decizie ? <Eticheta stare={{ eticheta: DECIZII[p.decizie], ton: p.decizie === 'refuz' ? 'alerta' : p.decizie === 'confirm' ? 'ok' : 'atentie' }} />
                    : <span className="discret">în așteptare</span>}</td>
                  <td>{p.observatii ?? ''}</td>
                  <td className="nowrap">{p.confirmat_la ? new Date(p.confirmat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pv.stare === 'semnat' && pv.semnat_la && (
          <p className="mesaj ok">Semnat de toți participanții din aplicație la {new Date(pv.semnat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}. Nu se mai modifică.</p>
        )}
        {pv.stare === 'contestat' && <p className="mesaj alerta">Un participant a refuzat. Procesul verbal se anulează și, după remediere, se convoacă unul nou.</p>}
        {pv.stare === 'anulat' && <p className="mesaj info">Anulat de {om(pv.anulat_de)}: {pv.motiv_anulare}</p>}
        <Atasamente proiectId={proiect.id} entitate="pv" entitateId={pv.id} membri={membri}
          poateIncarca={pv.stare !== 'anulat' && (pv.convocat_de === uid || parti.some(p => p.persoana_id === uid))}
          tipuri={['poza', 'pv_scanat', 'altul']} titlu="Documente și fotografii" excludeTipuri={['pv_semnat']}
          gol="Se pot atașa fotografiile de pe șantier și, dacă e cazul, PV-ul semnat olograf (scan)." />
        {pv.stare === 'semnat' && (
          <DocumentSemnat proiectId={proiect.id} entitate="pv" entitateId={pv.id} tip="pv_semnat" membri={membri}
            semnatari={parti.map(p => ({ nume: om(p.persoana_id), calitate: numeRol(p.rol), persoana_id: p.persoana_id }))}
            poateIncarca={pv.convocat_de === uid || parti.some(p => p.persoana_id === uid)}
            deschideDocument={() => window.print()} />
        )}
        <p className="nota doar-tipar">Document generat din Conpro BIM. Confirmările sunt înregistrate cu contul fiecărui participant, cu data și ora.</p>
      </article>

      <div className="nu-tipari">
        {pot.motiv && <p className="mesaj info">{pot.motiv}</p>}
        {potCompleta && <EditareContinut pv={pv} proiect={proiect} eroareInitiala={eroareContinut} onGata={incarca} />}
        {pot.da && eu && <Confirmare pvId={pv.id} onGata={incarca} />}
        <Eroare text={eroare} />
        <div className="actiuni stanga">
          <button className="buton" onClick={() => window.print()}>Tipărește / salvează PDF</button>
          {potAnula && <Anulare pvId={pv.id} onGata={incarca} />}
        </div>
      </div>
    </>
  );
}

function Confirmare({ pvId, onGata }: { pvId: string; onGata: () => void }) {
  const [decizie, setDecizie] = useState<DeciziePv>('confirm');
  const [obs, setObs] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    if (decizie !== 'confirm' && obs.trim().length < 3) { setEroare('Scrieți observațiile sau motivul refuzului.'); return; }
    if (!window.confirm(decizie === 'refuz' ? 'Refuzați procesul verbal? Decizia nu se mai poate schimba.' : 'Confirmați procesul verbal? Confirmarea nu se mai poate modifica.')) return;
    setLucreaza(true);
    const { error } = await supabase.rpc('confirma_pv', { p_pv: pvId, p_decizie: decizie, p_observatii: obs });
    setLucreaza(false);
    if (error) setEroare(mesajEroare(error)); else onGata();
  }

  return (
    <form className="card formular confirmare" onSubmit={trimite}>
      <h3>Decizia dumneavoastră</h3>
      <div className="optiuni">
        {(Object.keys(DECIZII) as DeciziePv[]).map(d => (
          <label key={d} className={`optiune ${decizie === d ? 'activ' : ''} ${d}`}>
            <input type="radio" name="decizie" checked={decizie === d} onChange={() => setDecizie(d)} />
            {d === 'confirm' ? 'Confirm' : d === 'confirm_cu_observatii' ? 'Confirm cu observații' : 'Refuz'}
          </label>
        ))}
      </div>
      {decizie !== 'confirm' && (
        <label>{decizie === 'refuz' ? 'Motivul refuzului' : 'Observații'}
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} required />
        </label>
      )}
      <Eroare text={eroare} />
      <div className="actiuni">
        <button className={`buton principal${decizie === 'refuz' ? ' pericol' : ''}`} disabled={lucreaza}>
          {lucreaza ? 'Se trimite…' : decizie === 'refuz' ? 'Refuz procesul verbal' : 'Confirm procesul verbal'}
        </button>
      </div>
    </form>
  );
}

function Anulare({ pvId, onGata }: { pvId: string; onGata: () => void }) {
  const [deschis, setDeschis] = useState(false);
  const [motiv, setMotiv] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  if (!deschis) return <button className="buton" onClick={() => setDeschis(true)}>Anulează PV-ul</button>;
  return (
    <div className="subformular lat-tot">
      <label>Motivul anulării<input value={motiv} onChange={e => setMotiv(e.target.value)} autoFocus /></label>
      <div className="actiuni stanga">
        <button className="buton" onClick={() => setDeschis(false)}>Renunță</button>
        <button className="buton principal pericol" disabled={motiv.trim().length < 3} onClick={async () => {
          const { error } = await supabase.rpc('anuleaza_pv', { p_pv: pvId, p_motiv: motiv });
          if (error) setEroare(mesajEroare(error)); else { setDeschis(false); onGata(); }
        }}>Anulează definitiv</button>
      </div>
      <Eroare text={eroare} />
    </div>
  );
}

// ------------------------------------------------------- Conținutul PV-ului
type Continut = { descriere: string; referinte: string; concluzii: string };

function CampuriContinut({ valoare, onChange, propune, poatePropune }:
  { valoare: Continut; onChange: (c: Continut) => void; propune: () => { descriere: string; concluzii: string }; poatePropune: boolean }) {
  const [generat, setGenerat] = useState(false);
  const set = (k: keyof Continut, v: string) => onChange({ ...valoare, [k]: v });
  function genereaza() {
    if ((valoare.descriere.trim() || valoare.concluzii.trim())
        && !window.confirm('Înlocuiți textul scris cu propunerea generată?')) return;
    const p = propune();
    onChange({ ...valoare, descriere: p.descriere, concluzii: p.concluzii });
    setGenerat(true);
  }
  return (
    <div className="campuri-continut">
      <label>Documentația de referință
        <input value={valoare.referinte} onChange={e => set('referinte', e.target.value)}
          placeholder="ex. Proiect tehnic nr. 12/2026, planșele R-03, R-04; caietul de sarcini CS-02" />
        <small>Se folosește și în textul propus.</small>
      </label>
      <div className="rand-propunere">
        <button type="button" className="buton" onClick={genereaza} disabled={!poatePropune}>Generează propunere de text</button>
        <span className="discret">Din tipul PV-ului, obiect, elemente, referințe și datele lucrării. Verificați și corectați înainte de salvare.</span>
      </div>
      {generat && <p className="mesaj info">Text propus automat. Completați ce lipsește (de exemplu rezultatele probei sau viciile constatate) și ștergeți ce nu se aplică.</p>}
      <label>Descrierea lucrărilor executate
        <textarea value={valoare.descriere} onChange={e => set('descriere', e.target.value)} rows={5} />
      </label>
      <label>Concluzii
        <textarea value={valoare.concluzii} onChange={e => set('concluzii', e.target.value)} rows={3} />
      </label>
    </div>
  );
}

function EditareContinut({ pv, proiect, eroareInitiala, onGata }:
  { pv: ProcesVerbal; proiect: Proiect; eroareInitiala: string | null; onGata: () => void }) {
  const [c, setC] = useState<Continut>({ descriere: pv.descriere_lucrari ?? '', referinte: pv.referinte_proiect ?? '', concluzii: pv.concluzii ?? '' });
  const [deschis, setDeschis] = useState(!pv.descriere_lucrari);
  const [eroare, setEroare] = useState<string | null>(eroareInitiala);
  const [lucreaza, setLucreaza] = useState(false);

  if (!deschis) return <div className="actiuni stanga"><button className="buton" onClick={() => setDeschis(true)}>Modifică descrierea și concluziile</button></div>;

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const { error } = await supabase.rpc('completeaza_pv', { p_pv: pv.id, p_descriere: c.descriere, p_referinte: c.referinte, p_concluzii: c.concluzii });
    setLucreaza(false);
    if (error) { setEroare(mesajEroare(error)); return; }
    setDeschis(false); onGata();
  }

  return (
    <form className="card formular confirmare" onSubmit={salveaza}>
      <h3>Descrierea lucrărilor și concluziile</h3>
      <p className="discret">Se pot modifica până la prima confirmare. După aceea, toți confirmă exact acest text.</p>
      <CampuriContinut valoare={c} onChange={setC} poatePropune
        propune={() => propunereContinutPv({ tip: pv.tip, obiect: pv.obiect, elemente: pv.elemente, referinte: c.referinte, proiect })} />
      <Eroare text={eroare} />
      <div className="actiuni">
        {pv.descriere_lucrari && <button type="button" className="buton" onClick={() => setDeschis(false)}>Renunță</button>}
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se salvează…' : 'Salvează conținutul'}</button>
      </div>
    </form>
  );
}
