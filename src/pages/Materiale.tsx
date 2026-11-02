import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  AVIZE, STARI_FAM, azi, codFam, formatData, laIso,
  type AvizFam, type DecizieFam, type Rol,
} from '../lib/domeniu';
import type { Fam, LivrareFam, Membru, Proiect } from '../lib/tipuri';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';
import Atasamente from '../components/Atasamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
const AUTORI: Rol[] = ['constructor', 'subcontractor'];

export default function Materiale(props: Props) {
  return (
    <Routes>
      <Route index element={<Lista {...props} />} />
      <Route path="nou" element={<FamNou {...props} />} />
      <Route path=":famId" element={<Detaliu {...props} />} />
    </Routes>
  );
}

/** Ce trebuie să facă rolul meu cu acest FAM, dacă e ceva. */
function deFacut(f: Fam, rol?: Rol) {
  if (!rol) return false;
  if ((f.stare === 'ciorna' || f.stare === 'completari') && AUTORI.includes(rol)) return true;
  if (f.stare === 'depus' && rol === 'proiectant') return true;
  if (f.stare === 'avizat' && rol === 'diriginte') return true;
  return false;
}

// --------------------------------------------------------------------- Lista
function Lista({ proiect, rolulMeu }: Props) {
  const [lista, setLista] = useState<Fam[] | null>(null);
  const [livrari, setLivrari] = useState<LivrareFam[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [toate, setToate] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from('fam').select('*').eq('proiect_id', proiect.id).order('numar', { ascending: false }).order('revizie', { ascending: false }),
      supabase.from('livrari_fam').select('*').eq('proiect_id', proiect.id),
    ]).then(([a, b]) => {
      setEroare(mesajEroare(a.error ?? b.error));
      setLista((a.data as Fam[]) ?? []);
      setLivrari((b.data as LivrareFam[]) ?? []);
    });
  }, [proiect.id]);

  // implicit se arată doar ultima revizie a fiecărui FAM
  const vizibile = useMemo(() => {
    if (!lista) return [];
    if (toate) return lista;
    const vazute = new Set<number>();
    return lista.filter(f => (vazute.has(f.numar) ? false : (vazute.add(f.numar), true)));
  }, [lista, toate]);
  const mele = vizibile.filter(f => deFacut(f, rolulMeu));
  const neconforme = (id: string) => livrari.filter(l => l.fam_id === id && !l.conform).length;

  return (
    <>
      {mele.length > 0 && (
        <div className="mesaj atentie-bloc">
          <b>Așteaptă acțiunea dumneavoastră:</b>{' '}
          {mele.map((f, i) => <span key={f.id}>{i > 0 && ', '}<Link to={f.id}>{codFam(proiect.cod, f.numar, f.revizie)}</Link></span>)}
        </div>
      )}
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Materiale · FAM</h2>
            <p className="discret">Fiecare material se aprobă înainte de comandă și de punerea în operă: constructorul depune, proiectantul avizează, dirigintele aprobă.</p>
          </div>
          {rolulMeu && AUTORI.includes(rolulMeu) && <Link className="buton principal" to="nou">FAM nou</Link>}
        </div>
        <label className="bifa"><input type="checkbox" checked={toate} onChange={e => setToate(e.target.checked)} /> Arată și reviziile anterioare</label>
        <Eroare text={eroare} />
        {lista === null ? <p className="discret">Se încarcă…</p> : vizibile.length === 0 ? (
          <Gol titlu="Niciun FAM încă"><p>Primul FAM îl întocmește constructorul, pentru materialele din lista stabilită la mobilizare.</p></Gol>
        ) : (
          <div className="tabel-wrap">
            <table className="tabel stivuit">
              <thead><tr><th>Cod</th><th>Material</th><th>Produs propus</th><th>Utilizare</th><th>Livrări</th><th>Stare</th></tr></thead>
              <tbody>
                {vizibile.map(f => {
                  const nl = livrari.filter(l => l.fam_id === f.id).length;
                  const nc = neconforme(f.id);
                  return (
                    <tr key={f.id}>
                      <td data-eticheta="Cod"><Link to={f.id} className="cod-link">{codFam(proiect.cod, f.numar, f.revizie)}</Link></td>
                      <td data-eticheta="Material">{f.material}</td>
                      <td data-eticheta="Produs">{[f.producator, f.produs].filter(Boolean).join(', ') || '—'}</td>
                      <td data-eticheta="Utilizare">{f.utilizare ?? '—'}</td>
                      <td data-eticheta="Livrări"><span>{nl || '—'}{nc > 0 && <> <span className="eticheta alerta">{nc} {nc === 1 ? 'neconformă' : 'neconforme'}</span></>}</span></td>
                      <td data-eticheta="Stare"><Eticheta stare={STARI_FAM[f.stare]} /></td>
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

// ------------------------------------------------------------ Câmpurile FAM
type Campuri = Pick<Fam, 'material' | 'utilizare' | 'cerinte_proiect' | 'producator' | 'produs' | 'furnizor'
  | 'performante_declarate' | 'date_mediu' | 'dop_numar' | 'dop_data' | 'marcaj_ce' | 'agrement_numar' | 'agrement_valabil_pana' | 'alte_documente'>;
const GOL: Campuri = {
  material: '', utilizare: '', cerinte_proiect: '', producator: '', produs: '', furnizor: '', performante_declarate: '',
  date_mediu: '', dop_numar: '', dop_data: null, marcaj_ce: false, agrement_numar: '', agrement_valabil_pana: null, alte_documente: '',
};
const curata = (c: Campuri) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v])) as Campuri;

function FormularFam({ v, set, blocat }: { v: Campuri; set: (c: Campuri) => void; blocat?: boolean }) {
  const s = <K extends keyof Campuri>(k: K, x: Campuri[K]) => set({ ...v, [k]: x });
  const t = (k: keyof Campuri) => ({ value: (v[k] as string) ?? '', onChange: (e: { target: { value: string } }) => s(k, e.target.value as never) });
  return (
    <fieldset disabled={blocat}>
      <h3>Ce cere proiectul</h3>
      <div className="campuri">
        <label className="lat">Materialul<input {...t('material')} required minLength={3} placeholder="ex. Polistiren expandat EPS 80 pentru termosistem" /></label>
        <label className="lat">Unde se pune în operă<input {...t('utilizare')} placeholder="ex. Pereți exteriori, etajele 1–4" /></label>
        <label className="lat">Performanțele cerute în proiect și caietul de sarcini
          <textarea {...t('cerinte_proiect')} rows={2} placeholder="ex. λ ≤ 0,039 W/mK; clasa de reacție la foc E; rezistență la compresiune ≥ 80 kPa" />
        </label>
      </div>
      <h3>Produsul propus</h3>
      <div className="campuri">
        <label>Producător<input {...t('producator')} /></label>
        <label>Produs (denumire comercială, tip)<input {...t('produs')} /></label>
        <label>Furnizor<input {...t('furnizor')} /></label>
        <label className="lat">Performanțele declarate<textarea {...t('performante_declarate')} rows={2} placeholder="Din declarația de performanță" /></label>
        <label className="lat">Date de mediu
          <input {...t('date_mediu')} placeholder="ex. EPD nr. …, emisii COV, conținut reciclat" />
          <small>Cerința fundamentală h), emisii în mediul exterior (art. 386 din Legea 169/2026).</small>
        </label>
      </div>
      <h3>Documente însoțitoare (art. 563)</h3>
      <div className="campuri">
        <label>Declarația de performanță, nr.<input {...t('dop_numar')} /></label>
        <label>din data<input type="date" value={v.dop_data ?? ''} onChange={e => s('dop_data', e.target.value || null)} /></label>
        <label className="bifa"><input type="checkbox" checked={v.marcaj_ce} onChange={e => s('marcaj_ce', e.target.checked)} /> Marcaj CE</label>
        <label>Agrement tehnic, nr.<input {...t('agrement_numar')} /></label>
        <label>valabil până la<input type="date" value={v.agrement_valabil_pana ?? ''} onChange={e => s('agrement_valabil_pana', e.target.value || null)} /></label>
        <label className="lat">Alte documente de conformitate<input {...t('alte_documente')} placeholder="ex. declarație de conformitate, certificat de conformitate, instrucțiuni" /></label>
      </div>
    </fieldset>
  );
}

// ------------------------------------------------------------------- FAM nou
function FamNou({ proiect, rolulMeu, uid }: Props) {
  const nav = useNavigate();
  const [v, setV] = useState<Campuri>(GOL);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  if (!rolulMeu || !AUTORI.includes(rolulMeu)) return <Gol titlu="FAM-urile le întocmește constructorul sau subcontractorul" />;

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const { error } = await supabase.from('fam').insert({ ...curata(v), proiect_id: proiect.id });
    if (error) { setLucreaza(false); setEroare(mesajEroare(error)); return; }
    const { data } = await supabase.from('fam').select('id').eq('proiect_id', proiect.id).eq('creat_de', uid)
      .order('creat_la', { ascending: false }).limit(1).single();
    setLucreaza(false);
    nav(data ? `../${data.id}` : '..');
  }

  return (
    <form className="card formular" onSubmit={salveaza}>
      <p><Link to=".." className="inapoi">← Materiale</Link></p>
      <h2>FAM nou</h2>
      <p className="discret">Se salvează ca ciornă. Atașați fișa tehnică și declarația de performanță, apoi depuneți-l.</p>
      <FormularFam v={v} set={setV} />
      <Eroare text={eroare} />
      <div className="actiuni">
        <Link to=".." className="buton">Renunță</Link>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se salvează…' : 'Salvează ciorna'}</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------- Detaliu
function Detaliu({ proiect, membri, rolulMeu }: Props) {
  const { famId = '' } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState<Fam | null>(null);
  const [revizii, setRevizii] = useState<Fam[]>([]);
  const [livrari, setLivrari] = useState<LivrareFam[]>([]);
  const [v, setV] = useState<Campuri>(GOL);
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [negasit, setNegasit] = useState(false);

  const incarca = useCallback(async () => {
    const a = await supabase.from('fam').select('*').eq('id', famId).maybeSingle();
    if (!a.data) { setNegasit(!a.error); setEroare(mesajEroare(a.error)); return; }
    const fam = a.data as Fam;
    const [r, l] = await Promise.all([
      supabase.from('fam').select('*').eq('proiect_id', fam.proiect_id).eq('numar', fam.numar).order('revizie'),
      supabase.from('livrari_fam').select('*').eq('fam_id', famId).order('data', { ascending: false }),
    ]);
    setF(fam);
    setV({ ...GOL, ...Object.fromEntries(Object.keys(GOL).map(k => [k, (fam as Record<string, unknown>)[k] ?? (GOL as Record<string, unknown>)[k]])) } as Campuri);
    setRevizii((r.data as Fam[]) ?? []);
    setLivrari((l.data as LivrareFam[]) ?? []);
  }, [famId]);
  useEffect(() => { incarca(); }, [incarca]);

  if (negasit) return <Gol titlu="FAM-ul nu există" />;
  if (!f) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;

  const cod = codFam(proiect.cod, f.numar, f.revizie);
  const autor = !!rolulMeu && AUTORI.includes(rolulMeu);
  const editabil = autor && (f.stare === 'ciorna' || f.stare === 'completari');
  const om = (id: string | null) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? (p.nume || p.email) : '—'; };
  const cand = (s: string | null) => s ? new Date(s).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : '';
  const fara = !membri.some(m => m.rol === 'proiectant');
  const ultima = revizii[revizii.length - 1];

  async function salveaza() {
    setEroare(null); setMesaj(null);
    const { error } = await supabase.from('fam').update(curata(v)).eq('id', f!.id);
    if (error) setEroare(mesajEroare(error)); else { setMesaj('Salvat.'); incarca(); }
  }
  async function depune() {
    setEroare(null); setMesaj(null);
    const s = await supabase.from('fam').update(curata(v)).eq('id', f!.id);
    if (s.error) { setEroare(mesajEroare(s.error)); return; }
    if (!window.confirm('Depuneți FAM-ul? După depunere nu se mai poate modifica până la decizie.')) return;
    const { error } = await supabase.rpc('fam_depune', { p_fam: f!.id });
    if (error) setEroare(mesajEroare(error)); else incarca();
  }
  async function revizieNoua() {
    const { data, error } = await supabase.rpc('fam_revizie_noua', { p_fam: f!.id });
    if (error) setEroare(mesajEroare(error)); else nav(`../${data}`);
  }

  return (
    <>
      <p className="nu-tipari"><Link to=".." className="inapoi">← Materiale</Link></p>
      <article className="card document-pv">
        <header className="antet-pv">
          <div>
            <span className="cod">{cod}</span>
            <h2>Fișă de aprobare a materialului</h2>
            <p className="discret">{proiect.denumire}{proiect.adresa ? `, ${proiect.adresa}` : ''}</p>
          </div>
          <Eticheta stare={STARI_FAM[f.stare]} />
        </header>

        {revizii.length > 1 && (
          <p className="revizii nu-tipari">Revizii:{' '}
            {revizii.map((r, i) => (
              <span key={r.id}>{i > 0 && ' · '}{r.id === f.id ? <b>R{r.revizie}</b> : <Link to={`../${r.id}`}>R{r.revizie}</Link>}</span>
            ))}
            {ultima && ultima.id !== f.id && <span className="eticheta atentie"> Există o revizie mai nouă</span>}
          </p>
        )}

        <div className="nu-tipari"><FormularFam v={v} set={setV} blocat={!editabil} /></div>
        <div className="doar-tipar fam-tiparit">
          {[
            ['Ce cere proiectul', [['Materialul', f.material], ['Unde se pune în operă', f.utilizare], ['Performanțele cerute în proiect', f.cerinte_proiect]]],
            ['Produsul propus', [['Producător', f.producator], ['Produs', f.produs], ['Furnizor', f.furnizor], ['Performanțele declarate', f.performante_declarate], ['Date de mediu', f.date_mediu]]],
            ['Documente însoțitoare (art. 563)', [
              ['Declarația de performanță', f.dop_numar ? `nr. ${f.dop_numar}${f.dop_data ? ` din ${formatData(f.dop_data)}` : ''}` : null],
              ['Marcaj CE', f.marcaj_ce ? 'Da' : null],
              ['Agrement tehnic', f.agrement_numar ? `nr. ${f.agrement_numar}${f.agrement_valabil_pana ? `, valabil până la ${formatData(f.agrement_valabil_pana)}` : ''}` : null],
              ['Alte documente', f.alte_documente]]],
          ].map(([titlu, randuri]) => {
            const pline = (randuri as [string, string | null][]).filter(r => r[1]?.toString().trim());
            return pline.length ? (
              <section key={titlu as string}>
                <h3>{titlu as string}</h3>
                <dl className="date-pv">{pline.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
              </section>
            ) : null;
          })}
        </div>

        {editabil && (
          <div className="actiuni stanga nu-tipari">
            <button className="buton" onClick={salveaza}>Salvează</button>
            <button className="buton principal" onClick={depune}>{f.stare === 'completari' ? 'Depune din nou' : 'Depune FAM-ul'}</button>
            {mesaj && <span className="mesaj-scurt">{mesaj}</span>}
            {fara && <span className="discret">Echipa nu are proiectant: FAM-ul merge direct la diriginte.</span>}
          </div>
        )}
        <Eroare text={eroare} />

        <Atasamente proiectId={proiect.id} entitate="fam" entitateId={f.id} poateIncarca={editabil} membri={membri}
          tipuri={['fisa_tehnica', 'dop', 'agrement', 'certificat', 'instructiuni', 'altul']}
          gol={editabil ? 'Atașați fișa tehnică și declarația de performanță.' : 'Niciun document atașat.'} />

        <h3 className="nu-tipari">Circuitul de aprobare</h3>
        <ol className="circuit nu-tipari">
          <li className={f.depus_la ? 'facut' : ''}>
            <b>Depus</b> {f.depus_la ? <>de {om(f.depus_de)}, {cand(f.depus_la)}</> : <span className="discret">de constructor</span>}
          </li>
          <li className={f.avizat_la ? 'facut' : ''}>
            <b>Avizul proiectantului</b>{' '}
            {f.aviz ? <>{AVIZE[f.aviz]}, {om(f.avizat_de)}, {cand(f.avizat_la)}{f.aviz_observatii && <><br /><span className="obs">„{f.aviz_observatii}”</span></>}</>
              : <span className="discret">{fara ? 'nu e cazul (fără proiectant în echipă)' : 'în așteptare'}</span>}
          </li>
          <li className={f.decis_la ? (f.decizie === 'respins' ? 'respins' : 'facut') : ''}>
            <b>Decizia dirigintelui</b>{' '}
            {f.decizie ? <>{STARI_FAM[f.decizie].eticheta}, {om(f.decis_de)}, {cand(f.decis_la)}{f.decizie_observatii && <><br /><span className="obs">„{f.decizie_observatii}”</span></>}</>
              : <span className="discret">în așteptare</span>}
          </li>
        </ol>

        {(f.aviz_observatii?.trim() || f.decizie_observatii?.trim()) && (
          <section className="observatii-pv doar-tipar">
            <h3>Observații</h3>
            <ul>
              {f.aviz_observatii?.trim() && <li><b>{om(f.avizat_de)}</b> (Proiectant): {f.aviz_observatii}</li>}
              {f.decizie_observatii?.trim() && <li><b>{om(f.decis_de)}</b> (Diriginte de șantier): {f.decizie_observatii}</li>}
            </ul>
          </section>
        )}
        <section className="semnaturi-pv doar-tipar">
          <h3>Semnături</h3>
          <div className={`semnaturi-grila ${fara ? '' : 'trei'}`}>
            {[
              { rol: 'constructor' as Rol, eticheta: 'Întocmit · Constructor / RTE', cine: f.depus_de, cand: f.depus_la, mentiune: null as string | null },
              ...(fara ? [] : [{ rol: 'proiectant' as Rol, eticheta: 'Avizat · Proiectant', cine: f.avizat_de, cand: f.avizat_la, mentiune: f.aviz ? AVIZE[f.aviz] : null }]),
              { rol: 'diriginte' as Rol, eticheta: 'Aprobat · Diriginte de șantier', cine: f.decis_de, cand: f.decis_la, mentiune: f.decizie ? STARI_FAM[f.decizie].eticheta : null },
            ].map(x => {
              const id = x.cine ?? membri.find(m => m.rol === x.rol)?.persoana_id ?? null;
              const firma = membri.find(m => m.persoana_id === id)?.persoane?.firme?.denumire;
              return (
                <div key={x.rol} className="semnatura-pv">
                  <span className="calitate">{x.eticheta}</span>
                  <b>{id ? om(id) : '—'}</b>
                  {firma && <span>{firma}</span>}
                  <div className="linie-semnatura">Semnătura</div>
                  {x.mentiune && <small>{x.mentiune}</small>}
                  {x.cand && <small>Înregistrat în Conpro BIM la {cand(x.cand)}</small>}
                </div>
              );
            })}
          </div>
        </section>
      </article>

      <div className="nu-tipari">
        {f.stare === 'depus' && rolulMeu === 'proiectant' && <Aviz famId={f.id} onGata={incarca} />}
        {f.stare === 'avizat' && rolulMeu === 'diriginte' && <Decizie famId={f.id} onGata={incarca} />}
        {f.stare === 'respins' && autor && ultima?.id === f.id && (
          <div className="card"><p>FAM-ul a fost respins. Reluați-l ca revizie nouă, cu produsul sau documentele corectate.</p>
            <button className="buton principal" onClick={revizieNoua}>Întocmește revizia R{f.revizie + 1}</button></div>
        )}
        {(f.stare === 'aprobat' || f.stare === 'aprobat_cu_observatii') && (
          <Livrari fam={f} livrari={livrari} membri={membri} rolulMeu={rolulMeu} proiectId={proiect.id} onGata={incarca} />
        )}
        <div className="actiuni stanga"><button className="buton" onClick={() => window.print()}>Tipărește / salvează PDF</button></div>
      </div>
    </>
  );
}

function Aviz({ famId, onGata }: { famId: string; onGata: () => void }) {
  const [aviz, setAviz] = useState<AvizFam>('conform');
  const [obs, setObs] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.rpc('fam_avizeaza', { p_fam: famId, p_aviz: aviz, p_observatii: obs });
    if (error) setEroare(mesajEroare(error)); else onGata();
  }
  return (
    <form className="card formular confirmare" onSubmit={trimite}>
      <h3>Avizul proiectantului</h3>
      <p className="discret">Corespunde produsul propus cu ce ați prevăzut în proiect și în caietul de sarcini?</p>
      <div className="optiuni">
        {(Object.keys(AVIZE) as AvizFam[]).map(a => (
          <label key={a} className={`optiune ${aviz === a ? 'activ' : ''} ${a === 'conform' ? 'confirm' : a === 'echivalent' ? 'confirm_cu_observatii' : 'refuz'}`}>
            <input type="radio" checked={aviz === a} onChange={() => setAviz(a)} /> {AVIZE[a]}
          </label>
        ))}
      </div>
      {aviz !== 'conform' && <label>{aviz === 'echivalent' ? 'De ce e echivalent' : 'Ce trebuie completat sau schimbat'}<textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} required /></label>}
      <Eroare text={eroare} />
      <div className="actiuni"><button className="buton principal">Trimite avizul</button></div>
    </form>
  );
}

function Decizie({ famId, onGata }: { famId: string; onGata: () => void }) {
  const [d, setD] = useState<DecizieFam>('aprobat');
  const [obs, setObs] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    if (!window.confirm('Confirmați decizia? Nu se mai poate modifica.')) return;
    const { error } = await supabase.rpc('fam_decide', { p_fam: famId, p_decizie: d, p_observatii: obs });
    if (error) setEroare(mesajEroare(error)); else onGata();
  }
  const nume: Record<DecizieFam, string> = { aprobat: 'Aprob', aprobat_cu_observatii: 'Aprob cu observații', respins: 'Resping' };
  return (
    <form className="card formular confirmare" onSubmit={trimite}>
      <h3>Decizia dirigintelui de șantier</h3>
      <p className="discret">După aprobare, constructorul poate comanda materialul. Decizia intră automat în registrul dumneavoastră electronic.</p>
      <div className="optiuni">
        {(Object.keys(nume) as DecizieFam[]).map(x => (
          <label key={x} className={`optiune ${d === x ? 'activ' : ''} ${x === 'aprobat' ? 'confirm' : x === 'respins' ? 'refuz' : 'confirm_cu_observatii'}`}>
            <input type="radio" checked={d === x} onChange={() => setD(x)} /> {nume[x]}
          </label>
        ))}
      </div>
      {d !== 'aprobat' && <label>{d === 'respins' ? 'Motivul respingerii' : 'Observații'}<textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} required /></label>}
      <Eroare text={eroare} />
      <div className="actiuni"><button className={`buton principal${d === 'respins' ? ' pericol' : ''}`}>{nume[d]} FAM-ul</button></div>
    </form>
  );
}

