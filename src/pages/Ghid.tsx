// Ghidul pe roluri: ce face fiecare participant în aplicație. Pagină publică (/ghid),
// ca un om invitat să o poată citi înainte să-și facă cont.
import { Link } from 'react-router-dom';

type Pas = { ce: string; unde: string; detalii?: string };
type Rol = { id: string; nume: string; pe_scurt: string; pasi: Pas[] };

const ROLURI: Rol[] = [
  {
    id: 'diriginte', nume: 'Diriginte de șantier',
    pe_scurt: 'Verifică execuția în numele beneficiarului, ține registrul electronic, întocmește Cartea tehnică și asigură secretariatul comisiei de recepție (art. 456 din Legea 169/2026).',
    pasi: [
      { ce: 'Confirmă procesele verbale de lucrări ascunse și faze determinante', unde: 'Procese verbale', detalii: 'Citiți descrierea și concluziile, apoi „Confirm”, „Confirm cu observații” sau „Refuz”. Confirmarea intră singură în registrul dumneavoastră.' },
      { ce: 'Aprobă materialele (FAM)', unde: 'Materiale (FAM)', detalii: 'După avizul proiectantului: aprobat, aprobat cu observații sau respins. La fiecare livrare verificați lotul și documentele de însoțire.' },
      { ce: 'Vizează turnările din condica de betoane și ia la cunoștință rezultatele încercărilor', unde: 'Betoane și încercări', detalii: 'Un rezultat neconform intră în registru ca neconformitate.' },
      { ce: 'Aprobă publicarea planșelor pentru execuție', unde: 'Documente', detalii: 'Revizia publicată (A1) devine cea „în vigoare”; cea veche se arhivează.' },
      { ce: 'Ține registrul electronic', unde: 'Registru (bara de sus)', detalii: 'Intrările automate (PV-uri, vize, încercări, recepții) apar singure; dispozițiile de șantier, verificările și opririle le scrieți dumneavoastră. Nu se șterg; o greșeală se corectează cu o intrare nouă.' },
      { ce: 'Întocmește Cartea tehnică', unde: 'Cartea tehnică', detalii: 'Opisul pe capitole A–D se completează singur; adăugați documentele din afara aplicației (certificat de urbanism, avize). Lista „Ce mai lipsește” arată ce e de rezolvat; la final descărcați arhiva electronică.' },
      { ce: 'Organizează recepția', unde: 'Recepție', detalii: 'Deschideți recepția, compuneți comisia, verificați documentele de la art. 528, convocați, consemnați pozițiile, obiecțiile și decizia; după remedieri confirmați fiecare obiecție.' },
    ],
  },
  {
    id: 'constructor', nume: 'Constructor / responsabil tehnic cu execuția (RTE)',
    pe_scurt: 'Execută lucrarea și dovedește calitatea: convoacă PV-urile, propune materialele, ține condica de betoane și completează echipamentele.',
    pasi: [
      { ce: 'Convoacă procesele verbale', unde: 'Procese verbale → PV nou', detalii: 'Alegeți tipul, obiectul și participanții; scrieți descrierea lucrărilor (butonul „Generează propunere de text” vă dă un început) și concluziile, apoi confirmați.' },
      { ce: 'Întocmește și depune FAM-urile', unde: 'Materiale (FAM) → FAM nou', detalii: 'Completați produsul, producătorul, declarația de performanță; atașați fișa tehnică și DoP-ul, apoi „Depune”. Dacă vi se cer completări, le faceți în aceeași fișă; dacă e respinsă, faceți o revizie nouă.' },
      { ce: 'Înregistrează turnările de beton', unde: 'Betoane și încercări → Turnare nouă', detalii: 'Punctul de lucru, elementul, betonul, bonurile, temperaturile și probele; după câteva zile, data decofrării. Condica se descarcă în Excel sau PDF.' },
      { ce: 'Introduce rezultatele încercărilor', unde: 'Betoane și încercări', detalii: 'Cu buletinul de la laborator atașat (sau le introduce laboratorul, dacă e în echipă).' },
      { ce: 'Completează echipamentele montate (COBie)', unde: 'Echipamente (sau Model 3D → Preluare în COBie)', detalii: 'Tipurile, cu producător, garanție și mentenanță; apoi fiecare echipament cu eticheta, încăperea și punerea în funcțiune. Din modelul IFC le puteți prelua dintr-un clic.' },
      { ce: 'Încarcă procedurile, graficele, rapoartele', unde: 'Documente', detalii: 'Cu codul standard; la mai multe fișiere folosiți „Încarcă mai multe”.' },
      { ce: 'Remediază obiecțiile de la recepție', unde: 'Recepție', detalii: 'Descrieți remedierea, atașați fotografii, apoi dirigintele confirmă.' },
      { ce: 'Ține registrul RTE', unde: 'Registru', detalii: 'Ca dirigintele, pentru propriile verificări (art. 459).' },
    ],
  },
  {
    id: 'proiectant', nume: 'Proiectant',
    pe_scurt: 'Publică planșele și modelele, avizează materialele propuse și participă la fazele determinante.',
    pasi: [
      { ce: 'Încarcă planșele și modelele, cu revizii', unde: 'Documente', detalii: 'Fiecare revizie începe în lucru (o vede doar echipa dumneavoastră); o partajați pentru coordonare sau comentarii (S1–S4) și cereți publicarea pentru execuție (A1). Modelele IFC (tip M3) se deschid în Model 3D.' },
      { ce: 'Avizează FAM-urile', unde: 'Materiale (FAM)', detalii: 'Conform, echivalent sau neconform (cu observații, care trimit fișa înapoi la constructor).' },
      { ce: 'Confirmă fazele determinante', unde: 'Procese verbale', detalii: 'Le primiți după ce au confirmat dirigintele și RTE-ul (art. 426 alin. 3).' },
      { ce: 'Dă punctul de vedere pentru recepție', unde: 'Recepție → documentele de recepție', detalii: 'Atașați punctul de vedere pe specialitatea dumneavoastră (art. 528 alin. 3 lit. a).' },
    ],
  },
  {
    id: 'beneficiar', nume: 'Beneficiar / investitor',
    pe_scurt: 'Urmărește lucrarea, aprobă publicarea documentelor și recepția, și primește Cartea tehnică.',
    pasi: [
      { ce: 'Aprobă recepția', unde: 'Recepție', detalii: 'După decizia comisiei: aprobați sau respingeți motivat. De la aprobare curge garanția; aplicația arată când trebuie făcută recepția finală.' },
      { ce: 'Aprobă publicarea documentelor', unde: 'Documente', detalii: 'Când proiectantul cere publicarea unei planșe pentru execuție.' },
      { ce: 'Urmărește lucrarea', unde: 'toate filele, Istoric', detalii: 'Vedeți PV-urile, materialele, betoanele, documentele și cine ce a făcut.' },
      { ce: 'Primește Cartea tehnică', unde: 'Cartea tehnică', detalii: 'Arhiva electronică, pe capitole, cu toate documentele (art. 529–530).' },
    ],
  },
  {
    id: 'administrator', nume: 'Administrator de proiect (manager de proiect / de informații)',
    pe_scurt: 'Creează proiectul, invită echipa și stabilește regulile pentru documente.',
    pasi: [
      { ce: 'Creează proiectul', unde: 'Proiecte → Proiect nou', detalii: 'Codul (3–6 caractere, ex. BLC01), denumirea, apoi în Detalii: autorizația de construire, clasa de consecințe și stadiul.' },
      { ce: 'Invită echipa', unde: 'Echipa', detalii: 'Adresa de e-mail și rolul fiecăruia. Spuneți-i persoanei să-și facă cont cu aceeași adresă: intră automat în proiect.' },
      { ce: 'Stabilește convenția de denumire', unde: 'Detalii → Convenția de denumire a documentelor', detalii: 'Inițiatorii, volumele, nivelurile; în modul strict alte coduri se refuză.' },
      { ce: 'Aprobă publicarea documentelor', unde: 'Documente' },
      { ce: 'Urmărește cine ce a făcut', unde: 'Istoric' },
    ],
  },
  {
    id: 'laborator', nume: 'Laborator',
    pe_scurt: 'Introduce rezultatele încercărilor, cu buletinul.',
    pasi: [{ ce: 'Introduce rezultatele', unde: 'Betoane și încercări', detalii: 'Pe turnare (rezistența la 7 și 28 de zile etc.) sau pe un material cu FAM; atașați buletinul PDF. Rezultatele nu se mai modifică după introducere.' }],
  },
  {
    id: 'subcontractor', nume: 'Subcontractor',
    pe_scurt: 'Lucrează ca executantul, pe partea lui de lucrare.',
    pasi: [{ ce: 'FAM-uri, turnări, echipamente, remedieri', unde: 'aceleași file ca la constructor', detalii: 'Pentru lucrările pe care le execută (de exemplu instalațiile).' }],
  },
  {
    id: 'administrator_cladire', nume: 'Administratorul clădirii (exploatare)',
    pe_scurt: 'Preia construcția după recepție: Cartea tehnică, echipamentele și garanțiile (ISO 19650-3).',
    pasi: [
      { ce: 'Consultă echipamentele și mentenanța', unde: 'Echipamente', detalii: 'Fiecare echipament cu încăperea, producătorul, garanția și intervalul de mentenanță; se exportă în COBie.' },
      { ce: 'Urmărește garanțiile și recepția finală', unde: 'Recepție', detalii: 'Perioada de garanție curge de la recepția la terminarea lucrărilor.' },
      { ce: 'Păstrează Cartea tehnică', unde: 'Cartea tehnică', detalii: 'Descărcați arhiva electronică; se păstrează pe toată durata de existență a construcției.' },
    ],
  },
  {
    id: 'cititor', nume: 'Cititor (ISC, comisie, auditor)',
    pe_scurt: 'Vede tot proiectul, fără să modifice nimic.',
    pasi: [{ ce: 'Consultă documentele', unde: 'toate filele', detalii: 'PV-uri, materiale, betoane, documente, Cartea tehnică, istoric.' }],
  },
];

