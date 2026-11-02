// Documentul semnat electronic (etapa 1): PDF-ul semnat cu certificate calificate,
// succesiv, de toți semnatarii, încărcat în aplicație. Semnăturile se citesc și se
// verifică în browser la încărcare și din nou la fiecare deschidere.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { aceeasiPersoana, LINK_DSS, semnaturaBuna, type SemnaturaPdf } from '../lib/semnaturaNume';

const verificaPdf = async (b: ArrayBuffer) => (await import('../lib/semnatura')).verificaPdf(b);
import type { Atasament, Membru } from '../lib/tipuri';
import { Eroare, Eticheta, mesajEroare } from './ui';

export type SemnatarAsteptat = { nume: string; calitate: string; persoana_id?: string | null };
type Props = {
  proiectId: string;
  entitate: 'pv' | 'receptie';
  entitateId: string;
  tip: 'pv_semnat' | 'pv_receptie_semnat';
  semnatari: SemnatarAsteptat[];
  membri: Membru[];
  poateIncarca: boolean;
  deschideDocument: () => void;
  titlu?: string;
};

const BUCKET = 'documente';
const numeSigur = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80);
const cand = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function DocumentSemnat({ proiectId, entitate, entitateId, tip, semnatari, membri, poateIncarca, deschideDocument, titlu }: Props) {
  const [doc, setDoc] = useState<Atasament | null | undefined>(undefined);
  const [semn, setSemn] = useState<SemnaturaPdf[] | null>(null);
  const [verificare, setVerificare] = useState<string | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const incarca = useCallback(async () => {
    const { data, error } = await supabase.from('atasamente').select('*').eq('entitate', entitate).eq('entitate_id', entitateId)
      .eq('tip_document', tip).order('incarcat_la', { ascending: false }).limit(1);
    if (error) { setEroare(mesajEroare(error)); return; }
    const a = (data as Atasament[])[0] ?? null;
    setDoc(a);
    setSemn(null);
    if (!a) return;
    setVerificare('Se verifică semnăturile din document…');
    const f = await supabase.storage.from(BUCKET).download(a.cale);
    if (f.error || !f.data) { setVerificare(null); setEroare('Documentul semnat nu a putut fi descărcat pentru verificare.'); return; }
    setSemn(await verificaPdf(await f.data.arrayBuffer()));
    setVerificare(null);
  }, [entitate, entitateId, tip]);
  useEffect(() => { incarca(); }, [incarca]);

  const potrivire = (s: SemnaturaPdf) => semnatari.find(x => aceeasiPersoana(x.nume, s));

  async function urca(f: File | undefined) {
    if (!f) return;
    setEroare(null); setMesaj(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setEroare('Încărcați fișierul PDF semnat.'); return; }
    setVerificare('Se citesc semnăturile…');
    const s = await verificaPdf(await f.arrayBuffer());
    if (!s.length) { setVerificare(null); setEroare('PDF-ul nu conține semnături electronice. Semnați-l mai întâi cu certificatul calificat.'); return; }
    const stricate = s.filter(x => !x.integra);
    if (stricate.length) { setVerificare(null); setEroare(`${stricate.length === 1 ? 'O semnătură nu e validă' : `${stricate.length} semnături nu sunt valide`}: documentul a fost modificat după semnare sau semnătura e deteriorată. Fișierul nu a fost încărcat.`); return; }
    setVerificare('Se încarcă documentul…');
    const cale = `${proiectId}/${entitate}/${entitateId}/${crypto.randomUUID().slice(0, 8)}-${numeSigur(f.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(cale, f, { contentType: 'application/pdf', upsert: false });
    if (up.error) { setVerificare(null); setEroare(up.error.message); return; }
    const ins = await supabase.from('atasamente').insert({ proiect_id: proiectId, entitate, entitate_id: entitateId, tip_document: tip, nume_fisier: f.name, cale, marime: f.size });
    if (ins.error) { setVerificare(null); setEroare(mesajEroare(ins.error)); return; }
    const { data: a } = await supabase.from('atasamente').select('id').eq('cale', cale).single();
    if (a) {
      const { error } = await supabase.from('semnaturi_electronice').insert(s.map(x => ({
        atasament_id: a.id, proiect_id: proiectId, ordine: x.ordine, semnatar: x.semnatar, emitent: x.emitent,
        serie_certificat: x.serieCertificat || null, calificata: x.calificata, integra: x.integra, acopera_tot: x.acoperaTot,
        marca_temporala: x.marcaTemporala, semnat_la: x.semnatLa ?? null, persoana_id: potrivire(x)?.persoana_id ?? null,
      })));
      if (error) setEroare(mesajEroare(error));
    }
    if (input.current) input.current.value = '';
    setMesaj(`Document încărcat: ${s.length} ${s.length === 1 ? 'semnătură' : 'semnături'}, ${s.filter(semnaturaBuna).length} calificate.`);
    await incarca();
  }

  async function deschide() {
    if (!doc) return;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(doc.cale, 120);
    if (data) window.open(data.signedUrl, '_blank', 'noopener');
  }

  const bune = (semn ?? []).filter(semnaturaBuna);
  const lipsa = semnatari.filter(x => !bune.some(s => aceeasiPersoana(x.nume, s)));
  const complet = !!semn && semn.length > 0 && lipsa.length === 0 && semn.every(s => s.integra);
  const om = (id: string) => { const p = membri.find(m => m.persoana_id === id)?.persoane; return p ? (p.nume || p.email) : '—'; };

  return (
    <section className="document-semnat">
      <div className="ds-cap">
        <h3>{titlu ?? 'Semnătura electronică calificată'}</h3>
        {semn && (complet ? <Eticheta stare={{ eticheta: 'Semnat electronic de toți', ton: 'ok' }} />
          : <Eticheta stare={{ eticheta: `${bune.length} din ${Math.max(semnatari.length, bune.length)} semnături calificate`, ton: 'atentie' }} />)}
      </div>

      {doc === null && (
        <ol className="ds-pasi">
          <li><b>Salvați documentul ca PDF.</b> <button type="button" className="legatura" onClick={deschideDocument}>Deschide documentul</button> și alegeți „Salvare ca PDF” la tipărire.</li>
          <li><b>Semnați pe rând, pe același fișier,</b> cu certificatul calificat: în Adobe Acrobat Reader (Instrumente → Certificate → Semnare digitală) sau în aplicația furnizorului (certSIGN, DigiSign, Trans Sped, AlfaSign…). Fiecare semnează fișierul primit de la cel dinainte.</li>
          <li><b>Încărcați aici PDF-ul semnat de toți.</b> Aplicația verifică fiecare semnătură înainte să-l primească.</li>
        </ol>
      )}

      {verificare && <p className="discret">{verificare}</p>}
      <Eroare text={eroare} />
      {mesaj && <p className="mesaj ok">{mesaj}</p>}

      {doc && (
        <p className="ds-fisier">
          <button type="button" className="legatura" onClick={deschide}>{doc.nume_fisier}</button>
          <span className="discret"> · încărcat de {om(doc.incarcat_de)}, {cand(doc.incarcat_la)}</span>
        </p>
      )}

      {semn && semn.length > 0 && (
        <div className="tabel-wrap">
          <table className="tabel stivuit">
            <thead><tr><th>Semnatar</th><th>Certificat</th><th>Tipul</th><th>Semnat la</th><th>Integritate</th><th>În proiect</th></tr></thead>
            <tbody>
              {semn.map(s => {
                const p = potrivire(s);
                return (
                  <tr key={s.ordine}>
                    <td data-eticheta="Semnatar"><b>{s.semnatar}</b>{s.organizatie && <small className="linia2">{s.organizatie}</small>}</td>
                    <td data-eticheta="Certificat">{s.emitent}<small className="linia2">valabil până la {s.certificatValabilPana ? new Date(s.certificatValabilPana).toLocaleDateString('ro-RO') : '—'}</small></td>
                    <td data-eticheta="Tipul">{s.calificata ? <Eticheta stare={{ eticheta: 'Calificată (QES)', ton: 'ok' }} /> : <Eticheta stare={{ eticheta: 'Necalificată', ton: 'atentie' }} />}{s.marcaTemporala && <small className="linia2">cu marcă temporală</small>}</td>
                    <td data-eticheta="Semnat la" className="fara-rupere">{cand(s.semnatLa)}</td>
                    <td data-eticheta="Integritate">{s.integra && !s.eroare ? <Eticheta stare={{ eticheta: 'Intactă', ton: 'ok' }} /> : <><Eticheta stare={{ eticheta: 'Invalidă', ton: 'alerta' }} /><small className="linia2">{s.eroare}</small></>}
                      {s.integra && !s.acoperaTot && <small className="linia2">urmată de alte semnături</small>}</td>
                    <td data-eticheta="În proiect">{p ? <>{p.nume}<small className="linia2">{p.calitate}</small></> : <span className="discret">nerecunoscut</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {semn && lipsa.length > 0 && <p className="mesaj atentie-bloc">Lipsesc semnăturile calificate ale: {lipsa.map(x => `${x.nume} (${x.calitate})`).join(', ')}.</p>}
      {semn && semn.length > 0 && (
        <p className="nota">Verificat acum, în browser, din fișierul stocat: integritatea documentului și a fiecărei semnături, certificatul și calificarea lui (eIDAS). Lanțul de încredere până la Lista de încredere a UE se poate valida complet cu <a href={LINK_DSS} target="_blank" rel="noreferrer">instrumentul DSS al Comisiei Europene</a>.</p>
      )}

      {poateIncarca && (
        <div className="incarcare-fisiere nu-tipari">
          {doc && <button type="button" className="buton" onClick={deschideDocument}>Documentul de semnat</button>}
          <label className="buton buton-fisier principal">
            {verificare ? 'Se verifică…' : doc ? 'Încarcă o versiune cu mai multe semnături' : 'Încarcă PDF-ul semnat'}
            <input ref={input} type="file" accept=".pdf,application/pdf" onChange={e => urca(e.target.files?.[0])} disabled={!!verificare} />
          </label>
        </div>
      )}
    </section>
  );
}
