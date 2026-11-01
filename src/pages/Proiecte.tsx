import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUid } from '../lib/sesiune';
import { CLASE, STADII, codPv, numeRol, stareAutorizatie, tipPv, type Rol, type TipPv } from '../lib/domeniu';
import type { Proiect } from '../lib/tipuri';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';

type Rand = Proiect & { membri_proiect: { rol: Rol }[] };
type DeConfirmat = { pv_id: string; procese_verbale: { numar: number; tip: TipPv; obiect: string; proiect_id: string; proiecte: { cod: string } | null } | null };

export default function Proiecte() {
  const uid = useUid();
  const [lista, setLista] = useState<Rand[] | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [formular, setFormular] = useState(false);
  const [invitatiiNoi, setInvitatiiNoi] = useState(0);
  const [deConfirmat, setDeConfirmat] = useState<DeConfirmat[]>([]);

  const incarca = useCallback(async () => {
    // Întâi se acceptă invitațiile primite pe emailul contului.
    const { data: n } = await supabase.rpc('accepta_invitatiile');
    if (typeof n === 'number' && n > 0) setInvitatiiNoi(n);
    const { data, error } = await supabase
      .from('proiecte')
      .select('*, membri_proiect!inner(rol)')
      .eq('membri_proiect.persoana_id', uid)
      .order('arhivat')
      .order('creat_la', { ascending: false });
    if (error) setEroare(mesajEroare(error));
    setLista((data as Rand[]) ?? []);
    const pv = await supabase.from('participanti_pv')
      .select('pv_id, procese_verbale!inner(numar, tip, obiect, proiect_id, stare, proiecte(cod))')
      .eq('persoana_id', uid).is('confirmat_la', null)
      .in('procese_verbale.stare', ['convocat', 'in_semnare']);
    setDeConfirmat((pv.data as unknown as DeConfirmat[]) ?? []);
  }, [uid]);

  useEffect(() => { incarca(); }, [incarca]);

  return (
    <>
      <div className="antet-pagina">
        <div>
          <h1>Proiecte</h1>
          <p className="discret">Lucrările la care aveți un rol.</p>
        </div>
        <button className="buton principal" onClick={() => setFormular(true)}>Proiect nou</button>
      </div>
      {invitatiiNoi > 0 && <p className="mesaj ok">Ați fost adăugat în {invitatiiNoi === 1 ? 'proiectul la care ați fost invitat' : `${invitatiiNoi} proiecte noi`}.</p>}
      {deConfirmat.length > 0 && (
        <div className="card atentie-card">
          <h3>Procese verbale la care participați și nu ați confirmat ({deConfirmat.length})</h3>
          <ul className="lista-simpla">
            {deConfirmat.map(d => d.procese_verbale && (
              <li key={d.pv_id}>
                <Link to={`/proiect/${d.procese_verbale.proiect_id}/pv/${d.pv_id}`}>
                  {codPv(d.procese_verbale.proiecte?.cod ?? '', d.procese_verbale.numar)}
                </Link> · {tipPv(d.procese_verbale.tip).nume} · {d.procese_verbale.obiect}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Eroare text={eroare} />
      {formular && <ProiectNou onInchide={() => setFormular(false)} />}
      {lista === null ? <p className="discret">Se încarcă…</p> : lista.length === 0 ? (
        <Gol titlu="Nu aveți încă niciun proiect">
          <p>Creați primul proiect sau cereți administratorului unui proiect să vă invite pe adresa contului.</p>
        </Gol>
      ) : (
        <div className="grila-proiecte">
          {lista.map(p => {
            const ac = stareAutorizatie(p);
            return (
              <Link key={p.id} to={`/proiect/${p.id}`} className={`card proiect${p.arhivat ? ' arhivat' : ''}`}>
                <div className="proiect-sus">
                  <span className="cod">{p.cod}</span>
                  <span className="rol">{numeRol(p.membri_proiect[0]?.rol)}</span>
                </div>
                <h3>{p.denumire}</h3>
                <p className="discret">{p.adresa || 'Fără adresă'}</p>
                <p className="stadiu">{STADII[p.stadiu_catuc]}</p>
                <div className="etichete">
                  {p.clasa_consecinte && <span className="eticheta neutru">{p.clasa_consecinte}</span>}
                  {p.regim_legal && <span className="eticheta neutru">{p.regim_legal}</span>}
                  {(p.ac_valabil_pana || p.ac_prelungit_pana) && <Eticheta stare={ac} />}
                  {p.arhivat && <span className="eticheta neutru">Arhivat</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function ProiectNou({ onInchide }: { onInchide: () => void }) {
  const nav = useNavigate();
  const [cod, setCod] = useState('');
  const [denumire, setDenumire] = useState('');
  const [adresa, setAdresa] = useState('');
  const [beneficiar, setBeneficiar] = useState('');
  const [stadiu, setStadiu] = useState(0);
  const [clasa, setClasa] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, setLucreaza] = useState(false);

  async function salveaza(e: FormEvent) {
    e.preventDefault();
    setLucreaza(true);
    setEroare(null);
    const c = cod.trim().toUpperCase();
    // Inserarea se face fără citire înapoi: proiectul devine vizibil
    // abia după ce creatorul e adăugat ca administrator.
    const { error } = await supabase.from('proiecte').insert({
      cod: c, denumire: denumire.trim(), adresa: adresa.trim() || null,
      beneficiar: beneficiar.trim() || null, stadiu_catuc: stadiu, clasa_consecinte: clasa || null,
    });
    if (error) { setEroare(mesajEroare(error)); setLucreaza(false); return; }
    const { data } = await supabase.from('proiecte').select('id').eq('cod', c).single();
    nav(data ? `/proiect/${data.id}` : '/');
  }

  return (
    <form className="card formular" onSubmit={salveaza}>
      <h2>Proiect nou</h2>
      <p className="discret">Deveniți administratorul proiectului și puteți invita echipa.</p>
      <div className="campuri">
        <label>Cod
          <input value={cod} onChange={e => setCod(e.target.value.toUpperCase())} required pattern="[A-Z0-9]{3,6}"
            placeholder="BLC01" title="3–6 litere mari sau cifre" maxLength={6} />
          <small>Apare în codul fiecărui document (ISO 19650).</small>
        </label>
        <label className="lat">Denumire
          <input value={denumire} onChange={e => setDenumire(e.target.value)} required minLength={3} placeholder="Bloc de locuințe P+4, Militari" />
        </label>
        <label className="lat">Adresă
          <input value={adresa} onChange={e => setAdresa(e.target.value)} />
        </label>
        <label>Beneficiar
          <input value={beneficiar} onChange={e => setBeneficiar(e.target.value)} />
        </label>
        <label>Stadiul (art. 479)
          <select value={stadiu} onChange={e => setStadiu(Number(e.target.value))}>
            {STADII.map((s, i) => <option key={i} value={i}>{s}</option>)}
          </select>
        </label>
        <label>Clasa de consecințe (art. 370)
          <select value={clasa} onChange={e => setClasa(e.target.value)}>
            <option value="">Nestabilită încă</option>
            {CLASE.map(c => <option key={c.id} value={c.id}>{c.nume}</option>)}
          </select>
        </label>
      </div>
      <Eroare text={eroare} />
      <div className="actiuni">
        <button type="button" className="buton" onClick={onInchide}>Renunță</button>
        <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se creează…' : 'Creează proiectul'}</button>
      </div>
    </form>
  );
}
