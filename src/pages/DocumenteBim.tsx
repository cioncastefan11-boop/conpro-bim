// EIR și BEP generate din datele proiectului; aici se scriu doar textele pe care aplicația nu le are.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Rol } from '../lib/domeniu';
import type { Membru, Proiect } from '../lib/tipuri';
import type { CerintaPredare } from '../lib/cerinte';
import { exportaIds, type RegulaModel } from '../lib/ids';
import { ROLURI_DOC, SECTIUNI, TITLU_DOC, htmlDocument, lipsuri, type DateDocBim, type LivrabilDoc, type MomentDoc, type TipDocBim } from '../lib/documenteBim';
import { Eroare, mesajEroare } from '../components/ui';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
type Rand = { tip: TipDocBim; sectiuni: Record<string, string>; versiune: number; actualizat_de: string; actualizat_la: string };

const DESCRIERE: Record<TipDocBim, string> = {
  eir: 'Ce informații cere beneficiarul, când, în ce format și după ce reguli (ISO 19650-2, 5.2.1). Se dă echipelor la licitație sau la contractare.',
  bep: 'Cum răspunde echipa de livrare: cine face ce, planul de livrare, procedurile, software-ul și riscurile (ISO 19650-2, 5.3.2 și 5.4.1).',
};
const CINE: Record<TipDocBim, string> = { eir: 'beneficiarul, administratorul proiectului sau dirigintele', bep: 'administratorul proiectului, constructorul sau proiectantul' };
const SCRIPT = 'Rulați în Supabase scriptul 0023_documente_bim.sql ca să puteți salva textele.';

