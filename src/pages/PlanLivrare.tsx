// Planul de livrare a informațiilor (ISO 19650-2: momentele 5.1.3, TIDP 5.4.4, MIDP 5.4.5)
// și matricea de responsabilități (5.4.2), legate de documentele din CDE prin cod.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ROLURI_DOCUMENT, TIPURI_DOCUMENT, formatData, numeRol, numeRolDocument, numeTipDocument, zilePana, type Rol } from '../lib/domeniu';
import type { Conventie, Membru, Proiect } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
type Moment = { id: string; cod: string; denumire: string; data_planificata: string; ordine: number };
type Livrabil = { id: string; moment_id: string | null; initiator: string; volum: string; nivel: string; tip: string; rol: string; numar: string; cod: string;
  titlu: string; nivel_informatii: string | null; stare_ceruta: 'partajat' | 'publicat'; termen: string | null; responsabil: string | null; creat_de: string };
type StareL = { livrabil_id: string; termen: string | null; stare: 'neinceput' | 'in_lucru' | 'partajat' | 'publicat'; atins: boolean; document_id: string | null };

export const STARI_LIVRABIL: Record<StareL['stare'], { nume: string; ton: string }> = {
  neinceput: { nume: 'Neînceput', ton: 'neutru' }, in_lucru: { nume: 'În lucru', ton: 'atentie' },
  partajat: { nume: 'Partajat', ton: 'info' }, publicat: { nume: 'Publicat', ton: 'ok' },
};
const intarziat = (s?: StareL) => !!s && !s.atins && !!s.termen && zilePana(s.termen) < 0;

function useDate(proiectId: string) {
  const [d, setD] = useState<{ momente: Moment[]; livrabile: Livrabil[]; stari: Map<string, StareL> } | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const [m, l, s] = await Promise.all([
      supabase.from('momente_livrare').select('*').eq('proiect_id', proiectId).order('data_planificata').order('ordine'),
      supabase.from('livrabile_planificate').select('*').eq('proiect_id', proiectId).order('cod'),
      supabase.rpc('livrabile_stare', { p: proiectId }),
    ]);
    const err = m.error ?? l.error ?? s.error;
    setEroare(err ? (/momente_livrare|livrabile/.test(err.message) ? 'Rulați în Supabase scriptul 0020_plan_livrare.sql.' : mesajEroare(err)) : null);
    setD({ momente: (m.data as Moment[]) ?? [], livrabile: (l.data as Livrabil[]) ?? [], stari: new Map(((s.data as StareL[]) ?? []).map(x => [x.livrabil_id, x])) });
  }, [proiectId]);
  useEffect(() => { incarca(); }, [incarca]);
  return { d, eroare, incarca };
}

const nume = (membri: Membru[], id: string | null) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : null; };