export default function Ghid({ public: pub }: { public?: boolean }) {
  return (
    <div className={`ghid ${pub ? 'ghid-public' : ''}`}>
      <div className="antet-pagina"><div>
        <h1>Ghidul Conpro BIM</h1>
        <p className="discret">Ce face fiecare participant în aplicație, pe scurt. Fiecare vede și poate face doar ce ține de rolul lui în proiect.</p>
      </div></div>

      <div className="card">
        <h2>Primii pași, pentru toți</h2>
        <ol className="pasi-ghid">
          <li><b>Contul.</b> Administratorul proiectului vă adaugă în echipă cu adresa de e-mail. Intrați pe aplicație, „Creează cont” cu <b>aceeași adresă</b>, confirmați e-mailul primit și intrați: proiectul apare singur.</li>
          <li><b>Profilul.</b> Completați numele, telefonul și firma (din Profil). Numele apare pe procesele verbale și în semnături.</li>
          <li><b>De făcut.</b> În bara de sus, „De făcut” arată tot ce așteaptă după dumneavoastră, în toate proiectele; fiecare rând duce direct acolo. Dimineața primiți și un rezumat pe e-mail (se poate opri din Profil).</li>
          <li><b>Semnătura electronică.</b> PV-urile și recepțiile se pot semna cu semnătura electronică calificată: salvați documentul ca PDF, semnați-l pe rând cu certificatul calificat și încărcați-l; aplicația verifică fiecare semnătură.</li>
        </ol>
      </div>

      <nav className="roluri-ghid">
        {ROLURI.map(r => <a key={r.id} href={`#${r.id}`}>{r.nume.split(' (')[0].split(' / ')[0]}</a>)}
      </nav>

      {ROLURI.map(r => (
        <section key={r.id} id={r.id} className="card rol-ghid">
          <h2>{r.nume}</h2>
          <p className="discret">{r.pe_scurt}</p>
          <ol className="pasi-ghid">
            {r.pasi.map(p => (
              <li key={p.ce}>
                <b>{p.ce}</b> <span className="unde">{p.unde}</span>
                {p.detalii && <p>{p.detalii}</p>}
              </li>
            ))}
          </ol>
        </section>
      ))}

      <p className="discret">Întrebări sau probleme: scrieți administratorului proiectului. Vedeți și <Link to="/confidentialitate">politica de confidențialitate</Link> și <Link to="/termeni">termenii de utilizare</Link>.</p>
    </div>
  );
}
