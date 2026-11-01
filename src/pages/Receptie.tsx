import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  CALITATI_COMISIE, DECIZII_RECEPTIE, POZITII_COMISIE, STARI_RECEPTIE, azi, calitate, codReceptie, formatData,
  garantieMinima, laIso, numeReceptie, type Rol,
} from '../lib/domeniu';
import type { CalitateComisie, DecizieReceptie, Membru, MembruComisie, ObiectieReceptie, Proiect, Receptie as TReceptie } from '../lib/tipuri';
import { incarcaDateProiect, numeDe, type DateProiect } from '../lib/dateProiect';
import { documenteReceptie, htmlReceptie, propunereConstatari, termenReceptieFinala, verificariPregatire, type Verificare } from '../lib/receptie';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };

export default function Receptie(props: Props) {
  return (
    <Routes>
      <Route index element={<Lista {...props} />} />
      <Route path="noua" element={<Noua {...props} />} />
      <Route path=":receptieId" element={<Detaliu {...props} />} />
    </Routes>
  );
}

function useDate(proiect: Proiect, membri: Membru[]) {
  const [d, setD] = useState<DateProiect | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    try { setD(await incarcaDateProiect(proiect, membri)); }
    catch (e) { setEroare(mesajEroare(e as { message?: string })); }
  }, [proiect, membri]);
  useEffect(() => { incarca(); }, [incarca]);
  return { d, eroare, incarca };
}

const zileRamase = (iso: string) => Math.round((new Date(iso + 'T00:00:00Z').getTime() - azi().getTime()) / 86400000);

