// Convenția de denumire a documentelor (ISO 19650-2): listele de coduri pentru
// inițiatori, volume și niveluri, numărul de cifre și modul strict.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Conventie as TConventie, ElementConventie, Membru, Proiect } from '../lib/tipuri';
import { Eroare, mesajEroare } from './ui';
import { initialeFirma } from '../pages/Documente';

type Lista = 'initiatori' | 'volume' | 'niveluri';
const LISTE: { cheie: Lista; titlu: string; ajutor: string; exemplu: ElementConventie }[] = [
  { cheie: 'initiatori', titlu: 'Inițiatori (organizațiile care produc documente)', ajutor: '2–6 litere sau cifre, ex. SP = Studio Proiect SRL.', exemplu: { cod: '', nume: '' } },
  { cheie: 'volume', titlu: 'Volume / corpuri', ajutor: 'ZZ = toate corpurile; ex. A = Corp A, B = Corp B.', exemplu: { cod: 'ZZ', nume: 'Toate corpurile' } },
  { cheie: 'niveluri', titlu: 'Niveluri', ajutor: '2–4 caractere: 00 parter, 01 etaj 1, B1 subsol 1, RF acoperiș; ZZ mai multe, XX niciunul.', exemplu: { cod: 'ZZ', nume: 'Mai multe niveluri' } },
];
const curat = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function Conventie({ proiect, membri, admin, onSalvat }: { proiect: Proiect; membri: Membru[]; admin: boolean; onSalvat: () => void }) {
  const [c, setC] = useState<TConventie>(proiect.standard_info ?? {});
  const [eroare, setEroare] = useState<string | null>(null);
  const [salvat, setSalvat] = useState(false);
  useEffect(() => setC(proiect.standard_info ?? {}), [proiect.standard_info]);

  const schimba = (k: Lista, l: ElementConventie[]) => { setC({ ...c, [k]: l }); setSalvat(false); };
  async function propune() {
    const firme = [...new Map(membri.filter(m => m.persoane?.firme?.denumire).map(m => [m.persoane!.firme!.denumire, m.persoane!.firme!.denumire])).values()];
    const { data: niv } = await supabase.from('niveluri').select('cod, denumire, ordine').eq('proiect_id', proiect.id).order('ordine');
    const unic = (l: ElementConventie[]) => l.filter((x, i, a) => x.cod && a.findIndex(y => y.cod === x.cod) === i);
    setC({
      ...c, cifre: c.cifre ?? 4,
      initiatori: unic([...(c.initiatori ?? []), ...firme.map(f => ({ cod: initialeFirma(f), nume: f }))]),
      volume: c.volume?.length ? c.volume : [{ cod: 'ZZ', nume: 'Toate corpurile' }],
      niveluri: unic([...(c.niveluri ?? []), ...((niv ?? []) as { cod: string; denumire: string }[]).map(n => ({ cod: curat(n.cod).padStart(2, '0').slice(0, 4), nume: n.denumire })),
        { cod: 'ZZ', nume: 'Mai multe niveluri' }, { cod: 'XX', nume: 'Niciun nivel' }]),
    });
    setSalvat(false);
  }
  async function salveaza() {
    setEroare(null);
    const fara = (l?: ElementConventie[]) => (l ?? []).map(x => ({ cod: curat(x.cod), nume: x.nume.trim() })).filter(x => x.cod);
    const nou = { ...c, initiatori: fara(c.initiatori), volume: fara(c.volume), niveluri: fara(c.niveluri) };
    const gresit = nou.initiatori.find(x => x.cod.length < 2 || x.cod.length > 6) ?? nou.niveluri.find(x => x.cod.length < 2 || x.cod.length > 4) ?? nou.volume.find(x => x.cod.length > 4);
    if (gresit) { setEroare(`Codul ${gresit.cod} nu are lungimea potrivită.`); return; }
    const { error } = await supabase.from('proiecte').update({ standard_info: nou }).eq('id', proiect.id);
    if (error) setEroare(mesajEroare(error)); else { setSalvat(true); onSalvat(); }
  }

  return (
    <div className="card formular">
      <h2>Convenția de denumire a documentelor</h2>
      <p className="discret">Codul fiecărui document se compune din proiect, inițiator, volum, nivel, tip, disciplină și număr (ISO 19650-2). Listele de mai jos apar ca alegeri la „Document nou”; în modul strict, alte coduri nu se acceptă.</p>
      <fieldset disabled={!admin}>
        {LISTE.map(l => (
          <section key={l.cheie} className="lista-conventie">
            <h3>{l.titlu}</h3>
            <small className="discret">{l.ajutor}</small>
            {(c[l.cheie] ?? []).map((x, i) => (
              <div key={i} className="rand-conventie">
                <input value={x.cod} onChange={e => schimba(l.cheie, (c[l.cheie] ?? []).map((y, j) => (j === i ? { ...y, cod: curat(e.target.value) } : y)))} aria-label="Cod" maxLength={6} />
                <input value={x.nume} onChange={e => schimba(l.cheie, (c[l.cheie] ?? []).map((y, j) => (j === i ? { ...y, nume: e.target.value } : y)))} aria-label="Semnificație" placeholder="Semnificația" />
                {admin && <button type="button" className="buton mic" onClick={() => schimba(l.cheie, (c[l.cheie] ?? []).filter((_, j) => j !== i))}>Scoate</button>}
              </div>
            ))}
            {admin && <button type="button" className="buton mic" onClick={() => schimba(l.cheie, [...(c[l.cheie] ?? []), { ...l.exemplu }])}>Adaugă</button>}
          </section>
        ))}
        <div className="campuri">
          <label>Numărul documentului
            <select value={c.cifre ?? 4} onChange={e => { setC({ ...c, cifre: Number(e.target.value) }); setSalvat(false); }}>
              {[4, 5, 6].map(n => <option key={n} value={n}>{n} cifre (ex. {'0'.repeat(n - 3)}101)</option>)}
            </select>
          </label>
          <label className="bifa lat"><input type="checkbox" checked={!!c.strict} onChange={e => { setC({ ...c, strict: e.target.checked }); setSalvat(false); }} /> Mod strict: se acceptă doar codurile din liste (verificat și în baza de date)</label>
        </div>
      </fieldset>
      <Eroare text={eroare} />
      {admin && (
        <div className="actiuni">
          <button type="button" className="buton" onClick={propune}>Propune din echipă și niveluri</button>
          {salvat && <span className="mesaj-scurt">Salvat.</span>}
          <button type="button" className="buton principal" onClick={salveaza}>Salvează convenția</button>
        </div>
      )}
    </div>
  );
}
