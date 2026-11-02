// La prima intrare după publicarea unei versiuni noi a termenilor (sau pentru conturile create
// înainte de 0.12), persoana le acceptă o dată. Paginile cu textele rămân accesibile.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUid } from '../lib/sesiune';
import { VERSIUNE_TERMENI } from '../lib/legal';

export function AcceptareTermeni() {
  const uid = useUid();
  const loc = useLocation();
  const [deAcceptat, setDeAcceptat] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    supabase.from('persoane').select('termeni_versiune').eq('id', uid).single().then(({ data, error }) => {
      // dacă migrarea 0013 nu e rulată încă, coloana lipsește: nu blocăm aplicația
      if (!error && data) setDeAcceptat((data as { termeni_versiune: string | null }).termeni_versiune !== VERSIUNE_TERMENI);
    });
  }, [uid]);

  if (!deAcceptat || ['/termeni', '/confidentialitate', '/acord-prelucrare'].includes(loc.pathname)) return null;

  async function accepta() {
    setEroare(null);
    const { error } = await supabase.rpc('accepta_termenii', { versiune: VERSIUNE_TERMENI });
    if (error) setEroare(error.message); else setDeAcceptat(false);
  }

  return (
    <div className="fereastra-termeni" role="dialog" aria-modal="true" aria-labelledby="titlu-termeni">
      <div className="card">
        <h2 id="titlu-termeni">Termenii și politica de confidențialitate</h2>
        <p>Am publicat <Link to="/termeni">termenii de utilizare</Link> și <Link to="/confidentialitate">politica de confidențialitate</Link> (versiunea {VERSIUNE_TERMENI.split('-').reverse().join('.')}). Ele explică ce date păstrează aplicația, de ce, cât timp și ce drepturi aveți.</p>
        <p className="discret">Pentru a continua, vă rugăm să le citiți și să le acceptați.</p>
        {eroare && <p className="mesaj alerta">{eroare}</p>}
        <div className="actiuni">
          <button className="buton" onClick={() => supabase.auth.signOut()}>Ieșire</button>
          <button className="buton principal" onClick={accepta}>Am citit și accept</button>
        </div>
      </div>
    </div>
  );
}
