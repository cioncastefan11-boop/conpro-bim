import { Link } from 'react-router-dom';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useUid } from '../lib/sesiune';
import { TIPURI_DOC, formatData, numeTipDoc, stareDocument, type TipDoc } from '../lib/domeniu';
import type { DocumentPersoana, Firma, Persoana } from '../lib/tipuri';
import { Eroare, Eticheta, mesajEroare } from '../components/ui';

export default function Profil() {
  const uid = useUid();
  const [p, setP] = useState<Persoana | null>(null);
  const [firme, setFirme] = useState<Firma[]>([]);
  const [docs, setDocs] = useState<DocumentPersoana[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [salvat, setSalvat] = useState(false);

  const incarca = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from('persoane').select('*').eq('id', uid).single(),
      supabase.from('firme').select('id, denumire, cui').order('denumire'),
      supabase.from('documente_persoana').select('*').eq('persoana_id', uid).eq('anulat', false).order('valabil_pana'),
    ]);
    setEroare(mesajEroare(a.error ?? b.error ?? c.error));
    setP(a.data as Persoana);
    setFirme((b.data as Firma[]) ?? []);
    setDocs((c.data as DocumentPersoana[]) ?? []);
  }, [uid]);
  useEffect(() => { incarca(); }, [incarca]);

  const [eroareNot, setEroareNot] = useState<string | null>(null);

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    if (!p) return;
    const { error } = await supabase.from('persoane')
      .update({ nume: p.nume.trim(), telefon: p.telefon?.trim() || null, firma_id: p.firma_id }).eq('id', uid);
    if (error) setEroare(mesajEroare(error)); else setSalvat(true);
  }

  if (!p) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;

  return (
    <>
      <div className="antet-pagina"><div><h1>Profilul meu</h1><p className="discret">{p.email}</p></div></div>

      <form className="card formular" onSubmit={salveaza}>
        <h2>Date de contact</h2>
        <div className="campuri">
          <label>Nume și prenume<input value={p.nume} onChange={e => { setP({ ...p, nume: e.target.value }); setSalvat(false); }} required /></label>
          <label>Telefon<input value={p.telefon ?? ''} onChange={e => { setP({ ...p, telefon: e.target.value }); setSalvat(false); }} /></label>
          <label>Firma
            <select value={p.firma_id ?? ''} onChange={e => { setP({ ...p, firma_id: e.target.value || null }); setSalvat(false); }}>
              <option value="">— alegeți —</option>
              {firme.map(f => <option key={f.id} value={f.id}>{f.denumire}{f.cui ? ` (${f.cui})` : ''}</option>)}
            </select>
          </label>
        </div>
        <FirmaNoua onAdaugata={async id => { await incarca(); setP(x => x && { ...x, firma_id: id }); setSalvat(false); }} />
        <Eroare text={eroare} />
        <div className="actiuni">
          {salvat && <span className="mesaj-scurt">Salvat.</span>}
          <button className="buton principal">Salvează</button>
        </div>
      </form>

      <div className="card formular">
        <h2>Notificări</h2>
        <label className="bifa">
          <input type="checkbox" checked={p.rezumat_zilnic !== false} onChange={async e => {
            const v = e.target.checked; setEroareNot(null);
            const { error } = await supabase.from('persoane').update({ rezumat_zilnic: v }).eq('id', uid);
            if (error) setEroareNot(error.message.includes('rezumat_zilnic') ? 'Rulați în Supabase scriptul 0012_conventie_sarcini.sql.' : mesajEroare(error)); else setP({ ...p, rezumat_zilnic: v });
          }} />
          Primesc dimineața, în zilele lucrătoare, un e-mail cu ce am de făcut în proiecte
        </label>
        <p className="discret">Lista completă e oricând în <Link to="/de-facut">De făcut</Link>, în bara de sus. E-mailul pleacă doar în zilele în care aveți ceva de făcut.</p>
        <Eroare text={eroareNot} />
      </div>

      <div className="card">
        <h2>Autorizații, atestate și polițe</h2>
        <p className="discret">Colegii din proiectele dumneavoastră văd aceste documente, ca beneficiarul să poată verifica autorizația și asigurarea (art. 456, 459 și 556 din Legea 169/2026).</p>
        {docs.length > 0 && (
          <div className="tabel-wrap">
            <table className="tabel">
              <thead><tr><th>Document</th><th>Număr</th><th>Emitent</th><th>Valabil până la</th><th>Stare</th><th /></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td>{numeTipDoc(d.tip)}{d.domeniu && <><br /><span className="discret">{d.domeniu}</span></>}</td>
                    <td>{d.numar ?? '—'}</td>
                    <td>{d.emitent ?? '—'}</td>
                    <td>{formatData(d.valabil_pana)}</td>
                    <td><Eticheta stare={stareDocument(d.valabil_pana)} /></td>
                    <td><button className="legatura alerta" onClick={async () => {
                      const { error } = await supabase.from('documente_persoana').update({ anulat: true }).eq('id', d.id);
                      if (error) setEroare(mesajEroare(error)); else incarca();
                    }}>Anulează</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DocumentNou onAdaugat={incarca} />
      </div>

      <SchimbaParola />
    </>
  );
}

function FirmaNoua({ onAdaugata }: { onAdaugata: (id: string) => void }) {
  const uid = useUid();
  const [deschis, setDeschis] = useState(false);
  const [denumire, setDenumire] = useState('');
  const [cui, setCui] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);

  async function adauga() {
    setEroare(null);
    const { error } = await supabase.from('firme').insert({ denumire: denumire.trim(), cui: cui.trim().toUpperCase() || null, creat_de: uid });
    if (error) { setEroare(mesajEroare(error)); return; }
    const { data } = await supabase.from('firme').select('id').eq('denumire', denumire.trim()).eq('creat_de', uid)
      .order('creat_la', { ascending: false }).limit(1).single();
    setDeschis(false); setDenumire(''); setCui('');
    if (data) onAdaugata(data.id);
  }

  if (!deschis) return <button type="button" className="legatura" onClick={() => setDeschis(true)}>Firma nu e pe listă? Adăugați-o</button>;
  return (
    <div className="subformular">
      <label>Denumirea firmei<input value={denumire} onChange={e => setDenumire(e.target.value)} /></label>
      <label>CUI<input value={cui} onChange={e => setCui(e.target.value)} placeholder="RO12345678" /></label>
      <button type="button" className="buton" disabled={denumire.trim().length < 2} onClick={adauga}>Adaugă firma</button>
      <Eroare text={eroare} />
    </div>
  );
}

