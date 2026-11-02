import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { VERSIUNE_TERMENI } from '../lib/legal';
import { Subsol } from './PaginaPublica';
import { supabase } from '../lib/supabase';

type Mod = 'intrare' | 'cont' | 'parola';

export default function Autentificare() {
  const [params] = useSearchParams();
  const [mod, setMod] = useState<Mod>(params.get('email') ? 'cont' : 'intrare');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [parola, setParola] = useState('');
  const [nume, setNume] = useState('');
  const [mesaj, setMesaj] = useState<{ ton: 'ok' | 'alerta'; text: string } | null>(null);
  const [lucreaza, setLucreaza] = useState(false);
  const [accept, setAccept] = useState(false);

  async function trimite(e: FormEvent) {
    e.preventDefault();
    setMesaj(null);
    setLucreaza(true);
    const em = email.trim().toLowerCase();
    try {
      if (mod === 'intrare') {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: parola });
        if (error) throw new Error(error.message === 'Invalid login credentials'
          ? 'Email sau parolă greșită.' : error.message);
      } else if (mod === 'cont') {
        if (parola.length < 10) throw new Error('Parola trebuie să aibă cel puțin 10 caractere.');
        if (!accept) throw new Error('Pentru cont nou trebuie să acceptați termenii și politica de confidențialitate.');
        const { data, error } = await supabase.auth.signUp({
          email: em, password: parola,
          options: { data: { nume: nume.trim(), termeni_versiune: VERSIUNE_TERMENI }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setMesaj({ ton: 'ok', text: `Am trimis un email de confirmare la ${em}. Deschideți linkul din el, apoi intrați în cont.` });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: `${window.location.origin}/profil` });
        if (error) throw error;
        setMesaj({ ton: 'ok', text: 'Dacă adresa are cont, primiți un email cu linkul de resetare.' });
      }
    } catch (err) {
      setMesaj({ ton: 'alerta', text: (err as Error).message });
    } finally {
      setLucreaza(false);
    }
  }

  return (
    <>
    <div className="pagina-centru intrare">
      <div className="intrare-stanga">
        <div className="marca mare">CON<span>PRO</span> BIM</div>
        <h1>Informațiile lucrării, într-un singur loc</h1>
        <p>Beneficiar, diriginte, constructor și proiectant, fiecare cu contul și răspunderea lui, de la cerințe până la Cartea tehnică electronică.</p>
        <p><Link to="/ghid">Ați fost invitat într-un proiect? Citiți ghidul pe roluri →</Link></p>
      </div>
      <form className="card ingust" onSubmit={trimite}>
        <h2>{mod === 'intrare' ? 'Intrați în cont' : mod === 'cont' ? 'Cont nou' : 'Resetarea parolei'}</h2>
        {mod === 'cont' && (
          <label>Nume și prenume
            <input value={nume} onChange={e => setNume(e.target.value)} required autoComplete="name" />
          </label>
        )}
        <label>Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        {mod !== 'parola' && (
          <label>Parolă
            <input type="password" value={parola} onChange={e => setParola(e.target.value)} required
              autoComplete={mod === 'cont' ? 'new-password' : 'current-password'} />
          </label>
        )}
        {mod === 'cont' && (
          <label className="bifa acceptare-termeni">
            <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} required />
            <span>Am citit și accept <Link to="/termeni" target="_blank">termenii de utilizare</Link> și <Link to="/confidentialitate" target="_blank">politica de confidențialitate</Link>.</span>
          </label>
        )}
        {mesaj && <p className={`mesaj ${mesaj.ton}`} role="status">{mesaj.text}</p>}
        <button className="buton principal" disabled={lucreaza}>
          {lucreaza ? 'Se trimite…' : mod === 'intrare' ? 'Intră' : mod === 'cont' ? 'Creează contul' : 'Trimite linkul'}
        </button>
        <div className="intrare-linkuri">
          {mod !== 'intrare' && <button type="button" className="legatura" onClick={() => setMod('intrare')}>Am deja cont</button>}
          {mod !== 'cont' && <button type="button" className="legatura" onClick={() => setMod('cont')}>Creează cont</button>}
          {mod !== 'parola' && <button type="button" className="legatura" onClick={() => setMod('parola')}>Am uitat parola</button>}
        </div>
      </form>
    </div>
    <Subsol />
    </>
  );
}
