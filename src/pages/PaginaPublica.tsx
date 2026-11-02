// Paginile care se văd și fără cont: ghidul, politica de confidențialitate, termenii.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import TextLegal from '../components/TextLegal';
import { completeaza } from '../lib/legal';
import confidentialitate from '../legal/confidentialitate.md?raw';
import termeni from '../legal/termeni.md?raw';
import acord from '../legal/acord-prelucrare.md?raw';

export const TEXTE = { confidentialitate, termeni, acord } as const;

export function Subsol() {
  return (
    <footer className="subsol-aplicatie">
      <Link to="/ghid">Ghid</Link>·<Link to="/confidentialitate">Confidențialitate</Link>·<Link to="/termeni">Termeni de utilizare</Link>
    </footer>
  );
}

/** Cadrul pentru vizitatorii fără cont (cei autentificați văd paginile în cadrul obișnuit al aplicației). */
export function CadruPublic({ children }: { children: ReactNode }) {
  return (
    <div>
      <header className="bara-publica">
        <Link to="/" className="marca">CON<span>PRO</span> BIM</Link>
        <Link to="/autentificare" className="buton">Intrați în cont</Link>
      </header>
      <main className="pagina-publica">{children}</main>
      <Subsol />
    </div>
  );
}

export const PaginaLegala = ({ text }: { text: keyof typeof TEXTE }) => <TextLegal text={completeaza(TEXTE[text])} />;
