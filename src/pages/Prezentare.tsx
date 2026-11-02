// Prezentarea proiectului: un singur ecran cu ce contează azi. Ce așteaptă după mine,
// calitatea execuției, documentele, modelul, predarea și (după recepție) exploatarea.
// Fiecare număr duce la secțiunea lui.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { STADII, formatData, numeRol, stareAutorizatie, zilePana, type Rol } from '../lib/domeniu';
import type { Membru, Proiect, Sarcina } from '../lib/tipuri';
import { incarcaDateProiect, type DateProiect } from '../lib/dateProiect';
import { lipsuriCarte } from '../lib/carte';
import { evalueazaCerinte } from '../lib/cerinte';
import { stariElemente, numaraStari } from '../lib/executie';
import { scadente } from '../lib/urmarire';
import { Eroare, Eticheta, mesajEroare } from '../components/ui';
import { TIPURI_SARCINA, incarcaSarcini } from './DeFacut';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
type Extra = {
  sarcini: Sarcina[];
  observatii: { id: string; stare: string; tip: string; termen: string | null; elemente: { guid: string }[] }[];
  livrabile: { stare: string; atins: boolean; termen: string | null }[];
  reclamatii: { stare: string; urgenta: boolean }[];
  jurnal: { id: number; tabel: string; operatie: string; autor: string | null; la: string }[];
};

// ce înseamnă o intrare din istoric, pe scurt
const TABELE: Record<string, string> = {
  procese_verbale: 'proces verbal', participanti_pv: 'confirmare PV', fam: 'FAM', livrari_fam: 'livrare', turnari: 'turnare', incercari: 'încercare',
  documente_proiect: 'document', revizii_document: 'revizie de document', receptii: 'recepție', obiectii_receptie: 'obiecție la recepție', observatii: 'observație pe model',
  elemente_legate: 'legătură cu modelul', echipamente: 'echipament', tipuri_echipament: 'tip de echipament', registru_intrari: 'intrare în registru',
  membri_proiect: 'echipa', invitatii: 'invitație', proiecte: 'datele proiectului', evenimente_exploatare: 'eveniment', inspectii_urmarire: 'inspecție',
  interventii_echipament: 'intervenție', reclamatii: 'reclamație', livrabile_planificate: 'plan de livrare', momente_livrare: 'moment de livrare',
  cerinte_predare: 'cerință de predare', lectii_invatate: 'lecție învățată', atasamente: 'fișier', documente_carte: 'document în Cartea tehnică',
};
const OPERATII: Record<string, string> = { INSERT: 'nou', UPDATE: 'modificat', DELETE: 'șters' };

