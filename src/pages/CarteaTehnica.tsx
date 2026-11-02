import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CAPITOLE_CARTE, TIPURI_ATASAMENT, formatData, type Rol } from '../lib/domeniu';
import type { Membru, Proiect } from '../lib/tipuri';
import { Eroare, mesajEroare } from '../components/ui';
import { incarcaDateProiect, type DateProiect } from '../lib/dateProiect';
import { construiesteOpis, genereazaArhiva, htmlManual, htmlOpis, lipsuriCarte } from '../lib/carte';
import { genereazaCobie } from '../lib/cobie';
import { descarca } from './Echipamente';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
const POT_ADAUGA: Rol[] = ['administrator', 'beneficiar', 'diriginte', 'constructor', 'proiectant'];

/** Deschide un document HTML generat într-o fereastră nouă, gata de tipărit. */
function deschideHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function CarteaTehnica({ proiect, membri, rolulMeu, uid }: Props) {
  const [d, setD] = useState<DateProiect | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [progres, setProgres] = useState<string | null>(null);

  const incarca = useCallback(async () => {
    try { setD(await incarcaDateProiect(proiect, membri)); } catch (e) { setEroare(mesajEroare(e as { message: string })); }
  }, [proiect, membri]);
  useEffect(() => { incarca(); }, [incarca]);

  const capitole = useMemo(() => (d ? construiesteOpis(d) : []), [d]);
  const lipsuri = useMemo(() => (d ? lipsuriCarte(d) : []), [d]);
  if (!d) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;

  const nrFisiere = capitole.reduce((s, c) => s + c.elemente.reduce((x, e) => x + e.fisiere.length, 0), 0);
  const nrElemente = capitole.reduce((s, c) => s + c.elemente.length, 0);

  async function arhiva() {
    setEroare(null);
    try {
      const blob = await genereazaArhiva(d!, setProgres);
      descarca(blob, `Cartea-tehnica-${proiect.cod}-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) { setEroare((e as Error).message); }
    setProgres(null);
  }

  async function deschideFisier(cale: string) {
    const { data, error } = await supabase.storage.from('documente').createSignedUrl(cale, 120);
    if (error || !data) setEroare(error?.message ?? 'Fișierul nu se poate deschide.'); else window.open(data.signedUrl, '_blank', 'noopener');
  }

  const unde: Record<string, string> = { pv: 'pv', fam: 'fam', beton: 'beton', echipamente: 'echipamente', carte: 'carte', receptie: 'receptie' };

  return (
    <>
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Cartea tehnică a construcției</h2>
            <p className="discret">Se completează singură din procesele verbale, FAM-uri, condica de betoane, încercări și echipamente. Se întocmește în format electronic și se încarcă în Registrul Național al Construcțiilor (art. 529–530 din Legea 169/2026).</p>
          </div>
        </div>
        <div className="indicatori">
          {capitole.map(c => <div key={c.id}><b>{c.elemente.length}</b><span>capitolul {c.id}</span></div>)}
          <div><b>{nrFisiere}</b><span>fișiere</span></div>
        </div>
        <div className="actiuni stanga">
          <button className="buton principal" onClick={arhiva} disabled={!!progres || nrElemente === 0}>{progres ?? 'Descarcă arhiva electronică (.zip)'}</button>
          <button className="buton" onClick={() => deschideHtml(htmlOpis(d, capitole))}>Opisul (tipărire / PDF)</button>
          {d.tipuri.length > 0 && <button className="buton" onClick={() => deschideHtml(htmlManual(d))}>Manualul de mentenanță</button>}
          {d.tipuri.length > 0 && <button className="buton" onClick={async () => descarca(await genereazaCobie(d), `COBie-${proiect.cod}.xlsx`)}>COBie (Excel)</button>}
        </div>
        <p className="nota">Arhiva conține opisul, procesele verbale, FAM-urile, condica de betoane, manualul și COBie generate din aplicație, plus toate fișierele atașate, pe capitole. Formatul de încărcare în Registrul Național al Construcțiilor nu e publicat încă; arhiva se va adapta când apare metodologia.</p>
        <Eroare text={eroare} />
      </div>

      {lipsuri.length > 0 && (
        <div className="card atentie-card">
          <h3>Ce mai lipsește pentru un dosar complet ({lipsuri.length})</h3>
          <ul className="lista-simpla">
            {lipsuri.map((l, i) => <li key={i}>{l.unde === 'carte' ? l.text : <Link to={`../${unde[l.unde]}`}>{l.text}</Link>}</li>)}
          </ul>
        </div>
      )}

      {capitole.map(c => (
        <div className="card" key={c.id}>
          <h3>{c.nume}</h3>
          <p className="discret">{c.continut}</p>
          {c.elemente.length === 0 ? <p className="discret">Niciun document încă.</p> : (
            <ol className="opis">
              {c.elemente.map((e, i) => (
                <li key={e.id}>
                  <span className="opis-nr">{c.id}.{i + 1}</span>
                  <div>
                    <b>{e.generat === 'pv' && e.pvId ? <Link to={`../pv/${e.pvId}`}>{e.titlu}</Link>
                      : e.generat === 'fam' ? <Link to={`../fam/${e.id}`}>{e.titlu}</Link>
                      : e.generat === 'condica' ? <Link to="../beton">{e.titlu}</Link>
                      : e.generat === 'receptie' ? <Link to={`../receptie/${e.id}`}>{e.titlu}</Link>
                      : e.generat === 'document' ? <Link to={`../documente/${e.id}`}>{e.titlu}</Link>
                      : e.generat === 'manual' ? <button className="legatura" onClick={() => deschideHtml(htmlManual(d))}>{e.titlu}</button>
                      : e.generat === 'cobie' ? <Link to="../echipamente">{e.titlu}</Link>
                      : e.generat === 'evenimente' ? <Link to="../exploatare">{e.titlu}</Link>
                      : e.generat === 'urmarire' ? <Link to="../exploatare/urmarire">{e.titlu}</Link>
                      : e.titlu}</b>
                    {e.data && <span className="discret"> · {formatData(e.data)}</span>}
                    {e.detalii && <div className="discret">{e.detalii}</div>}
                    {e.fisiere.length > 0 && (
                      <div className="fisiere-mici">
                        {e.fisiere.map(f => <button key={f.id} className="legatura" onClick={() => deschideFisier(f.cale)} title={TIPURI_ATASAMENT[f.tip_document] ?? ''}>{f.nume_fisier}</button>)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}

      {rolulMeu && POT_ADAUGA.includes(rolulMeu) && <DocumentNou proiectId={proiect.id} uid={uid} onGata={incarca} />}
    </>
  );
}

function DocumentNou({ proiectId, onGata }: { proiectId: string; uid: string; onGata: () => void }) {
  const [capitol, setCapitol] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [titlu, setTitlu] = useState('');
  const [numar, setNumar] = useState('');
  const [data, setData] = useState('');
  const [emitent, setEmitent] = useState('');
  const [fisiere, setFisiere] = useState<FileList | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const sugestii: Record<string, string[]> = {
    A: ['Certificatul de urbanism', 'Autorizația de construire', 'Avizele și acordurile', 'Proiectul tehnic de execuție, actualizat la recepție', 'Proiectul as-built', 'Dispoziții de șantier ale proiectantului', 'Expertiza tehnică'],
    B: ['Programul de control al calității (PCCVI)', 'Certificate de calitate', 'Rapoarte de neconformitate și soluțiile proiectantului', 'Jurnalul de evenimente'],
    C: ['Punctul de vedere al proiectanților', 'Punctul de vedere al dirigintelui de șantier', 'Fișe de instruire a operatorilor', 'Procesul verbal de recepție la terminarea lucrărilor (semnat)'],
    D: ['Programul de urmărire în timp a comportării', 'Caietul de sarcini pentru exploatare', 'Rapoarte de urmărire a comportării'],
  };

  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from('documente_carte').insert({
      id, proiect_id: proiectId, capitol, titlu: titlu.trim(), numar: numar.trim() || null, data: data || null, emitent: emitent.trim() || null,
    });
    if (error) { setLucreaza(false); setEroare(mesajEroare(error)); return; }
    for (const f of Array.from(fisiere ?? [])) {
      const cale = `${proiectId}/document_carte/${id}/${crypto.randomUUID().slice(0, 8)}-${f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
      const up = await supabase.storage.from('documente').upload(cale, f);
      if (up.error) { setEroare(`${f.name}: ${up.error.message}`); continue; }
      await supabase.from('atasamente').insert({ proiect_id: proiectId, entitate: 'document_carte', entitate_id: id, tip_document: 'document', nume_fisier: f.name, cale, marime: f.size });
    }
    setLucreaza(false); setTitlu(''); setNumar(''); setData(''); setEmitent(''); setFisiere(null);
    onGata();
  }

  return (
    <form className="card formular" onSubmit={trimite}>
      <h3>Adăugați un document din afara aplicației</h3>
      <p className="discret">Proiectul, autorizația, avizele, certificatele, as-built-ul. Documentul înregistrat nu se mai modifică.</p>
      <div className="campuri">
        <label>Capitolul
          <select value={capitol} onChange={e => setCapitol(e.target.value as 'A')}>{CAPITOLE_CARTE.map(c => <option key={c.id} value={c.id}>{c.nume}</option>)}</select>
        </label>
        <label className="lat">Titlul
          <input value={titlu} onChange={e => setTitlu(e.target.value)} list={`sugestii-${capitol}`} required minLength={3} />
          <datalist id={`sugestii-${capitol}`}>{sugestii[capitol].map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <label>Numărul<input value={numar} onChange={e => setNumar(e.target.value)} /></label>
        <label>Data<input type="date" value={data} onChange={e => setData(e.target.value)} /></label>
        <label>Emitentul<input value={emitent} onChange={e => setEmitent(e.target.value)} /></label>
        <label className="lat">Fișierele<input type="file" multiple onChange={e => setFisiere(e.target.files)} /></label>
      </div>
      <Eroare text={eroare} />
      <div className="actiuni"><button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se înregistrează…' : 'Înregistrează documentul'}</button></div>
    </form>
  );
}