function deschide(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Ce are de făcut rolul meu la această recepție, dacă are ceva. */
function deFacut(d: DateProiect, r: TReceptie, rol?: Rol): string | null {
  if (!rol) return null;
  if (rol === 'diriginte' && r.stare === 'pregatire') return 'de convocat';
  if (rol === 'diriginte' && r.stare === 'convocata') return 'de consemnat decizia';
  if (rol === 'beneficiar' && r.stare === 'decisa') return 'de aprobat';
  const ob = d.obiectii.filter(o => o.receptie_id === r.id);
  if ((rol === 'constructor' || rol === 'subcontractor') && ob.some(o => o.stare === 'deschisa')) return 'obiecții de remediat';
  if (rol === 'diriginte' && ob.some(o => o.stare === 'remediata')) return 'remedieri de confirmat';
  if (rol === 'proiectant' && r.tip === 'terminare' && ['pregatire', 'convocata'].includes(r.stare)
      && !d.atasamente.some(a => a.entitate === 'receptie' && a.entitate_id === r.id && a.tip_document === 'punct_vedere_proiectant')) return 'punctul de vedere al proiectantului';
  return null;
}

// --------------------------------------------------------------------- Lista
function Lista({ proiect, membri, rolulMeu }: Props) {
  const { d, eroare } = useDate(proiect, membri);
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  const lista = [...d.receptii].sort((a, b) => b.numar - a.numar);
  const dir = rolulMeu === 'diriginte';
  const terminareActiva = d.receptii.some(r => r.tip === 'terminare' && !r.partiala && !['respinsa', 'anulata'].includes(r.stare));
  const aprobate = d.receptii.filter(r => r.tip === 'terminare' && r.stare === 'aprobata');

  return (
    <>
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Recepția construcției</h2>
            <p className="discret">Recepția la terminarea lucrărilor, apoi recepția finală la expirarea garanției (art. 527). Dirigintele asigură secretariatul comisiei și întocmește documentele (art. 456 lit. j); beneficiarul aprobă.</p>
          </div>
          {dir && (
            <div className="actiuni-antet">
              {!terminareActiva && <Link className="buton principal" to="noua?tip=terminare">Recepție la terminare</Link>}
              <Link className="buton" to="noua?tip=terminare&partiala=1">Recepție parțială</Link>
            </div>
          )}
        </div>
        <Eroare text={eroare} />
        {!proiect.ac_numar && <p className="mesaj atentie-bloc">Autorizația de construire nu e completată în detaliile proiectului. Fără ea, construcția nu se poate recepționa (art. 280 alin. 8).</p>}
        {lista.length === 0 ? (
          <Gol titlu="Nicio recepție încă"><p>Când lucrările sunt gata, dirigintele deschide recepția la terminare: verifică dosarul, compune comisia și o convoacă.</p></Gol>
        ) : (
          <div className="tabel-wrap">
            <table className="tabel stivuit">
              <thead><tr><th>Cod</th><th>Recepția</th><th>Data</th><th>Stare</th><th>Decizia</th><th>De făcut</th></tr></thead>
              <tbody>
                {lista.map(r => {
                  const f = deFacut(d, r, rolulMeu);
                  return (
                    <tr key={r.id}>
                      <td data-eticheta="Cod"><Link to={r.id} className="cod-link fara-rupere">{codReceptie(proiect.cod, r.numar)}</Link></td>
                      <td data-eticheta="Recepția">{numeReceptie(r)}<small className="linia2">{r.obiect}</small></td>
                      <td data-eticheta="Data" className="fara-rupere">{r.data_receptie ? formatData(r.data_receptie) : '—'}</td>
                      <td data-eticheta="Stare"><Eticheta stare={STARI_RECEPTIE[r.stare]} /></td>
                      <td data-eticheta="Decizia">{r.decizie ? DECIZII_RECEPTIE[r.decizie].nume : <span className="discret">—</span>}</td>
                      <td data-eticheta="De făcut">{f ? <Eticheta stare={{ eticheta: f, ton: 'atentie' }} /> : <span className="discret">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aprobate.map(r => {
        const finala = d.receptii.find(x => x.receptie_terminare_id === r.id && !['anulata', 'respinsa'].includes(x.stare)
          && !(x.stare === 'aprobata' && x.decizie === 'prelungire_garantie'));
        const ultimaPrel = d.receptii.filter(x => x.receptie_terminare_id === r.id && x.stare === 'aprobata' && x.decizie === 'prelungire_garantie')
          .sort((a, b) => b.numar - a.numar)[0];
        const pana = ultimaPrel?.garantie_pana ?? r.garantie_pana;
        const finalaAdmisa = d.receptii.some(x => x.receptie_terminare_id === r.id && x.stare === 'aprobata' && x.decizie === 'admitere');
        if (!pana) return null;
        const zile = zileRamase(pana);
        const termen = termenReceptieFinala({ ...r, garantie_pana: pana });
        return (
          <div className="card" key={r.id}>
            <h2>Garanția · {r.obiect}</h2>
            {finalaAdmisa ? <p className="mesaj ok">Recepția finală a fost admisă. Construcția e în exploatare (stadiul 7).</p> : (
              <>
                <div className="kpi-rand">
                  <div className="kpi"><span>Garanția expiră</span><b>{formatData(pana)}</b><small>{zile > 0 ? `peste ${zile} zile` : zile === 0 ? 'astăzi' : `de ${-zile} zile`}</small></div>
                  <div className="kpi"><span>Recepția finală, cel târziu</span><b>{termen ? formatData(termen) : '—'}</b><small>în 10 zile de la expirare (art. 532 alin. 4)</small></div>
                  <div className="kpi"><span>Durata garanției</span><b>{r.garantie_luni} luni</b><small>de la {formatData(r.data_receptie)}{ultimaPrel ? ', prelungită' : ''}</small></div>
                </div>
                <p className="discret">În perioada de garanție executantul remediază viciile ascunse (art. 531 alin. 3). Defectele apărute se consemnează la recepția finală.</p>
                {finala ? <p><Link to={finala.id}>{codReceptie(proiect.cod, finala.numar)} · recepția finală ({STARI_RECEPTIE[finala.stare].eticheta.toLowerCase()})</Link></p>
                  : dir && <Link className="buton" to={`noua?tip=finala&terminare=${r.id}`}>Deschide recepția finală</Link>}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

// --------------------------------------------------------------------- Nouă
function Noua({ proiect, rolulMeu, uid }: Props) {
  const nav = useNavigate();
  const [q] = useSearchParams();
  const tip = q.get('tip') === 'finala' ? 'finala' : 'terminare';
  const partiala = q.get('partiala') === '1';
  const terminare = q.get('terminare');
  const min = garantieMinima(proiect.clasa_consecinte);
  const [c, setC] = useState({ obiect: partiala ? '' : 'Întreaga construcție', data_finalizare_lucrari: '', data_receptie: '', loc: 'Pe șantier', garantie_luni: min ? String(min) : '' });
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const [term, setTerm] = useState<TReceptie | null>(null);
  useEffect(() => {
    if (terminare) supabase.from('receptii').select('*').eq('id', terminare).maybeSingle().then(({ data }) => {
      setTerm(data as TReceptie); if (data) setC(x => ({ ...x, obiect: (data as TReceptie).obiect }));
    });
  }, [terminare]);
  if (rolulMeu !== 'diriginte') return <Gol titlu="Recepția o pregătește dirigintele de șantier, ca secretariat al comisiei" />;

  const s = (k: keyof typeof c) => ({ value: c[k], onChange: (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value }) });
  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const { error } = await supabase.from('receptii').insert({
      proiect_id: proiect.id, tip, partiala: tip === 'finala' ? term?.partiala ?? false : partiala, obiect: c.obiect.trim(),
      receptie_terminare_id: tip === 'finala' ? terminare : null,
      data_finalizare_lucrari: tip === 'terminare' ? c.data_finalizare_lucrari || null : null,
      data_receptie: c.data_receptie || null, loc: c.loc.trim() || null,
      garantie_luni: tip === 'terminare' && c.garantie_luni ? Number(c.garantie_luni) : null,
    });
    if (error) { setLucreaza(false); setEroare(mesajEroare(error)); return; }
    const { data } = await supabase.from('receptii').select('id').eq('proiect_id', proiect.id).eq('creat_de', uid)
      .order('creat_la', { ascending: false }).limit(1).single();
    setLucreaza(false);
    nav(data ? `../${data.id}` : '..');
  }

  return (
    <form className="card formular" onSubmit={salveaza}>
      <p><Link to=".." className="inapoi">← Recepția construcției</Link></p>
      <h2>{tip === 'finala' ? 'Recepția finală' : partiala ? 'Recepție parțială la terminarea lucrărilor' : 'Recepția la terminarea lucrărilor'}</h2>
      {partiala && <p className="mesaj info">Recepția parțială se face pentru părți distincte fizic și funcțional, care pot fi exploatate în siguranță. Decizia o ia beneficiarul la cererea executantului, cu avizul proiectantului (art. 527 alin. 3).</p>}
      {tip === 'finala' && term && <p className="mesaj info">După {codReceptie(proiect.cod, term.numar)} din {formatData(term.data_receptie)}. Comisia verifică remedierea viciilor din garanție și poate decide încheierea garanției sau prelungirea ei (art. 532).</p>}
      <div className="campuri">
        <label className="lat">Ce se recepționează<input {...s('obiect')} required minLength={3} placeholder={partiala ? 'ex. Corpul A, cu instalațiile aferente' : ''} /></label>
        {tip === 'terminare' && <label>Data finalizării lucrărilor<input type="date" {...s('data_finalizare_lucrari')} max={laIso(azi())} /><small>Cea din înștiințarea emitentului AC (art. 280 alin. 10).</small></label>}
        <label>Data recepției<input type="date" {...s('data_receptie')} /></label>
        <label>Locul<input {...s('loc')} /></label>
        {tip === 'terminare' && (
          <label>Garanția (luni)<input {...s('garantie_luni')} inputMode="numeric" required />
            <small>{min ? `Minimum ${min} luni pentru ${proiect.clasa_consecinte} (art. 531 alin. 6); se poate mai mult prin contract.` : 'Clasa de consecințe nu e completată: treceți durata din contract.'}</small>
          </label>
        )}
      </div>
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link to=".." className="buton">Renunță</Link>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se creează…' : 'Creează recepția'}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------- Detaliu
const PASI = [
  { id: 'pregatire', nume: 'Pregătire' }, { id: 'convocata', nume: 'Ședința comisiei' },
  { id: 'decisa', nume: 'Aprobarea beneficiarului' }, { id: 'aprobata', nume: 'Remedieri și garanție' },
];

function ListaVerificari({ lista }: { lista: Verificare[] }) {
  return (
    <ul className="verificari">
      {lista.map(v => (
        <li key={v.text} className={v.bine ? 'bine' : v.obligatoriu ? 'lipsa' : 'atentie'}>
          <span className="semn" aria-hidden>{v.bine ? '✓' : v.obligatoriu ? '✕' : '!'}</span>
          <div><b>{v.text}</b>{v.detalii && <small>{v.detalii}</small>}</div>
          {v.unde && !v.bine && <Link to={`../../${v.unde}`} className="discret">Deschide</Link>}
        </li>
      ))}
    </ul>
  );
}

function Detaliu({ proiect, membri, rolulMeu }: Props) {
  const { receptieId = '' } = useParams();
  const { d, eroare: eroareDate, incarca } = useDate(proiect, membri);
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const r = d?.receptii.find(x => x.id === receptieId);

  const rpc = async (fn: string, args: Record<string, unknown>, ok?: string) => {
    setEroare(null); setMesaj(null);
    const { error } = await supabase.rpc(fn, args);
    if (error) { setEroare(mesajEroare(error)); return false; }
    if (ok) setMesaj(ok);
    await incarca(); return true;
  };

  if (!d) return <><Eroare text={eroareDate} /><p className="discret">Se încarcă…</p></>;
  if (!r) return <Gol titlu="Recepția nu există" />;

  const dir = rolulMeu === 'diriginte';
  const exec = rolulMeu === 'constructor' || rolulMeu === 'subcontractor';
  const comisie = d.comisii.filter(m => m.receptie_id === r.id).sort((a, b) => a.ordine - b.ordine);
  const obiectii = d.obiectii.filter(o => o.receptie_id === r.id);
  const pas = r.stare === 'respinsa' || r.stare === 'anulata' ? -1 : PASI.findIndex(p => p.id === r.stare);
  const verif = verificariPregatire(d, r);
  const docs = documenteReceptie(d, r);
  const tipuriAtas = rolulMeu === 'proiectant' ? ['punct_vedere_proiectant']
    : dir ? ['punct_vedere_diriginte', 'pv_receptie_semnat', 'fisa_instruire', 'as_built', 'instiintare_finalizare', 'altul']
    : exec ? ['as_built', 'fisa_instruire', 'altul']
    : rolulMeu === 'beneficiar' ? ['raport_comportare', 'altul'] : [];
  const term = r.tip === 'finala' ? d.receptii.find(x => x.id === r.receptie_terminare_id) : undefined;

  return (
    <>
      <p className="nu-tipari"><Link to=".." className="inapoi">← Recepția construcției</Link></p>
      <article className="card receptie">
        <header className="antet-pv">
          <div>
            <span className="cod">{codReceptie(proiect.cod, r.numar)}</span>
            <h2>{numeReceptie(r)}</h2>
            <p className="discret">{r.obiect}{r.data_receptie ? ` · ${formatData(r.data_receptie)}` : ''}{r.loc ? `, ${r.loc}` : ''}{term ? ` · după ${codReceptie(proiect.cod, term.numar)}` : ''}</p>
          </div>
          <Eticheta stare={STARI_RECEPTIE[r.stare]} />
        </header>

        {pas >= 0 && (
          <ol className="pasi">
            {PASI.map((p, i) => <li key={p.id} className={i < pas ? 'gata' : i === pas ? 'acum' : ''}><span>{i + 1}</span>{p.nume}</li>)}
          </ol>
        )}
        {r.stare === 'anulata' && <p className="mesaj">Anulată: {r.motiv_anulare}</p>}
        <Eroare text={eroare} />
        {mesaj && <p className="mesaj ok">{mesaj}</p>}

        {(r.stare === 'pregatire' || r.stare === 'convocata') && <DateReceptie r={r} proiect={proiect} editabil={dir} onGata={incarca} />}

        <h3>Comisia de recepție</h3>
        <Comisie r={r} comisie={comisie} dir={dir} onGata={incarca} setEroare={setEroare} />

        {r.stare === 'pregatire' && (
          <>
            <h3>Înainte de convocare</h3>
            <ListaVerificari lista={verif} />
            {dir && (
              <div className="actiuni stanga">
                <button className="buton principal" disabled={verif.some(v => v.obligatoriu && !v.bine)}
                  onClick={() => rpc('receptie_convoaca', { p_receptie: r.id }, 'Comisia a fost convocată.')}>Convoacă comisia</button>
                {verif.some(v => v.obligatoriu && !v.bine) && <small className="discret">Completați punctele marcate cu ✕.</small>}
              </div>
            )}
          </>
        )}

        <h3>{r.tip === 'terminare' ? 'Documentele de recepție (art. 528 alin. 3)' : 'Documentele recepției finale'}</h3>
        <ListaVerificari lista={docs} />
        <Atasamente proiectId={proiect.id} entitate="receptie" entitateId={r.id} membri={membri}
          poateIncarca={tipuriAtas.length > 0 && r.stare !== 'anulata'} tipuri={tipuriAtas.length ? tipuriAtas : ['altul']}
          titlu="Documente atașate la recepție" gol="Punctele de vedere, fișele de instruire, as-built-ul și PV-ul semnat se atașează aici." />

        <h3>{r.tip === 'finala' ? 'Defecte constatate' : 'Obiecții'}</h3>
        <Obiectii r={r} obiectii={obiectii} d={d} dir={dir} exec={exec} proiect={proiect} membri={membri} rpc={rpc} onGata={incarca} setEroare={setEroare} />

        {r.stare === 'convocata' && dir && <Decizie r={r} d={d} comisie={comisie} obiectii={obiectii} rpc={rpc} />}

        {r.decizie && (
          <>
            <h3>Decizia comisiei</h3>
            <div className={`decizie-bloc ${DECIZII_RECEPTIE[r.decizie].ton}`}>
              <b>{DECIZII_RECEPTIE[r.decizie].nume}</b>
              <p>{r.constatari}</p>
              {r.motivare_decizie && <p><i>{r.motivare_decizie}</i></p>}
              {r.decizie === 'prelungire_garantie' && r.garantie_pana && <p>Garanția se prelungește până la <b>{formatData(r.garantie_pana)}</b>.</p>}
              <small className="discret">Consemnată de {numeDe(d, r.decis_de)}, {r.decis_la ? new Date(r.decis_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : ''}</small>
            </div>
          </>
        )}

        {r.stare === 'decisa' && rolulMeu === 'beneficiar' && <Aprobare r={r} rpc={rpc} />}
        {r.stare === 'decisa' && rolulMeu !== 'beneficiar' && <p className="mesaj info">Se așteaptă aprobarea beneficiarului / investitorului.</p>}
        {r.aprobat_la && (
          <p className={`mesaj ${r.stare === 'aprobata' ? 'ok' : 'alerta'}`}>
            {r.stare === 'aprobata' ? 'Aprobată' : 'Respinsă'} de beneficiar ({numeDe(d, r.aprobat_de)}) la {formatData(r.aprobat_la.slice(0, 10))}{r.observatii_beneficiar ? `: ${r.observatii_beneficiar}` : '.'}
            {r.stare === 'aprobata' && r.tip === 'terminare' && r.garantie_pana && ` Garanția curge până la ${formatData(r.garantie_pana)}.`}
          </p>
        )}

        <div className="actiuni stanga nu-tipari">
          <button className="buton" onClick={() => deschide(htmlReceptie(d, r))}>Procesul verbal (tipărire / PDF)</button>
          {dir && (r.stare === 'pregatire' || r.stare === 'convocata') && <Anulare r={r} rpc={rpc} />}
        </div>
      </article>
    </>
  );
}

function DateReceptie({ r, proiect, editabil, onGata }: { r: TReceptie; proiect: Proiect; editabil: boolean; onGata: () => void }) {
  const [c, setC] = useState({ obiect: r.obiect, data_finalizare_lucrari: r.data_finalizare_lucrari ?? '', data_receptie: r.data_receptie ?? '', loc: r.loc ?? '', garantie_luni: r.garantie_luni ? String(r.garantie_luni) : '' });
  const [eroare, setEroare] = useState<string | null>(null);
  const [salvat, setSalvat] = useState(false);
  const s = (k: keyof typeof c) => ({ value: c[k], onChange: (e: { target: { value: string } }) => { setSalvat(false); setC({ ...c, [k]: e.target.value }); } });
  const min = garantieMinima(proiect.clasa_consecinte);
  async function salveaza() {
    setEroare(null);
    const { error } = await supabase.from('receptii').update({
      obiect: c.obiect.trim(), data_finalizare_lucrari: c.data_finalizare_lucrari || null, data_receptie: c.data_receptie || null,
      loc: c.loc.trim() || null, garantie_luni: c.garantie_luni ? Number(c.garantie_luni) : null,
    }).eq('id', r.id);
    if (error) setEroare(mesajEroare(error)); else { setSalvat(true); onGata(); }
  }
  return (
    <fieldset disabled={!editabil} className="formular">
      <div className="campuri">
        <label className="lat">Ce se recepționează<input {...s('obiect')} /></label>
        {r.tip === 'terminare' && <label>Data finalizării lucrărilor<input type="date" {...s('data_finalizare_lucrari')} /></label>}
        <label>Data recepției<input type="date" {...s('data_receptie')} /></label>
        <label>Locul<input {...s('loc')} /></label>
        {r.tip === 'terminare' && <label>Garanția (luni)<input {...s('garantie_luni')} inputMode="numeric" />{min && <small>Minimum {min} luni ({proiect.clasa_consecinte}).</small>}</label>}
      </div>
      {editabil && <div className="actiuni stanga"><button type="button" className="buton" onClick={salveaza}>Salvează datele</button>{salvat && <span className="mesaj-scurt">Salvat.</span>}</div>}
      <Eroare text={eroare} />
    </fieldset>
  );
}

function Comisie({ r, comisie, dir, onGata, setEroare }: { r: TReceptie; comisie: MembruComisie[]; dir: boolean; onGata: () => void; setEroare: (s: string | null) => void }) {
  const [nou, setNou] = useState({ nume: '', calitate: 'presedinte' as CalitateComisie, institutie: '' });
  const [poz, setPoz] = useState<Record<string, { pozitie: string; motivare: string }>>({});
  const membriVot = comisie.filter(m => !calitate(m.calitate).invitat);
  async function adauga(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('comisie_receptie').insert({ receptie_id: r.id, nume: nou.nume.trim(), calitate: nou.calitate, institutie: nou.institutie.trim() || null, ordine: comisie.length + 1 });
    if (error) setEroare(mesajEroare(error)); else { setNou({ nume: '', calitate: 'specialist', institutie: '' }); onGata(); }
  }
  async function sterge(id: string) {
    const { error } = await supabase.from('comisie_receptie').delete().eq('id', id);
    if (error) setEroare(mesajEroare(error)); else onGata();
  }
  async function consemneaza(m: MembruComisie) {
    const v = poz[m.id]; if (!v?.pozitie) return;
    setEroare(null);
    const { error } = await supabase.from('comisie_receptie').update({ pozitie: v.pozitie, motivare: v.motivare.trim() || null }).eq('id', m.id);
    if (error) setEroare(mesajEroare(error)); else onGata();
  }
  return (
    <>
      {comisie.length === 0 ? <p className="discret">Comisia nu e încă numită. Ea e desemnată de investitor: președintele, reprezentantul emitentului autorizației, specialiștii și, după caz, ISC, ISU, cultura, ordonatorul de credite. Executantul și proiectantul participă ca invitați.</p> : (
        <div className="tabel-wrap">
          <table className="tabel stivuit">
            <thead><tr><th>Nume</th><th>Calitatea</th><th>Instituția</th><th>Poziția</th>{dir && r.stare === 'pregatire' && <th />}</tr></thead>
            <tbody>
              {comisie.map(m => {
                const cal = calitate(m.calitate);
                const editPoz = dir && r.stare === 'convocata' && !cal.invitat;
                const v = poz[m.id] ?? { pozitie: m.pozitie ?? '', motivare: m.motivare ?? '' };
                return (
                  <tr key={m.id}>
                    <td data-eticheta="Nume">{m.nume}</td>
                    <td data-eticheta="Calitatea">{cal.nume}{cal.veto && <small className="linia2">drept de veto</small>}</td>
                    <td data-eticheta="Instituția">{m.institutie || <span className="discret">—</span>}</td>
                    <td data-eticheta="Poziția">
                      {cal.invitat ? <span className="discret">fără vot</span> : editPoz ? (
                        <div className="pozitie">
                          <select value={v.pozitie} onChange={e => setPoz({ ...poz, [m.id]: { ...v, pozitie: e.target.value } })}>
                            <option value="">— de consemnat —</option>
                            <option value="de_acord">{POZITII_COMISIE.de_acord}</option>
                            <option value="obiectii">{POZITII_COMISIE.obiectii}</option>
                            {cal.veto && <option value="veto">{POZITII_COMISIE.veto}</option>}
                          </select>
                          {(v.pozitie === 'veto' || v.pozitie === 'obiectii') && <input placeholder={v.pozitie === 'veto' ? 'Motivarea în scris (obligatorie)' : 'Ce obiecții are'} value={v.motivare} onChange={e => setPoz({ ...poz, [m.id]: { ...v, motivare: e.target.value } })} />}
                          {(v.pozitie !== (m.pozitie ?? '') || v.motivare !== (m.motivare ?? '')) && <button className="buton mic" onClick={() => consemneaza(m)}>Consemnează</button>}
                        </div>
                      ) : m.pozitie ? <><Eticheta stare={{ eticheta: POZITII_COMISIE[m.pozitie], ton: m.pozitie === 'veto' ? 'alerta' : m.pozitie === 'obiectii' ? 'atentie' : 'ok' }} />{m.motivare && <small className="linia2">{m.motivare}</small>}</>
                        : <span className="discret">{r.stare === 'pregatire' ? 'după convocare' : '—'}</span>}
                    </td>
                    {dir && r.stare === 'pregatire' && <td><button className="buton mic" onClick={() => sterge(m.id)}>Scoate</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dir && r.stare === 'convocata' && membriVot.some(m => !m.pozitie) && <p className="discret">Consemnați poziția fiecărui membru exprimată în ședință.</p>}
      {dir && r.stare === 'pregatire' && (
        <form className="rand-adaugare" onSubmit={adauga}>
          <label>Nume<input value={nou.nume} onChange={e => setNou({ ...nou, nume: e.target.value })} required minLength={3} /></label>
          <label>Calitatea<select value={nou.calitate} onChange={e => setNou({ ...nou, calitate: e.target.value as CalitateComisie })}>
            {CALITATI_COMISIE.map(c => <option key={c.id} value={c.id}>{c.nume}</option>)}
          </select></label>
          <label>Instituția<input value={nou.institutie} onChange={e => setNou({ ...nou, institutie: e.target.value })} placeholder="ex. Primăria Sectorului 6" /></label>
          <button className="buton">Adaugă</button>
        </form>
      )}
    </>
  );
}

function Obiectii({ r, obiectii, d, dir, exec, proiect, membri, rpc, onGata, setEroare }: {
  r: TReceptie; obiectii: ObiectieReceptie[]; d: DateProiect; dir: boolean; exec: boolean; proiect: Proiect; membri: Membru[];
  rpc: (fn: string, a: Record<string, unknown>, ok?: string) => Promise<boolean>; onGata: () => void; setEroare: (s: string | null) => void;
}) {
  const [nou, setNou] = useState({ descriere: '', termen: '', responsabil: 'Executantul' });
  const [text, setText] = useState<Record<string, string>>({});
  async function adauga(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('obiectii_receptie').insert({ receptie_id: r.id, descriere: nou.descriere.trim(), termen: nou.termen, responsabil: nou.responsabil.trim() || null });
    if (error) setEroare(mesajEroare(error)); else { setNou({ descriere: '', termen: '', responsabil: 'Executantul' }); onGata(); }
  }
  return (
    <>
      {obiectii.length === 0 ? <p className="discret">{r.stare === 'convocata' ? 'Obiecțiile formulate în ședință se consemnează aici, cu termen de remediere.' : 'Nicio obiecție.'}</p> : (
        <ul className="obiectii">
          {obiectii.map(o => {
            const intarziat = o.stare !== 'confirmata' && o.termen < laIso(azi());
            return (
              <li key={o.id}>
                <div className="obiectie-cap">
                  <b>{o.numar}. {o.descriere}</b>
                  <Eticheta stare={o.stare === 'confirmata' ? { eticheta: 'Remediată', ton: 'ok' } : o.stare === 'remediata' ? { eticheta: 'De confirmat', ton: 'atentie' } : { eticheta: intarziat ? 'Termen depășit' : 'Deschisă', ton: intarziat ? 'alerta' : 'neutru' }} />
                </div>
                <small className="discret">Termen {formatData(o.termen)}{o.responsabil ? ` · ${o.responsabil}` : ''}{o.confirmat_la ? ` · confirmată de ${numeDe(d, o.confirmat_de)} la ${formatData(o.confirmat_la.slice(0, 10))}` : ''}</small>
                {o.remediere && <p className="remediere">{o.remediere}</p>}
                {exec && o.stare === 'deschisa' && (
                  <div className="rand-actiune">
                    <input placeholder="Ce s-a făcut pentru remediere" value={text[o.id] ?? ''} onChange={e => setText({ ...text, [o.id]: e.target.value })} />
                    <button className="buton mic principal" onClick={() => rpc('obiectie_remediata', { p_obiectie: o.id, p_remediere: text[o.id] ?? '' }, 'Remedierea a fost raportată.')}>Raportez remedierea</button>
                  </div>
                )}
                {dir && o.stare === 'remediata' && (
                  <div className="rand-actiune">
                    <input placeholder="Observații (obligatoriu la refuz)" value={text[o.id] ?? ''} onChange={e => setText({ ...text, [o.id]: e.target.value })} />
                    <button className="buton mic principal" onClick={() => rpc('obiectie_confirma', { p_obiectie: o.id, p_accept: true, p_observatii: text[o.id] ?? null }, 'Remedierea a fost confirmată.')}>Confirm</button>
                    <button className="buton mic" onClick={() => rpc('obiectie_confirma', { p_obiectie: o.id, p_accept: false, p_observatii: text[o.id] ?? '' })}>Nu accept</button>
                  </div>
                )}
                <Atasamente proiectId={proiect.id} entitate="obiectie_receptie" entitateId={o.id} membri={membri}
                  poateIncarca={exec && o.stare !== 'confirmata'} ascundeDacaGol={!(exec && o.stare !== 'confirmata')}
                  tipuri={['dovada_remediere', 'poza']} titlu="Dovezi" gol="Fotografii sau documente care arată remedierea." />
              </li>
            );
          })}
        </ul>
      )}
      {dir && r.stare === 'convocata' && (
        <form className="rand-adaugare" onSubmit={adauga}>
          <label className="lat">{r.tip === 'finala' ? 'Defectul constatat' : 'Obiecția'}<input value={nou.descriere} onChange={e => setNou({ ...nou, descriere: e.target.value })} required minLength={5} placeholder="ex. Retușuri la tencuiala din casa scării, etajul 2" /></label>
          <label>Termen<input type="date" value={nou.termen} min={laIso(azi())} onChange={e => setNou({ ...nou, termen: e.target.value })} required /></label>
          <label>Responsabil<input value={nou.responsabil} onChange={e => setNou({ ...nou, responsabil: e.target.value })} /></label>
          <button className="buton">Adaugă</button>
        </form>
      )}
    </>
  );
}

function Decizie({ r, d, comisie, obiectii, rpc }: {
  r: TReceptie; d: DateProiect; comisie: MembruComisie[]; obiectii: ObiectieReceptie[];
  rpc: (fn: string, a: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const veto = comisie.some(m => m.pozitie === 'veto');
  const lipsa = comisie.filter(m => !calitate(m.calitate).invitat && !m.pozitie).length;
  const deschise = obiectii.filter(o => o.stare !== 'confirmata').length;
  const optiuni = (Object.keys(DECIZII_RECEPTIE) as DecizieReceptie[]).filter(k => !DECIZII_RECEPTIE[k].doarFinala || r.tip === 'finala');
  const implicit: DecizieReceptie = veto ? 'respingere' : deschise ? (r.tip === 'finala' ? 'prelungire_garantie' : 'admitere_cu_obiectii') : 'admitere';
  const [dec, setDec] = useState<DecizieReceptie>(implicit);
  const [constatari, setConstatari] = useState(r.constatari ?? '');
  const [motivare, setMotivare] = useState('');
  const [pana, setPana] = useState('');
  const blocat = (k: DecizieReceptie) => (veto && k !== 'respingere') || (k === 'admitere' && deschise > 0)
    || ((k === 'admitere_cu_obiectii' || k === 'prelungire_garantie') && obiectii.length === 0);
  const motivObligatoriu = ['suspendare', 'respingere', 'prelungire_garantie'].includes(dec);
  return (
    <div className="card formular confirmare">
      <h3>Decizia comisiei</h3>
      {lipsa > 0 && <p className="mesaj atentie-bloc">Mai trebuie consemnată poziția a {lipsa} {lipsa === 1 ? 'membru' : 'membri'} ai comisiei.</p>}
      {veto && <p className="mesaj alerta">Un membru cu drept de veto a propus respingerea: recepția nu poate fi admisă.</p>}
      <div className="optiuni-decizie">
        {optiuni.map(k => (
          <label key={k} className={blocat(k) ? 'dezactivat' : ''}>
            <input type="radio" name="decizie" checked={dec === k} disabled={blocat(k)} onChange={() => setDec(k)} />
            {DECIZII_RECEPTIE[k].nume}
          </label>
        ))}
      </div>
      <label>Constatările comisiei
        <textarea rows={5} value={constatari} onChange={e => setConstatari(e.target.value)} />
      </label>
      <div><button type="button" className="buton mic" onClick={() => setConstatari(propunereConstatari(d, r))}>Propune text din datele proiectului</button></div>
      {motivObligatoriu && <label>Motivarea în scris<textarea rows={2} value={motivare} onChange={e => setMotivare(e.target.value)} /></label>}
      {dec === 'prelungire_garantie' && <label>Garanția se prelungește până la<input type="date" value={pana} onChange={e => setPana(e.target.value)} /><small>Până la remedierea defectelor (art. 532 alin. 3).</small></label>}
      <div className="actiuni">
        <button className="buton principal" disabled={lipsa > 0 || blocat(dec)}
          onClick={() => rpc('receptie_decide', { p_receptie: r.id, p_decizie: dec, p_constatari: constatari, p_motivare: motivare || null, p_garantie_pana: pana || null }, 'Decizia a fost consemnată și trimisă beneficiarului.')}>
          Consemnează decizia
        </button>
      </div>
    </div>
  );
}

function Aprobare({ r, rpc }: { r: TReceptie; rpc: (fn: string, a: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [obs, setObs] = useState('');
  const poateAproba = r.decizie !== 'suspendare' && r.decizie !== 'respingere';
  return (
    <div className="card formular confirmare">
      <h3>Aprobarea beneficiarului / investitorului</h3>
      <p className="discret">{poateAproba ? 'Comisia propune admiterea. Aprobați sau respingeți recepția, cu motivare (regulamentul de recepție: în 3 zile de la decizia comisiei).' : 'Comisia propune ' + (r.decizie === 'suspendare' ? 'suspendarea' : 'respingerea') + ' recepției. Luați act de decizie.'}</p>
      <label>Observații{poateAproba && <small> (obligatorii la respingere)</small>}<textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} /></label>
      <div className="actiuni">
        <button className="buton" onClick={() => rpc('receptie_aproba', { p_receptie: r.id, p_aproba: false, p_observatii: obs || (poateAproba ? '' : 'Am luat act de decizia comisiei.') })}>{poateAproba ? 'Resping recepția' : 'Iau act'}</button>
        {poateAproba && <button className="buton principal" onClick={() => rpc('receptie_aproba', { p_receptie: r.id, p_aproba: true, p_observatii: obs || null }, 'Recepția a fost aprobată.')}>Aprob recepția</button>}
      </div>
    </div>
  );
}

function Anulare({ r, rpc }: { r: TReceptie; rpc: (fn: string, a: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [deschis, setDeschis] = useState(false);
  const [motiv, setMotiv] = useState('');
  return deschis ? (
    <span className="rand-actiune">
      <input placeholder="Motivul anulării" value={motiv} onChange={e => setMotiv(e.target.value)} />
      <button className="buton mic" onClick={() => rpc('receptie_anuleaza', { p_receptie: r.id, p_motiv: motiv })}>Anulez recepția</button>
    </span>
  ) : <button className="buton" onClick={() => setDeschis(true)}>Anulează…</button>;
}

