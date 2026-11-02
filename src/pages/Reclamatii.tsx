// Exploatare → Reclamații: reclamațiile locatarilor și ale echipei, și lista locatarilor clădirii.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { codReclamatie, numeCategorieReclamatie, type Rol } from '../lib/domeniu';
import type { Locatar, Membru, Proiect, Reclamatie } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import { EticReclamatie, FisaReclamatie, FormularReclamatie } from '../components/Reclamatie';

type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };
const administreaza = (r?: Rol) => r === 'beneficiar' || r === 'administrator' || r === 'administrator_cladire';

export default function Reclamatii(props: Props) {
  const [lista, setLista] = useState<Reclamatie[] | null>(null);
  const [locatari, setLocatari] = useState<Locatar[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('reclamatii').select('*').eq('proiect_id', props.proiect.id).order('numar', { ascending: false }),
      administreaza(props.rolulMeu) ? supabase.from('locatari').select('*').eq('proiect_id', props.proiect.id).order('unitate') : Promise.resolve({ data: [], error: null }),
    ]);
    const err = a.error ?? b.error;
    if (err) setEroare(/reclamatii|locatari/.test(err.message) ? 'Rulați în Supabase scriptul 0017_reclamatii.sql.' : mesajEroare(err));
    setLista((a.data as Reclamatie[]) ?? []);
    setLocatari((b.data as Locatar[]) ?? []);
  }, [props.proiect.id, props.rolulMeu]);
  useEffect(() => { incarca(); }, [incarca]);
  if (!lista) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;
  return (
    <>
      <Eroare text={eroare} />
      <Routes>
        <Route index element={<Lista {...props} lista={lista} locatari={locatari} onSchimbat={incarca} />} />
        <Route path="noua" element={<Noua {...props} onSalvat={incarca} />} />
        <Route path=":rId" element={<Fisa {...props} lista={lista} onSchimbat={incarca} />} />
      </Routes>
    </>
  );
}