export default function Prezentare({ proiect, membri, rolulMeu, uid }: Props) {
  const [d, setD] = useState<DateProiect | null>(null);
  const [x, setX] = useState<Extra | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);

  useEffect(() => {
    let anulat = false;
    (async () => {
      try {
        const id = proiect.id;
        const lista = <T,>(p: PromiseLike<{ data: unknown }>) => Promise.resolve(p).then(r => (r.data as T[]) ?? []);
        const [dp, sarcini, observatii, livrabile, reclamatii, jurnal] = await Promise.all([
          incarcaDateProiect(proiect, membri),
          incarcaSarcini().then(l => l.filter(s => s.proiect_id === id)).catch(() => [] as Sarcina[]),
          lista<Extra['observatii'][number]>(supabase.from('observatii').select('id, stare, tip, termen, elemente').eq('proiect_id', id)),
          lista<Extra['livrabile'][number]>(supabase.rpc('livrabile_stare', { p: id })),
          proiect.exploatare_din ? lista<Extra['reclamatii'][number]>(supabase.from('reclamatii').select('stare, urgenta').eq('proiect_id', id)) : Promise.resolve([]),
          lista<Extra['jurnal'][number]>(supabase.from('jurnal').select('id, tabel, operatie, autor, la').eq('proiect_id', id).neq('tabel', 'participanti_pv').order('la', { ascending: false }).limit(8)),
        ]);
        if (anulat) return;
        setD(dp); setX({ sarcini, observatii, livrabile, reclamatii, jurnal });
      } catch (e) { if (!anulat) setEroare(mesajEroare(e as { message?: string })); }
    })();
    return () => { anulat = true; };
  }, [proiect, membri]);

  if (!d || !x) return <><Eroare text={eroare} /><p className="discret">Se încarcă prezentarea proiectului…</p></>;

  const ac = stareAutorizatie(proiect);
  const nume = (id: string | null) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : '—'; };

  // calitatea execuției
  const pv = { semnate: d.pvs.filter(p => p.stare === 'semnat').length, curs: d.pvs.filter(p => p.stare === 'convocat' || p.stare === 'in_semnare').length, contestate: d.pvs.filter(p => p.stare === 'contestat').length };
  const fam = { aprobate: d.famuri.filter(f => f.stare === 'aprobat' || f.stare === 'aprobat_cu_observatii').length, curs: d.famuri.filter(f => ['depus', 'avizat', 'completari'].includes(f.stare)).length, respinse: d.famuri.filter(f => f.stare === 'respins' && !d.famuri.some(y => y.fam_anterior_id === f.id)).length };
  const volum = d.turnari.reduce((s, t) => s + (Number(t.volum) || 0), 0);
  const neconforme = d.incercari.filter(i => !i.conform).length;
  const faraRezultat = d.turnari.filter(t => zilePana(t.data) <= -28 && !d.incercari.some(i => i.turnare_id === t.id && i.tip === 'compresiune_28')).length;
  const obsDeschise = x.observatii.filter(o => o.stare !== 'inchisa');
  const obsIntarziate = obsDeschise.filter(o => o.termen && o.stare !== 'rezolvata' && zilePana(o.termen) < 0).length;

  // documente și model
  const livrate = x.livrabile.filter(l => l.atins).length;
  const livIntarziate = x.livrabile.filter(l => !l.atins && l.termen && zilePana(l.termen) < 0).length;
  const publicate = d.documenteProiect.filter(doc => d.revizii.some(r => r.document_id === doc.id && r.stare === 'publicat')).length;
  const exec = numaraStari(stariElemente({ legaturi: d.legaturi as never, pvs: d.pvs, turnari: d.turnari, executate: [], observatii: x.observatii as never }));

  // predare
  const lipsuri = lipsuriCarte(d);
  const cerinte = evalueazaCerinte(d, d.cerinte);
  const recTerminare = d.receptii.find(r => r.tip === 'terminare' && !r.partiala && r.stare !== 'anulata');

  // exploatare
  const sc = scadente(proiect, d.puncte, d.inspectii, d.constatari).filter(s => zilePana(s.urmatoarea) < 0).length;
  const reclDeschise = x.reclamatii.filter(r => !['confirmata', 'respinsa'].includes(r.stare));

  return (
    <div className="prezentare">
      <Eroare text={eroare} />
      <div className="prez-stare">
        <div><span>Stadiul</span><b>{STADII[proiect.stadiu_catuc].split(' · ')[1] ?? STADII[proiect.stadiu_catuc]}</b><small>{STADII[proiect.stadiu_catuc].split(' · ')[0]}{proiect.clasa_consecinte ? ` · ${proiect.clasa_consecinte}` : ''}</small></div>
        <div><span>Autorizația de construire</span><b>{proiect.ac_numar ? `nr. ${proiect.ac_numar}` : '—'}</b><small><Eticheta stare={ac} /></small></div>
        <div><span>Echipa</span><b>{membri.length} {membri.length === 1 ? 'persoană' : 'persoane'}</b><small>rolul dumneavoastră: {rolulMeu ? numeRol(rolulMeu) : '—'}</small></div>
        {proiect.exploatare_din
          ? <div><span>În exploatare din</span><b>{formatData(proiect.exploatare_din)}</b><small>stadiul 7</small></div>
          : <div><span>Recepția la terminare</span><b>{recTerminare ? (recTerminare.stare === 'aprobata' ? 'aprobată' : recTerminare.stare === 'decisa' ? 'decisă' : 'în pregătire') : 'neîncepută'}</b><small>{lipsuri.length ? `${lipsuri.length} lipsuri în dosar` : 'dosarul e complet'}</small></div>}
      </div>

      <section className="card prez-sarcini">
        <div className="antet-card"><h2>Ce așteaptă după dumneavoastră aici</h2><Link to="/de-facut">Toate sarcinile</Link></div>
        {!x.sarcini.length ? <p className="discret">Nimic de făcut în acest proiect acum.</p> : (
          <ul className="lista-sarcini">
            {x.sarcini.slice(0, 6).map((s, i) => (
              <li key={i}><span className={`tip-sarcina t-${s.tip}`}>{TIPURI_SARCINA[s.tip] ?? s.tip}</span><Link to={s.cale.startsWith('/') ? s.cale : `/proiect/${proiect.id}/${s.cale}`}>{s.titlu}</Link></li>
            ))}
            {x.sarcini.length > 6 && <li className="discret">și încă {x.sarcini.length - 6}…</li>}
          </ul>
        )}
      </section>

      <div className="prez-grila">
        <Panou titlu="Procese verbale" la="pv" principal={`${pv.semnate}`} sub="semnate" alerta={pv.contestate ? `${pv.contestate} contestate` : undefined}>
          <Bara parti={[{ n: pv.semnate, ton: 'ok', nume: 'semnate' }, { n: pv.curs, ton: 'atentie', nume: 'în curs' }, { n: pv.contestate, ton: 'alerta', nume: 'contestate' }]} />
        </Panou>
        <Panou titlu="Materiale (FAM)" la="fam" principal={`${fam.aprobate}`} sub="aprobate" alerta={fam.respinse ? `${fam.respinse} respinse, fără revizie` : undefined}>
          <Bara parti={[{ n: fam.aprobate, ton: 'ok', nume: 'aprobate' }, { n: fam.curs, ton: 'atentie', nume: 'în avizare' }, { n: fam.respinse, ton: 'alerta', nume: 'respinse' }]} />
        </Panou>
        <Panou titlu="Betoane și încercări" la="beton" principal={`${d.turnari.length}`} sub={`turnări · ${volum.toLocaleString('ro-RO')} m³`}
          alerta={neconforme ? `${neconforme} rezultate neconforme` : faraRezultat ? `${faraRezultat} fără rezultat la 28 de zile` : undefined}>
          <p className="discret">{d.incercari.length} încercări{d.turnari.filter(t => !t.vizat_la).length ? ` · ${d.turnari.filter(t => !t.vizat_la).length} turnări nevizate` : ''}</p>
        </Panou>
        <Panou titlu="Observații pe model" la="model/observatii" principal={`${obsDeschise.length}`} sub="deschise" alerta={obsIntarziate ? `${obsIntarziate} cu termen depășit` : undefined}>
          <Bara parti={[{ n: obsDeschise.filter(o => o.stare === 'deschisa').length, ton: 'alerta', nume: 'deschise' }, { n: obsDeschise.filter(o => o.stare === 'in_lucru').length, ton: 'atentie', nume: 'în lucru' }, { n: obsDeschise.filter(o => o.stare === 'rezolvata').length, ton: 'ok', nume: 'de verificat' }]} />
        </Panou>
        <Panou titlu="Documente și plan de livrare" la="documente/plan" principal={x.livrabile.length ? `${Math.round(livrate / x.livrabile.length * 100)}%` : `${publicate}`}
          sub={x.livrabile.length ? `din plan livrat (${livrate}/${x.livrabile.length})` : 'documente publicate'} alerta={livIntarziate ? `${livIntarziate} livrabile întârziate` : undefined}>
          <p className="discret">{d.documenteProiect.length} documente în CDE · {publicate} publicate</p>
        </Panou>
        <Panou titlu="Execuția pe model" la="model" principal={`${exec.verificat}`} sub="elemente verificate prin PV">
          <p className="discret">{exec.in_verificare} în verificare · {exec.executat} executate · {exec.observatie} cu observație</p>
        </Panou>
        <Panou titlu="Predarea" la="carte" principal={cerinte.length ? `${cerinte.filter(c => c.indeplinita).length}/${cerinte.length}` : `${lipsuri.length}`}
          sub={cerinte.length ? 'cerințe de predare îndeplinite' : 'lipsuri în Cartea tehnică'} alerta={cerinte.length && lipsuri.length ? `${lipsuri.length} lipsuri în dosar` : undefined}>
          <p className="discret">{d.echipamente.length} echipamente · {d.tipuri.length} tipuri</p>
        </Panou>
        {proiect.exploatare_din && (
          <Panou titlu="Exploatarea" la="exploatare" principal={`${reclDeschise.length}`} sub="reclamații deschise"
            alerta={sc ? `${sc} verificări de urmărire restante` : reclDeschise.some(r => r.urgenta) ? 'reclamații urgente' : undefined}>
            <p className="discret">{d.evenimente.length} evenimente în jurnal · {d.interventii.length} intervenții</p>
          </Panou>
        )}
      </div>

      <section className="card">
        <div className="antet-card"><h2>Activitatea recentă</h2><Link to="istoric">Tot istoricul</Link></div>
        {!x.jurnal.length ? <p className="discret">Nicio activitate încă.</p> : (
          <ul className="activitate">
            {x.jurnal.map(j => (
              <li key={j.id}><span className="discret">{new Date(j.la).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <b>{nume(j.autor)}</b> · {TABELE[j.tabel] ?? j.tabel} {OPERATII[j.operatie] ?? ''}{j.autor === uid ? ' (dvs.)' : ''}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Panou({ titlu, la, principal, sub, alerta, children }: { titlu: string; la: string; principal: string; sub: string; alerta?: string; children?: ReactNode }) {
  return (
    <Link to={la} className={`card prez-panou${alerta ? ' cu-alerta' : ''}`}>
      <h3>{titlu}</h3>
      <div className="prez-numar"><b>{principal}</b><span>{sub}</span></div>
      {children}
      {alerta && <p className="prez-alerta">⚠ {alerta}</p>}
    </Link>
  );
}

/** Bară segmentată cu legendă text (culoarea nu e singura informație). */
function Bara({ parti }: { parti: { n: number; ton: 'ok' | 'atentie' | 'alerta'; nume: string }[] }) {
  const total = parti.reduce((s, p) => s + p.n, 0);
  if (!total) return <p className="discret">Nimic încă.</p>;
  return (
    <>
      <div className="bara-seg" role="img" aria-label={parti.map(p => `${p.n} ${p.nume}`).join(', ')}>
        {parti.filter(p => p.n).map(p => <i key={p.nume} className={p.ton} style={{ flexGrow: p.n }} title={`${p.n} ${p.nume}`} />)}
      </div>
      <p className="bara-legenda">{parti.filter(p => p.n).map(p => <span key={p.nume}><i className={p.ton} />{p.n} {p.nume}</span>)}</p>
    </>
  );
}