function descarca(continut: string, nume: string, tip: string) {
  const url = URL.createObjectURL(new Blob([continut], { type: tip }));
  const a = document.createElement('a'); a.href = url; a.download = nume; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function deschide(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// Word deschide direct HTML-ul salvat ca .doc
const pentruWord = (html: string) => html.replace('<html lang="ro">', '<html lang="ro" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">');

export default function DocumenteBim({ proiect, membri, rolulMeu }: Props) {
  const [date, setDate] = useState<Omit<DateDocBim, 'sectiuni' | 'versiune' | 'actualizat_la' | 'actualizat_de'> | null>(null);
  const [randuri, setRanduri] = useState<Rand[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lipsaScript, setLipsaScript] = useState(false);

  const incarca = useCallback(async () => {
    const id = proiect.id;
    const [d, m, l, r, c] = await Promise.all([
      supabase.from('documente_bim').select('tip, sectiuni, versiune, actualizat_de, actualizat_la').eq('proiect_id', id),
      supabase.from('momente_livrare').select('id, cod, denumire, data_planificata').eq('proiect_id', id).order('data_planificata').order('ordine'),
      supabase.from('livrabile_planificate').select('id, cod, titlu, initiator, rol, tip, moment_id, termen, responsabil, stare_ceruta, nivel_informatii').eq('proiect_id', id).order('cod'),
      supabase.from('reguli_model').select('*').eq('proiect_id', id).order('ordine'),
      supabase.from('cerinte_predare').select('*').eq('proiect_id', id).order('ordine'),
    ]);
    // tabelele din migrările anterioare pot lipsi: documentul se generează cu ce există
    setLipsaScript(!!d.error && /documente_bim/.test(d.error.message));
    if (d.error && !/documente_bim/.test(d.error.message)) setEroare(mesajEroare(d.error));
    setRanduri((d.data as Rand[]) ?? []);
    setDate({ proiect, membri, momente: (m.data as MomentDoc[]) ?? [], livrabile: (l.data as LivrabilDoc[]) ?? [], reguli: (r.data as RegulaModel[]) ?? [], cerinte: (c.data as CerintaPredare[]) ?? [] });
  }, [proiect, membri]);
  useEffect(() => { incarca(); }, [incarca]);

  if (!date) return <p className="discret">Se încarcă…</p>;
  return (
    <>
      <Eroare text={eroare} />
      {lipsaScript && <p className="mesaj atentie-bloc">{SCRIPT} Până atunci documentele se generează cu textele implicite.</p>}
      <div className="documente-bim">
        {(['eir', 'bep'] as TipDocBim[]).map(tip => (
          <CardDocument key={tip} tip={tip} date={date} rand={randuri.find(x => x.tip === tip)} membri={membri} poate={!!rolulMeu && ROLURI_DOC[tip].includes(rolulMeu) && !lipsaScript} onSalvat={incarca} />
        ))}
      </div>
    </>
  );
}

function CardDocument({ tip, date, rand, membri, poate, onSalvat }: {
  tip: TipDocBim; date: Omit<DateDocBim, 'sectiuni' | 'versiune' | 'actualizat_la' | 'actualizat_de'>; rand?: Rand; membri: Membru[]; poate: boolean; onSalvat: () => Promise<void>;
}) {
  const [edit, setEdit] = useState(false);
  const [texte, setTexte] = useState<Record<string, string>>({});
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [lucru, setLucru] = useState(false);
  const d: DateDocBim = useMemo(() => ({ ...date, sectiuni: rand?.sectiuni ?? {}, versiune: rand?.versiune ?? null, actualizat_la: rand?.actualizat_la ?? null, actualizat_de: rand?.actualizat_de ?? null }), [date, rand]);
  const l = lipsuri(tip, d);
  const p = date.proiect;
  const autor = membri.find(m => m.persoana_id === rand?.actualizat_de)?.persoane;
  const sectiuni = SECTIUNI[tip];

  function incepe() {
    setTexte(Object.fromEntries(sectiuni.map(s => [s.cheie, d.sectiuni[s.cheie] ?? s.implicit])));
    setEdit(true); setMesaj(null);
  }
  async function salveaza() {
    setLucru(true); setEroare(null);
    // se păstrează doar ce diferă de textul implicit, ca îmbunătățirile textelor implicite să ajungă și aici
    const sect = Object.fromEntries(sectiuni.filter(s => (texte[s.cheie] ?? '') !== s.implicit).map(s => [s.cheie, (texte[s.cheie] ?? '').trim()]));
    const { error } = await supabase.from('documente_bim').upsert({ proiect_id: p.id, tip, sectiuni: sect }, { onConflict: 'proiect_id,tip' });
    setLucru(false);
    if (error) { setEroare(/documente_bim/.test(error.message) ? SCRIPT : mesajEroare(error)); return; }
    setEdit(false); setMesaj('Textele au fost salvate.'); await onSalvat();
  }

  return (
    <div className="card document-bim">
      <div className="antet-card">
        <div>
          <h2>{TITLU_DOC[tip]}</h2>
          <p className="discret">{DESCRIERE[tip]}</p>
        </div>
        <span className="eticheta neutru">{rand ? `versiunea ${rand.versiune}` : 'texte implicite'}</span>
      </div>
      {rand && <p className="discret"><small>Textele modificate ultima dată la {new Date(rand.actualizat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}{autor ? ` de ${autor.nume || autor.email}` : ''}.</small></p>}
      <p><small>Se completează singure din aplicație: {tip === 'eir'
        ? <>datele proiectului, echipa beneficiarului, momentele de livrare ({date.momente.length}), convenția de denumire, regulile modelului ({date.reguli.length}), cerințele de predare ({date.cerinte.length}).</>
        : <>echipa de livrare ({membri.filter(m => m.rol !== 'cititor').length} persoane), convenția, matricea și planul de livrare ({date.livrabile.length} livrabile), răspunsul la cerințele EIR ({date.reguli.length + date.cerinte.length}).</>}</small></p>
      {l.length > 0 && (
        <div className="mesaj atentie-bloc">
          <b>De completat înainte de emitere:</b>
          <ul>{l.map(x => <li key={x.text}>{x.unde ? <Link to={`/proiect/${p.id}/${x.unde}`}>{x.text}</Link> : x.text}</li>)}</ul>
        </div>
      )}
      <Eroare text={eroare} />
      {mesaj && <p className="mesaj ok">{mesaj}</p>}
      {!edit ? (
        <div className="actiuni stanga">
          <button className="buton principal" onClick={() => deschide(htmlDocument(tip, d))}>Deschide documentul</button>
          <button className="buton" onClick={() => descarca(pentruWord(htmlDocument(tip, d)), `${p.cod}-${tip.toUpperCase()}-v${d.versiune ?? 1}.doc`, 'application/msword')}>Descarcă pentru Word</button>
          {tip === 'eir' && date.reguli.length > 0 && <button className="buton" onClick={() => descarca(exportaIds(date.reguli, { titlu: `Cerințele de informații ale modelului · ${p.cod}`, proiect: `${p.cod} ${p.denumire}` }), `${p.cod}-cerinte-model.ids`, 'application/xml')}>Anexa IDS</button>}
          {poate ? <button className="buton" onClick={incepe}>Editează textele</button> : <small className="discret">Textele le scriu {CINE[tip]}.</small>}
        </div>
      ) : (
        <div className="formular cadru-editare sectiuni-doc">
          {sectiuni.map(s => (
            <label key={s.cheie}>
              <span className="titlu-sectiune">{s.titlu}{s.optionala && <small className="discret"> · opțional</small>}</span>
              <small className="discret">{s.ajutor} Rândurile care încep cu „-” devin listă.</small>
              <textarea rows={Math.min(12, Math.max(3, (texte[s.cheie] ?? '').split('\n').length + 1))} value={texte[s.cheie] ?? ''} onChange={e => setTexte(t => ({ ...t, [s.cheie]: e.target.value }))} />
              {s.implicit && texte[s.cheie] !== s.implicit && <button type="button" className="legatura" onClick={() => setTexte(t => ({ ...t, [s.cheie]: s.implicit }))}>Textul implicit</button>}
            </label>
          ))}
          <div className="actiuni">
            <button className="buton" onClick={() => setEdit(false)}>Renunță</button>
            <button className="buton principal" onClick={salveaza} disabled={lucru}>{lucru ? 'Se salvează…' : 'Salvează textele'}</button>
          </div>
        </div>
      )}
      <p className="discret"><small>Pentru emitere: deschideți documentul, salvați-l ca PDF (Tipărire → Salvare ca PDF) și încărcați-l în Documente, cu codul lui din convenție, ca să treacă prin aprobare și să rămână în CDE.</small></p>
    </div>
  );
}
