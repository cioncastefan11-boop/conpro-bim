import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { CATEGORII_ECHIPAMENT, codFam, codPv, formatData, type Rol } from '../lib/domeniu';
import type { Echipament, Fam, Incapere, Membru, ProcesVerbal, Proiect, TipEchipament } from '../lib/tipuri';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';
import { incarcaDateProiect, type DateProiect } from '../lib/dateProiect';
import { genereazaCobie, lipsuriEchipament } from '../lib/cobie';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
const SPATII: Rol[] = ['administrator', 'proiectant', 'constructor'];
const ECHIP: Rol[] = ['administrator', 'constructor', 'subcontractor', 'administrator_cladire'];
const nr = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export function descarca(blob: Blob, nume: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nume; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function Echipamente({ proiect, membri, rolulMeu }: Props) {
  const [d, setD] = useState<DateProiect | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [fila, setFila] = useState<'echipamente' | 'tipuri' | 'spatii'>('echipamente');
  const [exporta, setExporta] = useState(false);

  const incarca = useCallback(async () => {
    try { setD(await incarcaDateProiect(proiect, membri)); } catch (e) { setEroare(mesajEroare(e as { message: string })); }
  }, [proiect, membri]);
  useEffect(() => { incarca(); }, [incarca]);

  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  const potSpatii = !!rolulMeu && SPATII.includes(rolulMeu);
  const potEchip = !!rolulMeu && ECHIP.includes(rolulMeu);
  const cuLipsuri = d.echipamente.filter(e => lipsuriEchipament(d, e.id).length > 0).length;
  const complet = d.echipamente.length ? Math.round(100 * (d.echipamente.length - cuLipsuri) / d.echipamente.length) : 0;

  async function exportCobie() {
    setExporta(true); setEroare(null);
    try { descarca(await genereazaCobie(d!), `COBie-${proiect.cod}.xlsx`); }
    catch (e) { setEroare((e as Error).message); }
    setExporta(false);
  }

  return (
    <>
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Echipamente și spații (COBie)</h2>
            <p className="discret">Constructorul completează datele la montaj, nu la final. Din ele rezultă fișierul COBie și manualul de utilizare și mentenanță.</p>
          </div>
          <button className="buton principal" onClick={exportCobie} disabled={exporta || d.tipuri.length === 0}>{exporta ? 'Se generează…' : 'Export COBie (Excel)'}</button>
        </div>
        <div className="indicatori">
          <div><b>{d.niveluri.length}</b><span>niveluri</span></div>
          <div><b>{d.incaperi.length}</b><span>încăperi</span></div>
          <div><b>{d.tipuri.length}</b><span>tipuri</span></div>
          <div><b>{d.echipamente.length}</b><span>echipamente</span></div>
          <div className={cuLipsuri ? 'atentie' : 'ok'}><b>{d.echipamente.length ? `${complet}%` : '—'}</b><span>complete</span></div>
        </div>
        <div className="filtre" role="tablist">
          {(['echipamente', 'tipuri', 'spatii'] as const).map(f => (
            <button key={f} role="tab" aria-selected={fila === f} className={`pastila${fila === f ? ' activ' : ''}`} onClick={() => setFila(f)}>
              {{ echipamente: 'Echipamente montate', tipuri: 'Tipuri de echipamente', spatii: 'Niveluri și încăperi' }[f]}
            </button>
          ))}
        </div>
        <Eroare text={eroare} />
      </div>
      {fila === 'spatii' && <Spatii d={d} pot={potSpatii} onGata={incarca} />}
      {fila === 'tipuri' && <Tipuri d={d} pot={potEchip} onGata={incarca} />}
      {fila === 'echipamente' && <ListaEchipamente d={d} pot={potEchip} onGata={incarca} />}
    </>
  );
}

// -------------------------------------------------------------------- Spații
function Spatii({ d, pot, onGata }: { d: DateProiect; pot: boolean; onGata: () => void }) {
  const [nCod, setNCod] = useState(''); const [nDen, setNDen] = useState(''); const [nCota, setNCota] = useState('');
  const [nivel, setNivel] = useState(d.niveluri[0]?.id ?? '');
  const [lipit, setLipit] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  useEffect(() => { if (!nivel && d.niveluri[0]) setNivel(d.niveluri[0].id); }, [d.niveluri, nivel]);

  async function adaugaNivel(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('niveluri').insert({ proiect_id: d.proiect.id, cod: nCod.trim(), denumire: nDen.trim(), cota: nr(nCota), ordine: d.niveluri.length + 1 });
    if (error) setEroare(mesajEroare(error)); else { setNCod(''); setNDen(''); setNCota(''); onGata(); }
  }

  // Rânduri lipite din Excel: cod, denumire, funcțiune, arie (separate prin tab sau ;)
  const randuri = useMemo(() => lipit.split(/\r?\n/).map(r => r.split(/\t|;/).map(x => x.trim())).filter(r => r[0] && r[1]), [lipit]);
  async function adaugaIncaperi(e: FormEvent) {
    e.preventDefault(); setEroare(null); setMesaj(null);
    const { error } = await supabase.from('incaperi').insert(randuri.map(r => ({
      proiect_id: d.proiect.id, nivel_id: nivel, cod: r[0], denumire: r[1], functiune: r[2] || null, arie: r[3] ? nr(r[3]) : null,
    })));
    if (error) setEroare(mesajEroare(error)); else { setMesaj(`${randuri.length} încăperi adăugate.`); setLipit(''); onGata(); }
  }

  return (
    <div className="card">
      <h3>Niveluri</h3>
      {d.niveluri.length === 0 ? <p className="discret">Niciun nivel definit.</p> : (
        <div className="etichete">{d.niveluri.map(n => <span key={n.id} className="eticheta neutru">{n.cod} · {n.denumire}{n.cota != null ? ` · ${n.cota} m` : ''}</span>)}</div>
      )}
      {pot && (
        <form className="rand-formular trei" onSubmit={adaugaNivel}>
          <label>Cod<input value={nCod} onChange={e => setNCod(e.target.value)} required maxLength={12} placeholder="P" /></label>
          <label>Denumire<input value={nDen} onChange={e => setNDen(e.target.value)} required placeholder="Parter" /></label>
          <label>Cota (m)<input value={nCota} onChange={e => setNCota(e.target.value)} inputMode="decimal" placeholder="0,00" /></label>
          <button className="buton">Adaugă nivelul</button>
        </form>
      )}

      <h3>Încăperi</h3>
      {d.incaperi.length === 0 ? <p className="discret">Nicio încăpere definită.</p> : (
        <div className="tabel-wrap">
          <table className="tabel stivuit">
            <thead><tr><th>Cod</th><th>Denumire</th><th>Nivel</th><th>Funcțiune</th><th>Arie</th><th>Echipamente</th></tr></thead>
            <tbody>
              {d.incaperi.map(i => (
                <tr key={i.id}>
                  <td data-eticheta="Cod"><b>{i.cod}</b></td>
                  <td data-eticheta="Denumire">{i.denumire}</td>
                  <td data-eticheta="Nivel">{d.niveluri.find(n => n.id === i.nivel_id)?.denumire}</td>
                  <td data-eticheta="Funcțiune">{i.functiune ?? '—'}</td>
                  <td data-eticheta="Arie">{i.arie != null ? `${Number(i.arie).toLocaleString('ro-RO')} m²` : '—'}</td>
                  <td data-eticheta="Echipamente">{d.echipamente.filter(e => e.incapere_id === i.id).length || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pot && d.niveluri.length > 0 && (
        <form className="subformular" onSubmit={adaugaIncaperi}>
          <h3>Adăugați încăperi</h3>
          <label>Pe nivelul
            <select value={nivel} onChange={e => setNivel(e.target.value)}>{d.niveluri.map(n => <option key={n.id} value={n.id}>{n.cod} · {n.denumire}</option>)}</select>
          </label>
          <label>Lipiți din Excel sau scrieți câte o încăpere pe rând: cod, denumire, funcțiune, arie
            <textarea value={lipit} onChange={e => setLipit(e.target.value)} rows={5}
              placeholder={'P.01\tCentrală termică\tTehnic\t12,5\nP.02\tHol intrare\tCirculație\t18'} />
            <small>Coloanele separate prin Tab (cum vin din Excel) sau prin punct și virgulă.</small>
          </label>
          {randuri.length > 0 && <p className="discret">Se vor adăuga {randuri.length} încăperi: {randuri.slice(0, 4).map(r => r[0]).join(', ')}{randuri.length > 4 ? '…' : ''}</p>}
          <Eroare text={eroare} />
          {mesaj && <p className="mesaj ok">{mesaj}</p>}
          <div className="actiuni"><button className="buton principal" disabled={!randuri.length || !nivel}>Adaugă încăperile</button></div>
        </form>
      )}
      {pot && d.niveluri.length === 0 && <Eroare text={eroare} />}
    </div>
  );
}

// -------------------------------------------------------------------- Tipuri
type CampTip = { denumire: string; categorie: string; producator: string; model: string; fam_id: string; garantie_luni: string;
  garant: string; interval_mentenanta_luni: string; durata_viata_ani: string; instructiuni_mentenanta: string };
const golTip: CampTip = { denumire: '', categorie: '', producator: '', model: '', fam_id: '', garantie_luni: '', garant: '',
  interval_mentenanta_luni: '', durata_viata_ani: '', instructiuni_mentenanta: '' };
const dinTip = (t: TipEchipament): CampTip => Object.fromEntries(Object.keys(golTip).map(k => [k, (t as Record<string, unknown>)[k] == null ? '' : String((t as Record<string, unknown>)[k])])) as CampTip;

function Tipuri({ d, pot, onGata }: { d: DateProiect; pot: boolean; onGata: () => void }) {
  const [editat, setEditat] = useState<TipEchipament | 'nou' | null>(null);
  const [deschis, setDeschis] = useState<string | null>(null);
  const famuri = d.famuri.filter(f => f.stare === 'aprobat' || f.stare === 'aprobat_cu_observatii');

  return (
    <div className="card">
      <div className="antet-card">
        <div>
          <h3>Tipuri de echipamente</h3>
          <p className="discret">Ce e comun pentru toate bucățile de același fel: producător, model, garanție, mentenanță, fișa tehnică și manualul.</p>
        </div>
        {pot && !editat && <button className="buton principal" onClick={() => setEditat('nou')}>Tip nou</button>}
      </div>
      {editat && <FormularTip d={d} famuri={famuri} tip={editat === 'nou' ? null : editat} onGata={() => { setEditat(null); onGata(); }} onRenunt={() => setEditat(null)} />}
      {d.tipuri.length === 0 ? <Gol titlu="Niciun tip de echipament"><p>Începeți cu tipurile din proiectul de instalații: centrală, pompe, ventiloconvectoare, tablouri electrice.</p></Gol> : (
        <div className="lista-tipuri">
          {d.tipuri.map(t => {
            const docs = d.atasamente.filter(a => a.entitate === 'tip_echipament' && a.entitate_id === t.id).length;
            const buc = d.echipamente.filter(e => e.tip_id === t.id).length;
            return (
              <div key={t.id} className="tip-rand">
                <div className="tip-cap">
                  <div>
                    <b>{t.denumire}</b> <span className="discret">{[t.categorie, t.producator, t.model].filter(Boolean).join(' · ')}</span>
                    <div className="etichete">
                      <span className="eticheta neutru">{buc} {buc === 1 ? 'bucată' : 'bucăți'}</span>
                      {t.garantie_luni != null ? <span className="eticheta neutru">garanție {t.garantie_luni} luni</span> : <span className="eticheta atentie">fără garanție</span>}
                      {t.interval_mentenanta_luni != null ? <span className="eticheta neutru">mentenanță la {t.interval_mentenanta_luni} luni</span> : <span className="eticheta atentie">fără interval de mentenanță</span>}
                      {docs ? <span className="eticheta ok">{docs} documente</span> : <span className="eticheta atentie">fără fișă tehnică</span>}
                    </div>
                  </div>
                  <div className="actiuni-mici">
                    <button className="legatura" onClick={() => setDeschis(deschis === t.id ? null : t.id)}>{deschis === t.id ? 'Închide' : 'Documente'}</button>
                    {pot && <button className="legatura" onClick={() => setEditat(t)}>Modifică</button>}
                  </div>
                </div>
                {deschis === t.id && (
                  <>
                    {t.instructiuni_mentenanta && <p className="instructiuni">{t.instructiuni_mentenanta}</p>}
                    <Atasamente proiectId={d.proiect.id} entitate="tip_echipament" entitateId={t.id} membri={d.membri} poateIncarca={pot}
                      tipuri={['fisa_tehnica', 'manual', 'certificat_garantie', 'dop', 'altul']} titlu="Fișă tehnică, manual, garanție" />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormularTip({ d, famuri, tip, onGata, onRenunt }: { d: DateProiect; famuri: Fam[]; tip: TipEchipament | null; onGata: () => void; onRenunt: () => void }) {
  const [c, setC] = useState<CampTip>(tip ? dinTip(tip) : golTip);
  const [eroare, setEroare] = useState<string | null>(null);
  const s = (k: keyof CampTip) => ({ value: c[k], onChange: (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value }) });

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const rand = {
      denumire: c.denumire.trim(), categorie: c.categorie || null, producator: c.producator.trim() || null, model: c.model.trim() || null,
      fam_id: c.fam_id || null, garantie_luni: nr(c.garantie_luni), garant: c.garant.trim() || null,
      interval_mentenanta_luni: nr(c.interval_mentenanta_luni), durata_viata_ani: nr(c.durata_viata_ani),
      instructiuni_mentenanta: c.instructiuni_mentenanta.trim() || null,
    };
    const { error } = tip
      ? await supabase.from('tipuri_echipament').update(rand).eq('id', tip.id)
      : await supabase.from('tipuri_echipament').insert({ ...rand, proiect_id: d.proiect.id });
    if (error) setEroare(mesajEroare(error)); else onGata();
  }

  return (
    <form className="subformular formular" onSubmit={salveaza}>
      <h3>{tip ? 'Modificați tipul' : 'Tip nou de echipament'}</h3>
      <div className="campuri">
        <label className="lat">Denumirea<input {...s('denumire')} required minLength={3} placeholder="ex. Pompă de căldură aer-apă 12 kW" /></label>
        <label>Categoria
          <select {...s('categorie')}><option value="">—</option>{CATEGORII_ECHIPAMENT.map(x => <option key={x}>{x}</option>)}</select>
        </label>
        <label>Producătorul<input {...s('producator')} /></label>
        <label>Modelul<input {...s('model')} /></label>
        <label>FAM aprobat
          <select {...s('fam_id')}><option value="">—</option>{famuri.map(f => <option key={f.id} value={f.id}>{codFam(d.proiect.cod, f.numar, f.revizie)} · {f.material}</option>)}</select>
        </label>
        <label>Garanția (luni)<input {...s('garantie_luni')} inputMode="numeric" /></label>
        <label>Garantul<input {...s('garant')} placeholder="ex. distribuitorul, instalatorul" /></label>
        <label>Mentenanță la (luni)<input {...s('interval_mentenanta_luni')} inputMode="numeric" placeholder="ex. 12" /></label>
        <label>Durata de viață (ani)<input {...s('durata_viata_ani')} inputMode="numeric" /></label>
        <label className="lat">Instrucțiuni de mentenanță
          <textarea {...s('instructiuni_mentenanta')} rows={3} placeholder="ex. Curățarea filtrelor la 3 luni; verificarea presiunii și a agentului frigorific anual, de firmă autorizată." />
          <small>Apar în manualul de utilizare și mentenanță din Cartea tehnică.</small>
        </label>
      </div>
      <Eroare text={eroare} />
      <div className="actiuni"><button type="button" className="buton" onClick={onRenunt}>Renunță</button><button className="buton principal">Salvează</button></div>
    </form>
  );
}

// ---------------------------------------------------------------- Echipamente
type CampE = { tip_id: string; incapere_id: string; cod: string; serie: string; data_montaj: string; data_punere_functiune: string;
  pv_id: string; garantie_start: string; observatii: string };
const golE: CampE = { tip_id: '', incapere_id: '', cod: '', serie: '', data_montaj: '', data_punere_functiune: '', pv_id: '', garantie_start: '', observatii: '' };

function ListaEchipamente({ d, pot, onGata }: { d: DateProiect; pot: boolean; onGata: () => void }) {
  const [editat, setEditat] = useState<Echipament | 'nou' | null>(null);
  const [doarLipsuri, setDoarLipsuri] = useState(false);
  const [deschis, setDeschis] = useState<string | null>(null);
  const tip = (id: string) => d.tipuri.find(t => t.id === id);
  const inc = (id: string | null) => d.incaperi.find(i => i.id === id);
  const lista = d.echipamente.filter(e => !doarLipsuri || lipsuriEchipament(d, e.id).length > 0);

  return (
    <div className="card">
      <div className="antet-card">
        <div>
          <h3>Echipamente montate</h3>
          <p className="discret">Fiecare bucată, cu eticheta, încăperea, seria și datele de montaj, punere în funcțiune și garanție.</p>
        </div>
        {pot && !editat && d.tipuri.length > 0 && <button className="buton principal" onClick={() => setEditat('nou')}>Echipament nou</button>}
      </div>
      {d.tipuri.length === 0 && <p className="mesaj info">Definiți întâi tipurile de echipamente.</p>}
      {editat && <FormularEchipament d={d} e={editat === 'nou' ? null : editat} onGata={() => { setEditat(null); onGata(); }} onRenunt={() => setEditat(null)} />}
      {d.echipamente.length > 0 && <label className="bifa"><input type="checkbox" checked={doarLipsuri} onChange={e => setDoarLipsuri(e.target.checked)} /> Doar cele cu date lipsă</label>}
      {d.echipamente.length === 0 ? <Gol titlu="Niciun echipament înregistrat"><p>Echipamentele se înregistrează la montaj, cu seria de pe plăcuța de identificare.</p></Gol> : (
        <div className="tabel-wrap">
          <table className="tabel stivuit">
            <thead><tr><th>Etichetă</th><th>Tip</th><th>Încăpere</th><th>Serie</th><th>Montaj</th><th>Garanție până la</th><th>Date</th><th /></tr></thead>
            <tbody>
              {lista.map(e => {
                const t = tip(e.tip_id); const l = lipsuriEchipament(d, e.id);
                let garantie = '—';
                if (e.garantie_start && t?.garantie_luni != null) {
                  const g = new Date(e.garantie_start); g.setMonth(g.getMonth() + t.garantie_luni); garantie = formatData(g.toISOString().slice(0, 10));
                }
                return (
                  <tr key={e.id}>
                    <td data-eticheta="Etichetă"><b>{e.cod}</b></td>
                    <td data-eticheta="Tip">{t?.denumire}</td>
                    <td data-eticheta="Încăpere">{inc(e.incapere_id) ? `${inc(e.incapere_id)!.cod} · ${inc(e.incapere_id)!.denumire}` : '—'}</td>
                    <td data-eticheta="Serie">{e.serie ?? '—'}</td>
                    <td data-eticheta="Montaj">{formatData(e.data_montaj)}</td>
                    <td data-eticheta="Garanție">{garantie}</td>
                    <td data-eticheta="Date"><span>{l.length ? <span title={`Lipsesc: ${l.join(', ')}`}><Eticheta stare={{ eticheta: `${l.length} lipsuri`, ton: 'atentie' }} /></span> : <Eticheta stare={{ eticheta: 'Complet', ton: 'ok' }} />}</span></td>
                    <td data-eticheta="">
                      <span className="actiuni-mici">
                        <button className="legatura" onClick={() => setDeschis(deschis === e.id ? null : e.id)}>{deschis === e.id ? 'Închide' : 'Detalii'}</button>
                        {pot && <button className="legatura" onClick={() => setEditat(e)}>Modifică</button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {deschis && (() => {
        const e = d.echipamente.find(x => x.id === deschis)!; const l = lipsuriEchipament(d, e.id);
        return (
          <div className="subformular">
            <h3>{e.cod} · {tip(e.tip_id)?.denumire}</h3>
            {l.length > 0 && <p className="mesaj atentie-bloc">Lipsesc: {l.join(', ')}.</p>}
            {e.pv_id && <p>PV de punere în funcțiune: {codPv(d.proiect.cod, d.pvs.find(p => p.id === e.pv_id)?.numar ?? 0)}</p>}
            {e.observatii && <p>{e.observatii}</p>}
            <Atasamente proiectId={d.proiect.id} entitate="echipament" entitateId={e.id} membri={d.membri} poateIncarca={pot}
              tipuri={['poza', 'certificat_garantie', 'altul']} titlu="Poze (plăcuța de identificare) și certificate" />
          </div>
        );
      })()}
    </div>
  );
}

function FormularEchipament({ d, e, onGata, onRenunt }: { d: DateProiect; e: Echipament | null; onGata: () => void; onRenunt: () => void }) {
  const [c, setC] = useState<CampE>(e ? Object.fromEntries(Object.keys(golE).map(k => [k, (e as Record<string, unknown>)[k] == null ? '' : String((e as Record<string, unknown>)[k])])) as CampE : { ...golE, tip_id: d.tipuri[0]?.id ?? '' });
  const [eroare, setEroare] = useState<string | null>(null);
  const s = (k: keyof CampE) => ({ value: c[k], onChange: (x: { target: { value: string } }) => setC({ ...c, [k]: x.target.value }) });
  const pvPf: ProcesVerbal[] = d.pvs.filter(p => p.stare === 'semnat' && p.tip === 'punere_in_functiune');

  async function salveaza(ev: FormEvent) {
    ev.preventDefault(); setEroare(null);
    const rand = {
      tip_id: c.tip_id, incapere_id: c.incapere_id || null, cod: c.cod.trim(), serie: c.serie.trim() || null,
      data_montaj: c.data_montaj || null, data_punere_functiune: c.data_punere_functiune || null, pv_id: c.pv_id || null,
      garantie_start: c.garantie_start || c.data_punere_functiune || null, observatii: c.observatii.trim() || null,
    };
    const { error } = e
      ? await supabase.from('echipamente').update(rand).eq('id', e.id)
      : await supabase.from('echipamente').insert({ ...rand, proiect_id: d.proiect.id });
    if (error) setEroare(mesajEroare(error)); else onGata();
  }

  return (
    <form className="subformular formular" onSubmit={salveaza}>
      <h3>{e ? `Modificați ${e.cod}` : 'Echipament nou'}</h3>
      <div className="campuri">
        <label>Eticheta<input {...s('cod')} required maxLength={40} placeholder="ex. PC-01" /></label>
        <label className="lat">Tipul<select {...s('tip_id')} required>{d.tipuri.map(t => <option key={t.id} value={t.id}>{t.denumire}</option>)}</select></label>
        <label>Încăperea
          <select {...s('incapere_id')}><option value="">—</option>{d.incaperi.map((i: Incapere) => <option key={i.id} value={i.id}>{i.cod} · {i.denumire}</option>)}</select>
        </label>
        <label>Seria<input {...s('serie')} /></label>
        <label>Data montajului<input type="date" {...s('data_montaj')} /></label>
        <label>Data punerii în funcțiune<input type="date" {...s('data_punere_functiune')} /></label>
        <label>Începutul garanției<input type="date" {...s('garantie_start')} /><small>Dacă lipsește, se ia data punerii în funcțiune.</small></label>
        <label className="lat">PV de punere în funcțiune
          <select {...s('pv_id')}><option value="">—</option>{pvPf.map(p => <option key={p.id} value={p.id}>{codPv(d.proiect.cod, p.numar)} · {p.obiect}</option>)}</select>
        </label>
        <label className="lat">Observații<input {...s('observatii')} /></label>
      </div>
      <Eroare text={eroare} />
      <div className="actiuni"><button type="button" className="buton" onClick={onRenunt}>Renunță</button><button className="buton principal">Salvează</button></div>
    </form>
  );
}

