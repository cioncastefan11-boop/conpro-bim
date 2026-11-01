import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  CLASE_BETON, TIPURI_INCERCARE, azi, codFam, codPv, formatData, laIso, numeIncercare, rezistenteClasa, tipPv, type Rol,
} from '../lib/domeniu';
import type { Fam, Incercare, Membru, ProcesVerbal, Proiect, Turnare } from '../lib/tipuri';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
const EXECUTANTI: Rol[] = ['constructor', 'subcontractor'];
const INTRODUC_REZULTATE: Rol[] = ['laborator', 'constructor', 'subcontractor'];

export default function Betoane(props: Props) {
  return (
    <Routes>
      <Route index element={<Condica {...props} />} />
      <Route path="nou" element={<TurnareNoua {...props} />} />
      <Route path=":turnareId" element={<DetaliuTurnare {...props} />} />
    </Routes>
  );
}

const nr = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const om = (membri: Membru[], id: string | null) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? (p.nume || p.email) : '—'; };

// ------------------------------------------------------------------- Condica
function Condica({ proiect, membri, rolulMeu }: Props) {
  const [turnari, setTurnari] = useState<Turnare[] | null>(null);
  const [incercari, setIncercari] = useState<Incercare[]>([]);
  const [famuri, setFamuri] = useState<Fam[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);

  const incarca = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('turnari').select('*').eq('proiect_id', proiect.id).order('numar', { ascending: false }),
      supabase.from('incercari').select('*').eq('proiect_id', proiect.id).order('creat_la', { ascending: false }),
      supabase.from('fam').select('*').eq('proiect_id', proiect.id).in('stare', ['aprobat', 'aprobat_cu_observatii']),
    ]);
    setEroare(mesajEroare(a.error ?? b.error ?? c.error));
    setTurnari((a.data as Turnare[]) ?? []);
    setIncercari((b.data as Incercare[]) ?? []);
    setFamuri((c.data as Fam[]) ?? []);
  }, [proiect.id]);
  useEffect(() => { incarca(); }, [incarca]);

  const pe = (t: string) => incercari.filter(i => i.turnare_id === t);
  const deVizat = (turnari ?? []).filter(t => !t.vizat_la);
  const neverificate = incercari.filter(i => !i.verificat_la);
  const volumTotal = (turnari ?? []).reduce((s, t) => s + (Number(t.volum) || 0), 0);
  const peMateriale = incercari.filter(i => i.fam_id && !i.turnare_id);

  return (
    <>
      {rolulMeu === 'diriginte' && (deVizat.length > 0 || neverificate.length > 0) && (
        <div className="mesaj atentie-bloc">
          <b>De verificat:</b> {deVizat.length > 0 && `${deVizat.length} ${deVizat.length === 1 ? 'turnare nevizată' : 'turnări nevizate'}`}
          {deVizat.length > 0 && neverificate.length > 0 && ', '}
          {neverificate.length > 0 && `${neverificate.length} ${neverificate.length === 1 ? 'rezultat de încercare neluat la cunoștință' : 'rezultate de încercări neluate la cunoștință'}`}.
        </div>
      )}
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Condica de betoane</h2>
            <p className="discret">O ține executantul (RTE): fiecare turnare cu elementul, clasa, volumul, bonurile, condițiile și probele. Dirigintele o vizează.</p>
          </div>
          {rolulMeu && EXECUTANTI.includes(rolulMeu) && <Link className="buton principal" to="nou">Turnare nouă</Link>}
        </div>
        <Eroare text={eroare} />
        {turnari === null ? <p className="discret">Se încarcă…</p> : turnari.length === 0 ? (
          <Gol titlu="Nicio turnare înregistrată"><p>Prima turnare o înregistrează constructorul, după ce PV-ul pentru armătură e semnat.</p></Gol>
        ) : (
          <>
            <p className="discret">{turnari.length} {turnari.length === 1 ? 'turnare' : 'turnări'}, {volumTotal.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} m³ în total.</p>
            <div className="tabel-wrap">
              <table className="tabel stivuit">
                <thead><tr><th>Nr.</th><th>Data</th><th>Element</th><th>Beton</th><th>Volum</th><th>Probe</th><th>Rezultate</th><th>Viză</th></tr></thead>
                <tbody>
                  {turnari.map(t => {
                    const r = pe(t.id);
                    const nc = r.filter(x => !x.conform).length;
                    return (
                      <tr key={t.id}>
                        <td data-eticheta="Nr."><Link to={t.id} className="cod-link">{t.numar}</Link></td>
                        <td data-eticheta="Data">{formatData(t.data)}</td>
                        <td data-eticheta="Element">{t.element}</td>
                        <td data-eticheta="Beton">{t.clasa_beton}{t.clasa_expunere ? ` ${t.clasa_expunere}` : ''}{t.consistenta ? ` ${t.consistenta}` : ''}</td>
                        <td data-eticheta="Volum">{t.volum != null ? `${Number(t.volum).toLocaleString('ro-RO')} m³` : '—'}</td>
                        <td data-eticheta="Probe">{t.probe_prelevate ?? '—'}</td>
                        <td data-eticheta="Rezultate"><span>{r.length === 0 ? <span className="discret">în așteptare</span>
                          : nc > 0 ? <Eticheta stare={{ eticheta: `${nc} neconform${nc > 1 ? 'e' : ''}`, ton: 'alerta' }} />
                          : <Eticheta stare={{ eticheta: `${r.length} conform${r.length > 1 ? 'e' : ''}`, ton: 'ok' }} />}</span></td>
                        <td data-eticheta="Viză">{t.vizat_la ? <Eticheta stare={{ eticheta: 'Vizată', ton: 'ok' }} /> : <Eticheta stare={{ eticheta: 'Nevizată', ton: 'neutru' }} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Încercări pe materiale</h2>
        <p className="discret">Rezultatele încercărilor pe materiale cu FAM aprobat (de exemplu aderența adezivului sau densitatea polistirenului).</p>
        <ListaIncercari incercari={peMateriale} membri={membri} rolulMeu={rolulMeu} onGata={incarca}
          eticheta={i => famuri.find(f => f.id === i.fam_id) ? codFam(proiect.cod, famuri.find(f => f.id === i.fam_id)!.numar, famuri.find(f => f.id === i.fam_id)!.revizie) : ''} />
        {rolulMeu && INTRODUC_REZULTATE.includes(rolulMeu) && (
          famuri.length ? <IncercareNoua proiectId={proiect.id} famuri={famuri} codProiect={proiect.cod} onGata={incarca} />
            : <p className="discret">Rezultatele se pot introduce după ce există materiale cu FAM aprobat.</p>
        )}
      </div>
    </>
  );
}

// -------------------------------------------------------------- Câmpurile turnării
type CampuriT = {
  data: string; element: string; clasa_beton: string; clasa_expunere: string; consistenta: string; dmax: string; volum: string;
  statie: string; fam_id: string; pv_id: string; bonuri: string; ora_inceput: string; ora_sfarsit: string; temp_aer: string;
  temp_beton: string; mod_punere: string; tratare: string; probe_prelevate: string; coduri_probe: string; observatii: string;
};
const golT = (): CampuriT => ({
  data: laIso(azi()), element: '', clasa_beton: 'C25/30', clasa_expunere: '', consistenta: 'S3', dmax: '16', volum: '', statie: '',
  fam_id: '', pv_id: '', bonuri: '', ora_inceput: '', ora_sfarsit: '', temp_aer: '', temp_beton: '', mod_punere: '', tratare: '',
  probe_prelevate: '', coduri_probe: '', observatii: '',
});
const dinTurnare = (t: Turnare): CampuriT => Object.fromEntries(Object.keys(golT()).map(k => {
  const v = (t as Record<string, unknown>)[k];
  return [k, v == null ? '' : String(v).slice(0, k.startsWith('ora') ? 5 : undefined)];
})) as CampuriT;
const pentruBaza = (c: CampuriT) => ({
  data: c.data, element: c.element.trim(), clasa_beton: c.clasa_beton.trim().toUpperCase(),
  clasa_expunere: c.clasa_expunere.trim() || null, consistenta: c.consistenta.trim() || null, dmax: nr(c.dmax), volum: nr(c.volum),
  statie: c.statie.trim() || null, fam_id: c.fam_id || null, pv_id: c.pv_id || null, bonuri: c.bonuri.trim() || null,
  ora_inceput: c.ora_inceput || null, ora_sfarsit: c.ora_sfarsit || null, temp_aer: nr(c.temp_aer), temp_beton: nr(c.temp_beton),
  mod_punere: c.mod_punere.trim() || null, tratare: c.tratare.trim() || null, probe_prelevate: nr(c.probe_prelevate),
  coduri_probe: c.coduri_probe.trim() || null, observatii: c.observatii.trim() || null,
});

function useLegaturi(proiectId: string) {
  const [famuri, setFamuri] = useState<Fam[]>([]);
  const [pvs, setPvs] = useState<ProcesVerbal[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from('fam').select('*').eq('proiect_id', proiectId).in('stare', ['aprobat', 'aprobat_cu_observatii']),
      supabase.from('procese_verbale').select('*').eq('proiect_id', proiectId).eq('stare', 'semnat').order('numar', { ascending: false }),
    ]).then(([a, b]) => { setFamuri((a.data as Fam[]) ?? []); setPvs((b.data as ProcesVerbal[]) ?? []); });
  }, [proiectId]);
  return { famuri, pvs };
}

function FormularTurnare({ c, set, proiect, blocat }: { c: CampuriT; set: (x: CampuriT) => void; proiect: Proiect; blocat?: boolean }) {
  const { famuri, pvs } = useLegaturi(proiect.id);
  const s = (k: keyof CampuriT) => ({ value: c[k], onChange: (e: { target: { value: string } }) => set({ ...c, [k]: e.target.value }) });
  const rez = rezistenteClasa(c.clasa_beton);
  return (
    <fieldset disabled={blocat}>
      <div className="campuri">
        <label>Data turnării<input type="date" {...s('data')} max={laIso(azi())} required /></label>
        <label className="lat">Elementul / zona<input {...s('element')} required minLength={3} placeholder="ex. Placa +3,00, axele 1–6 / A–D" /></label>
        <label>Clasa betonului
          <input {...s('clasa_beton')} list="clase-beton" required pattern="L?C[0-9]{1,3}/[0-9]{1,3}" placeholder="C25/30" />
          <datalist id="clase-beton">{CLASE_BETON.map(x => <option key={x} value={x} />)}</datalist>
          {rez && <small>fck = {rez.fck} MPa (cilindri) · fck,cub = {rez.fckCub} MPa (cuburi)</small>}
        </label>
        <label>Clasa de expunere<input {...s('clasa_expunere')} placeholder="ex. XC1, XC4+XF1" /></label>
        <label>Consistența<input {...s('consistenta')} placeholder="ex. S3" /></label>
        <label>Dmax agregat (mm)<input {...s('dmax')} inputMode="numeric" /></label>
        <label>Volumul (m³)<input {...s('volum')} inputMode="decimal" placeholder="ex. 42,5" /></label>
        <label>Stația / producătorul<input {...s('statie')} /></label>
        <label className="lat">FAM-ul betonului
          <select {...s('fam_id')}>
            <option value="">— fără legătură —</option>
            {famuri.map(f => <option key={f.id} value={f.id}>{codFam(proiect.cod, f.numar, f.revizie)} · {f.material}</option>)}
          </select>
          <small>Doar FAM-uri aprobate.</small>
        </label>
        <label className="lat">PV-ul pentru armătură / lucrări ascunse
          <select {...s('pv_id')}>
            <option value="">— fără legătură —</option>
            {pvs.map(p => <option key={p.id} value={p.id}>{codPv(proiect.cod, p.numar)} · {tipPv(p.tip).nume} · {p.obiect}</option>)}
          </select>
          <small>Doar PV-uri semnate de toți participanții.</small>
        </label>
        <label className="lat">Bonurile de livrare<input {...s('bonuri')} placeholder="ex. 1021, 1022, 1023" /></label>
        <label>Ora de început<input type="time" {...s('ora_inceput')} /></label>
        <label>Ora de sfârșit<input type="time" {...s('ora_sfarsit')} /></label>
        <label>Temperatura aerului (°C)<input {...s('temp_aer')} inputMode="decimal" /></label>
        <label>Temperatura betonului (°C)<input {...s('temp_beton')} inputMode="decimal" /></label>
        <label className="lat">Modul de punere în operă<input {...s('mod_punere')} placeholder="ex. pompă, compactare cu pervibrator" /></label>
        <label className="lat">Protecția și tratarea după turnare<input {...s('tratare')} placeholder="ex. stropire cu apă 7 zile, folie" /></label>
        <label>Probe prelevate (seturi)<input {...s('probe_prelevate')} inputMode="numeric" /></label>
        <label className="lat">Codurile probelor<input {...s('coduri_probe')} placeholder="ex. P1-2026-11-04 (3 cuburi), P2 (3 cuburi)" /></label>
        <label className="lat">Observații<textarea {...s('observatii')} rows={2} /></label>
      </div>
      {c.temp_aer !== '' && Number(c.temp_aer.replace(',', '.')) < 5 && (
        <p className="mesaj info">Temperatura aerului sub +5 °C: se aplică măsurile pentru betonarea pe timp friguros prevăzute în proiect și în normativ.</p>
      )}
    </fieldset>
  );
}

function TurnareNoua({ proiect, rolulMeu, uid }: Props) {
  const nav = useNavigate();
  const [c, setC] = useState<CampuriT>(golT());
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  if (!rolulMeu || !EXECUTANTI.includes(rolulMeu)) return <Gol titlu="Condica de betoane o ține executantul (constructor / RTE)" />;

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const { error } = await supabase.from('turnari').insert({ ...pentruBaza(c), proiect_id: proiect.id });
    if (error) { setLucreaza(false); setEroare(mesajEroare(error)); return; }
    const { data } = await supabase.from('turnari').select('id').eq('proiect_id', proiect.id).eq('inregistrat_de', uid)
      .order('creat_la', { ascending: false }).limit(1).single();
    setLucreaza(false);
    nav(data ? `../${data.id}` : '..');
  }

  return (
    <form className="card formular" onSubmit={salveaza}>
      <p><Link to=".." className="inapoi">← Condica de betoane</Link></p>
      <h2>Turnare nouă</h2>
      <FormularTurnare c={c} set={setC} proiect={proiect} />
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link to=".." className="buton">Renunță</Link>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se înregistrează…' : 'Înregistrează turnarea'}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------ Detaliul turnării
function DetaliuTurnare({ proiect, membri, rolulMeu }: Props) {
  const { turnareId = '' } = useParams();
  const [t, setT] = useState<Turnare | null>(null);
  const [c, setC] = useState<CampuriT>(golT());
  const [incercari, setIncercari] = useState<Incercare[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [obsViza, setObsViza] = useState('');
  const [negasit, setNegasit] = useState(false);

  const incarca = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('turnari').select('*').eq('id', turnareId).maybeSingle(),
      supabase.from('incercari').select('*').eq('turnare_id', turnareId).order('creat_la'),
    ]);
    if (!a.data) { setNegasit(!a.error); setEroare(mesajEroare(a.error)); return; }
    setT(a.data as Turnare); setC(dinTurnare(a.data as Turnare));
    setIncercari((b.data as Incercare[]) ?? []);
  }, [turnareId]);
  useEffect(() => { incarca(); }, [incarca]);

  const rez = useMemo(() => (t ? rezistenteClasa(t.clasa_beton) : null), [t]);
  if (negasit) return <Gol titlu="Turnarea nu există" />;
  if (!t) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;

  const executant = !!rolulMeu && EXECUTANTI.includes(rolulMeu);
  const editabil = executant && !t.vizat_la;
  const comp28 = incercari.filter(i => i.tip === 'compresiune_28' && i.valoare != null);
  const media = comp28.length ? comp28.reduce((s, i) => s + Number(i.valoare), 0) / comp28.length : null;

  async function salveaza() {
    setEroare(null); setMesaj(null);
    const { error } = await supabase.from('turnari').update(pentruBaza(c)).eq('id', t!.id);
    if (error) setEroare(mesajEroare(error)); else { setMesaj('Salvat.'); incarca(); }
  }
  async function vizeaza() {
    setEroare(null);
    if (!window.confirm('Vizați turnarea? După viză nu se mai poate modifica.')) return;
    const { error } = await supabase.rpc('vizeaza_turnare', { p_turnare: t!.id, p_observatii: obsViza });
    if (error) setEroare(mesajEroare(error)); else incarca();
  }

  return (
    <>
      <p className="nu-tipari"><Link to=".." className="inapoi">← Condica de betoane</Link></p>
      <article className="card document-pv">
        <header className="antet-pv">
          <div>
            <span className="cod">CONDICA {proiect.cod} · nr. {t.numar}</span>
            <h2>Turnare · {t.element}</h2>
            <p className="discret">{formatData(t.data)} · înregistrată de {om(membri, t.inregistrat_de)}</p>
          </div>
          {t.vizat_la ? <Eticheta stare={{ eticheta: 'Vizată', ton: 'ok' }} /> : <Eticheta stare={{ eticheta: 'Nevizată', ton: 'neutru' }} />}
        </header>
        <FormularTurnare c={c} set={setC} proiect={proiect} blocat={!editabil} />
        {editabil && (
          <div className="actiuni stanga nu-tipari">
            <button className="buton principal" onClick={salveaza}>Salvează modificările</button>
            {mesaj && <span className="mesaj-scurt">{mesaj}</span>}
          </div>
        )}
        {t.vizat_la && <p className="mesaj ok">Vizată de {om(membri, t.vizat_de)}, {new Date(t.vizat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}{t.observatii_viza ? `: ${t.observatii_viza}` : ''}.</p>}
        <Eroare text={eroare} />

        <h3>Rezultatele încercărilor</h3>
        {rez && <p className="discret">Clasa {t.clasa_beton}: fck,cub = {rez.fckCub} MPa. {media != null && <>Media rezultatelor la 28 de zile: <b>{media.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} MPa</b> din {comp28.length} {comp28.length === 1 ? 'rezultat' : 'rezultate'}.</>} Conformitatea o stabilește laboratorul după criteriile din normativ; aplicația doar o consemnează.</p>}
        <ListaIncercari incercari={incercari} membri={membri} rolulMeu={rolulMeu} onGata={incarca} referinta={rez?.fckCub} />
        {rolulMeu && INTRODUC_REZULTATE.includes(rolulMeu) && (
          <IncercareNoua proiectId={proiect.id} turnare={t} codProiect={proiect.cod} onGata={incarca} />
        )}

        <Atasamente proiectId={proiect.id} entitate="turnare" entitateId={t.id} membri={membri}
          poateIncarca={!!rolulMeu && ['constructor', 'subcontractor', 'diriginte'].includes(rolulMeu)}
          tipuri={['bon_livrare', 'poza', 'altul']} titlu="Bonuri și fotografii" gol="Se pot atașa bonurile de livrare și fotografii de la turnare." />
      </article>

      <div className="nu-tipari">
        {rolulMeu === 'diriginte' && !t.vizat_la && (
          <div className="card formular confirmare">
            <h3>Viza dirigintelui</h3>
            <label>Observații (opțional)<input value={obsViza} onChange={e => setObsViza(e.target.value)} /></label>
            <div className="actiuni"><button className="buton principal" onClick={vizeaza}>Vizez turnarea</button></div>
          </div>
        )}
        <div className="actiuni stanga"><button className="buton" onClick={() => window.print()}>Tipărește / salvează PDF</button></div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Încercări
function ListaIncercari({ incercari, membri, rolulMeu, onGata, referinta, eticheta }:
  { incercari: Incercare[]; membri: Membru[]; rolulMeu?: Rol; onGata: () => void; referinta?: number; eticheta?: (i: Incercare) => string }) {
  const [eroare, setEroare] = useState<string | null>(null);
  if (incercari.length === 0) return <p className="discret">Niciun rezultat încă.</p>;

  async function iaAct(id: string) {
    setEroare(null);
    const { error } = await supabase.rpc('ia_la_cunostinta_incercare', { p_incercare: id });
    if (error) setEroare(mesajEroare(error)); else onGata();
  }

  return (
    <>
      <div className="tabel-wrap">
        <table className="tabel stivuit">
          <thead><tr>{eticheta && <th>FAM</th>}<th>Încercarea</th><th>Rezultat</th><th>Cerință</th><th>Buletin</th><th>Concluzie</th><th>Diriginte</th></tr></thead>
          <tbody>
            {incercari.map(i => (
              <tr key={i.id}>
                {eticheta && <td data-eticheta="FAM" className="nowrap">{eticheta(i)}</td>}
                <td data-eticheta="Încercarea">{i.descriere || numeIncercare(i.tip)}{i.varsta_zile != null && <span className="discret"> · {i.varsta_zile} zile</span>}</td>
                <td data-eticheta="Rezultat">
                  <span>{i.valoare != null ? `${Number(i.valoare).toLocaleString('ro-RO')} ${i.unitate ?? ''}` : '—'}
                  {referinta && i.tip === 'compresiune_28' && i.valoare != null && Number(i.valoare) < referinta && <span className="discret"> (sub fck,cub)</span>}</span>
                </td>
                <td data-eticheta="Cerință">{i.cerinta ?? '—'}</td>
                <td data-eticheta="Buletin">{[i.buletin_numar, i.buletin_data && formatData(i.buletin_data), i.laborator].filter(Boolean).join(' · ') || '—'}</td>
                <td data-eticheta="Concluzie">
                  <span><Eticheta stare={i.conform ? { eticheta: 'Conform', ton: 'ok' } : { eticheta: 'Neconform', ton: 'alerta' }} />
                  {i.observatii && <><br /><span className="discret">{i.observatii}</span></>}</span>
                </td>
                <td data-eticheta="Diriginte">
                  {i.verificat_la ? <span className="discret">Luat la cunoștință, {om(membri, i.verificat_de)}</span>
                    : rolulMeu === 'diriginte' ? <button className="legatura" onClick={() => iaAct(i.id)}>Iau la cunoștință</button>
                    : <span className="discret">în așteptare</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {incercari.map(i => (
        <Atasamente key={i.id} proiectId={i.proiect_id} entitate="incercare" entitateId={i.id} membri={membri}
          poateIncarca={false} tipuri={['buletin']} titlu={`Buletin: ${i.descriere || numeIncercare(i.tip)}${i.buletin_numar ? ` nr. ${i.buletin_numar}` : ''}`} ascundeDacaGol />
      ))}
      <Eroare text={eroare} />
    </>
  );
}

function IncercareNoua({ proiectId, turnare, famuri, codProiect, onGata }:
  { proiectId: string; turnare?: Turnare; famuri?: Fam[]; codProiect: string; onGata: () => void }) {
  const rez = turnare ? rezistenteClasa(turnare.clasa_beton) : null;
  const [deschis, setDeschis] = useState(false);
  const [famId, setFamId] = useState(famuri?.[0]?.id ?? '');
  const [tip, setTip] = useState(turnare ? 'compresiune_28' : 'altul');
  const [descriere, setDescriere] = useState('');
  const [laborator, setLaborator] = useState('');
  const [buletin, setBuletin] = useState('');
  const [dataB, setDataB] = useState(laIso(azi()));
  const [valoare, setValoare] = useState('');
  const [unitate, setUnitate] = useState(turnare ? 'MPa' : '');
  const [cerinta, setCerinta] = useState(rez ? `≥ ${rez.fckCub} MPa (fck,cub)` : '');
  const [conform, setConform] = useState(true);
  const [obs, setObs] = useState('');
  const [fisier, setFisier] = useState<File | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const t = TIPURI_INCERCARE.find(x => x.id === tip);

  if (!deschis) return <div className="actiuni stanga nu-tipari"><button className="buton principal" onClick={() => setDeschis(true)}>Adaugă un rezultat</button></div>;

  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from('incercari').insert({
      id, proiect_id: proiectId, turnare_id: turnare?.id ?? null, fam_id: turnare ? null : famId || null, tip,
      descriere: descriere.trim() || t?.nume || null, laborator: laborator.trim() || null, buletin_numar: buletin.trim() || null,
      buletin_data: dataB || null, varsta_zile: t?.varsta ?? null, valoare: nr(valoare), unitate: unitate.trim() || null,
      cerinta: cerinta.trim() || null, conform, observatii: obs.trim() || null,
    });
    if (error) { setLucreaza(false); setEroare(mesajEroare(error)); return; }
    if (fisier) {
      const cale = `${proiectId}/incercare/${id}/${crypto.randomUUID().slice(0, 8)}-${fisier.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
      const up = await supabase.storage.from('documente').upload(cale, fisier);
      if (!up.error) await supabase.from('atasamente').insert({ proiect_id: proiectId, entitate: 'incercare', entitate_id: id, tip_document: 'buletin', nume_fisier: fisier.name, cale, marime: fisier.size });
      else setEroare(`Rezultatul s-a salvat, dar buletinul nu s-a încărcat: ${up.error.message}`);
    }
    setLucreaza(false); setDeschis(false); onGata();
  }

  return (
    <form className="subformular" onSubmit={trimite}>
      <h3>Rezultat nou</h3>
      <div className="campuri">
        {!turnare && famuri && (
          <label className="lat">Materialul (FAM aprobat)
            <select value={famId} onChange={e => setFamId(e.target.value)} required>
              {famuri.map(f => <option key={f.id} value={f.id}>{codFam(codProiect, f.numar, f.revizie)} · {f.material}</option>)}
            </select>
          </label>
        )}
        <label>Încercarea
          <select value={tip} onChange={e => { setTip(e.target.value); const x = TIPURI_INCERCARE.find(y => y.id === e.target.value); if (x?.unitate) setUnitate(x.unitate); }}>
            {TIPURI_INCERCARE.filter(x => turnare || x.id === 'altul').map(x => <option key={x.id} value={x.id}>{x.nume}</option>)}
          </select>
        </label>
        {tip === 'altul' && <label className="lat">Descrierea încercării<input value={descriere} onChange={e => setDescriere(e.target.value)} required placeholder="ex. Aderența la tracțiune a adezivului" /></label>}
        <label>Valoarea<input value={valoare} onChange={e => setValoare(e.target.value)} inputMode="decimal" /></label>
        <label>Unitatea<input value={unitate} onChange={e => setUnitate(e.target.value)} /></label>
        <label>Cerința<input value={cerinta} onChange={e => setCerinta(e.target.value)} placeholder="ex. ≥ 0,08 N/mm²" /></label>
        <label>Laboratorul<input value={laborator} onChange={e => setLaborator(e.target.value)} /></label>
        <label>Buletinul, nr.<input value={buletin} onChange={e => setBuletin(e.target.value)} /></label>
        <label>Data buletinului<input type="date" value={dataB} onChange={e => setDataB(e.target.value)} /></label>
        <label className="lat">Buletinul (PDF)<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFisier(e.target.files?.[0] ?? null)} /></label>
      </div>
      <div className="optiuni">
        <label className={`optiune ${conform ? 'activ confirm' : ''}`}><input type="radio" checked={conform} onChange={() => setConform(true)} /> Conform</label>
        <label className={`optiune ${!conform ? 'activ refuz' : ''}`}><input type="radio" checked={!conform} onChange={() => setConform(false)} /> Neconform</label>
      </div>
      <label>{conform ? 'Observații (opțional)' : 'Ce nu corespunde'}<textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} required={!conform} /></label>
      <p className="nota">Rezultatul nu se mai modifică după salvare. Dirigintele îl ia la cunoștință, iar luarea la cunoștință intră în registrul lui.</p>
      <Eroare text={eroare} />
      <div className="actiuni"><button type="button" className="buton" onClick={() => setDeschis(false)}>Renunță</button><button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se salvează…' : 'Salvează rezultatul'}</button></div>
    </form>
  );
}
