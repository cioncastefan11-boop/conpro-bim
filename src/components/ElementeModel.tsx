// Elementele din model legate de un PV, o turnare sau un FAM (trasabilitatea, harta BIM: liniile PV și MAT).
// Se leagă din Modelul 3D (elementele alese); aici se văd, se arată în model și se pot dezlega.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { numeClasa } from '../lib/ifcClase';
import type { Rol } from '../lib/domeniu';
import { Eroare, mesajEroare } from './ui';

type Leg = { id: string; guid: string; nume: string | null; clasa: string | null; creat_de: string };

export default function ElementeModel({ proiectId, entitate, entitateId, uid, rolulMeu }: {
  proiectId: string; entitate: 'pv' | 'turnare' | 'fam'; entitateId: string; uid: string; rolulMeu?: Rol;
}) {
  const [lista, setLista] = useState<Leg[] | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const incarca = useCallback(async () => {
    const { data, error } = await supabase.from('elemente_legate').select('id, guid, nume, clasa, creat_de').eq('entitate', entitate).eq('entitate_id', entitateId).order('creat_la');
    if (error && !/elemente_legate/.test(error.message)) setEroare(mesajEroare(error));
    setLista((data as Leg[]) ?? []);
  }, [entitate, entitateId]);
  useEffect(() => { incarca(); }, [incarca]);
  if (!lista) return null;

  async function dezleaga(l: Leg) {
    const { error, count } = await supabase.from('elemente_legate').delete({ count: 'exact' }).eq('id', l.id);
    if (error) setEroare(mesajEroare(error));
    else if (!count) setEroare('Legătura o poate șterge cel care a făcut-o sau dirigintele (după semnarea PV-ului, doar dirigintele).');
    else incarca();
  }

  return (
    <div className="elemente-model">
      <div className="antet-card">
        <h3>Elementele din model ({lista.length})</h3>
        {lista.length > 0 && <Link className="buton mic" to={`/proiect/${proiectId}/model?leg=${entitate}:${entitateId}`}>Arată în model</Link>}
      </div>
      {!lista.length ? <p className="discret">Nicio legătură cu modelul. În <Link to={`/proiect/${proiectId}/model`}>Modelul 3D</Link> alegeți elementele (Shift + clic pentru mai multe) și legați-le de acest document.</p> : (
        <ul className="lista-guid">
          {lista.map(l => (
            <li key={l.id}>
              <b>{l.nume || (l.clasa ? numeClasa(l.clasa) : 'Element')}</b> {l.clasa && <span className="discret">{numeClasa(l.clasa)}</span>} <code>{l.guid}</code>
              {(l.creat_de === uid || rolulMeu === 'diriginte') && <button className="legatura alerta" onClick={() => dezleaga(l)}>dezleagă</button>}
            </li>
          ))}
        </ul>
      )}
      <Eroare text={eroare} />
    </div>
  );
}
