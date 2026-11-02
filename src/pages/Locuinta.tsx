// „Locuința mea”: pagina locatarului. Vede clădirea, unitatea lui și reclamațiile trimise de el;
// nu e membru al proiectului și nu vede nimic altceva din el.
import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUid } from '../lib/sesiune';
import { codReclamatie, numeCategorieReclamatie } from '../lib/domeniu';
import type { Locuinta as TLocuinta, Reclamatie } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import { EticReclamatie, FisaReclamatie, FormularReclamatie } from '../components/Reclamatie';

export async function incarcaLocuinte(): Promise<TLocuinta[]> {
  const { data, error } = await supabase.rpc('locuintele_mele');
  if (error) return [];
  return (data as TLocuinta[]) ?? [];
}

export default function Locuinta() {
  const uid = useUid();
  const [loc, setLoc] = useState<TLocuinta[] | null>(null);
  const [rec, setRec] = useState<Reclamatie[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    await supabase.rpc('accepta_invitatiile');
    const l = await incarcaLocuinte();
    setLoc(l);
    if (!l.length) return;
    const { data, error } = await supabase.from('reclamatii').select('*').eq('raportat_de', uid)
      .in('proiect_id', l.map(x => x.proiect_id)).order('creat_la', { ascending: false });
    setEroare(mesajEroare(error));
    setRec((data as Reclamatie[]) ?? []);
  }, [uid]);
  useEffect(() => { incarca(); }, [incarca]);
  if (!loc) return <p className="discret">Se încarcă…</p>;
  if (!loc.length) return <Gol titlu="Contul nu e legat de nicio locuință">Administratorul clădirii vă adaugă în lista locatarilor cu adresa de e-mail a contului; după aceea locuința apare aici.</Gol>;
  return (
    <>
      <Eroare text={eroare} />
      <Routes>
        <Route index element={<Panou loc={loc} rec={rec} />} />
        <Route path="noua" element={<Noua loc={loc} onSalvat={incarca} />} />
        <Route path=":rId" element={<Fisa loc={loc} rec={rec} uid={uid} onSchimbat={incarca} />} />
      </Routes>
    </>
  );
}

function Panou({ loc, rec }: { loc: TLocuinta[]; rec: Reclamatie[] }) {
  return (
    <>
      <div className="antet-pagina"><div>
        <h1>Locuința mea</h1>
        <p className="discret">Trimiteți administrării problemele din locuință sau din părțile comune și urmăriți cum se rezolvă.</p>
      </div></div>
      {loc.map(l => {
        const ale = rec.filter(r => r.proiect_id === l.proiect_id);
        return (
          <div key={l.locatar_id} className="card">
            <div className="antet-card">
              <div>
                <h2>{l.unitate}</h2>
                <p className="discret">{l.denumire}{l.adresa ? `, ${l.adresa}` : ''}</p>
                {l.administrator && <p className="discret">Administratorul clădirii: {l.administrator}</p>}
              </div>
              <div className="actiuni"><Link className="buton principal" to={`noua?cladire=${l.proiect_id}`}>Reclamație nouă</Link></div>
            </div>
            {!ale.length ? <p className="discret">Nu ați trimis nicio reclamație.</p> : (
              <ul className="lista-evenimente">
                {ale.map(r => (
                  <li key={r.id} className={r.stare === 'rezolvata' ? 'ev-interventie' : ['confirmata', 'respinsa'].includes(r.stare) ? '' : 'ev-seism'}>
                    <Link to={r.id}>
                      <span className="cod">{codReclamatie(l.cod, r.numar)}</span>
                      <span className="data">{new Date(r.creat_la).toLocaleDateString('ro-RO')}</span>
                      <span className="tip-ev">{numeCategorieReclamatie(r.categorie)}</span>
                      <b>{r.titlu}</b>
                      <small><EticReclamatie r={r} /></small>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

function Noua({ loc, onSalvat }: { loc: TLocuinta[]; onSalvat: () => Promise<void> }) {
  const nav = useNavigate();
  const [q] = useSearchParams();
  const l = loc.find(x => x.proiect_id === q.get('cladire')) ?? loc[0];
  return (
    <>
      <p><Link to="..">← Locuința mea</Link></p>
      <FormularReclamatie proiectId={l.proiect_id} unitateFixa={l.unitate} onRenunta={() => nav('..')}
        onTrimis={async id => { await onSalvat(); nav(`../${id}`); }} />
    </>
  );
}

function Fisa({ loc, rec, uid, onSchimbat }: { loc: TLocuinta[]; rec: Reclamatie[]; uid: string; onSchimbat: () => Promise<void> }) {
  const { rId } = useParams();
  const r = rec.find(x => x.id === rId);
  if (!r) return <Gol titlu="Reclamația nu există"><Link to="..">Locuința mea</Link></Gol>;
  const l = loc.find(x => x.proiect_id === r.proiect_id)!;
  return (
    <>
      <p><Link to="..">← Locuința mea</Link></p>
      <FisaReclamatie r={r} codProiect={l.cod} uid={uid} membri={[]} administreaza={false} constructor={false} pentruLocatar onSchimbat={onSchimbat} />
    </>
  );
}
