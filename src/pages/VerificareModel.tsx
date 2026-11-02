// Verificarea modelului după regulile de informații (EIR, ca IDS 1.0): regulile proiectului,
// șabloanele, exportul / importul IDS și rapoartele salvate; panoul de lângă modelul 3D rulează regulile.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Rol } from '../lib/domeniu';
import type { Membru, Proiect } from '../lib/tipuri';
import { Eroare, Gol, mesajEroare } from '../components/ui';
import type { ControlVizualizator, ModelIncarcat } from '../components/Vizualizator';
import {
  ATRIBUTE, SABLOANE, TIPURI_CERINTA, descrieCerinta, exportaIds, importaIds, reunesteRezultate, sumar,
  type RegulaModel, type RezultatRegula, type TipCerinta,
} from '../lib/ids';
import { NUME_CLASE, numeClasa } from '../lib/ifcClase';

export type Regula = RegulaModel & { id: string; obligatorie: boolean; sursa: string; ordine: number };
export type Raport = {
  id: string; modele: string[]; reguli: number; elemente: number; neconforme: number; rezultat: RezultatRegula[];
  nota: string | null; creat_de: string; creat_la: string;
};
type Props = { proiect: Proiect; membri: Membru[]; rolulMeu?: Rol; uid: string };

export const poateRegula = (r?: Rol) => r === 'administrator' || r === 'beneficiar' || r === 'diriginte';
const SCRIPT = 'Rulați în Supabase scriptul 0022_verificare_model.sql ca să folosiți verificarea modelului.';
const eroareDb = (e: { message?: string } | null) => (e && /reguli_model|verificari_model/.test(e.message ?? '') ? SCRIPT : mesajEroare(e));
const cheieRegula = (r: RegulaModel) => [r.clasa, r.predefinit ?? '', r.tip_cerinta, r.pset ?? '', r.proprietate ?? '', r.valoare ?? ''].join('|').toLowerCase();
const nume = (membri: Membru[], id: string) => membri.find(m => m.persoana_id === id)?.persoane?.nume ?? membri.find(m => m.persoana_id === id)?.persoane?.email ?? '';
const PSETURI = ['Pset_WallCommon', 'Pset_SlabCommon', 'Pset_BeamCommon', 'Pset_ColumnCommon', 'Pset_DoorCommon', 'Pset_WindowCommon', 'Pset_SpaceCommon',
  'Pset_CoveringCommon', 'Pset_RoofCommon', 'Pset_StairCommon', 'Pset_ManufacturerTypeInformation', 'Pset_ManufacturerOccurrence', 'Pset_Warranty',
  'Pset_ServiceLife', 'Qto_SpaceBaseQuantities', 'Qto_WallBaseQuantities', 'Qto_SlabBaseQuantities'];

export async function incarcaReguli(proiectId: string): Promise<{ reguli: Regula[]; eroare: string | null }> {
  const { data, error } = await supabase.from('reguli_model').select('*').eq('proiect_id', proiectId).order('ordine').order('creat_la');
  return { reguli: (data as Regula[]) ?? [], eroare: eroareDb(error) };
}

