import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { configurat, supabase } from './lib/supabase';
import { useSesiune } from './lib/sesiune';
import Autentificare from './pages/Autentificare';
import Proiecte from './pages/Proiecte';
import Proiect from './pages/Proiect';
import Profil from './pages/Profil';
import Configurare from './pages/Configurare';
import Registru from './pages/Registru';
import DeFacut, { incarcaSarcini } from './pages/DeFacut';

export default function App() {
  const { sesiune, incarcare } = useSesiune();
  const nav = useNavigate();
  const loc = useLocation();
  const [deFacut, setDeFacut] = useState<number | null>(null);
  // numărul de sarcini, reîmprospătat la fiecare schimbare de pagină
  useEffect(() => { if (sesiune) incarcaSarcini().then(l => setDeFacut(l.length)).catch(() => setDeFacut(null)); }, [sesiune, loc.pathname]);

  if (!configurat) return <Configurare />;
  if (incarcare) return <div className="incarcare">Se încarcă…</div>;
  if (!sesiune) {
    return (
      <Routes>
        <Route path="/autentificare" element={<Autentificare />} />
        <Route path="*" element={<Navigate to="/autentificare" replace />} />
      </Routes>
    );
  }

  return (
    <div className="cadru">
      <header className="bara">
        <Link to="/" className="marca">CON<span>PRO</span> BIM</Link>
        <nav>
          <NavLink to="/" end>Proiecte</NavLink>
          <NavLink to="/de-facut">De făcut{deFacut ? <span className="numar-sarcini">{deFacut}</span> : null}</NavLink>
          <NavLink to="/registru">Registru</NavLink>
          <NavLink to="/profil">Profil</NavLink>
          <button className="legatura" onClick={async () => { await supabase.auth.signOut(); nav('/autentificare'); }}>
            Ieșire
          </button>
        </nav>
      </header>
      <main className="continut">
        <Routes>
          <Route path="/" element={<Proiecte />} />
          <Route path="/proiect/:id/*" element={<Proiect />} />
          <Route path="/registru" element={<Registru />} />
          <Route path="/de-facut" element={<DeFacut />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