function Lista({ proiect, rolulMeu, lista, locatari, onSchimbat }: Props & { lista: Reclamatie[]; locatari: Locatar[]; onSchimbat: () => Promise<void> }) {
  const [filtru, setFiltru] = useState<'deschise' | 'toate'>('deschise');
  const deschise = lista.filter(r => ['noua', 'preluata', 'la_constructor', 'rezolvata'].includes(r.stare));
  const arata = filtru === 'deschise' ? deschise : lista;
  return (
    <>
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Reclamațiile</h2>
            <p className="discret">De la locatari și de la echipă. Administrarea le preia sau le trimite constructorului, în garanție; cel care a trimis-o confirmă rezolvarea.</p>
          </div>
          <div className="actiuni">{rolulMeu && rolulMeu !== 'cititor' && <Link className="buton principal" to="noua">Reclamație nouă</Link>}</div>
        </div>
        <div className="filtre-punct">
          <button className={filtru === 'deschise' ? 'activ' : ''} onClick={() => setFiltru('deschise')}>Deschise ({deschise.length})</button>
          <button className={filtru === 'toate' ? 'activ' : ''} onClick={() => setFiltru('toate')}>Toate ({lista.length})</button>
        </div>
        {!arata.length ? <Gol titlu={filtru === 'deschise' ? 'Nicio reclamație deschisă' : 'Nicio reclamație'} /> : (
          <ul className="lista-evenimente">
            {arata.map(r => (
              <li key={r.id} className={r.urgenta && r.stare === 'noua' ? 'ev-avarie' : r.stare === 'noua' ? 'ev-seism' : 'ev-inspectie'}>
                <Link to={r.id}>
                  <span className="cod">{codReclamatie(proiect.cod, r.numar)}</span>
                  <span className="data">{new Date(r.creat_la).toLocaleDateString('ro-RO')}</span>
                  <span className="tip-ev">{numeCategorieReclamatie(r.categorie)}</span>
                  <b>{r.unitate ? `${r.unitate} · ` : ''}{r.titlu}</b>
                  {r.urgenta && <span className="eticheta alerta">Urgent</span>}
                  {r.redeschideri > 0 && <span className="eticheta atentie">redeschisă</span>}
                  <small><EticReclamatie r={r} /></small>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {administreaza(rolulMeu) && <Locatari proiect={proiect} locatari={locatari} onSchimbat={onSchimbat} />}
    </>
  );
}

// --------------------------------------------------------------------- Locatarii
function Locatari({ proiect, locatari, onSchimbat }: { proiect: Proiect; locatari: Locatar[]; onSchimbat: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [rezultat, setRezultat] = useState<string | null>(null);
  const [inactivi, setInactivi] = useState(false);
  const link = `${window.location.origin}/autentificare`;

  // un locatar pe rând: „email; unitate” (sau tab / virgulă), ca la lipirea dintr-un tabel
  function citeste(t: string) {
    return t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const parti = l.split(/[;\t]/).map(x => x.trim()).filter(Boolean);
      const email = parti.find(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
      const unitate = parti.filter(x => x !== email).join(', ');
      return email && unitate ? { email: email.toLowerCase(), unitate } : null;
    });
  }
  async function adauga(e: FormEvent) {
    e.preventDefault(); setEroare(null); setRezultat(null);
    const randuri = citeste(text);
    if (randuri.some(r => !r)) { setEroare('Fiecare rând trebuie să aibă e-mailul și unitatea, despărțite prin „;”, ex. ion@exemplu.ro; Ap. 14'); return; }
    const noi = (randuri as { email: string; unitate: string }[]).filter(r => !locatari.some(l => l.email === r.email));
    if (!noi.length) { setEroare('Toți locatarii sunt deja în listă.'); return; }
    const { error } = await supabase.from('locatari').insert(noi.map(r => ({ proiect_id: proiect.id, ...r })));
    if (error) { setEroare(mesajEroare(error)); return; }
    setRezultat(`${noi.length} ${noi.length === 1 ? 'locatar adăugat' : 'locatari adăugați'}${randuri.length > noi.length ? `; ${randuri.length - noi.length} erau deja în listă` : ''}.`);
    setText(''); await onSchimbat();
  }
  async function schimba(l: Locatar, activ: boolean) {
    const { error } = await supabase.from('locatari').update({ activ }).eq('id', l.id);
    if (error) setEroare(mesajEroare(error)); else await onSchimbat();
  }
  const arata = inactivi ? locatari : locatari.filter(l => l.activ);

  return (
    <div className="card">
      <div className="antet-card">
        <div>
          <h2>Locatarii ({locatari.filter(l => l.activ).length})</h2>
          <p className="discret">Locatarii nu fac parte din echipa proiectului: văd doar clădirea, unitatea lor și reclamațiile trimise de ei. Spuneți-le să-și facă cont cu aceeași adresă de e-mail, la <b>{link}</b>.</p>
        </div>
        {locatari.some(l => !l.activ) && <button className="legatura" onClick={() => setInactivi(!inactivi)}>{inactivi ? 'Ascunde mutații' : 'Arată și mutații'}</button>}
      </div>
      {arata.length > 0 && (
        <div className="tabel-wrap"><table className="tabel">
          <thead><tr><th>Unitatea</th><th>E-mail</th><th>Cont</th><th /></tr></thead>
          <tbody>{arata.map(l => (
            <tr key={l.id} className={l.activ ? '' : 'inactiv'}>
              <td><b>{l.unitate}</b></td><td>{l.email}</td>
              <td>{l.persoana_id ? <span className="eticheta ok">are cont</span> : <span className="eticheta neutru">invitat</span>}</td>
              <td><button className={`legatura${l.activ ? ' alerta' : ''}`} onClick={() => schimba(l, !l.activ)}>{l.activ ? 'S-a mutat' : 'Reactivează'}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <form className="formular" onSubmit={adauga}>
        <label>Adăugați locatari, câte unul pe rând: <i>e-mail; unitate</i>
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={'ion.pop@exemplu.ro; Ap. 14, scara A\nmaria@exemplu.ro; Ap. 3'} /></label>
        <p className="discret">Puteți lipi direct două coloane dintr-un tabel Excel (e-mail și apartament).</p>
        <Eroare text={eroare} />
        {rezultat && <p className="mesaj ok">{rezultat}</p>}
        <div className="actiuni"><button className="buton principal">Adaugă</button></div>
      </form>
    </div>
  );
}

function Noua({ proiect, rolulMeu, onSalvat }: Props & { onSalvat: () => Promise<void> }) {
  const nav = useNavigate();
  if (!rolulMeu || rolulMeu === 'cititor') return <Gol titlu="Reclamațiile le trimit echipa și locatarii" />;
  return <FormularReclamatie proiectId={proiect.id} onRenunta={() => nav('..')} onTrimis={async id => { await onSalvat(); nav(`../${id}`); }} />;
}

function Fisa({ proiect, membri, rolulMeu, uid, lista, onSchimbat }: Props & { lista: Reclamatie[]; onSchimbat: () => Promise<void> }) {
  const { rId } = useParams();
  const r = lista.find(x => x.id === rId);
  if (!r) return <Gol titlu="Reclamația nu există" />;
  return (
    <>
      <p><Link to="..">← Reclamațiile</Link></p>
      <FisaReclamatie r={r} codProiect={proiect.cod} uid={uid} membri={membri} administreaza={administreaza(rolulMeu)}
        constructor={rolulMeu === 'constructor' || rolulMeu === 'subcontractor'} onSchimbat={onSchimbat} />
    </>
  );
}
