import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUid } from '../lib/sesiune';
import {
  CLASE, ROLURI, STADII, codFam, codPv, formatData, numeRol, numeTipRegistru, tipPv, numeTipDoc, stareAutorizatie, stareDocument, type DeciziePv, type Rol, type TipPv, type TipRegistru,
} from '../lib/domeniu';
import type { DocumentPersoana, IntrareJurnal, Invitatie, Membru, Proiect as TProiect } from '../lib/tipuri';
import { Eroare, Eticheta, Gol, mesajEroare } from '../components/ui';
import ProceseVerbale from './ProceseVerbale';
import Materiale from './Materiale';
import Betoane from './Betoane';
import Echipamente from './Echipamente';
import Receptie from './Receptie';
import CarteaTehnica from './CarteaTehnica';

export default function Proiect() {
  const { id = '' } = useParams();
  const uid = useUid();
  const [proiect, setProiect] = useState<TProiect | null>(null);
  const [membri, setMembri] = useState<Membru[]>([]);
  const [eroare, setEroare] = useState<string | null>(null);
  const [gasit, setGasit] = useState(true);

  const incarca = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('proiecte').select('*').eq('id', id).maybeSingle(),
      supabase.from('membri_proiect')
        .select('proiect_id, persoana_id, rol, zona, persoane(id, nume, email, telefon, firma_id, firme(denumire))')
        .eq('proiect_id', id),
    ]);
    if (p.error || m.error) setEroare(mesajEroare(p.error ?? m.error));
    if (!p.data && !p.error) setGasit(false);
    setProiect(p.data as TProiect | null);
    setMembri((m.data as unknown as Membru[]) ?? []);
  }, [id]);

  useEffect(() => { incarca(); }, [incarca]);

  const rolulMeu = membri.find(m => m.persoana_id === uid)?.rol;
  const admin = rolulMeu === 'administrator';

  if (!gasit) return <Gol titlu="Proiectul nu există sau nu faceți parte din echipă" />;
  if (!proiect) return <><Eroare text={eroare} /><p className="discret">Se încarcă…</p></>;

  return (
    <>
      <div className="antet-pagina">
        <div>
          <span className="cod">{proiect.cod}</span>
          <h1>{proiect.denumire}</h1>
          <p className="discret">{STADII[proiect.stadiu_catuc]} · rolul dumneavoastră: <b>{rolulMeu ? numeRol(rolulMeu) : '—'}</b></p>
        </div>
      </div>
      <nav className="file" aria-label="Secțiunile proiectului">
        <NavLink to="" end>Detalii</NavLink>
        <NavLink to="pv">Procese verbale</NavLink>
        <NavLink to="fam">Materiale (FAM)</NavLink>
        <NavLink to="beton">Betoane și încercări</NavLink>
        <NavLink to="echipamente">Echipamente</NavLink>
        <NavLink to="receptie">Recepție</NavLink>
        <NavLink to="carte">Cartea tehnică</NavLink>
        <NavLink to="echipa">Echipa ({membri.length})</NavLink>
        <NavLink to="istoric">Istoric</NavLink>
      </nav>
      <Eroare text={eroare} />
      <Routes>
        <Route index element={<Detalii proiect={proiect} admin={admin} onSalvat={incarca} />} />
        <Route path="echipa" element={<Echipa proiectId={id} membri={membri} admin={admin} uid={uid} onSchimbat={incarca} />} />
        <Route path="echipamente" element={<Echipamente proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} />} />
        <Route path="receptie/*" element={<Receptie proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} />} />
        <Route path="carte" element={<CarteaTehnica proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} />} />
        <Route path="beton/*" element={<Betoane proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} />} />
        <Route path="fam/*" element={<Materiale proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} />} />
        <Route path="pv/*" element={<ProceseVerbale proiect={proiect} membri={membri} rolulMeu={rolulMeu} uid={uid} />} />
        <Route path="istoric" element={<Istoric proiect={proiect} membri={membri} />} />
      </Routes>
    </>
  );
}

