// Reclamațiile: formularul și fișa, comune echipei (Exploatare → Reclamații) și locatarului (Locuința mea).
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { CATEGORII_RECLAMATIE, STARI_RECLAMATIE, codReclamatie, numeCategorieReclamatie } from '../lib/domeniu';
import type { Membru, Reclamatie } from '../lib/tipuri';
import { Eroare, mesajEroare } from './ui';
import Atasamente from './Atasamente';

export const EticReclamatie = ({ r }: { r: Reclamatie }) =>
  <span className={`eticheta ${STARI_RECLAMATIE[r.stare].ton}`}>{STARI_RECLAMATIE[r.stare].eticheta}</span>;

/** Formularul de reclamație nouă. La locatar, unitatea e cea din lista locatarilor (o pune baza de date). */
export function FormularReclamatie({ proiectId, unitateFixa, onTrimis, onRenunta }: {
  proiectId: string; unitateFixa?: string; onTrimis: (id: string) => void; onRenunta: () => void;
}) {
  const [f, setF] = useState({ categorie: 'apa_canal', unitate: '', loc: '', titlu: '', descriere: '', urgenta: false });
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  async function trimite(e: FormEvent) {
    e.preventDefault(); setEroare(null); setLucreaza(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from('reclamatii').insert({ id, proiect_id: proiectId, categorie: f.categorie,
      unitate: unitateFixa ?? (f.unitate.trim() || null), loc: f.loc.trim() || null, titlu: f.titlu.trim(), descriere: f.descriere.trim(), urgenta: f.urgenta });
    setLucreaza(false);
    if (error) setEroare(mesajEroare(error)); else onTrimis(id);
  }

  return (
    <form className="card formular eveniment-nou" onSubmit={trimite}>
      <h2>Reclamație nouă</h2>
      <p className="discret">Descrieți problema cât mai exact; după trimitere puteți adăuga fotografii. {unitateFixa && <>Reclamația se trimite pentru <b>{unitateFixa}</b>.</>}</p>
      <div className="campuri">
        <label>Ce fel de problemă
          <select value={f.categorie} onChange={e => set('categorie', e.target.value)}>{CATEGORII_RECLAMATIE.map(c => <option key={c.id} value={c.id}>{c.nume}</option>)}</select>
        </label>
        {!unitateFixa && <label>Unitatea / zona<input value={f.unitate} onChange={e => set('unitate', e.target.value)} placeholder="ex. Ap. 14 sau Scara A" /></label>}
        <label>Unde anume<input value={f.loc} onChange={e => set('loc', e.target.value)} placeholder="ex. baie, tavanul de lângă cadă" /></label>
      </div>
      <label>Pe scurt<input value={f.titlu} onChange={e => set('titlu', e.target.value)} required minLength={3} placeholder="ex. Curge apă de la etajul de deasupra" /></label>
      <label>Ce se întâmplă<textarea rows={4} value={f.descriere} onChange={e => set('descriere', e.target.value)} required minLength={5}
        placeholder="De când, cât de des, ce ați observat." /></label>
      <label className="bifa"><input type="checkbox" checked={f.urgenta} onChange={e => set('urgenta', e.target.checked)} />
        Urgent (pericol, inundație, fără apă / căldură / curent). În caz de pericol imediat sunați și la 112.</label>
      <Eroare text={eroare} />
      <div className="actiuni">
        <button type="button" className="buton" onClick={onRenunta}>Renunță</button>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se trimite…' : 'Trimite reclamația'}</button>
      </div>
    </form>
  );
}

const dataOra = (s: string | null) => (s ? new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** Fișa reclamației, cu pașii parcurși și acțiunile permise celui care o vede. */
export function FisaReclamatie({ r, codProiect, uid, membri, administreaza, constructor, pentruLocatar, onSchimbat }: {
  r: Reclamatie; codProiect: string; uid: string; membri: Membru[]; administreaza: boolean; constructor: boolean; pentruLocatar?: boolean; onSchimbat: () => void;
}) {
  const [text, setText] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const deschisa = ['noua', 'preluata', 'la_constructor'].includes(r.stare);
  const poateRezolva = deschisa && (administreaza || (constructor && r.stare === 'la_constructor'));
  const eRaportor = r.raportat_de === uid;
  const nume = (id: string | null) => { if (!id) return ''; if (id === uid) return 'dumneavoastră'; const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : pentruLocatar ? 'administrarea' : 'locatarul'; };

  async function rpc(fn: string, args: Record<string, unknown>) {
    setEroare(null); setLucreaza(true);
    const { error } = await supabase.rpc(fn, args);
    setLucreaza(false);
    if (error) setEroare(mesajEroare(error)); else { setText(''); onSchimbat(); }
  }

  const pasi = [
    { cand: r.creat_la, ce: `Trimisă de ${nume(r.raportat_de)}${r.de_locatar && !pentruLocatar ? ' (locatar)' : ''}` },
    r.preluata_la && r.stare !== 'respinsa' ? { cand: r.preluata_la, ce: `Preluată de ${nume(r.preluata_de)}` } : null,
    r.trimisa_constructorului_la ? { cand: r.trimisa_constructorului_la, ce: 'Trimisă constructorului, în garanție' } : null,
    r.redeschideri ? { cand: null, ce: `Redeschisă de ${r.redeschideri} ${r.redeschideri === 1 ? 'dată' : 'ori'}: „${r.nota_redeschidere}”` } : null,
    r.rezolvata_la ? { cand: r.rezolvata_la, ce: `Rezolvată${pentruLocatar ? '' : ` de ${nume(r.rezolvata_de)}`}: ${r.rezolvare}` } : null,
    r.confirmata_la ? { cand: r.confirmata_la, ce: 'Rezolvarea a fost confirmată' } : null,
    r.stare === 'respinsa' ? { cand: r.preluata_la, ce: `Respinsă: ${r.motiv_respingere}` } : null,
  ].filter(Boolean) as { cand: string | null; ce: string }[];

  return (
    <div className="card">
      <span className="cod">{codReclamatie(codProiect, r.numar)}</span>
      <h2>{r.titlu} <EticReclamatie r={r} />{r.urgenta && <> <span className="eticheta alerta">Urgent</span></>}</h2>
      {pentruLocatar && <p className="mesaj info">{STARI_RECLAMATIE[r.stare].pentruLocatar}</p>}
      <table className="tabel-detalii"><tbody>
        <tr><th>Problema</th><td>{numeCategorieReclamatie(r.categorie)}</td></tr>
        {r.unitate && <tr><th>Unitatea</th><td>{r.unitate}</td></tr>}
        {r.loc && <tr><th>Unde</th><td>{r.loc}</td></tr>}
        <tr><th>Descrierea</th><td className="text-lung">{r.descriere}</td></tr>
      </tbody></table>
      <h3>Pașii</h3>
      <ol className="pasi-reclamatie">{pasi.map((p, i) => <li key={i}><span className="discret">{dataOra(p.cand)}</span> {p.ce}</li>)}</ol>

      {(administreaza && deschisa) || poateRezolva || (eRaportor && r.stare === 'rezolvata') ? (
        <div className="actiuni-reclamatie">
          <label>{eRaportor && r.stare === 'rezolvata' ? 'Dacă nu s-a rezolvat, spuneți ce mai e' : poateRezolva ? 'Ce s-a făcut (sau motivul respingerii)' : 'Observații'}
            <textarea rows={2} value={text} onChange={e => setText(e.target.value)} /></label>
          <div className="actiuni">
            {administreaza && r.stare === 'noua' && <button className="buton" disabled={lucreaza} onClick={() => rpc('reclamatie_preia', { p_id: r.id, p_la_constructor: false })}>Preia</button>}
            {administreaza && deschisa && r.stare !== 'la_constructor' && <button className="buton" disabled={lucreaza} onClick={() => rpc('reclamatie_preia', { p_id: r.id, p_la_constructor: true })}>Trimite constructorului (garanție)</button>}
            {administreaza && deschisa && <button className="buton" disabled={lucreaza} onClick={() => rpc('reclamatie_respinge', { p_id: r.id, p_motiv: text })}>Respinge</button>}
            {poateRezolva && <button className="buton principal" disabled={lucreaza} onClick={() => rpc('reclamatie_rezolva', { p_id: r.id, p_rezolvare: text })}>Marchează rezolvată</button>}
            {eRaportor && r.stare === 'rezolvata' && <>
              <button className="buton" disabled={lucreaza} onClick={() => rpc('reclamatie_confirma', { p_id: r.id, p_rezolvata: false, p_nota: text })}>Nu s-a rezolvat</button>
              <button className="buton principal" disabled={lucreaza} onClick={() => rpc('reclamatie_confirma', { p_id: r.id, p_rezolvata: true, p_nota: null })}>Confirm rezolvarea</button>
            </>}
          </div>
          <Eroare text={eroare} />
        </div>
      ) : null}

      <Atasamente proiectId={r.proiect_id} entitate="reclamatie" entitateId={r.id} membri={membri}
        poateIncarca={deschisa && (eRaportor || administreaza || (constructor && r.stare === 'la_constructor'))}
        tipuri={['poza', 'document']} titlu="Fotografii" gol="Fotografiile problemei și ale remedierii." />
    </div>
  );
}
