import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TIPURI_ATASAMENT } from '../lib/domeniu';
import type { Atasament, Membru } from '../lib/tipuri';
import { Eroare, mesajEroare } from './ui';

export const BUCKET = 'documente';
export const MAX = 50 * 1024 * 1024;

/** Numele fișierului fără diacritice și caractere pe care Storage nu le acceptă. */
export const numeSigur = (n: string) =>
  n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-120);

const marime = (b: number | null) =>
  b == null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

type Props = {
  proiectId: string;
  entitate: Atasament['entitate'];
  entitateId: string;
  poateIncarca: boolean;
  tipuri: string[];          // tipurile de document propuse la încărcare
  membri: Membru[];
  titlu?: string;
  gol?: string;
  excludeTipuri?: string[];   // documente afișate în altă parte (de ex. PV-ul semnat electronic)
  ascundeDacaGol?: boolean;   // nu afișa nimic dacă nu sunt fișiere și nu se poate încărca
};

export default function Atasamente({ proiectId, entitate, entitateId, poateIncarca, tipuri, membri, titlu = 'Documente atașate', gol, ascundeDacaGol, excludeTipuri }: Props) {
  const [lista, setLista] = useState<Atasament[] | null>(null);
  const [tip, setTip] = useState(tipuri[0] ?? 'altul');
  const [eroare, setEroare] = useState<string | null>(null);
  const [progres, setProgres] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const incarca = useCallback(async () => {
    const { data, error } = await supabase.from('atasamente').select('*')
      .eq('entitate', entitate).eq('entitate_id', entitateId).order('incarcat_la');
    if (error) setEroare(mesajEroare(error));
    setLista(((data as Atasament[]) ?? []).filter(a => !excludeTipuri?.includes(a.tip_document)));
  }, [entitate, entitateId, excludeTipuri?.join()]);
  useEffect(() => { incarca(); }, [incarca]);

  async function urca(fisiere: FileList | null) {
    if (!fisiere?.length) return;
    setEroare(null);
    for (const f of Array.from(fisiere)) {
      if (f.size > MAX) { setEroare(`${f.name} are peste 50 MB.`); continue; }
      setProgres(`Se încarcă ${f.name}…`);
      const cale = `${proiectId}/${entitate}/${entitateId}/${crypto.randomUUID().slice(0, 8)}-${numeSigur(f.name)}`;
      const up = await supabase.storage.from(BUCKET).upload(cale, f, { contentType: f.type || undefined, upsert: false });
      if (up.error) { setEroare(`${f.name}: ${up.error.message}`); continue; }
      const { error } = await supabase.from('atasamente').insert({
        proiect_id: proiectId, entitate, entitate_id: entitateId, tip_document: tip,
        nume_fisier: f.name, cale, marime: f.size,
      });
      if (error) setEroare(mesajEroare(error));
    }
    setProgres(null);
    if (input.current) input.current.value = '';
    incarca();
  }

  async function deschide(a: Atasament) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.cale, 120);
    if (error || !data) { setEroare(error?.message ?? 'Fișierul nu se poate deschide.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  if (ascundeDacaGol && !poateIncarca && lista !== null && lista.length === 0) return null;

  const om = (id: string) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? (p.nume || p.email) : '—'; };

  return (
    <section className="atasamente">
      <h3>{titlu}</h3>
      {lista === null ? <p className="discret">Se încarcă…</p> : lista.length === 0 ? (
        <p className="discret">{gol ?? 'Niciun document atașat.'}</p>
      ) : (
        <ul className="lista-fisiere">
          {lista.map(a => (
            <li key={a.id}>
              <button type="button" className="legatura" onClick={() => deschide(a)}>{a.nume_fisier}</button>
              <span className="discret"> · {TIPURI_ATASAMENT[a.tip_document] ?? a.tip_document} · {marime(a.marime)} · {om(a.incarcat_de)}, {new Date(a.incarcat_la).toLocaleDateString('ro-RO')}</span>
            </li>
          ))}
        </ul>
      )}
      {poateIncarca && (
        <div className="incarcare-fisiere nu-tipari">
          <label>Tipul documentului
            <select value={tip} onChange={e => setTip(e.target.value)}>
              {tipuri.map(t => <option key={t} value={t}>{TIPURI_ATASAMENT[t] ?? t}</option>)}
            </select>
          </label>
          <label className="buton buton-fisier">
            {progres ?? 'Alege fișiere…'}
            <input ref={input} type="file" multiple onChange={e => urca(e.target.files)} disabled={!!progres}
              accept=".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx,.zip" />
          </label>
        </div>
      )}
      <Eroare text={eroare} />
    </section>
  );
}
