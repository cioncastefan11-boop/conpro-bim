// Lecțiile învățate (ISO 19650-2, 5.8.2): ce a mers bine, ce nu și ce recomandăm la proiectul următor.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { STADII, type Rol } from '../lib/domeniu';
import type { Membru, Proiect } from '../lib/tipuri';
import { Eroare, mesajEroare } from './ui';

type Lectie = { id: string; categorie: string; stadiu: number | null; titlu: string; ce_s_a_intamplat: string | null; recomandare: string; pozitiva: boolean; creat_de: string; creat_la: string };
export const CATEGORII_LECTII: Record<string, string> = {
  informatii: 'Informații și documente', proces: 'Procese și aprobări', tehnic: 'Soluții tehnice', colaborare: 'Colaborare și comunicare', instrumente: 'Software și instrumente', altul: 'Altele',
};

export default function LectiiInvatate({ proiect, membri, rolulMeu, uid }: { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string }) {
  const [lista, setLista] = useState<Lectie[] | null>(null);
  const [nou, setNou] = useState(false);
  const [f, setF] = useState({ categorie: 'informatii', stadiu: String(proiect.stadiu_catuc), titlu: '', ce_s_a_intamplat: '', recomandare: '', pozitiva: false });
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const { data, error } = await supabase.from('lectii_invatate').select('*').eq('proiect_id', proiect.id).order('creat_la', { ascending: false });
    if (error && !/lectii_invatate/.test(error.message)) setEroare(mesajEroare(error));
    setLista((data as Lectie[]) ?? []);
  }, [proiect.id]);
  useEffect(() => { incarca(); }, [incarca]);
  if (!lista) return null;
  const nume = (id: string) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? p.nume || p.email : '—'; };

  async function salveaza(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const { error } = await supabase.from('lectii_invatate').insert({ proiect_id: proiect.id, categorie: f.categorie, stadiu: Number(f.stadiu), titlu: f.titlu.trim(),
      ce_s_a_intamplat: f.ce_s_a_intamplat.trim() || null, recomandare: f.recomandare.trim(), pozitiva: f.pozitiva });
    if (error) setEroare(/lectii_invatate/.test(error.message) ? 'Rulați în Supabase scriptul 0021_cerinte_lectii.sql.' : mesajEroare(error));
    else { setNou(false); setF({ ...f, titlu: '', ce_s_a_intamplat: '', recomandare: '' }); incarca(); }
  }
  async function sterge(l: Lectie) { const { error } = await supabase.from('lectii_invatate').delete().eq('id', l.id); if (error) setEroare(mesajEroare(error)); else incarca(); }

  return (
    <div className="card">
      <div className="antet-card">
        <div>
          <h2>Lecții învățate</h2>
          <p className="discret">Ce a mers bine și ce nu, cu recomandarea pentru proiectul următor (ISO 19650-2, 5.8.2). Se scriu pe parcurs, nu doar la final, cât timp detaliile sunt proaspete.</p>
        </div>
        {rolulMeu && rolulMeu !== 'cititor' && !nou && <button className="buton" onClick={() => setNou(true)}>Lecție nouă</button>}
      </div>
      {nou && (
        <form className="formular eveniment-nou cadru-editare" onSubmit={salveaza}>
          <div className="campuri">
            <label>Domeniul<select value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value })}>{Object.entries(CATEGORII_LECTII).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Stadiul<select value={f.stadiu} onChange={e => setF({ ...f, stadiu: e.target.value })}>{STADII.map((s, i) => <option key={i} value={i}>{s}</option>)}</select></label>
            <label>Tipul<select value={f.pozitiva ? 'da' : 'nu'} onChange={e => setF({ ...f, pozitiva: e.target.value === 'da' })}><option value="nu">De evitat / de îmbunătățit</option><option value="da">A mers bine, de repetat</option></select></label>
          </div>
          <label>Pe scurt<input value={f.titlu} onChange={e => setF({ ...f, titlu: e.target.value })} required minLength={3} placeholder="ex. Fișele COBie completate la montaj, nu la final" /></label>
          <label>Ce s-a întâmplat<textarea rows={2} value={f.ce_s_a_intamplat} onChange={e => setF({ ...f, ce_s_a_intamplat: e.target.value })} /></label>
          <label>Recomandarea pentru proiectul următor<textarea rows={2} value={f.recomandare} onChange={e => setF({ ...f, recomandare: e.target.value })} required minLength={3} /></label>
          <Eroare text={eroare} />
          <div className="actiuni"><button type="button" className="buton" onClick={() => setNou(false)}>Renunță</button><button className="buton principal">Salvează</button></div>
        </form>
      )}
      {!lista.length ? <p className="discret">Nicio lecție înregistrată încă.</p> : (
        <ul className="lectii">
          {lista.map(l => (
            <li key={l.id} className={l.pozitiva ? 'buna' : 'de-evitat'}>
              <div className="discutie-cap"><b>{l.titlu}</b><span className="eticheta neutru">{CATEGORII_LECTII[l.categorie]}</span>{l.stadiu != null && <small className="discret">{STADII[l.stadiu]}</small>}</div>
              {l.ce_s_a_intamplat && <p className="text-lung">{l.ce_s_a_intamplat}</p>}
              <p><b>Recomandare:</b> {l.recomandare}</p>
              <small className="discret">{nume(l.creat_de)}, {new Date(l.creat_la).toLocaleDateString('ro-RO')}</small>
              {(l.creat_de === uid || rolulMeu === 'administrator') && <button className="legatura alerta" onClick={() => sterge(l)}> șterge</button>}
            </li>
          ))}
        </ul>
      )}
      {!nou && <Eroare text={eroare} />}
    </div>
  );
}