function Livrari({ fam, livrari, membri, rolulMeu, proiectId, onGata }:
  { fam: Fam; livrari: LivrareFam[]; membri: Membru[]; rolulMeu?: Rol; proiectId: string; onGata: () => void }) {
  const [deschis, setDeschis] = useState(false);
  const [data, setData] = useState(laIso(azi()));
  const [cantitate, setCantitate] = useState('');
  const [lot, setLot] = useState('');
  const [doc, setDoc] = useState('');
  const [conform, setConform] = useState(true);
  const [obs, setObs] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const om = (id: string) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? (p.nume || p.email) : '—'; };

  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('livrari_fam').insert({
      fam_id: fam.id, data, cantitate: cantitate.trim() || null, lot: lot.trim() || null,
      document_insotire: doc.trim() || null, conform, observatii: obs.trim() || null,
    });
    if (error) { setEroare(mesajEroare(error)); return; }
    setDeschis(false); setCantitate(''); setLot(''); setDoc(''); setObs(''); setConform(true); onGata();
  }

  return (
    <div className="card">
      <div className="antet-card">
        <div>
          <h3>Verificarea la livrare</h3>
          <p className="discret">Dirigintele verifică dacă produsul adus e cel aprobat: producător, tip, declarație de performanță, lot.</p>
        </div>
        {rolulMeu === 'diriginte' && !deschis && <button className="buton principal" onClick={() => setDeschis(true)}>Înregistrează o livrare</button>}
      </div>
      {deschis && (
        <form className="subformular" onSubmit={trimite}>
          <div className="campuri">
            <label>Data<input type="date" value={data} max={laIso(azi())} onChange={e => setData(e.target.value)} required /></label>
            <label>Cantitatea<input value={cantitate} onChange={e => setCantitate(e.target.value)} placeholder="ex. 120 m²" /></label>
            <label>Lotul<input value={lot} onChange={e => setLot(e.target.value)} /></label>
            <label>Document de însoțire<input value={doc} onChange={e => setDoc(e.target.value)} placeholder="ex. aviz nr. 4411" /></label>
          </div>
          <div className="optiuni">
            <label className={`optiune ${conform ? 'activ confirm' : ''}`}><input type="radio" checked={conform} onChange={() => setConform(true)} /> Conform cu FAM-ul</label>
            <label className={`optiune ${!conform ? 'activ refuz' : ''}`}><input type="radio" checked={!conform} onChange={() => setConform(false)} /> Neconform</label>
          </div>
          <label>{conform ? 'Observații (opțional)' : 'Ce nu corespunde'}<textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} required={!conform} /></label>
          {!conform && <p className="mesaj alerta">Produsul neconform nu se pune în operă. Livrarea intră în registrul dumneavoastră ca neconformitate.</p>}
          <Eroare text={eroare} />
          <div className="actiuni"><button type="button" className="buton" onClick={() => setDeschis(false)}>Renunță</button><button className="buton principal">Înregistrează</button></div>
        </form>
      )}
      {livrari.length === 0 ? <p className="discret">Nicio livrare verificată încă.</p> : (
        <div className="tabel-wrap">
          <table className="tabel stivuit">
            <thead><tr><th>Data</th><th>Cantitate</th><th>Lot</th><th>Document</th><th>Rezultat</th><th>Verificat de</th></tr></thead>
            <tbody>
              {livrari.map(l => (
                <tr key={l.id}>
                  <td data-eticheta="Data">{formatData(l.data)}</td>
                  <td data-eticheta="Cantitate">{l.cantitate ?? '—'}</td>
                  <td data-eticheta="Lot">{l.lot ?? '—'}</td>
                  <td data-eticheta="Document">{l.document_insotire ?? '—'}</td>
                  <td data-eticheta="Rezultat">
                    <Eticheta stare={l.conform ? { eticheta: 'Conform', ton: 'ok' } : { eticheta: 'Neconform', ton: 'alerta' }} />
                    {l.observatii && <><br /><span className="discret">{l.observatii}</span></>}
                  </td>
                  <td data-eticheta="Verificat de">{om(l.verificat_de)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {livrari.map(l => (
        <Atasamente key={l.id} proiectId={proiectId} entitate="livrare_fam" entitateId={l.id} membri={membri}
          poateIncarca={rolulMeu === 'diriginte'} tipuri={['aviz_insotire', 'poza', 'certificat', 'altul']}
          titlu={`Documente livrare ${formatData(l.data)}${l.lot ? `, lot ${l.lot}` : ''}`} gol="Niciun document." ascundeDacaGol />
      ))}
    </div>
  );
}
