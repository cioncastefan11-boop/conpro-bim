// Cerințele de predare ale beneficiarului (AIR / EIR) și cât sunt îndeplinite, în Cartea tehnică.
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { DateProiect } from '../lib/dateProiect';
import { CAMPURI_CERINTA, CERINTE_TIP, evalueazaCerinte, type CampCerinta, type CerintaPredare } from '../lib/cerinte';
import type { Rol } from '../lib/domeniu';
import { Eroare, mesajEroare } from './ui';

export default function CerintePredare({ d, rolulMeu, onSchimbat }: { d: DateProiect; rolulMeu?: Rol; onSchimbat: () => Promise<void> }) {
  const admin = rolulMeu === 'administrator' || rolulMeu === 'beneficiar';
  const rez = useMemo(() => evalueazaCerinte(d, d.cerinte), [d]);
  const [nou, setNou] = useState(false);
  const [f, setF] = useState({ categorie: 'echipament' as 'echipament' | 'document', camp: 'serie' as CampCerinta, aplicabil_la: '', titlu: '', cuvinte: '', cod_document: '', capitol: '', sursa: 'AIR' as 'AIR' | 'EIR', obligatorie: true });
  const [eroare, setEroare] = useState<string | null>(null);
  const indeplinite = rez.filter(r => r.indeplinita).length;

  async function setTip() {
    setEroare(null);
    const { error } = await supabase.from('cerinte_predare').insert(CERINTE_TIP.map(c => ({ ...c, proiect_id: d.proiect.id })));
    if (error) setEroare(/cerinte_predare/.test(error.message) ? 'Rulați în Supabase scriptul 0021_cerinte_lectii.sql.' : mesajEroare(error)); else await onSchimbat();
  }
  async function adauga(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const doc = f.categorie === 'document';
    const { error } = await supabase.from('cerinte_predare').insert({ proiect_id: d.proiect.id, categorie: f.categorie, camp: doc ? null : f.camp, aplicabil_la: doc ? null : f.aplicabil_la,
      titlu: doc ? f.titlu : null, cuvinte: doc ? f.cuvinte : null, cod_document: doc ? f.cod_document : null, capitol: doc && f.capitol ? f.capitol : null,
      sursa: f.sursa, obligatorie: f.obligatorie, ordine: Math.max(0, ...d.cerinte.map(c => c.ordine)) + 1 });
    if (error) setEroare(mesajEroare(error)); else { setNou(false); await onSchimbat(); }
  }
  async function sterge(c: CerintaPredare) {
    const { error } = await supabase.from('cerinte_predare').delete().eq('id', c.id);
    if (error) setEroare(mesajEroare(error)); else await onSchimbat();
  }

  return (
    <div className="card">
      <div className="antet-card">
        <div>
          <h2>Cerințele de predare (AIR / EIR)</h2>
          <p className="discret">Ce informații cere beneficiarul la predare: datele fiecărui echipament (COBie) și documentele. Aplicația verifică singură cât sunt îndeplinite; cele obligatorii neîndeplinite apar în „Ce mai lipsește” și în pregătirea recepției.</p>
        </div>
        {rez.length > 0 && <div className="scor-cerinte"><b>{indeplinite}/{rez.length}</b><small>îndeplinite</small></div>}
      </div>
      {!rez.length ? (
        <div className="mesaj info">
          <p>Nu sunt stabilite cerințe de predare.{admin ? ' Porniți de la setul tip (9 câmpuri COBie pentru echipamente și 5 documente de bază) și adaptați-l la ce cere beneficiarul în caietul de sarcini.' : ' Le stabilesc beneficiarul sau administratorul proiectului.'}</p>
          {admin && <button className="buton principal" onClick={setTip}>Adaugă setul tip</button>}
        </div>
      ) : (
        <div className="tabel-wrap"><table className="tabel">
          <thead><tr><th>Cerința</th><th>Sursa</th><th>Starea</th><th>Detalii</th>{admin && <th />}</tr></thead>
          <tbody>{rez.map(r => (
            <tr key={r.cerinta.id}>
              <td><b>{r.cerinta.categorie === 'echipament' ? CAMPURI_CERINTA[r.cerinta.camp!] : r.cerinta.titlu}</b><br />
                <small className="discret">{r.cerinta.categorie === 'echipament' ? `la ${r.cerinta.aplicabil_la ? `echipamentele „${r.cerinta.aplicabil_la}”` : 'toate echipamentele'}` : `document${r.cerinta.capitol ? `, capitolul ${r.cerinta.capitol}` : ''}${r.cerinta.cod_document ? ` · ${r.cerinta.cod_document}` : ''}`}{r.cerinta.obligatorie ? '' : ' · opțională'}</small></td>
              <td><span className="eticheta neutru">{r.cerinta.sursa}</span></td>
              <td>{r.indeplinita ? <span className="eticheta ok">îndeplinită</span> : r.bune > 0 ? <span className="eticheta atentie">parțial</span> : <span className="eticheta alerta">lipsă</span>}
                {r.cerinta.categorie === 'echipament' && r.total > 0 && <div className="bara-progres"><i style={{ width: `${r.bune / r.total * 100}%` }} /></div>}</td>
              <td><small>{r.detalii}{r.cerinta.categorie === 'echipament' && r.lipsa.length ? <> · lipsește la <Link to="../echipamente">{r.lipsa.slice(0, 4).join(', ')}{r.lipsa.length > 4 ? '…' : ''}</Link></> : null}</small></td>
              {admin && <td><button className="legatura alerta" onClick={() => sterge(r.cerinta)}>șterge</button></td>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {admin && rez.length > 0 && !nou && <div className="actiuni stanga"><button className="buton" onClick={() => setNou(true)}>Cerință nouă</button></div>}
      {nou && (
        <form className="formular eveniment-nou cadru-editare" onSubmit={adauga}>
          <div className="campuri">
            <label>Ce se cere<select value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value as 'document' })}><option value="echipament">Un câmp la echipamente</option><option value="document">Un document</option></select></label>
            <label>Sursa<select value={f.sursa} onChange={e => setF({ ...f, sursa: e.target.value as 'AIR' })}><option value="AIR">AIR (cerințele activului)</option><option value="EIR">EIR (cerințele contractului)</option></select></label>
            <label className="bifa"><input type="checkbox" checked={f.obligatorie} onChange={e => setF({ ...f, obligatorie: e.target.checked })} /> Obligatorie</label>
          </div>
          {f.categorie === 'echipament' ? (
            <div className="campuri">
              <label>Câmpul<select value={f.camp} onChange={e => setF({ ...f, camp: e.target.value as CampCerinta })}>{Object.entries(CAMPURI_CERINTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Doar la echipamentele (categorie sau denumire)<input value={f.aplicabil_la} onChange={e => setF({ ...f, aplicabil_la: e.target.value })} placeholder="gol = toate; ex. Încălzire, lift" /></label>
            </div>
          ) : (
            <>
              <label>Documentul cerut<input value={f.titlu} onChange={e => setF({ ...f, titlu: e.target.value })} required minLength={3} placeholder="ex. Raportul de măsurători la priza de pământ" /></label>
              <div className="campuri">
                <label>Se recunoaște după cuvintele<input value={f.cuvinte} onChange={e => setF({ ...f, cuvinte: e.target.value })} placeholder="ex. priza de pamant, rezistenta de dispersie" /></label>
                <label>sau codul exact din CDE<input value={f.cod_document} onChange={e => setF({ ...f, cod_document: e.target.value.toUpperCase() })} placeholder={`${d.proiect.cod}-…`} /></label>
                <label>Capitolul Cărții tehnice<select value={f.capitol} onChange={e => setF({ ...f, capitol: e.target.value })}><option value="">oricare</option>{['A', 'B', 'C', 'D'].map(c => <option key={c} value={c}>{c}</option>)}</select></label>
              </div>
            </>
          )}
          <Eroare text={eroare} />
          <div className="actiuni"><button type="button" className="buton" onClick={() => setNou(false)}>Renunță</button><button className="buton principal">Adaugă</button></div>
        </form>
      )}
      {!nou && <Eroare text={eroare} />}
    </div>
  );
}