// ------------------------------------------------------------------ Detalii
function Detalii({ proiect, admin, onSalvat }: { proiect: TProiect; admin: boolean; onSalvat: () => void }) {
  const [f, setF] = useState(proiect);
  const [eroare, setEroare] = useState<string | null>(null);
  const [salvat, setSalvat] = useState(false);
  const [lucreaza, setLucreaza] = useState(false);
  useEffect(() => setF(proiect), [proiect]);

  const ac = stareAutorizatie(f);
  const set = <K extends keyof TProiect>(k: K, v: TProiect[K]) => { setF({ ...f, [k]: v }); setSalvat(false); };
  const dataSauNull = (v: string) => (v ? v : null);

  async function salveaza(e: FormEvent) {
    e.preventDefault();
    setLucreaza(true); setEroare(null);
    const { error } = await supabase.from('proiecte').update({
      denumire: f.denumire, adresa: f.adresa, beneficiar: f.beneficiar, stadiu_catuc: f.stadiu_catuc,
      clasa_consecinte: f.clasa_consecinte, data_cerere_ac: f.data_cerere_ac, ac_numar: f.ac_numar,
      ac_emis_la: f.ac_emis_la, ac_valabil_pana: f.ac_valabil_pana, ac_prelungit_pana: f.ac_prelungit_pana,
      arhivat: f.arhivat,
    }).eq('id', proiect.id);
    setLucreaza(false);
    if (error) { setEroare(mesajEroare(error)); return; }
    setSalvat(true); onSalvat();
  }

  return (
    <form className="card formular" onSubmit={salveaza}>
      {!admin && <p className="mesaj info">Doar administratorul proiectului modifică aceste date.</p>}
      <fieldset disabled={!admin}>
        <h2>Lucrarea</h2>
        <div className="campuri">
          <label className="lat">Denumire<input value={f.denumire} onChange={e => set('denumire', e.target.value)} required /></label>
          <label className="lat">Adresă<input value={f.adresa ?? ''} onChange={e => set('adresa', e.target.value || null)} /></label>
          <label>Beneficiar<input value={f.beneficiar ?? ''} onChange={e => set('beneficiar', e.target.value || null)} /></label>
          <label>Stadiul (art. 479)
            <select value={f.stadiu_catuc} onChange={e => set('stadiu_catuc', Number(e.target.value))}>
              {STADII.map((s, i) => <option key={i} value={i}>{s}</option>)}
            </select>
          </label>
          <label>Clasa de consecințe (art. 370)
            <select value={f.clasa_consecinte ?? ''} onChange={e => set('clasa_consecinte', (e.target.value || null) as TProiect['clasa_consecinte'])}>
              <option value="">Nestabilită încă</option>
              {CLASE.map(c => <option key={c.id} value={c.id}>{c.nume}</option>)}
            </select>
            {(f.clasa_consecinte === 'CC3' || f.clasa_consecinte === 'CC4') &&
              <small>Urmărire specială a comportării obligatorie; măsurătorile intră în Cartea tehnică și în registru (art. 550).</small>}
          </label>
        </div>

        <h2>Autorizația de construire</h2>
        <div className="campuri">
          <label>Data cererii
            <input type="date" value={f.data_cerere_ac ?? ''} onChange={e => set('data_cerere_ac', dataSauNull(e.target.value))} />
            <small>Stabilește legea aplicabilă (art. 582).{proiect.regim_legal ? ` Acum: ${proiect.regim_legal}.` : ''}</small>
          </label>
          <label>Număr<input value={f.ac_numar ?? ''} onChange={e => set('ac_numar', e.target.value || null)} /></label>
          <label>Emisă la<input type="date" value={f.ac_emis_la ?? ''} onChange={e => set('ac_emis_la', dataSauNull(e.target.value))} /></label>
          <label>Valabilă până la<input type="date" value={f.ac_valabil_pana ?? ''} onChange={e => set('ac_valabil_pana', dataSauNull(e.target.value))} /></label>
          <label>Prelungită până la
            <input type="date" value={f.ac_prelungit_pana ?? ''} onChange={e => set('ac_prelungit_pana', dataSauNull(e.target.value))} />
            <small>O singură prelungire, de cel mult 12 luni (art. 310).</small>
          </label>
        </div>
        {(f.ac_valabil_pana || f.ac_prelungit_pana) && (
          <div className={`alerta-ac ${ac.ton}`}><Eticheta stare={ac} />{ac.detaliu && <span>{ac.detaliu}</span>}</div>
        )}
        <label className="bifa"><input type="checkbox" checked={f.arhivat} onChange={e => set('arhivat', e.target.checked)} /> Proiect arhivat</label>
      </fieldset>
      <Eroare text={eroare} />
      {admin && (
        <div className="actiuni">
          {salvat && <span className="mesaj-scurt">Salvat.</span>}
          <button className="buton principal" disabled={lucreaza}>{lucreaza ? 'Se salvează…' : 'Salvează'}</button>
        </div>
      )}
    </form>
  );
}

