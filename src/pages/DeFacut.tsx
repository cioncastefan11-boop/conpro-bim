// Ce am de făcut, în toate proiectele: PV-uri de confirmat, FAM-uri de avizat sau aprobat,
// turnări de vizat, rezultate de luat la cunoștință, recepții, obiecții, documente de aprobat.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Sarcina } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';

export const TIPURI_SARCINA: Record<string, string> = {
  pv: 'Proces verbal', fam: 'Material (FAM)', turnare: 'Condica de betoane', incercare: 'Încercare',
  receptie: 'Recepție', obiectie: 'Obiecție la recepție', document: 'Document', exploatare: 'Exploatare', urmarire: 'Urmărirea în timp', mentenanta: 'Mentenanță', garantie: 'Garanție', reclamatie: 'Reclamație', observatie: 'Observație pe model',
};

export async function incarcaSarcini(): Promise<Sarcina[]> {
  const { data, error } = await supabase.rpc('sarcinile_mele');
  if (error) throw error;
  return (data as Sarcina[]) ?? [];
}

export default function DeFacut() {
  const [lista, setLista] = useState<Sarcina[] | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  useEffect(() => {
    incarcaSarcini().then(setLista).catch(e => {
      setLista([]);
      setEroare(String(e.message).includes('sarcinile_mele') ? 'Rulați în Supabase scriptul 0012_conventie_sarcini.sql ca să apară lista.' : mesajEroare(e));
    });
  }, []);
  if (!lista) return <p className="discret">Se încarcă…</p>;
  const proiecte = [...new Map(lista.map(s => [s.proiect_id, s])).values()];
  return (
    <>
      <div className="antet-pagina"><div><h1>De făcut</h1><p className="discret">Ce așteaptă după dumneavoastră, în toate proiectele. Lista se actualizează singură pe măsură ce lucrați.</p></div></div>
      <Eroare text={eroare} />
      {lista.length === 0 && !eroare ? <Gol titlu="Nimic de făcut acum"><p>Când cineva vă convoacă la un PV, vă trimite un FAM sau un document de aprobat, apare aici.</p></Gol> : (
        proiecte.map(p => {
          const ale = lista.filter(s => s.proiect_id === p.proiect_id);
          return (
            <div key={p.proiect_id} className="card">
              <h2><span className="cod">{p.cod_proiect}</span> {p.denumire_proiect} <small className="discret">· {ale.length}</small></h2>
              <ul className="lista-sarcini">
                {ale.map((s, i) => (
                  <li key={i}>
                    <span className={`tip-sarcina t-${s.tip}`}>{TIPURI_SARCINA[s.tip] ?? s.tip}</span>
                    <Link to={s.cale.startsWith('/') ? s.cale : `/proiect/${s.proiect_id}/${s.cale}`}>{s.titlu}</Link>
                    {s.din && <small className="discret">{new Date(s.din).toLocaleDateString('ro-RO')}</small>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </>
  );
}
