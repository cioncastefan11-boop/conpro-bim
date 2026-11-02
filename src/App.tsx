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
import Ghid from './pages/Ghid';
import Locuinta, { incarcaLocuinte } from './pages/Locuinta';
import { CadruPublic, PaginaLegala, Subsol } from './pages/PaginaPublica';
import { AcceptareTermeni } from './components/AcceptareTermeni';

export default function App() {
  const { sesiune, incarcare } = useSesiune();
  const nav = useNavigate();
  const loc = useLocation();
  const [deFacut, setDeFacut] = useState<number | null>(null);
  const [areLocuinta, setAreLocuinta] = useState(false);
  // numărul de sarcini, reîmprospătat la fiecare schimbare de pagină
  useEffect(() => { if (sesiune) incarcaLocuinte().then(l => setAreLocuinta(l.length > 0)); }, [sesiune]);
  useEffect(() => { if (sesiune) incarcaSarcini().then(l => setDeFacut(l.length)).catch(() => setDeFacut(null)); }, [sesiune, loc.pathname]);

  if (!configurat) return <Configurare />;
  if (incarcare) return <div className="incarcare">Se încarcă…</div>;
  if (!sesiune) {
    return (
      <Routes>
        <Route path="/autentificare" element={<Autentificare />} />
        <Route path="/ghid" element={<CadruPublic><Ghid public /></CadruPublic>} />
        <Route path="/confidentialitate" element={<CadruPublic><PaginaLegala text="confidentialitate" /></CadruPublic>} />
        <Route path="/termeni" element={<CadruPublic><PaginaLegala text="termeni" /></CadruPublic>} />
        <Route path="/acord-prelucrare" element={<CadruPublic><PaginaLegala text="acord" /></CadruPublic>} />
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
          {areLocuinta && <NavLink to="/locuinta">Locuința mea</NavLink>}
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
          <Route path="/locuinta/*" element={<Locuinta />} />
          <Route path="/ghid" element={<Ghid />} />
          <Route path="/confidentialitate" element={<PaginaLegala text="confidentialitate" />} />
          <Route path="/termeni" element={<PaginaLegala text="termeni" />} />
          <Route path="/acord-prelucrare" element={<PaginaLegala text="acord" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Subsol />
      <AcceptareTermeni />
    </div>
  );
}