// ------------------------------------------------------------------- Echipa
function Echipa({ proiectId, membri, admin, uid, onSchimbat }:
  { proiectId: string; membri: Membru[]; admin: boolean; uid: string; onSchimbat: () => void }) {
  const [invitatii, setInvitatii] = useState<Invitatie[]>([]);
  const [docs, setDocs] = useState<DocumentPersoana[]>([]);
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('constructor');
  const [eroare, setEroare] = useState<string | null>(null);
  const [copiat, setCopiat] = useState('');

  const incarca = useCallback(async () => {
    const ids = membri.map(m => m.persoana_id);
    const [inv, d] = await Promise.all([
      admin ? supabase.from('invitatii').select('*').eq('proiect_id', proiectId).is('acceptat_la', null).order('creat_la')
            : Promise.resolve({ data: [] as Invitatie[], error: null }),
      ids.length ? supabase.from('documente_persoana').select('*').in('persoana_id', ids).eq('anulat', false)
                 : Promise.resolve({ data: [] as DocumentPersoana[], error: null }),
    ]);
    setInvitatii((inv.data as Invitatie[]) ?? []);
    setDocs((d.data as DocumentPersoana[]) ?? []);
  }, [proiectId, membri, admin]);
  useEffect(() => { incarca(); }, [incarca]);

  const docsPe = useMemo(() => {
    const m = new Map<string, DocumentPersoana[]>();
    docs.forEach(d => m.set(d.persoana_id, [...(m.get(d.persoana_id) ?? []), d]));
    return m;
  }, [docs]);

  async function invita(e: FormEvent) {
    e.preventDefault(); setEroare(null);
    const em = email.trim().toLowerCase();
    if (membri.some(m => m.persoane?.email === em)) { setEroare('Persoana face deja parte din echipă.'); return; }
    const { error } = await supabase.from('invitatii').insert({ proiect_id: proiectId, email: em, rol });
    if (error) { setEroare(mesajEroare(error)); return; }
    setEmail(''); incarca();
  }

  async function schimbaRol(persoanaId: string, nou: Rol) {
    setEroare(null);
    const { error } = await supabase.from('membri_proiect').update({ rol: nou }).eq('proiect_id', proiectId).eq('persoana_id', persoanaId);
    if (error) setEroare(mesajEroare(error)); else onSchimbat();
  }

  async function scoate(m: Membru) {
    if (!confirmare(`Scoateți pe ${m.persoane?.nume || m.persoane?.email} din proiect?`)) return;
    const { error } = await supabase.from('membri_proiect').delete().eq('proiect_id', proiectId).eq('persoana_id', m.persoana_id);
    if (error) setEroare(mesajEroare(error)); else onSchimbat();
  }

  async function anuleazaInvitatia(i: Invitatie) {
    const { error } = await supabase.from('invitatii').delete().eq('id', i.id);
    if (error) setEroare(mesajEroare(error)); else incarca();
  }

  const link = (em: string) => `${window.location.origin}/autentificare?email=${encodeURIComponent(em)}`;
  async function copiaza(em: string) {
    try { await navigator.clipboard.writeText(link(em)); setCopiat(em); } catch { setCopiat(''); }
  }

  return (
    <>
      <div className="card">
        <h2>Echipa proiectului</h2>
        <p className="discret">Drepturile vin din rol. Nimeni nu confirmă în numele altcuiva.</p>
        <div className="tabel-wrap">
          <table className="tabel">
            <thead><tr><th>Persoana</th><th>Firma</th><th>Rol</th><th>Autorizații și polițe</th>{admin && <th />}</tr></thead>
            <tbody>
              {membri.map(m => (
                <tr key={m.persoana_id}>
                  <td><b>{m.persoane?.nume || '—'}</b>{m.persoana_id === uid && ' (dvs.)'}<br /><span className="discret">{m.persoane?.email}</span></td>
                  <td>{m.persoane?.firme?.denumire ?? '—'}</td>
                  <td>
                    {admin ? (
                      <select value={m.rol} onChange={e => schimbaRol(m.persoana_id, e.target.value as Rol)} aria-label="Rol">
                        {ROLURI.map(r => <option key={r.id} value={r.id}>{r.nume}</option>)}
                      </select>
                    ) : numeRol(m.rol)}
                  </td>
                  <td>
                    <div className="etichete">
                      {(docsPe.get(m.persoana_id) ?? []).map(d => (
                        <span key={d.id} title={`${numeTipDoc(d.tip)}${d.numar ? ' nr. ' + d.numar : ''} · până la ${formatData(d.valabil_pana)}`}>
                          <Eticheta stare={{ ...stareDocument(d.valabil_pana), eticheta: `${scurt(d.tip)}: ${acord(d.tip, stareDocument(d.valabil_pana).eticheta)}` }} />
                        </span>
                      ))}
                      {(m.rol === 'diriginte' || m.rol === 'constructor') &&
                        !(docsPe.get(m.persoana_id) ?? []).some(d => d.tip === 'polita_rc') &&
                        <span className="eticheta atentie">Fără poliță înregistrată</span>}
                    </div>
                  </td>
                  {admin && <td>{m.persoana_id !== uid && <button className="legatura alerta" onClick={() => scoate(m)}>Scoate</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">Dirigintele și RTE-ul au obligația de asigurare de răspundere civilă profesională (art. 456 și 459 din Legea 169/2026).</p>
      </div>

      {admin && (
        <div className="card">
          <h2>Invitați pe cineva</h2>
          <form className="rand-formular" onSubmit={invita}>
            <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="nume@firma.ro" /></label>
            <label>Rol
              <select value={rol} onChange={e => setRol(e.target.value as Rol)}>
                {ROLURI.map(r => <option key={r.id} value={r.id}>{r.nume}</option>)}
              </select>
            </label>
            <button className="buton principal">Invită</button>
          </form>
          <p className="discret">{ROLURI.find(r => r.id === rol)?.descriere}</p>
          <Eroare text={eroare} />
          {invitatii.length > 0 && (
            <>
              <h3>Invitații în așteptare</h3>
              <p className="discret">Trimiteți persoanei linkul. Când își face cont sau intră cu acest email, intră automat în proiect cu rolul ales.</p>
              <ul className="lista-invitatii">
                {invitatii.map(i => (
                  <li key={i.id}>
                    <span><b>{i.email}</b> · {numeRol(i.rol)}</span>
                    <span className="actiuni-mici">
                      <button className="legatura" onClick={() => copiaza(i.email)}>{copiat === i.email ? 'Link copiat' : 'Copiază linkul'}</button>
                      <button className="legatura alerta" onClick={() => anuleazaInvitatia(i)}>Anulează</button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {!admin && <Eroare text={eroare} />}
    </>
  );
}

const scurt = (t: DocumentPersoana['tip']) =>
  ({ autorizatie_isc: 'Autorizație ISC', polita_rc: 'Poliță RC', atestat: 'Atestat', legitimatie_anre: 'ANRE', alt: 'Document' })[t];

// Acordul la feminin pentru poliță, autorizație, legitimație.
const acord = (t: DocumentPersoana['tip'], e: string) => {
  const f = t !== 'atestat' && t !== 'alt';
  const x = e.toLowerCase();
  return f ? x.replace(/^valabil$/, 'valabilă').replace(/^expirat$/, 'expirată') : x;
};

// window.confirm într-o funcție separată, ca să poată fi înlocuit ușor cu un dialog propriu.
const confirmare = (text: string) => window.confirm(text);

// ------------------------------------------------------------------ Istoric
const NUME_TABEL: Record<string, string> = {
  proiecte: 'Proiect', membri_proiect: 'Echipă', invitatii: 'Invitație',
  procese_verbale: 'Proces verbal', participanti_pv: 'Proces verbal', registru_intrari: 'Registru electronic',
  fam: 'FAM', livrari_fam: 'Livrare', atasamente: 'Document', turnari: 'Condica de betoane', incercari: 'Încercare',
  tipuri_echipament: 'Echipamente', echipamente: 'Echipamente', documente_carte: 'Cartea tehnică',
};
const CAMPURI: Record<string, string> = {
  denumire: 'denumirea', adresa: 'adresa', beneficiar: 'beneficiarul', stadiu_catuc: 'stadiul',
  clasa_consecinte: 'clasa de consecințe', data_cerere_ac: 'data cererii AC', ac_numar: 'numărul AC',
  ac_emis_la: 'data emiterii AC', ac_valabil_pana: 'termenul AC', ac_prelungit_pana: 'prelungirea AC',
  arhivat: 'arhivarea', rol: 'rolul', zona: 'zona',
};

function Istoric({ proiect, membri }: { proiect: TProiect; membri: Membru[] }) {
  const proiectId = proiect.id;
  const [intrari, setIntrari] = useState<IntrareJurnal[] | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);

  const [coduriPv, setCoduriPv] = useState(new Map<string, string>());

  useEffect(() => {
    Promise.all([
      supabase.from('jurnal').select('*').eq('proiect_id', proiectId).order('la', { ascending: false }).limit(300),
      supabase.from('procese_verbale').select('id, numar').eq('proiect_id', proiectId),
    ]).then(([a, b]) => {
      setEroare(mesajEroare(a.error ?? b.error));
      // convocarea fiecărui participant nu se afișează separat: apare în rândul de convocare
      setIntrari(((a.data as IntrareJurnal[]) ?? []).filter(j => !(j.tabel === 'participanti_pv' && j.operatie === 'INSERT')));
      setCoduriPv(new Map(((b.data as { id: string; numar: number }[]) ?? []).map(x => [x.id, codPv(proiect.cod, x.numar)])));
    });
  }, [proiectId, proiect.cod]);

  const nume = (id: string | null | undefined) => {
    const p = membri.find(m => m.persoana_id === id)?.persoane;
    return p ? (p.nume || p.email) : 'o persoană care nu mai e în echipă';
  };

  function descriere(j: IntrareJurnal): string {
    const d = j.dupa ?? {}, i = j.inainte ?? {};
    if (j.tabel === 'proiecte') {
      if (j.operatie === 'INSERT') return 'a creat proiectul';
      const schimbate = Object.keys(CAMPURI).filter(k => k in d && JSON.stringify(d[k]) !== JSON.stringify(i[k]));
      return schimbate.length ? `a modificat ${schimbate.map(k => CAMPURI[k]).join(', ')}` : 'a salvat proiectul';
    }
    if (j.tabel === 'membri_proiect') {
      const cine = nume((d.persoana_id ?? i.persoana_id) as string);
      if (j.operatie === 'INSERT') return `a adăugat pe ${cine} ca ${numeRol(d.rol as Rol)}`;
      if (j.operatie === 'DELETE') return `a scos pe ${cine} din proiect`;
      return `a schimbat rolul lui ${cine}: ${numeRol(i.rol as Rol)} → ${numeRol(d.rol as Rol)}`;
    }
    if (j.tabel === 'invitatii') {
      if (j.operatie === 'INSERT') return `a invitat ${d.email} ca ${numeRol(d.rol as Rol)}`;
      if (j.operatie === 'DELETE') return `a anulat invitația pentru ${i.email}`;
      return `a acceptat invitația ca ${numeRol(d.rol as Rol)}`;
    }
    if (j.tabel === 'procese_verbale') {
      const cod = codPv(proiect.cod, Number(d.numar ?? i.numar));
      if (j.operatie === 'INSERT') return `a convocat ${cod} (${tipPv(d.tip as TipPv).nume.toLowerCase()}): ${d.obiect}`;
      if (d.stare === 'anulat' && i.stare !== 'anulat') return `a anulat ${cod}: ${d.motiv_anulare}`;
      if (d.completat_la && d.completat_la !== i.completat_la) return `a completat descrierea și concluziile pentru ${cod}`;
      if (d.stare !== i.stare) return `${cod} a trecut în starea „${String(d.stare).replace('_', ' ')}”`;
      return `a actualizat ${cod}`;
    }
    if (j.tabel === 'participanti_pv') {
      const cod = coduriPv.get(d.pv_id as string) ?? 'procesul verbal';
      const verb = { confirm: 'a confirmat', confirm_cu_observatii: 'a confirmat cu observații', refuz: 'a refuzat' }[d.decizie as DeciziePv];
      if (verb) return `${verb} ${cod}${d.observatii ? `: „${d.observatii}”` : ''}`;
      return 'a actualizat o participare';
    }
    if (j.tabel === 'fam') {
      const cod = codFam(proiect.cod, Number(d.numar ?? i.numar), Number(d.revizie ?? i.revizie));
      if (j.operatie === 'INSERT') return `a întocmit ${cod}: ${d.material}`;
      if (d.stare !== i.stare) {
        const ce: Record<string, string> = {
          depus: 'a depus', avizat: d.aviz ? `a avizat (${String(d.aviz)})` : 'a depus', completari: 'a cerut completări la',
          aprobat: 'a aprobat', aprobat_cu_observatii: 'a aprobat cu observații', respins: 'a respins',
        };
        return `${ce[String(d.stare)] ?? 'a modificat'} ${cod}`;
      }
      return `a modificat ${cod}`;
    }
    if (j.tabel === 'livrari_fam') return `a verificat o livrare: ${d.conform ? 'conformă' : 'NECONFORMĂ'}${d.lot ? `, lot ${d.lot}` : ''}`;
    if (j.tabel === 'turnari') {
      if (j.operatie === 'INSERT') return `a înregistrat turnarea nr. ${d.numar}: ${d.element}, ${d.clasa_beton}${d.volum ? `, ${d.volum} m³` : ''}`;
      if (d.vizat_la && !i.vizat_la) return `a vizat turnarea nr. ${d.numar}`;
      return `a corectat turnarea nr. ${d.numar}`;
    }
    if (j.tabel === 'incercari') {
      if (j.operatie === 'INSERT') return `a introdus un rezultat de încercare: ${d.descriere ?? d.tip}${d.valoare != null ? ` = ${d.valoare} ${d.unitate ?? ''}` : ''}, ${d.conform ? 'conform' : 'NECONFORM'}`;
      return 'a luat la cunoștință un rezultat de încercare';
    }
    if (j.tabel === 'tipuri_echipament') {
      const x = (j.operatie === 'DELETE' ? i : d) as Record<string, unknown>;
      return `${j.operatie === 'INSERT' ? 'a adăugat' : j.operatie === 'DELETE' ? 'a șters' : 'a modificat'} tipul de echipament „${x.denumire}”`;
    }
    if (j.tabel === 'echipamente') {
      const x = (j.operatie === 'DELETE' ? i : d) as Record<string, unknown>;
      return `${j.operatie === 'INSERT' ? 'a înregistrat' : j.operatie === 'DELETE' ? 'a șters' : 'a completat'} echipamentul ${x.cod}`;
    }
    if (j.tabel === 'documente_carte') return `a înregistrat în Cartea tehnică (capitolul ${d.capitol}): ${d.titlu}`;
    if (j.tabel === 'receptii') {
      if (j.operatie === 'INSERT') return `a deschis recepția nr. ${d.numar} (${d.tip === 'terminare' ? 'la terminarea lucrărilor' : 'finală'}): ${d.obiect}`;
      const st = d.stare as string, inainte = (j.inainte ?? {}) as Record<string, unknown>;
      if (st !== inainte.stare) return ({ convocata: `a convocat comisia de recepție nr. ${d.numar}`, decisa: `a consemnat decizia comisiei la recepția nr. ${d.numar}`, aprobata: `a aprobat recepția nr. ${d.numar}`, respinsa: `a respins recepția nr. ${d.numar}`, anulata: `a anulat recepția nr. ${d.numar}` } as Record<string, string>)[st] ?? `a modificat recepția nr. ${d.numar}`;
      return `a modificat datele recepției nr. ${d.numar}`;
    }
    if (j.tabel === 'comisie_receptie') return j.operatie === 'DELETE' ? 'a scos un membru din comisia de recepție' : j.operatie === 'INSERT' ? `a numit în comisia de recepție: ${d.nume}` : `a consemnat poziția lui ${d.nume} în comisia de recepție`;
    if (j.tabel === 'obiectii_receptie') {
      if (j.operatie === 'INSERT') return `a consemnat obiecția nr. ${d.numar} la recepție: ${d.descriere}`;
      return d.stare === 'remediata' ? `a raportat remedierea obiecției nr. ${d.numar}` : d.stare === 'confirmata' ? `a confirmat remedierea obiecției nr. ${d.numar}` : `a redeschis obiecția nr. ${d.numar}`;
    }
    if (j.tabel === 'atasamente') return `a atașat documentul „${d.nume_fisier}”`;
    if (j.tabel === 'registru_intrari') return `a scris în registrul electronic (${numeTipRegistru(d.tip as TipRegistru).toLowerCase()})`;
    return `${j.operatie} ${j.tabel}`;
  }

  if (intrari === null) return <p className="discret">Se încarcă…</p>;
  return (
    <div className="card">
      <h2>Istoric</h2>
      <p className="discret">Fiecare modificare rămâne înregistrată: cine, ce și când, cu valoarea anterioară.</p>
      <Eroare text={eroare} />
      {intrari.length === 0 ? <p>Nicio modificare încă.</p> : (
        <ol className="jurnal">
          {intrari.map(j => (
            <li key={j.id}>
              <time>{new Date(j.la).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })}</time>
              <span><b>{j.autor ? nume(j.autor) : 'Sistemul'}</b> {descriere(j)}</span>
              <small>{NUME_TABEL[j.tabel] ?? j.tabel}</small>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