// --------------------------------------------------------------------- Planul
export function PlanLivrare({ proiect, membri, rolulMeu, uid }: Props) {
  const { d, eroare, incarca } = useDate(proiect.id);
  const [moment, setMoment] = useState('');
  const [echipa, setEchipa] = useState('');
  const [doarIntarziate, setDoarIntarziate] = useState(false);
  const [adauga, setAdauga] = useState(false);
  const [eroareOp, setEroareOp] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  const admin = rolulMeu === 'administrator' || rolulMeu === 'beneficiar';
  const echipe = [...new Set(d.livrabile.map(l => l.initiator))].sort();
  const lista = d.livrabile.filter(l => (!moment || l.moment_id === moment) && (!echipa || l.initiator === echipa) && (!doarIntarziate || intarziat(d.stari.get(l.id))));
  const nInt = d.livrabile.filter(l => intarziat(d.stari.get(l.id))).length;
  const nAtinse = d.livrabile.filter(l => d.stari.get(l.id)?.atins).length;

  // documentele deja create în CDE care nu sunt încă în plan (pornire rapidă; apoi se completează momentul și termenul)
  async function preiaDinCde() {
    setEroareOp(null); setMesaj(null);
    const { data, error } = await supabase.from('documente_proiect').select('initiator, volum, nivel, tip, rol, numar, cod, titlu').eq('proiect_id', proiect.id);
    if (error) { setEroareOp(mesajEroare(error)); return; }
    const exista = new Set(d!.livrabile.map(l => l.cod));
    const noi = ((data as Livrabil[]) ?? []).filter(x => !exista.has(x.cod));
    if (!noi.length) { setMesaj('Toate documentele din CDE sunt deja în plan.'); return; }
    const { error: e2 } = await supabase.from('livrabile_planificate').insert(noi.map(x => ({ proiect_id: proiect.id, initiator: x.initiator, volum: x.volum, nivel: x.nivel, tip: x.tip, rol: x.rol, numar: x.numar, titlu: x.titlu })));
    if (e2) { setEroareOp(mesajEroare(e2)); return; }
    setMesaj(`${noi.length} documente preluate în plan. Alegeți momentul și termenul pentru fiecare.`);
    await incarca();
  }

  async function sterge(l: Livrabil) {
    setEroareOp(null);
    const { error, count } = await supabase.from('livrabile_planificate').delete({ count: 'exact' }).eq('id', l.id);
    if (error) setEroareOp(mesajEroare(error)); else if (!count) setEroareOp('Rândul îl șterge echipa care l-a planificat sau administratorul.'); else incarca();
  }

  return (
    <>
      <Eroare text={eroare} />
      <div className="rezumat-exploatare">
        <div><span>Livrabile planificate</span><b>{d.livrabile.length}</b><small>{echipe.length} {echipe.length === 1 ? 'echipă' : 'echipe'} · {d.momente.length} momente</small></div>
        <div className={nAtinse === d.livrabile.length && d.livrabile.length ? '' : ''}><span>Livrate la starea cerută</span><b>{nAtinse}</b><small>{d.livrabile.length ? Math.round(nAtinse / d.livrabile.length * 100) : 0}% din plan</small></div>
        <div className={nInt ? 'alerta' : ''}><span>Întârziate</span><b>{nInt}</b><small>{nInt ? 'termenul a trecut și documentul nu e la starea cerută' : 'nimic întârziat'}</small></div>
      </div>

      <Momente proiect={proiect} momente={d.momente} livrabile={d.livrabile} stari={d.stari} admin={admin} onSchimbat={incarca} />

      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Planul general de livrare (MIDP)</h2>
            <p className="discret">Fiecare echipă își planifică documentele (TIDP), cu codul din convenție; aplicația le găsește singură în CDE și arată starea lor. Ce întârzie apare în „De făcut” la responsabil.</p>
          </div>
          <div className="actiuni">
            <button className="buton" onClick={() => tipareste(proiect, d.momente, d.livrabile, d.stari, membri)}>Tipărește planul</button>
            {rolulMeu && rolulMeu !== 'cititor' && <button className="buton" onClick={preiaDinCde}>Preia documentele din CDE</button>}
            {rolulMeu && rolulMeu !== 'cititor' && <button className="buton principal" onClick={() => setAdauga(!adauga)}>{adauga ? 'Închide' : 'Livrabil nou'}</button>}
          </div>
        </div>
        {adauga && <LivrabilNou proiect={proiect} membri={membri} momente={d.momente} onSalvat={async () => { setAdauga(false); await incarca(); }} />}
        <div className="filtre-punct">
          <select value={moment} onChange={e => setMoment(e.target.value)} aria-label="Momentul"><option value="">toate momentele</option>{d.momente.map(m => <option key={m.id} value={m.id}>{m.cod} · {m.denumire}</option>)}</select>
          <select value={echipa} onChange={e => setEchipa(e.target.value)} aria-label="Echipa"><option value="">toate echipele (MIDP)</option>{echipe.map(e => <option key={e} value={e}>{e} (TIDP)</option>)}</select>
          <button className={doarIntarziate ? 'activ' : ''} onClick={() => setDoarIntarziate(!doarIntarziate)}>Doar întârziate ({nInt})</button>
        </div>
        <Eroare text={eroareOp} />
        {mesaj && <p className="mesaj ok">{mesaj}</p>}
        {!lista.length ? <Gol titlu="Niciun livrabil">Adăugați documentele pe care le produce fiecare echipă, cu momentul la care trebuie livrate.</Gol> : (
          <div className="tabel-wrap"><table className="tabel tabel-plan">
            <thead><tr><th>Codul</th><th>Documentul</th><th>Momentul / termenul</th><th>Responsabil</th><th>Cerut</th><th>Starea în CDE</th><th /></tr></thead>
            <tbody>{lista.map(l => {
              const s = d.stari.get(l.id); const m = d.momente.find(x => x.id === l.moment_id);
              return (
                <tr key={l.id} className={intarziat(s) ? 'rand-intarziat' : ''}>
                  <td><code>{l.cod}</code></td>
                  <td>{s?.document_id ? <Link to={`../${s.document_id}`}><b>{l.titlu}</b></Link> : <b>{l.titlu}</b>}<br /><small className="discret">{numeTipDocument(l.tip)} · {numeRolDocument(l.rol)}{l.nivel_informatii ? ` · ${l.nivel_informatii}` : ''}</small></td>
                  <td>{m ? <span className="eticheta neutru">{m.cod}</span> : null} {s?.termen ? formatData(s.termen) : '—'}</td>
                  <td>{nume(membri, l.responsabil) ?? <span className="discret">—</span>}</td>
                  <td>{l.stare_ceruta === 'publicat' ? 'Publicat' : 'Partajat'}</td>
                  <td>{s && <span className={`eticheta ${STARI_LIVRABIL[s.stare].ton}`}>{STARI_LIVRABIL[s.stare].nume}</span>} {intarziat(s) && <span className="eticheta alerta">întârziat</span>} {s?.atins && <span className="discret">✓</span>}</td>
                  <td>{(l.creat_de === uid || rolulMeu === 'administrator') && <button className="legatura alerta" onClick={() => sterge(l)}>șterge</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

function Momente({ proiect, momente, livrabile, stari, admin, onSchimbat }: { proiect: Proiect; momente: Moment[]; livrabile: Livrabil[]; stari: Map<string, StareL>; admin: boolean; onSchimbat: () => Promise<void> }) {
  const [f, setF] = useState({ cod: '', denumire: '', data: '' });
  const [eroare, setEroare] = useState<string | null>(null);
  async function adauga(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('momente_livrare').insert({ proiect_id: proiect.id, cod: f.cod, denumire: f.denumire.trim(), data_planificata: f.data, ordine: momente.length + 1 });
    if (error) setEroare(mesajEroare(error)); else { setF({ cod: '', denumire: '', data: '' }); await onSchimbat(); }
  }
  async function sterge(m: Moment) {
    const { error } = await supabase.from('momente_livrare').delete().eq('id', m.id);
    if (error) setEroare(mesajEroare(error)); else await onSchimbat();
  }
  return (
    <div className="card">
      <h2>Momentele de livrare a informațiilor</h2>
      <p className="discret">Momentele la care beneficiarul are nevoie de informații ca să decidă (ISO 19650-2, 5.1.3): de exemplu depunerea pentru autorizație, aprobarea PTE, începerea execuției, recepția.</p>
      {momente.length > 0 && (
        <div className="tabel-wrap"><table className="tabel">
          <thead><tr><th>Codul</th><th>Momentul</th><th>Data</th><th>Livrabile</th>{admin && <th />}</tr></thead>
          <tbody>{momente.map(m => {
            const ale = livrabile.filter(l => l.moment_id === m.id); const ok = ale.filter(l => stari.get(l.id)?.atins).length;
            return (
              <tr key={m.id}>
                <td><b>{m.cod}</b></td><td>{m.denumire}</td>
                <td>{formatData(m.data_planificata)} {zilePana(m.data_planificata) < 0 && ok < ale.length ? <span className="eticheta alerta">depășit</span> : null}</td>
                <td>{ale.length ? <><div className="bara-progres"><i style={{ width: `${ok / ale.length * 100}%` }} /></div><small>{ok} din {ale.length} livrate</small></> : <span className="discret">—</span>}</td>
                {admin && <td><button className="legatura alerta" onClick={() => sterge(m)}>șterge</button></td>}
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {admin && (
        <form className="rand-formular" onSubmit={adauga}>
          <label>Codul<input value={f.cod} onChange={e => setF({ ...f, cod: e.target.value.toUpperCase() })} required maxLength={10} placeholder="ex. PTE" /></label>
          <label>Momentul<input value={f.denumire} onChange={e => setF({ ...f, denumire: e.target.value })} required minLength={3} placeholder="ex. Aprobarea proiectului tehnic" /></label>
          <label>Data<input type="date" value={f.data} onChange={e => setF({ ...f, data: e.target.value })} required /></label>
          <button className="buton">Adaugă momentul</button>
        </form>
      )}
      {!admin && !momente.length && <p className="discret">Momentele le stabilesc beneficiarul sau administratorul proiectului.</p>}
      <Eroare text={eroare} />
    </div>
  );
}

function LivrabilNou({ proiect, membri, momente, onSalvat }: { proiect: Proiect; membri: Membru[]; momente: Moment[]; onSalvat: () => Promise<void> }) {
  const conv = (proiect.standard_info ?? {}) as Conventie;
  const [f, setF] = useState({ initiator: conv.initiatori?.[0]?.cod ?? '', volum: 'ZZ', nivel: 'ZZ', tip: 'DR', rol: 'A', numar: '', titlu: '', moment_id: momente[0]?.id ?? '',
    termen: '', stare_ceruta: 'publicat', responsabil: '', nivel_informatii: '' });
  const [eroare, setEroare] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const lista = (l: { cod: string; nume?: string }[] | undefined, k: 'initiator' | 'volum' | 'nivel', ph: string) => l?.length
    ? <select value={f[k]} onChange={e => set(k, e.target.value)}>{l.map(x => <option key={x.cod} value={x.cod}>{x.cod}{x.nume ? ` · ${x.nume}` : ''}</option>)}</select>
    : <input value={f[k]} onChange={e => set(k, e.target.value.toUpperCase())} required placeholder={ph} />;
  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('livrabile_planificate').insert({ proiect_id: proiect.id, initiator: f.initiator, volum: f.volum || 'ZZ', nivel: f.nivel || 'ZZ', tip: f.tip, rol: f.rol,
      numar: f.numar, titlu: f.titlu.trim(), moment_id: f.moment_id || null, termen: f.termen || null, stare_ceruta: f.stare_ceruta, responsabil: f.responsabil || null,
      nivel_informatii: f.nivel_informatii.trim() || null });
    if (error) setEroare(mesajEroare(error)); else await onSalvat();
  }
  return (
    <form className="formular eveniment-nou cadru-editare" onSubmit={salveaza}>
      <p className="discret">Codul: <code>{[proiect.cod, f.initiator || '…', f.volum || 'ZZ', f.nivel || 'ZZ', f.tip, f.rol, f.numar || '…'].join('-')}</code>. Când documentul cu acest cod e creat în CDE, planul îl recunoaște singur.</p>
      <div className="campuri">
        <label>Inițiatorul (echipa){lista(conv.initiatori, 'initiator', 'ex. SP')}</label>
        <label>Volumul{lista(conv.volume, 'volum', 'ZZ')}</label>
        <label>Nivelul{lista(conv.niveluri, 'nivel', 'ZZ')}</label>
        <label>Tipul<select value={f.tip} onChange={e => set('tip', e.target.value)}>{TIPURI_DOCUMENT.map(t => <option key={t.id} value={t.id}>{t.id} · {t.nume}</option>)}</select></label>
        <label>Disciplina<select value={f.rol} onChange={e => set('rol', e.target.value)}>{ROLURI_DOCUMENT.map(t => <option key={t.id} value={t.id}>{t.id} · {t.nume}</option>)}</select></label>
        <label>Numărul<input value={f.numar} onChange={e => set('numar', e.target.value.replace(/\D/g, ''))} required pattern="[0-9]{4,6}" placeholder="0101" /></label>
      </div>
      <label>Titlul<input value={f.titlu} onChange={e => set('titlu', e.target.value)} required minLength={3} placeholder="ex. Plan cofraj placă peste parter" /></label>
      <div className="campuri">
        <label>Momentul<select value={f.moment_id} onChange={e => set('moment_id', e.target.value)}><option value="">— fără moment —</option>{momente.map(m => <option key={m.id} value={m.id}>{m.cod} · {formatData(m.data_planificata)}</option>)}</select></label>
        <label>Termen (altul decât al momentului)<input type="date" value={f.termen} onChange={e => set('termen', e.target.value)} /></label>
        <label>Starea cerută<select value={f.stare_ceruta} onChange={e => set('stare_ceruta', e.target.value)}><option value="publicat">Publicat (pentru execuție / aprobare)</option><option value="partajat">Partajat (pentru coordonare)</option></select></label>
        <label>Responsabil<select value={f.responsabil} onChange={e => set('responsabil', e.target.value)}><option value="">—</option>{membri.filter(m => m.rol !== 'cititor').map(m => <option key={m.persoana_id} value={m.persoana_id}>{m.persoane?.nume || m.persoane?.email} · {numeRol(m.rol)}</option>)}</select></label>
      </div>
      <label>Nivelul necesar de informații (opțional)<input value={f.nivel_informatii} onChange={e => set('nivel_informatii', e.target.value)} placeholder="ex. detalii de execuție, scara 1:50; model cu proprietăți COBie" /></label>
      <Eroare text={eroare} />
      <div className="actiuni"><button className="buton principal">Adaugă în plan</button></div>
    </form>
  );
}

// --------------------------------------------------------------------- Matricea de responsabilități
export function MatriceResponsabilitati({ proiect, membri }: Props) {
  const { d, eroare } = useDate(proiect.id);
  const randuri = useMemo(() => {
    if (!d) return [];
    const m = new Map<string, Livrabil[]>();
    d.livrabile.forEach(l => { const k = `${l.initiator}|${l.rol}`; m.set(k, [...(m.get(k) ?? []), l]); });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [d]);
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  const conv = (proiect.standard_info ?? {}) as Conventie;
  const coloane = [...d.momente, ...(d.livrabile.some(l => !l.moment_id) ? [{ id: '', cod: '—', denumire: 'Fără moment', data_planificata: '', ordine: 999 }] : [])];
  return (
    <div className="card">
      <h2>Matricea de responsabilități</h2>
      <p className="discret">Cine produce ce, pentru fiecare moment de livrare (ISO 19650-2, 5.4.2): pe rânduri echipa (inițiatorul) și disciplina, pe coloane momentele; în fiecare celulă, documentele planificate și câte sunt livrate. Se completează din planul de livrare.</p>
      {!randuri.length ? <Gol titlu="Planul de livrare e gol"><Link to="../plan">Planul de livrare</Link></Gol> : (
        <div className="tabel-wrap"><table className="tabel matrice">
          <thead><tr><th>Echipa · disciplina</th><th>Responsabili</th>{coloane.map(c => <th key={c.id || 'fara'} title={c.denumire}>{c.cod}<br /><small>{c.data_planificata ? formatData(c.data_planificata) : ''}</small></th>)}</tr></thead>
          <tbody>{randuri.map(([k, ls]) => {
            const [ini, rol] = k.split('|');
            const resp = [...new Set(ls.map(l => nume(membri, l.responsabil)).filter(Boolean))];
            return (
              <tr key={k}>
                <td><b>{ini}</b>{conv.initiatori?.find(x => x.cod === ini)?.nume ? <small className="discret"> {conv.initiatori.find(x => x.cod === ini)!.nume}</small> : null}<br />{numeRolDocument(rol)}</td>
                <td><small>{resp.join(', ') || '—'}</small></td>
                {coloane.map(c => {
                  const cel = ls.filter(l => (l.moment_id ?? '') === c.id);
                  if (!cel.length) return <td key={c.id || 'fara'} />;
                  const ok = cel.filter(l => d.stari.get(l.id)?.atins).length, intz = cel.filter(l => intarziat(d.stari.get(l.id))).length;
                  return <td key={c.id || 'fara'} className={`celula ${intz ? 'int' : ok === cel.length ? 'ok' : ''}`} title={cel.map(l => `${l.cod} ${l.titlu}`).join('\n')}><b>{ok}/{cel.length}</b>{intz ? <small> · {intz} întârz.</small> : null}</td>;
                })}
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </div>
  );
}

function tipareste(p: Proiect, momente: Moment[], livrabile: Livrabil[], stari: Map<string, StareL>, membri: Membru[]) {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  let h = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>MIDP ${esc(p.cod)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9}h1{font-size:18px}h2{font-size:14px;margin-top:18px}code{font-family:monospace}</style></head><body>`;
  h += `<h1>Planul general de livrare a informațiilor (MIDP)</h1><p>${esc(p.cod)} · ${esc(p.denumire)}<br>Generat la ${new Date().toLocaleString('ro-RO')} din Conpro BIM</p>`;
  h += '<h2>Momentele de livrare</h2><table><tr><th>Cod</th><th>Moment</th><th>Data</th></tr>' + momente.map(m => `<tr><td>${esc(m.cod)}</td><td>${esc(m.denumire)}</td><td>${formatData(m.data_planificata)}</td></tr>`).join('') + '</table>';
  h += '<h2>Livrabilele</h2><table><tr><th>Cod</th><th>Titlu</th><th>Moment</th><th>Termen</th><th>Responsabil</th><th>Cerut</th><th>Stare</th></tr>';
  for (const l of livrabile) {
    const s = stari.get(l.id);
    h += `<tr><td><code>${esc(l.cod)}</code></td><td>${esc(l.titlu)}${l.nivel_informatii ? `<br><small>${esc(l.nivel_informatii)}</small>` : ''}</td><td>${esc(momente.find(m => m.id === l.moment_id)?.cod ?? '')}</td><td>${s?.termen ? formatData(s.termen) : ''}</td><td>${esc(nume(membri, l.responsabil) ?? '')}</td><td>${l.stare_ceruta}</td><td>${s ? STARI_LIVRABIL[s.stare].nume : ''}${intarziat(s) ? ' · ÎNTÂRZIAT' : ''}</td></tr>`;
  }
  h += '</table></body></html>';
  const url = URL.createObjectURL(new Blob([h], { type: 'text/html' }));
  window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