function descarca(text: string, numeFisier: string, tip: string) {
  const url = URL.createObjectURL(new Blob([text], { type: tip }));
  const a = document.createElement('a'); a.href = url; a.download = numeFisier; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function tiparesteRaport(p: Proiect, r: Pick<Raport, 'modele' | 'rezultat' | 'creat_la' | 'nota'> & { neconforme?: number }, autor: string) {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const s = { ...sumar(r.rezultat), ...(r.neconforme != null ? { neconforme: r.neconforme } : {}) };
  let h = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Verificarea modelului ${esc(p.cod)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9}h1{font-size:18px}h2{font-size:14px;margin-top:18px}code{font-family:monospace;font-size:11px}.nu{color:#b91c1c}.da{color:#15803d}</style></head><body>`;
  h += `<h1>Raportul de verificare a modelului</h1><p>${esc(p.cod)} · ${esc(p.denumire)}<br>Verificat la ${new Date(r.creat_la).toLocaleString('ro-RO')}${autor ? ` de ${esc(autor)}` : ''}<br>Modele: ${esc(r.modele.join(', '))}</p>`;
  h += `<p><b>${s.reguli}</b> reguli · <b>${s.verificari}</b> verificări, din care <b>${s.trec}</b> trec (${s.procent}%) · <b>${s.neconforme}</b> elemente neconforme la regulile obligatorii</p>`;
  if (r.nota) h += `<p>Notă: ${esc(r.nota)}</p>`;
  h += '<h2>Pe reguli</h2><table><tr><th>Regula</th><th>Obligatorie</th><th>Verificate</th><th>Trec</th><th>Nu trec</th></tr>'
    + r.rezultat.map(x => `<tr><td>${esc(x.denumire)}</td><td>${x.obligatorie ? 'da' : 'recomandată'}</td><td>${x.verificate}</td><td class="da">${x.trec}</td><td class="${x.verificate - x.trec ? 'nu' : ''}">${x.verificate - x.trec}</td></tr>`).join('') + '</table>';
  const nec = r.rezultat.filter(x => x.nu_trec.length);
  if (nec.length) {
    h += '<h2>Elementele care nu trec</h2>';
    for (const x of nec) h += `<h3>${esc(x.denumire)}</h3><table><tr><th>Element</th><th>Clasa</th><th>Motivul</th><th>GlobalId</th></tr>${x.verificate - x.trec > x.nu_trec.length ? `<tr><td colspan="4">Primele ${x.nu_trec.length} din ${x.verificate - x.trec}.</td></tr>` : ''}${x.nu_trec.map(e => `<tr><td>${esc(e.nume)}</td><td>${esc(numeClasa(e.clasa))}</td><td>${esc(e.motiv)}</td><td><code>${esc(e.guid)}</code></td></tr>`).join('')}</table>`;
  }
  h += '<p><small>Regulile sunt cerințele de informații ale proiectului (EIR), exportabile ca IDS 1.0 (buildingSMART). Generat din Conpro BIM.</small></p></body></html>';
  const url = URL.createObjectURL(new Blob([h], { type: 'text/html' }));
  window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// --------------------------------------------------------------------- pagina: regulile și rapoartele
export default function VerificareModel({ proiect, membri, rolulMeu }: Props) {
  const [reguli, setReguli] = useState<Regula[] | null>(null);
  const [rapoarte, setRapoarte] = useState<Raport[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [nou, setNou] = useState(false);
  const admin = poateRegula(rolulMeu);

  const incarca = useCallback(async () => {
    const [r, v] = await Promise.all([
      incarcaReguli(proiect.id),
      supabase.from('verificari_model').select('*').eq('proiect_id', proiect.id).order('creat_la', { ascending: false }).limit(30),
    ]);
    setReguli(r.reguli); setRapoarte((v.data as Raport[]) ?? []);
    setEroare(r.eroare ?? eroareDb(v.error));
  }, [proiect.id]);
  useEffect(() => { incarca(); }, [incarca]);

  async function adaugaReguli(lista: RegulaModel[], sursa?: string) {
    setEroare(null); setMesaj(null);
    const existente = new Set((reguli ?? []).map(cheieRegula));
    const noi = lista.filter(r => !existente.has(cheieRegula(r)));
    if (!noi.length) { setMesaj('Regulile există deja în proiect.'); return 0; }
    let ordine = Math.max(0, ...(reguli ?? []).map(r => r.ordine));
    const { error } = await supabase.from('reguli_model').insert(noi.map(r => ({
      proiect_id: proiect.id, denumire: r.denumire.trim().length > 2 ? r.denumire.trim() : `${numeClasa(r.clasa)}: ${descrieCerinta(r)}`,
      clasa: r.clasa, predefinit: r.predefinit ?? null, tip_cerinta: r.tip_cerinta, pset: r.pset ?? null, proprietate: r.proprietate ?? null,
      valoare: r.valoare ?? null, obligatorie: r.obligatorie !== false, sursa: sursa ?? r.sursa ?? 'EIR', ordine: ++ordine,
    })));
    if (error) { setEroare(eroareDb(error)); return 0; }
    await incarca();
    return noi.length;
  }
  async function sablon(cheie: string) {
    const s = SABLOANE.find(x => x.cheie === cheie); if (!s) return;
    const n = await adaugaReguli(s.reguli);
    if (n) setMesaj(`Adăugate ${n} reguli din șablonul „${s.titlu}”. Le puteți șterge pe cele care nu vi se aplică.`);
  }
  async function importa(f: File | undefined) {
    if (!f) return;
    setEroare(null); setMesaj(null);
    try {
      const r = importaIds(await f.text());
      if (!r.reguli.length) { setEroare(`Fișierul nu conține reguli pe care să le putem prelua.${r.ignorate.length ? ` ${r.ignorate.slice(0, 3).join('; ')}` : ''}`); return; }
      const n = await adaugaReguli(r.reguli);
      setMesaj(`Din „${r.titlu ?? f.name}” s-au preluat ${n} reguli${r.reguli.length > n ? ` (${r.reguli.length - n} existau deja)` : ''}.${r.ignorate.length ? ` Nepreluate (${r.ignorate.length}): ${r.ignorate.slice(0, 4).join('; ')}${r.ignorate.length > 4 ? '…' : ''}` : ''}`);
    } catch (e) { setEroare(`Fișierul IDS nu se poate citi: ${(e as Error).message}`); }
  }
  function exporta() {
    const eu = membri.find(m => m.rol === rolulMeu)?.persoane?.email;
    const xml = exportaIds(reguli ?? [], { titlu: `Cerințele de informații ale modelului · ${proiect.cod}`, autor: eu, proiect: `${proiect.cod} ${proiect.denumire}` });
    descarca(xml, `${proiect.cod}-cerinte-model.ids`, 'application/xml');
  }
  async function schimba(r: Regula, camp: Partial<Regula>) {
    const { error } = await supabase.from('reguli_model').update(camp).eq('id', r.id);
    if (error) setEroare(eroareDb(error)); else await incarca();
  }
  async function sterge(r: Regula) {
    const { error } = await supabase.from('reguli_model').delete().eq('id', r.id);
    if (error) setEroare(eroareDb(error)); else await incarca();
  }
  async function stergeRaport(r: Raport) {
    const { error } = await supabase.from('verificari_model').delete().eq('id', r.id);
    if (error) setEroare(eroareDb(error)); else await incarca();
  }

  return (
    <>
      <div className="card">
        <div className="antet-card">
          <div>
            <h2>Regulile modelului</h2>
            <p className="discret">Ce informații trebuie să aibă elementele din model (cerințele EIR): un atribut completat, o proprietate dintr-un set, o clasificare, un material, nivelul. Le verificați pe modelele deschise în <Link to="..">Modelul 3D</Link>, iar fișierul IDS îl dați proiectanților, ca să-și verifice singuri modelul înainte de predare.</p>
          </div>
          <div className="actiuni">
            {!!reguli?.length && <button className="buton" onClick={exporta}>Exportă IDS</button>}
            {admin && <label className="buton buton-fisier">Importă IDS<input type="file" accept=".ids,.xml" onChange={e => { importa(e.target.files?.[0]); e.target.value = ''; }} /></label>}
            {admin && !nou && <button className="buton principal" onClick={() => setNou(true)}>Regulă nouă</button>}
          </div>
        </div>
        <Eroare text={eroare} />
        {mesaj && <p className="mesaj info">{mesaj}</p>}
        {nou && <FormularRegula onRenunta={() => setNou(false)} onSalveaza={async r => { const n = await adaugaReguli([r]); if (n) { setNou(false); setMesaj('Regula a fost adăugată.'); } }} />}
        {reguli === null ? <p className="discret">Se încarcă…</p> : !reguli.length ? (
          <Gol titlu="Nicio regulă încă">
            <p>{admin ? 'Porniți de la un șablon și adaptați-l la ce cere caietul de sarcini, sau importați fișierul IDS primit de la beneficiar.' : 'Regulile le stabilesc beneficiarul, administratorul proiectului sau dirigintele.'}</p>
          </Gol>
        ) : (
          <div className="tabel-wrap"><table className="tabel">
            <thead><tr><th>Regula</th><th className="ascuns-mobil">Se aplică la</th><th>Cerința</th><th className="ascuns-mobil">Sursa</th>{admin && <th />}</tr></thead>
            <tbody>{reguli.map(r => (
              <tr key={r.id}>
                <td><b>{r.denumire}</b>{!r.obligatorie && <><br /><small className="discret">recomandată</small></>}<small className="doar-mobil discret"><br /><code>{r.clasa}</code> · {r.sursa}</small></td>
                <td className="ascuns-mobil">{numeClasa(r.clasa)}<br /><small className="discret"><code>{r.clasa}</code>{r.predefinit ? ` · ${r.predefinit}` : ''}</small></td>
                <td><small>{descrieCerinta(r)}</small></td>
                <td className="ascuns-mobil"><span className="eticheta neutru">{r.sursa}</span></td>
                {admin && <td className="celula-actiuni">
                  <button className="legatura" title={r.obligatorie ? 'Faceți regula recomandată (neobligatorie)' : 'Faceți regula obligatorie'} onClick={() => schimba(r, { obligatorie: !r.obligatorie })}>{r.obligatorie ? 'Recomandată' : 'Obligatorie'}</button>
                  <button className="legatura alerta" onClick={() => sterge(r)}>Șterge</button>
                </td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {admin && reguli !== null && (
          <div className="actiuni stanga sabloane-reguli">
            <span className="discret">Adaugă din șablon:</span>
            {SABLOANE.map(s => <button key={s.cheie} className="buton mic" onClick={() => sablon(s.cheie)}>{s.titlu} ({s.reguli.length})</button>)}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Rapoartele de verificare</h2>
        <p className="discret">Fiecare verificare salvată rămâne ca dovadă: cine a verificat, când, ce revizii ale modelelor și ce elemente nu au trecut. Le puteți atașa la recepție sau trimite proiectantului.</p>
        {!rapoarte.length ? <p className="discret">Niciun raport salvat. Deschideți modelele în <Link to="..">Modelul 3D</Link> și rulați verificarea.</p> : (
          <div className="tabel-wrap"><table className="tabel">
            <thead><tr><th>Data</th><th>Modele</th><th>Rezultat</th><th>Verificat de</th><th /></tr></thead>
            <tbody>{rapoarte.map(r => { const s = sumar(r.rezultat); return (
              <tr key={r.id}>
                <td>{new Date(r.creat_la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td><small>{r.modele.join(', ')}</small>{r.nota && <><br /><small className="discret">{r.nota}</small></>}</td>
                <td><span className={`eticheta ${r.neconforme ? 'alerta' : 'ok'}`}>{r.neconforme ? `${r.neconforme} neconforme` : 'conform'}</span><br /><small className="discret">{s.trec}/{s.verificari} verificări trec ({s.procent}%)</small></td>
                <td>{nume(membri, r.creat_de)}</td>
                <td className="celula-actiuni">
                  <button className="legatura" onClick={() => tiparesteRaport(proiect, r, nume(membri, r.creat_de))}>Tipărește</button>
                  {rolulMeu === 'administrator' && <button className="legatura alerta" onClick={() => stergeRaport(r)}>Șterge</button>}
                </td>
              </tr>
            ); })}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

function FormularRegula({ onRenunta, onSalveaza }: { onRenunta: () => void; onSalveaza: (r: RegulaModel) => Promise<void> }) {
  const [f, setF] = useState({ denumire: '', clasa: 'IFCWALL', predefinit: '', tip_cerinta: 'proprietate' as TipCerinta, pset: 'Pset_WallCommon', proprietate: 'IsExternal', valoare: '', obligatorie: true, sursa: 'EIR' });
  const set = (k: keyof typeof f, v: string | boolean) => setF(x => ({ ...x, [k]: v }));
  const regula: RegulaModel = {
    denumire: f.denumire, clasa: f.clasa.trim().toUpperCase().replace(/^(?!IFC)/, 'IFC'), predefinit: f.predefinit.trim() || null, tip_cerinta: f.tip_cerinta,
    pset: f.tip_cerinta === 'proprietate' ? f.pset.trim() : null,
    proprietate: f.tip_cerinta === 'proprietate' || f.tip_cerinta === 'atribut' ? f.proprietate.trim() : null,
    valoare: f.tip_cerinta === 'nivel' && !f.valoare.trim() ? null : f.valoare.trim() || null, obligatorie: f.obligatorie, sursa: f.sursa,
  };
  const valida = /^IFC[A-Z]+$/.test(regula.clasa) && (f.tip_cerinta !== 'proprietate' || (regula.pset && regula.proprietate)) && (f.tip_cerinta !== 'atribut' || regula.proprietate);
  async function trimite(e: FormEvent) { e.preventDefault(); if (valida) await onSalveaza(regula); }
  return (
    <form className="formular cadru-editare" onSubmit={trimite}>
      <div className="rand-formular">
        <label>Elementele (clasa IFC)
          <input list="clase-ifc" value={f.clasa} onChange={e => set('clasa', e.target.value)} required />
          <datalist id="clase-ifc">{Object.entries(NUME_CLASE).map(([c, n]) => <option key={c} value={c}>{n}</option>)}</datalist>
        </label>
        <label>Tipul predefinit <small className="discret">(opțional)</small>
          <input value={f.predefinit} onChange={e => set('predefinit', e.target.value)} placeholder="ex. PARTITIONING" />
        </label>
        <label>Ce se cere
          <select value={f.tip_cerinta} onChange={e => { const t = e.target.value as TipCerinta; setF(x => ({ ...x, tip_cerinta: t, proprietate: t === 'atribut' ? 'Name' : t === 'proprietate' ? x.proprietate || 'IsExternal' : x.proprietate })); }}>
            {(Object.keys(TIPURI_CERINTA) as TipCerinta[]).map(t => <option key={t} value={t}>{TIPURI_CERINTA[t]}</option>)}
          </select>
        </label>
      </div>
      <div className="rand-formular">
        {f.tip_cerinta === 'atribut' && <label>Atributul
          <select value={f.proprietate} onChange={e => set('proprietate', e.target.value)}>{ATRIBUTE.map(a => <option key={a}>{a}</option>)}</select>
        </label>}
        {f.tip_cerinta === 'proprietate' && <>
          <label>Setul de proprietăți
            <input list="pseturi" value={f.pset} onChange={e => set('pset', e.target.value)} required />
            <datalist id="pseturi">{PSETURI.map(p => <option key={p} value={p} />)}</datalist>
          </label>
          <label>Proprietatea<input value={f.proprietate} onChange={e => set('proprietate', e.target.value)} required /></label>
        </>}
        <label>{f.tip_cerinta === 'clasificare' ? 'Sistemul de clasificare' : f.tip_cerinta === 'nivel' ? 'Nivelul' : f.tip_cerinta === 'material' ? 'Materialul (conține)' : 'Valoarea cerută'} <small className="discret">(gol = oricare; variante: a|b)</small>
          <input value={f.valoare} onChange={e => set('valoare', e.target.value)} placeholder={f.tip_cerinta === 'clasificare' ? 'ex. Uniclass 2015' : f.tip_cerinta === 'proprietate' ? 'ex. true' : ''} />
        </label>
      </div>
      <div className="rand-formular">
        <label>Denumirea regulii<input value={f.denumire} onChange={e => set('denumire', e.target.value)} placeholder={`${numeClasa(regula.clasa)}: ${descrieCerinta(regula)}`} /></label>
        <label>Sursa<select value={f.sursa} onChange={e => set('sursa', e.target.value)}>{['EIR', 'AIR', 'BEP', 'normativ'].map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="bifa"><input type="checkbox" checked={f.obligatorie} onChange={e => set('obligatorie', e.target.checked)} /> Obligatorie</label>
      </div>
      <div className="actiuni">
        <button type="button" className="buton" onClick={onRenunta}>Renunță</button>
        <button className="buton principal" disabled={!valida}>Adaugă regula</button>
      </div>
    </form>
  );
}

// --------------------------------------------------------------------- panoul de lângă modelul 3D
const ROSU = '#dc2626', VERDE = '#16a34a';
export function PanouVerificare({ proiect, membri, rolulMeu, uid, ctrl, incarcate }: Props & { ctrl: React.RefObject<ControlVizualizator>; incarcate: ModelIncarcat[] }) {
  const [reguli, setReguli] = useState<Regula[] | null>(null);
  const [rez, setRez] = useState<RezultatRegula[] | null>(null);
  const [activa, setActiva] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [lucru, setLucru] = useState(false);
  useEffect(() => { incarcaReguli(proiect.id).then(r => { setReguli(r.reguli); setEroare(r.eroare); }); }, [proiect.id]);
  // modelele s-au schimbat: rezultatul vechi nu mai e valabil
  useEffect(() => { setRez(null); setActiva(null); }, [incarcate]);

  const s = useMemo(() => (rez ? sumar(rez) : null), [rez]);
  const modele = incarcate.map(m => m.nume);

  function verifica() {
    if (!ctrl.current || !reguli?.length) return;
    setLucru(true); setMesaj(null); setEroare(null);
    // lăsăm interfața să afișeze „Se verifică…” înainte de calcul
    setTimeout(() => {
      try {
        const pe = ctrl.current!.verifica(reguli);
        const r = reunesteRezultate(pe.map(x => x.rezultat));
        setRez(r); setActiva(null);
        const toate = new Map<string, string>();
        r.forEach(x => (x.trec_guid ?? []).forEach(g => toate.set(g, VERDE)));
        r.filter(x => x.obligatorie).forEach(x => x.nu_trec.forEach(e => toate.set(e.guid, ROSU)));
        ctrl.current!.coloreaza(toate);
      } catch (e) { setEroare((e as Error).message); }
      setLucru(false);
    }, 30);
  }
  function arataRegula(i: number) {
    if (!rez || !ctrl.current) return;
    const r = rez[i]; setActiva(i);
    ctrl.current.coloreaza(new Map([...(r.trec_guid ?? []).map(g => [g, VERDE] as [string, string]), ...r.nu_trec.map(e => [e.guid, ROSU] as [string, string])]));
    if (r.nu_trec.length) ctrl.current.arata(null, r.nu_trec.slice(0, 200).map(e => e.guid));
  }
  function curata() { ctrl.current?.coloreaza(null); setActiva(null); }
  async function salveaza() {
    if (!rez || !s) return;
    setLucru(true); setEroare(null);
    const rezultat = rez.map(({ trec_guid: _t, ...r }) => ({ ...r, nu_trec: r.nu_trec.slice(0, 500) }));
    const { error } = await supabase.from('verificari_model').insert({ proiect_id: proiect.id, modele, reguli: s.reguli, elemente: s.verificari, neconforme: s.neconforme, rezultat, nota: nota.trim() || null });
    setLucru(false);
    if (error) setEroare(eroareDb(error)); else { setMesaj('Raportul a fost salvat. Îl găsiți în Verificarea modelului.'); setNota(''); }
  }

  if (reguli === null) return null;
  return (
    <div className="card panou-verificare">
      <div className="antet-card">
        <div>
          <h2>Verificarea modelului</h2>
          <p className="discret">Regulile de informații ale proiectului (EIR), rulate pe modelele deschise: în verde elementele care trec, în roșu cele care nu trec o regulă obligatorie.</p>
        </div>
        <div className="actiuni">
          <Link className="buton" to="verificare">Regulile ({reguli.length})</Link>
          {reguli.length > 0 && <button className="buton principal" onClick={verifica} disabled={lucru}>{lucru && !rez ? 'Se verifică…' : rez ? 'Verifică din nou' : 'Verifică modelele deschise'}</button>}
        </div>
      </div>
      <Eroare text={eroare} />
      {mesaj && <p className="mesaj ok">{mesaj}</p>}
      {!reguli.length && <p className="discret">Nu sunt stabilite reguli pentru model. {poateRegula(rolulMeu) ? <Link to="verificare">Adăugați-le din șabloane sau dintr-un fișier IDS.</Link> : 'Le stabilesc beneficiarul, administratorul proiectului sau dirigintele.'}</p>}
      {rez && s && (
        <>
          <div className="kpi-rand">
            <div className="kpi"><span>Reguli</span><b>{s.reguli}</b><small>pe {modele.length} {modele.length === 1 ? 'model' : 'modele'}</small></div>
            <div className="kpi"><span>Verificări care trec</span><b>{s.procent}%</b><small>{s.trec} din {s.verificari}</small></div>
            <div className="kpi"><span>Elemente neconforme</span><b className={s.neconforme ? 'text-alerta' : 'text-ok'}>{s.neconforme}</b><small>la regulile obligatorii</small></div>
          </div>
          <div className="tabel-wrap"><table className="tabel rezultate-verificare">
            <thead><tr><th>Regula</th><th>Verificate</th><th>Trec</th><th>Nu trec</th><th /></tr></thead>
            <tbody>{rez.map((r, i) => (
              <tr key={i} className={activa === i ? 'activ' : ''}>
                <td><b>{r.denumire}</b>{!r.obligatorie && <small className="discret"> · recomandată</small>}
                  {activa === i && r.nu_trec.length > 0 && (
                    <ul className="neconforme">{r.nu_trec.slice(0, 30).map(e => (
                      <li key={e.guid}><button className="legatura" onClick={() => ctrl.current?.arata(null, [e.guid])}>{e.nume || numeClasa(e.clasa)}</button> <small className="discret">{e.motiv}</small></li>
                    ))}{r.nu_trec.length > 30 && <li className="discret">… și încă {r.nu_trec.length - 30}</li>}</ul>
                  )}
                </td>
                <td>{r.verificate || <span className="discret">0</span>}</td>
                <td className="text-ok">{r.trec}</td>
                <td className={r.verificate - r.trec ? (r.obligatorie ? 'text-alerta' : 'text-atentie') : ''}>{r.verificate - r.trec}</td>
                <td>{r.verificate > 0 && <button className="legatura" onClick={() => arataRegula(i)}>Arată</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {rez.some(r => r.verificate === 0) && <p className="discret"><small>Regulile cu 0 elemente verificate nu au găsit clasa respectivă în modelele deschise (deschideți și celelalte discipline).</small></p>}
          <div className="actiuni stanga salvare-raport">
            {activa !== null && <button className="buton" onClick={curata}>Culorile modelului</button>}
            <button className="buton" onClick={() => tiparesteRaport(proiect, { modele, rezultat: rez, creat_la: new Date().toISOString(), nota: nota.trim() || null }, nume(membri, uid))}>Tipărește</button>
            {rolulMeu && rolulMeu !== 'cititor' && <>
              <input className="nota-raport" value={nota} onChange={e => setNota(e.target.value)} placeholder="Notă (opțional), ex. verificare înainte de recepție" />
              <button className="buton principal" onClick={salveaza} disabled={lucru}>Salvează raportul</button>
            </>}
          </div>
        </>
      )}
    </div>
  );
}
