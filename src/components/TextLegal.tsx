// Afișează textele juridice scrise în Markdown simplu (titluri, paragrafe, liste, tabele, **îngroșat**, [legături](/cale)).
// [[câmp]] = de completat, apare evidențiat.
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

function inline(t: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[\[(.+?)\]\]|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    if (m[1] !== undefined) out.push(<b key={i++}>{inline(m[1])}</b>);
    else if (m[2] !== undefined) out.push(<span key={i++} className="de-completat">{m[2]}</span>);
    else out.push(m[4].startsWith('/') ? <Link key={i++} to={m[4]}>{m[3]}</Link> : <a key={i++} href={m[4]} target="_blank" rel="noreferrer">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

const celule = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function blocuri(md: string): ReactNode[] {
  const linii = md.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = []; let k = 0;
  for (let i = 0; i < linii.length;) {
    const l = linii[i];
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,3}) (.*)$/);
    if (h) { const H = (`h${h[1].length}`) as 'h1' | 'h2' | 'h3'; out.push(<H key={k++}>{inline(h[2])}</H>); i++; continue; }
    if (l.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < linii.length && linii[i].trim().startsWith('|')) rows.push(linii[i++]);
      const [cap, , ...corp] = rows;
      out.push(<div key={k++} className="tabel-legal"><table><thead><tr>{celule(cap).map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
        <tbody>{corp.map((r, ri) => <tr key={ri}>{celule(r).map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^(- |\d+\. |[a-z]\) )/.test(l)) {
      const ord = !l.startsWith('- ');
      const items: string[] = [];
      while (i < linii.length && /^(- |\d+\. |[a-z]\) )/.test(linii[i])) items.push(linii[i++]);
      const lit = /^[a-z]\) /.test(items[0]);
      const L = ord ? 'ol' : 'ul';
      out.push(<L key={k++} className={lit ? 'fara-numere' : undefined}>{items.map((it, j) =>
        <li key={j}>{inline(lit ? it : it.replace(/^(- |\d+\. )/, ''))}</li>)}</L>);
      continue;
    }
    const par: string[] = [];
    while (i < linii.length && linii[i].trim() && !/^(#|\||- |\d+\. |[a-z]\) )/.test(linii[i])) par.push(linii[i++]);
    out.push(<p key={k++}>{inline(par.join(' '))}</p>);
  }
  return out.map((n, j) => <Fragment key={j}>{n}</Fragment>);
}

export default function TextLegal({ text }: { text: string }) {
  return <article className="card text-legal">{blocuri(text)}</article>;
}
