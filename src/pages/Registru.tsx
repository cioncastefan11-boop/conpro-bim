import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUid } from '../lib/sesiune';
import { TIPURI_REGISTRU, azi, formatData, laIso, numeTipRegistru, type TipRegistru } from '../lib/domeniu';
import type { IntrareRegistru } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';

type Intrare = IntrareRegistru & { proiecte: { cod: string; denumire: string; adresa: string | null } | null };
type ProiectRol = { proiect_id: string; rol: 'diriginte' | 'constructor'; proiecte: { cod: string; denumire: string } | null };

export default function Registru() {
  const uid = useUid();
  const [intrari, setIntrari] = useState<Intrare[] | null>(null);
  const [proiecte, setProiecte] = useState<ProiectRol[]>([]);
  const [nume, setNume] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [fProiect, setFProiect] = useState('');
  const [de, setDe] = useState('');
  const [pana, setPana] = useState('');
  const [corectez, setCorectez] = useState<Intrare | null>(null);

  const incarca = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('registru_intrari').select('*, proiecte(cod, denumire, adresa)').eq('persoana_id', uid)
        .order('data', { ascending: true }).order('creat_la', { ascending: true }),
      supabase.from('membri_proiect').select('proiect_id, rol, proiecte(cod, denumire)').eq('persoana_id', uid).in('rol', ['diriginte', 'constructor']),
      supabase.from('persoane').select('nume').eq('id', uid).single(),
    ]);
    setEroare(mesajEroare(a.error ?? b.error));
    setIntrari((a.data as unknown as Intrare[]) ?? []);
    setProiecte((b.data as unknown as ProiectRol[]) ?? []);
    setNume(c.data?.nume ?? '');
  }, [uid]);
  useEffect(() => { incarca(); }, [incarca]);

  // numărul de ordine e pe tot registrul persoanei, nu pe filtru
  const numerotate = useMemo(() => (intrari ?? []).map((x, i) => ({ ...x, nr: i + 1 })), [intrari]);
  const corectate = useMemo(() => new Map(numerotate.filter(x => x.corecteaza_id).map(x => [x.corecteaza_id!, x.nr])), [numerotate]);
  const vizibile = numerotate.filter(x => (!fProiect || x.proiect_id === fProiect) && (!de || x.data >= de) && (!pana || x.data <= pana));

  function exportCsv() {
    const cap = ['Nr.', 'Data', 'Cod lucrare', 'Lucrarea', 'Adresa', 'Calitatea', 'Activitatea', 'Descriere', 'Sursa', 'Corectează nr.', 'Înregistrat la'];
    const rows = vizibile.map(x => [
      x.nr, formatData(x.data), x.proiecte?.cod ?? '', x.proiecte?.denumire ?? '', x.proiecte?.adresa ?? '',
      x.rol === 'diriginte' ? 'Diriginte de șantier' : 'Responsabil tehnic cu execuția', numeTipRegistru(x.tip), x.descriere,
      x.automat ? 'Confirmare PV' : 'Înregistrare manuală',
      x.corecteaza_id ? numerotate.find(y => y.id === x.corecteaza_id)?.nr ?? '' : '',
      new Date(x.creat_la).toLocaleString('ro-RO'),
    ]);
    const csv = [cap, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `registru-electronic-${laIso(azi())}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="antet-pagina">
        <div>
          <h1>Registrul electronic de evidență</h1>
          <p className="discret">Activitatea dumneavoastră ca diriginte de șantier sau RTE, pe toate lucrările (art. 456 lit. f și art. 459 lit. i din Legea 169/2026).</p>
        </div>
      </div>
      <div className="doar-tipar antet-tipar">
        <h2>Registrul electronic de evidență a activității</h2>
        <p>{nume} · {fProiect ? proiecte.find(p => p.proiect_id === fProiect)?.proiecte?.denumire : 'toate lucrările'} · {de || pana ? `${de ? formatData(de) : '…'} – ${pana ? formatData(pana) : '…'}` : 'toată perioada'}</p>
      </div>

      {proiecte.length > 0 && <IntrareNoua proiecte={proiecte} corectez={corectez} onGata={() => { setCorectez(null); incarca(); }} onRenunt={() => setCorectez(null)} />}

      <div className="card">
        <div className="filtre-registru nu-tipari">
          <label>Lucrarea
            <select value={fProiect} onChange={e => setFProiect(e.target.value)}>
              <option value="">Toate</option>
              {[...new Map((intrari ?? []).map(x => [x.proiect_id, x.proiecte])).entries()].map(([id, p]) =>
                <option key={id} value={id}>{p?.cod} · {p?.denumire}</option>)}
            </select>
          </label>
          <label>De la<input type="date" value={de} onChange={e => setDe(e.target.value)} /></label>
          <label>Până la<input type="date" value={pana} onChange={e => setPana(e.target.value)} /></label>
          <div className="actiuni-mici">
            <button className="buton" onClick={exportCsv} disabled={!vizibile.length}>Export Excel (CSV)</button>
            <button className="buton" onClick={() => window.print()} disabled={!vizibile.length}>Tipărește / PDF</button>
          </div>
        </div>
        <Eroare text={eroare} />
        {intrari === null ? <p className="discret">Se încarcă…</p> : intrari.length === 0 ? (
          <Gol titlu="Registrul e gol">
            <p>{proiecte.length
              ? 'Intrările apar automat când confirmați procese verbale. Puteți adăuga și verificări, neconformități sau dispoziții.'
              : 'Registrul îl țin dirigintele de șantier și RTE-ul. Când primiți unul din aceste roluri într-un proiect, îl puteți completa aici.'}</p>
          </Gol>
        ) : (
          <div className="tabel-wrap">
            <table className="tabel registru">
              <thead><tr><th>Nr.</th><th>Data</th><th>Lucrarea</th><th>Activitatea</th><th>Descriere</th><th className="nu-tipari" /></tr></thead>
              <tbody>
                {vizibile.map(x => (
                  <tr key={x.id} className={corectate.has(x.id) ? 'estompat' : ''}>
                    <td>{x.nr}</td>
                    <td className="nowrap">{formatData(x.data)}</td>
                    <td><Link to={`/proiect/${x.proiect_id}`}>{x.proiecte?.cod}</Link><br /><span className="discret">{x.rol === 'diriginte' ? 'Diriginte' : 'RTE'}</span></td>
                    <td>{numeTipRegistru(x.tip)}{x.automat && <><br /><span className="discret">din PV</span></>}</td>
                    <td>
                      {x.corecteaza_id && <span className="eticheta neutru">Corectează nr. {numerotate.find(y => y.id === x.corecteaza_id)?.nr}</span>}{' '}
                      {x.descriere}
                      {corectate.has(x.id) && <><br /><span className="discret">Corectată prin intrarea nr. {corectate.get(x.id)}</span></>}
                      {x.pv_id && <><br /><Link to={`/proiect/${x.proiect_id}/pv/${x.pv_id}`} className="nu-tipari">Deschide PV-ul</Link></>}
                    </td>
                    <td className="nu-tipari">
                      {!x.automat && !corectate.has(x.id) && <button className="legatura" onClick={() => { setCorectez(x); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Corectează</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="nota">Intrările nu se modifică și nu se șterg. O greșeală se corectează printr-o intrare nouă, care o menționează pe cea corectată. Formatul oficial al registrului va fi stabilit prin metodologia ministerului (art. 578); exportul se va adapta atunci.</p>
      </div>
    </>
  );
}

function IntrareNoua({ proiecte, corectez, onGata, onRenunt }:
  { proiecte: ProiectRol[]; corectez: Intrare | null; onGata: () => void; onRenunt: () => void }) {
  const [proiect, setProiect] = useState(proiecte[0]?.proiect_id ?? '');
  const [tip, setTip] = useState<TipRegistru>('verificare');
  const [data, setData] = useState(laIso(azi()));
  const [descriere, setDescriere] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  useEffect(() => {
    if (corectez) { setProiect(corectez.proiect_id); setTip(corectez.tip); setData(corectez.data); setDescriere(corectez.descriere); }
  }, [corectez]);

  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const rol = proiecte.find(p => p.proiect_id === proiect)?.rol ?? 'diriginte';
    const { error } = await supabase.from('registru_intrari').insert({
      proiect_id: proiect, rol, tip, data, descriere: descriere.trim(), corecteaza_id: corectez?.id ?? null,
    });
    setLucreaza(false);
    if (error) { setEroare(mesajEroare(error)); return; }
    setDescriere(''); onGata();
  }

  return (
    <form className="card formular nu-tipari" onSubmit={trimite}>
      <h2>{corectez ? 'Corectură la o intrare' : 'Intrare nouă'}</h2>
      {corectez && <p className="mesaj info">Intrarea originală rămâne în registru, marcată ca fiind corectată.</p>}
      <div className="campuri">
        <label>Lucrarea
          <select value={proiect} onChange={e => setProiect(e.target.value)} disabled={!!corectez}>
            {proiecte.map(p => <option key={p.proiect_id} value={p.proiect_id}>{p.proiecte?.cod} · {p.proiecte?.denumire} ({p.rol === 'diriginte' ? 'diriginte' : 'RTE'})</option>)}
          </select>
        </label>
        <label>Activitatea
          <select value={tip} onChange={e => setTip(e.target.value as TipRegistru)}>
            {TIPURI_REGISTRU.filter(t => t.manual || t.id === tip).map(t => <option key={t.id} value={t.id}>{t.nume}</option>)}
          </select>
        </label>
        <label>Data<input type="date" value={data} onChange={e => setData(e.target.value)} max={laIso(azi())} required /></label>
        <label className="lat">Descriere
          <textarea value={descriere} onChange={e => setDescriere(e.target.value)} rows={3} required minLength={3}
            placeholder={tip === 'oprire_lucrari' ? 'Ce s-a constatat, ce lucrări s-au oprit, când și cum s-a înștiințat ISC' : 'Ce s-a verificat, unde, ce s-a constatat'} />
        </label>
      </div>
      {tip === 'oprire_lucrari' && <p className="mesaj info">La accidente tehnice sau abateri de la proiect, ISC se înștiințează în 24 de ore (art. 456 lit. d, art. 459 lit. g).</p>}
      <Eroare text={eroare} />
      <div className="actiuni">
        {corectez && <button type="button" className="buton" onClick={onRenunt}>Renunță</button>}
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se înregistrează…' : 'Înregistrează'}</button>
      </div>
    </form>
  );
}