function DocumentNou({ onAdaugat }: { onAdaugat: () => void }) {
  const [tip, setTip] = useState<TipDoc>('polita_rc');
  const [numar, setNumar] = useState('');
  const [emitent, setEmitent] = useState('');
  const [domeniu, setDomeniu] = useState('');
  const [de, setDe] = useState('');
  const [pana, setPana] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);

  async function adauga(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('documente_persoana').insert({
      tip, numar: numar.trim() || null, emitent: emitent.trim() || null, domeniu: domeniu.trim() || null,
      valabil_de: de || null, valabil_pana: pana || null,
    });
    if (error) { setEroare(mesajEroare(error)); return; }
    setNumar(''); setEmitent(''); setDomeniu(''); setDe(''); setPana('');
    onAdaugat();
  }

  return (
    <form className="subformular" onSubmit={adauga}>
      <h3>Adăugați un document</h3>
      <div className="campuri">
        <label>Tip
          <select value={tip} onChange={e => setTip(e.target.value as TipDoc)}>
            {TIPURI_DOC.map(t => <option key={t.id} value={t.id}>{t.nume}</option>)}
          </select>
        </label>
        <label>Număr<input value={numar} onChange={e => setNumar(e.target.value)} /></label>
        <label>Emitent<input value={emitent} onChange={e => setEmitent(e.target.value)} placeholder={tip === 'polita_rc' ? 'Asigurătorul' : 'ISC'} /></label>
        <label className="lat">Domenii / observații<input value={domeniu} onChange={e => setDomeniu(e.target.value)} placeholder="ex. construcții civile, industriale și agricole" /></label>
        <label>Valabil de la<input type="date" value={de} onChange={e => setDe(e.target.value)} /></label>
        <label>Valabil până la<input type="date" value={pana} onChange={e => setPana(e.target.value)} required={tip === 'polita_rc'} /></label>
      </div>
      <Eroare text={eroare} />
      <div className="actiuni"><button className="buton principal">Adaugă</button></div>
    </form>
  );
}

function SchimbaParola() {
  const [parola, setParola] = useState('');
  const [mesaj, setMesaj] = useState<{ ton: 'ok' | 'alerta'; text: string } | null>(null);

  async function schimba(e: FormEvent) {
    e.preventDefault();
    if (parola.length < 10) { setMesaj({ ton: 'alerta', text: 'Parola trebuie să aibă cel puțin 10 caractere.' }); return; }
    const { error } = await supabase.auth.updateUser({ password: parola });
    setMesaj(error ? { ton: 'alerta', text: error.message } : { ton: 'ok', text: 'Parola a fost schimbată.' });
    if (!error) setParola('');
  }

  return (
    <form className="card formular" onSubmit={schimba}>
      <h2>Parola</h2>
      <div className="rand-formular">
        <label>Parolă nouă<input type="password" value={parola} onChange={e => setParola(e.target.value)} autoComplete="new-password" /></label>
        <button className="buton">Schimbă parola</button>
      </div>
      {mesaj && <p className={`mesaj ${mesaj.ton}`}>{mesaj.text}</p>}
    </form>
  );
}
