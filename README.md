# Conpro BIM · versiunea 0.5

Platforma în care beneficiarul, dirigintele, constructorul și proiectantul lucrează pe aceleași informații ale unei lucrări, fiecare cu contul și răspunderea lui (SR EN ISO 19650, Legea 169/2026).

**Ce face versiunea 0.1**

- conturi cu email și parolă, resetare de parolă;
- firme și profiluri;
- proiecte cu stadiul CATUC (art. 479), clasa de consecințe (art. 370), regimul legal calculat din data cererii (art. 582) și autorizația de construire cu avertizare pentru prelungire (art. 310);
- echipa pe roluri, cu invitații pe email;
- autorizațiile ISC, atestatele și polițele fiecărei persoane, cu avertizare la expirare (art. 456, 459, 556); beneficiarul le vede pe ale echipei;
- istoricul complet al modificărilor: cine, ce, când, valoarea anterioară.

- **procese verbale** (din 0.2): convocare de către constructor, diriginte sau administrator, cu participanții obligatorii pe tip de PV; confirmare individuală (confirm, confirm cu observații, refuz); la fazele determinante și la recepția la terminarea lucrărilor proiectantul confirmă după diriginte și RTE (art. 426 alin. 3); numerotare continuă pe proiect (PV-COD-0001); PV-ul semnat nu se mai modifică; tipărire / PDF;
- **registrul electronic de evidență** al dirigintelui și al RTE-ului (art. 456 lit. f, art. 459 lit. i), din 0.2: se completează automat la fiecare confirmare de PV și manual (verificări, neconformități, opriri, înștiințări ISC, dispoziții); intrările nu se modifică și nu se șterg, se corectează prin intrări noi; export Excel (CSV) și tipărire.

Următoarele module (CDE și documente, FAM, condica de betoane, încercări, echipamente COBie, Cartea tehnică) se construiesc peste această fundație.

---

## Site-ul de prezentare (bim.conpro.ro)

În folderul `site/` e site-ul public de prezentare: pagina principală, câte o pagină pentru diriginți, constructori și beneficiari publici, formularul de demonstrație și cookie-urile. Se publică pe un al doilea site Netlify, din același depozit; pașii sunt în `site/README.md`. Aplicația trece pe `app.conpro.ro`.

## Actualizare la 0.23 (EIR și BEP generate din aplicație)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0023_documente_bim.sql`, lipiți și **Run** (după 0022).
3. Verificare: `select count(*) from pg_proc where proname = 'document_bim_verifica';` trebuie să dea **1**.

Ce aduce:
- **Documente → EIR și BEP:** cele două documente ISO 19650-2 se generează din datele proiectului, gata de tipărit (PDF) sau de deschis în Word.
  - **EIR** (cerințele de schimb de informații, 5.2.1): datele proiectului, echipa beneficiarului, momentele de livrare, standardul informațiilor (convenția de denumire, stările CDE, codurile de stare), procedurile, regulile modelului (cu anexa IDS), cerințele de predare (AIR), formatele de schimb, criteriile de acceptare.
  - **BEP** (planul de execuție BIM, 5.3.2 și 5.4.1): echipa de livrare, managerul informațiilor, strategia de livrare și de federare, matricea de responsabilități, planul general de livrare (MIDP) pe momente, procedurile, coordonarea, răspunsul la fiecare cerință din EIR, software-ul, riscurile.
- Textele pe care aplicația nu le are (scopul, strategia, software-ul, riscurile…) pornesc de la un text implicit și se modifică pe secțiuni; versiunea crește la fiecare modificare. EIR-ul îl scriu beneficiarul, administratorul sau dirigintele; BEP-ul, administratorul, constructorul sau proiectantul.
- „De completat înainte de emitere”: ce lipsește din proiect pentru un document complet, cu legătura la locul unde se completează.

## Actualizare la 0.22 (verificarea modelului după reguli, IDS)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0022_verificare_model.sql`, lipiți și **Run** (după 0021).
3. Verificare: `select count(*) from pg_proc where proname in ('regula_model_verifica','verificare_model_verifica');` trebuie să dea **2**.

Ce aduce:
- **Model 3D → Verificarea modelului:** regulile de informații ale proiectului (cerințele EIR, ISO 19650-2, 5.2.1), pe clase IFC (cu subtipurile): un atribut completat (Name, LongName, Description, ObjectType, Tag), o proprietate dintr-un set (pe element sau moștenită din tip; și cantitățile Qto), o clasificare, un material, nivelul. Valoarea cerută e opțională, cu variante „a|b”; regula poate fi obligatorie sau recomandată. Le stabilesc beneficiarul, administratorul sau dirigintele; se poate porni de la șabloane (spații, arhitectură, structură, instalații / COBie).
- **IDS 1.0 (buildingSMART):** exportul regulilor ca fișier `.ids`, validat față de schema oficială, pentru proiectanți și pentru Revit, Archicad, Solibri, BIMcollab; importul unui IDS primit (cerințele simple se preiau, restul se raportează).
- **Verificarea pe modelele deschise:** în panoul de lângă model, procentul de verificări care trec, elementele neconforme și, pe fiecare regulă, elementele care nu trec cu motivul („lipsește setul Pset_WallCommon”). Modelul se colorează: verde trec, roșu nu trec o regulă obligatorie; „Arată” duce la elemente.
- **Rapoartele de verificare:** salvate ca dovadă (cine, când, ce revizii, rezultatul pe reguli), tipărire; nu se mai modifică.
- Corectură: pe telefon, tabelele late nu mai împing pagina proiectului în lateral.

## Actualizare la 0.21 (prezentarea proiectului și meniul nou)

Nu are script SQL; codul ajunge pe site singur, după unirea în `main`.

- **Prezentarea proiectului** (prima pagină a fiecărui proiect): stadiul, autorizația, echipa, recepția sau exploatarea; ce așteaptă după dumneavoastră în proiect; panouri pentru procese verbale, FAM-uri, betoane, observații pe model, planul de livrare, execuția pe model, predare și exploatare, cu alertele (contestate, neconforme, întârziate, lipsuri); activitatea recentă. Fiecare panou duce la secțiunea lui.
- **Meniul proiectului**, grupat pe etapele lucrării (Informații, Execuție, Predare, Exploatare, Proiect): în stânga pe calculator, ca listă de alegere pe telefon. Detaliile proiectului, convenția și lecțiile învățate sunt acum în „Detalii și convenție”.
- **Lista de proiecte** arată câte lucruri aveți de făcut în fiecare.

## Actualizare la 0.20 (cerințele de predare și lecțiile învățate)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0021_cerinte_lectii.sql`, lipiți și **Run** (după 0020).
3. Verificare: `select count(*) from pg_proc where proname in ('cerinta_verifica','lectie_verifica');` trebuie să dea **2**.

Ce aduce:
- **Cartea tehnică → Cerințele de predare (AIR / EIR):** ce cere beneficiarul la predare. La echipamente, câmpurile COBie (producător, model, serie, încăpere, punere în funcțiune, garanție, mentenanță, fișă tehnică, instrucțiuni, certificat de garanție), pe toate sau pe o categorie; la documente, titlul, cuvintele după care se recunoaște sau codul exact din CDE. Le stabilesc beneficiarul sau administratorul; se poate porni de la setul tip.
- **Verificarea automată:** pentru fiecare cerință, îndeplinită / parțial / lipsă, cu echipamentele la care lipsește. Cele obligatorii neîndeplinite intră în „Ce mai lipsește” și în pregătirea recepției.
- **Detalii → Lecții învățate** (ISO 19650-2, 5.8.2): ce a mers bine și ce nu, cu recomandarea pentru proiectul următor, pe domenii și stadii.

## Actualizare la 0.19 (planul de livrare și matricea de responsabilități)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0020_plan_livrare.sql`, lipiți și **Run** (după 0019).
3. Verificare: `select count(*) from pg_proc where proname in ('livrabile_stare','livrabil_verifica','moment_verifica');` trebuie să dea **3**.

Ce aduce (ISO 19650-2: 5.1.3, 5.4.2, 5.4.4, 5.4.5):
- **Documente → Planul de livrare:** momentele de livrare a informațiilor (le stabilesc beneficiarul sau administratorul), cu progresul fiecăruia; planul general (MIDP), filtrabil pe echipă (TIDP), cu codul din convenție, momentul, termenul, responsabilul, starea cerută (partajat / publicat) și nivelul necesar de informații.
- **Legătura cu CDE:** aplicația găsește documentul cu același cod și arată starea lui (neînceput, în lucru, partajat, publicat) și ce e întârziat. „Preia documentele din CDE” pornește planul din documentele existente. Planul se tipărește.
- **Documente → Matricea de responsabilități:** pe rânduri echipa și disciplina, pe coloane momentele; în celule, câte documente sunt livrate din cele planificate și ce întârzie.
- **„De făcut”:** livrabilele scadente în 7 zile sau întârziate, la responsabil; cele întârziate fără responsabil, la administrator.

## Actualizare la 0.18 (legăturile cu modelul și starea execuției)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0019_legaturi_model.sql`, lipiți și **Run** (după 0018).
3. Verificare: `select count(*) from pg_proc where proname in ('poate_lega','legatura_verifica','executat_verifica');` trebuie să dea **3**.

Ce aduce (harta BIM, liniile PV, MAT și IFC):
- **Model 3D → Execuția pe model:** elementele alese se leagă de un proces verbal, de o turnare din condica de betoane sau de un FAM; constructorul le poate marca și „executate”.
- **Modelul colorat după starea execuției:** verde = verificat (PV semnat), galben = în verificare (PV în curs), albastru = executat, roșu = cu observație deschisă; restul devine transparent. Legenda arată câte elemente are fiecare stare.
- **Trasabilitatea elementului ales:** PV-urile, turnările, FAM-urile și observațiile lui, cu legături directe.
- **În fișa PV-ului, a turnării și a FAM-ului:** lista elementelor din model, „Arată în model” (deschide modelele și evidențiază elementele) și dezlegarea unei legături greșite (după semnarea PV-ului, doar de diriginte). PV-ul și FAM-ul tipărite (și din Cartea tehnică) au lista elementelor din modelul IFC.

## Actualizare la 0.17 (observațiile pe model, BCF)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0018_observatii.sql`, lipiți și **Run** (după 0017).
3. Verificare: `select count(*) from pg_proc where proname in ('observatie_stare','observatie_verifica','comentariu_verifica');` trebuie să dea **3**.

Ce aduce (ISO 19650-2, 5.6–5.7; linia BCF din harta BIM):
- **Model 3D → Observație nouă:** alegeți unul sau mai multe elemente (Shift / Ctrl + clic), așezați vederea și deschideți observația: neconformitate, întrebare (RFI), dispoziție, remediere sau comentariu, cu prioritate, termen și cine răspunde (un rol sau o persoană). Se salvează elementele (GlobalId), camera și o captură.
- **„Arată”** readuce camera și evidențiază elementele, în orice model deschis; din fișa observației, „Arată în model” deschide singur modelele.
- **Observații pe model:** lista (deschise / ale mele / toate), fișa cu discuția, stările deschisă → în lucru → rezolvată → închisă (verificată de autor, diriginte sau administrator), redeschiderea motivată, fotografii. Totul rămâne în Istoric.
- **BCF 2.1:** export și import `.bcfzip`, cu camera, elementele, captura și comentariile, ca observațiile să circule cu Revit, Archicad, BIMcollab, Solibri, Navisworks.
- **„De făcut”:** observațiile atribuite (rolului sau persoanei) și cele rezolvate, de verificat de autor.
- Vizualizatorul: clicul nu mai alege volumele transparente (spații, zone) din fața elementelor; un model care nu se deschide nu le mai oprește pe celelalte.
- **Aplicația se încarcă mai repede:** motorul IFC (circa 4 MB) se descarcă doar când deschideți Modelul 3D, nu la fiecare intrare; pagina de pornire are acum aproximativ un sfert din cât avea.

## Actualizare la 0.16 (locatarii și reclamațiile)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0017_reclamatii.sql`, lipiți și **Run** (după 0016).
3. Verificare: `select count(*) from pg_proc where proname in ('reclamatie_preia','reclamatie_rezolva','reclamatie_confirma','locuintele_mele');` trebuie să dea **4**.
4. Funcția Edge `rezumat-zilnic` s-a schimbat puțin (legătura din e-mail pentru locatari). Dacă rezumatul e activ, copiați din nou `supabase/functions/rezumat-zilnic/index.ts` în editorul funcției și **Deploy**.

Ce aduce:
- **Locatarii** (Exploatare → Reclamații, la administrare): lista cu e-mailul și unitatea (se pot lipi din Excel), „s-a mutat” pentru cei plecați. Locatarii **nu sunt membri ai proiectului**: cu un cont pe același e-mail văd doar „Locuința mea”: clădirea, unitatea lor, administratorul și reclamațiile trimise de ei.
- **Reclamațiile:** categoria, locul, descrierea, urgența, fotografii. Administrarea le preia, le trimite constructorului (în garanție) sau le respinge motivat; rezolvarea o consemnează administrarea sau, în garanție, constructorul; cel care a trimis-o confirmă sau o redeschide. Fiecare pas are data și rămâne în Istoric.
- **„De făcut” și rezumatul pe e-mail:** reclamațiile noi (administrarea), cele în garanție (constructorul), confirmarea rezolvării (locatarul).
- Ghidul are rolul „Locatar”; politica de confidențialitate menționează datele locatarilor.

## Actualizare la 0.15 (mentenanța echipamentelor și garanțiile)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0016_mentenanta.sql`, lipiți și **Run** (după 0015).
3. Verificare: `select count(*) from pg_proc where proname in ('scadente_mentenanta','garantii','interventie_verifica');` trebuie să dea **3**.

Ce aduce (ISO 19650-3, informațiile despre echipamente ținute la zi în exploatare):
- **Exploatare → Mentenanță și garanții:** mentenanța restantă, garanțiile care expiră, intervențiile din an.
- **Scadențele de mentenanță** din intervalul tipului (COBie) și ultima revizie / verificare periodică (sau punerea în funcțiune).
- **Registrul intervențiilor:** revizii, verificări periodice obligatorii (ISCIR, PSI), reparații, înlocuiri, defecte, cu executantul, „în garanție”, starea după intervenție și fișele atașate. Nu se modifică. Se tipărește și intră în Cartea tehnică, capitolul D.
- **Garanțiile:** garanția de bună execuție a construcției (de la recepție) și a fiecărui echipament (din durata garanției tipului). La o intervenție, aplicația spune dacă echipamentul e în garanție și cine e garantul.
- **„De făcut”** pentru beneficiar și administratorul clădirii: mentenanța scadentă în 14 zile, garanția construcției cu 90 de zile înainte de expirare, a echipamentelor cu 60.
- **Administratorul clădirii** poate adăuga și actualiza echipamentele (înlocuiri, echipamente noi) și documentația lor.

## Actualizare la 0.14 (urmărirea comportării în timp)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0015_urmarire.sql`, lipiți și **Run** (după 0014).
3. Verificare: `select count(*) from pg_proc where proname in ('inregistreaza_inspectie','scadente_urmarire','scadente_urmarire_intern');` trebuie să dea **3**.

Ce aduce (Legea 169/2026, programul de urmărire în timp):
- **Exploatare → Urmărirea în timp:** verificările restante, ultima inspecție, punctele urmărite.
- **Programul de urmărire:** ce se urmărește, zona, metoda, intervalul (cel mult 12 luni) și pragul de alarmă. Îl stabilesc proiectantul, beneficiarul, administratorul proiectului sau al clădirii. Se poate porni de la **programul tip** pentru urmărirea curentă (10 puncte). Punctele nu se șterg, se scot din program.
- **Inspecțiile:** pentru fiecare punct, normal / atenție / alarmă / neverificat, cu constatările; concluzii, măsuri, fotografii. Nu se modifică după înregistrare. Fiecare inspecție intră automat în **jurnalul evenimentelor**; alarma o marchează „necesită expertiză”.
- **Scadențele:** de la ultima verificare a fiecărui punct (sau de la intrarea în exploatare) plus intervalul. Ce e scadent în 14 zile apare în **„De făcut”** și în rezumatul pe e-mail al beneficiarului și al administratorului clădirii.
- **Raportul anual** privind urmărirea comportării în timp (program, inspecții, alte evenimente, semnături) și secțiunea din **Cartea tehnică**, capitolul D.

## Actualizare la 0.13 (exploatarea construcției, etapa 1)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0014_exploatare.sql`, lipiți și **Run** (după 0013).
3. Verificare: `select count(*) from pg_proc where proname in ('trece_in_exploatare','receptie_terminare_aprobata','eveniment_verifica');` trebuie să dea **3**.

Ce aduce (stadiul 7 din Legea 169/2026, ISO 19650-3):
- **Fila Exploatare** în proiect. După ce recepția la terminarea lucrărilor e admisă și aprobată, beneficiarul sau administratorul proiectului trece construcția în exploatare (cu data); proiectul trece în stadiul 7. Sarcina apare în „De făcut”.
- **Rezumatul exploatării:** de când e în exploatare, până când curge garanția de bună execuție, câte evenimente cer expertiză.
- **Jurnalul evenimentelor:** avarii, seisme, fenomene meteo, incendii, intervenții, inspecții, schimbări de utilizare sau proprietar, cu zona, efectele, măsurile, executantul și fotografii / documente atașate. Intrările nu se modifică și nu se șterg; o greșeală se corectează cu o intrare nouă, legată de cea veche. Jurnalul se tipărește și intră în Cartea tehnică, capitolul D, și în arhiva electronică.
- Ghidul pe roluri are pașii noi pentru beneficiar și administratorul clădirii.

## Actualizare la 0.12 (ghid pe roluri, GDPR, încărcare multiplă)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0013_gdpr.sql`, lipiți și **Run**.
3. Verificare: `select count(*) from pg_proc where proname in ('accepta_termenii','datele_mele');` trebuie să dea **2**.
4. **Înainte de primul proiect real:** completați datele firmei în `src/lib/legal.ts` (CUI, nr. Registrul Comerțului, sediu, e-mail pentru date personale, reprezentant, limita răspunderii, prețul). Până atunci apar evidențiate cu galben în pagini. Textele sunt în `src/legal/*.md` și trebuie verificate de un jurist; la o versiune nouă schimbați `VERSIUNE_TERMENI`, iar fiecare utilizator le acceptă din nou la prima intrare.

Ce aduce:
- **Ghidul pe roluri** la `/ghid`, vizibil și fără cont: primii pași (cont, profil, De făcut, semnătura electronică) și ce face fiecare rol, cu fila din aplicație unde se face. La invitare, aplicația arată linkul către rolul ales.
- **Politica de confidențialitate** (`/confidentialitate`), **termenii de utilizare** (`/termeni`) și **modelul de acord de prelucrare** art. 28 GDPR între Conpro și firmele client (`/acord-prelucrare`), cu subprocesatorii (Supabase, Netlify, Resend) și măsurile de securitate. Legături în subsolul fiecărei pagini.
- **Acceptarea termenilor:** bifă obligatorie la cont nou; versiunea și momentul se păstrează în baza de date. Conturile existente acceptă o dată, la prima intrare.
- **„Descarcă datele mele”** în Profil (dreptul de acces și portabilitate): un fișier JSON cu profilul, autorizațiile, proiectele și acțiunile din istoric.
- **Încărcarea mai multor documente deodată** (Documente → „Încarcă mai multe”): trageți fișierele, aplicația recunoaște codul ISO 19650 din nume, grupează fișierele cu același cod (PDF + DWG) într-o singură revizie, propune revizia următoare și arată ce nu se poate încărca și de ce.

## Actualizare la 0.11 (convenția de denumire și „De făcut”)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0012_conventie_sarcini.sql`, lipiți și **Run**.
3. Verificare: `select count(*) from pg_proc where proname in ('sarcinile_mele','sarcini_persoana','in_lista');` trebuie să dea **3**.
4. **Opțional, rezumatul zilnic pe e-mail:** pașii sunt în `docs/REZUMAT-EMAIL.md` (cont Resend, funcția Edge, programarea).

Ce aduce:
- **Convenția de denumire pe proiect** (Detalii → „Convenția de denumire a documentelor”, o editează administratorul): listele de inițiatori, volume și niveluri, cu semnificația lor, numărul de cifre și **modul strict** (alte coduri se refuză, verificat și în baza de date). Butonul „Propune din echipă și niveluri” completează listele din firmele echipei și din nivelurile COBie. La „Document nou”, câmpurile devin liste.
- **„De făcut”** în bara de sus, cu numărul de sarcini: tot ce așteaptă după dumneavoastră, în toate proiectele — PV-uri de confirmat (proiectantul abia după diriginte și RTE, art. 426), FAM-uri de avizat / aprobat / completat, turnări de vizat, rezultate de luat la cunoștință, recepții de convocat / decis / aprobat, obiecții de remediat sau de confirmat, documente de aprobat pentru publicare. Fiecare rând duce direct acolo.
- **Rezumatul zilnic pe e-mail** (după activare): dimineața, în zilele lucrătoare, doar celor care au ceva de făcut. Fiecare îl poate opri din Profil.

## Actualizare la 0.10 (modelul 3D, IFC)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0011_model_ifc.sql`, lipiți și **Run**. Scriptul doar adaugă o coloană; nu șterge nimic.
3. Verificare: `select count(*) from information_schema.columns where column_name = 'ifc_guid' and table_name in ('niveluri','incaperi','tipuri_echipament','echipamente');` trebuie să dea **4**.
4. **Când treceți pe Supabase Pro**, ridicați limita de mărime pe fișier (planul gratuit acceptă cel mult 50 MB), de exemplu la 1 GB: `update storage.buckets set file_size_limit = 1073741824 where id = 'documente';`

Ce aduce:
- **Tab nou „Model 3D”:** modelele IFC din documentele proiectului (tip M3, revizia în vigoare sau cea mai nouă partajată) se deschid direct în browser, fără alt program. Se pot deschide mai multe deodată (arhitectură, structură, instalații), suprapuse, fiecare cu culoarea ei; se poate deschide și un fișier IFC de pe calculator, doar pentru vizualizare.
- **În vizualizare:** rotire, apropiere, încadrare; bife pe discipline și pe niveluri; **secțiune orizontală** la orice cotă; clic pe un element → clasa, GlobalId, atributele și seturile de proprietăți și cantități.
- **Preluare în COBie:** nivelurile, spațiile (cu aria, dacă e în model) și echipamentele (guri de aer, pompe, cazane, corpuri de iluminat, obiecte sanitare etc.) trec în tabul Echipamente, cu tipul și categoria lor. Fiecare păstrează GlobalId-ul din model, deci o nouă preluare adaugă doar ce e nou.
- Motorul de vizualizare (web-ifc, three.js) se încarcă doar în tabul Model 3D; restul aplicației rămâne la fel de rapid.

## Actualizare la 0.9 (documentele proiectului după ISO 19650)

1. Codul ajunge pe site singur, după unirea în `main` pe GitHub.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0010_documente_cde.sql`, lipiți și **Run**. La avertismentul „destructive operations” apăsați **Run query**: scriptul doar înlocuiește o regulă de citire a atașamentelor și extinde lista lor, nu șterge date.
3. Verificare: `select count(*) from pg_policies where tablename in ('documente_proiect','revizii_document');` trebuie să dea **6**.

Ce aduce:
- **Tab nou „Documente”** (mediul comun de date, CDE): planșe, modele, caiete de sarcini, rapoarte, calcule, grafice, fiecare cu **codul standard ISO 19650**, compus automat: Proiect-Inițiator-Volum-Nivel-Tip-Disciplină-Număr (ex. `BLC01-SP-ZZ-01-DR-S-0101`), cu numărul următor propus.
- **Revizii și stări:** în lucru (S0, o vede doar echipa autorului) → partajat (S1 coordonare, S2 informare, S3 comentarii, S4 aprobarea etapei) → publicat (A aprobat pentru execuție, B aprobat parțial, CR ca executat) → arhivat când e înlocuit. Fișierele unei revizii nu se mai schimbă după partajare.
- **Aprobarea publicării:** autorul o cere, beneficiarul, dirigintele sau administratorul o aprobă sau o refuză motivat. Pe pagina documentului se vede mereu revizia **în vigoare**.
- **Registrul documentelor** în Excel, cu filtre.
- **Legături:** la PV-uri, „Documentația de referință” se completează alegând planșa, cu revizia în vigoare. Revizia publicată a fiecărui document intră singură în capitolul A al Cărții tehnice; o revizie CR (ca executat) bifează proiectul as-built.

## Actualizare la 0.8 (semnătura electronică calificată, etapa 1)

1. **GitHub:** urcați din nou tot conținutul folderului (Add file → Upload files → Commit changes).
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0009_semnatura_electronica.sql`, lipiți și **Run**.
3. Verificare: `select count(*) from pg_policies where tablename = 'semnaturi_electronice';` trebuie să dea **2**.

Ce aduce (art. 581 alin. 4: Legea 214/2024 și Regulamentul eIDAS):
- **La procesele verbale semnate și la recepții:** secțiunea „Semnătura electronică calificată”. Documentul se salvează ca PDF, fiecare semnatar îl semnează pe rând cu certificatul calificat (Adobe Reader sau aplicația furnizorului), apoi PDF-ul semnat de toți se încarcă în aplicație.
- **Verificarea în browser, la încărcare și la fiecare deschidere:** integritatea documentului și a fiecărei semnături, semnatarul, emitentul, valabilitatea certificatului, dacă e calificat (QES, eIDAS), momentul semnării și marca temporală. Un PDF modificat după semnare e refuzat.
- **Potrivirea cu oamenii din proiect:** aplicația recunoaște după nume participanții la PV, respectiv membrii comisiei de recepție și dirigintele, și arată cine nu a semnat încă.
- Fișierele semnate nu se pot modifica sau șterge; semnăturile citite se păstrează în baza de date. Validarea completă până la Lista de încredere a UE se poate face cu instrumentul DSS al Comisiei Europene (legătură în aplicație).
- La documentele PV, scanul unui PV semnat olograf are acum tipul lui („PV semnat olograf (scan)”).

## Actualizare la 0.7 (recepția construcției)

1. **GitHub:** urcați din nou tot conținutul folderului (Add file → Upload files → Commit changes).
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0008_receptie.sql`, lipiți și **Run**. La avertismentul „destructive operations” apăsați **Run query**: scriptul doar extinde lista documentelor care se pot atașa, nu șterge date.
3. Verificare: `select count(*) from pg_policies where tablename in ('receptii','comisie_receptie','obiectii_receptie');` trebuie să dea **9**.

Ce aduce (Legea 169/2026, art. 280, 456, 527–532):
- **Tab nou „Recepție”:** recepția la terminarea lucrărilor (și parțială, pe corpuri sau tronsoane), apoi recepția finală la expirarea garanției.
- **Pregătirea:** dirigintele (secretariatul comisiei) deschide recepția, compune comisia (președinte, reprezentantul emitentului AC, specialiști, ISC/ISU/cultură/ordonator, invitați) și vede ce mai lipsește înainte de convocare. Fără autorizație de construire nu se poate deschide recepția.
- **Documentele de la art. 528 alin. 3 (a–g):** verificate automat; punctele de vedere, fișele de instruire, as-built-ul și PV-ul semnat se atașează la recepție. Proiectantul își încarcă singur punctul de vedere.
- **Ședința:** se consemnează poziția fiecărui membru; reprezentanții autorităților au drept de veto, motivat. Obiecțiile se scriu cu termen și responsabil. Decizia: admitere, admitere cu obiecții, suspendare, respingere (la recepția finală și prelungirea garanției). Textul constatărilor se poate propune din datele proiectului.
- **Aprobarea beneficiarului**, apoi garanția: minimul legal după clasa de consecințe (CC1 1 an, CC2 3 ani, CC3–CC4 5 ani), curge de la data recepției; aplicația arată termenul recepției finale (10 zile după expirare). Proiectul trece singur în stadiul 6, apoi 7.
- **Remedierile:** executantul raportează, cu dovezi, dirigintele confirmă sau refuză; totul intră în registrul electronic.
- **Procesul verbal de recepție** generat, gata de tipărit sau salvat PDF; intră în Cartea tehnică (capitolul C) și în arhivă.
- La procesele verbale, tipurile de recepție la terminare, parțială și finală s-au mutat în tabul Recepție.

## Actualizare la 0.6 (condica de betoane, versiunea completă)

1. **GitHub:** urcați din nou tot conținutul folderului (Add file → Upload files → Commit changes).
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0007_condica_betoane.sql`, lipiți și **Run**. Scriptul doar adaugă coloane și o funcție; nu șterge nimic.
3. Verificare: `select count(*) from information_schema.columns where table_name='turnari' and column_name in ('punct_lucru','schimb','identificare','data_decofrare','supravegheat_de');` trebuie să dea **5**.

Ce aduce:
- **Condica de betoane generată din proiect:** antet cu lucrarea, adresa, beneficiarul, autorizația, executantul, RTE-ul și dirigintele; un rezumat (turnări, volum, probe, rezultate, decofrări, vize); tabelul pe grupe: turnarea, elementul betonat, betonul, temperaturile, probele și încercările, decofrarea, supravegherea și viza. Rezultatele neconforme apar evidențiate. La final, semnăturile RTE și diriginte.
- **Câmpuri noi la turnare:** punctul de lucru (opțional, pentru lucrări cu mai multe corpuri), schimbul, nivelul / axele / travea și cine a supravegheat turnarea (implicit, cel care înregistrează).
- **Data decofrării:** o trece executantul o singură dată, și după viza dirigintelui; nu poate fi înaintea turnării sau în viitor.
- **În aplicație:** comutator „Listă” / „Condica (cum se tipărește)” și filtru pe punctul de lucru.
- **Export:** „Condica (Excel)”, o foaie cu toate turnările, filtre pe coloane și totalul volumului, și „Condica (tipărire / PDF)”. Arhiva Cărții tehnice le conține pe amândouă.
- Tip nou de încercare: **nedistructivă** (sclerometru, ultrasunete).

## Actualizare la 0.5 (echipamente, COBie și Cartea tehnică)

1. **GitHub:** urcați din nou tot conținutul folderului (Add file → Upload files → Commit changes). Netlify instalează singur bibliotecile noi (exceljs, jszip).
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0006_echipamente_carte.sql`, lipiți și **Run**. La avertismentul „destructive operations” apăsați **Run query**: scriptul doar extinde lista de documente care se pot atașa.
3. Verificare: `select count(*) from pg_policies where tablename in ('niveluri','incaperi','tipuri_echipament','echipamente','documente_carte');` trebuie să dea **10**.

Ce aduce:
- **Echipamente (COBie):** niveluri și încăperi (se pot lipi din Excel), tipuri de echipamente cu producător, model, garanție, interval de mentenanță, durată de viață, instrucțiuni și documentele producătorului; echipamentele montate, cu eticheta, încăperea, seria, montajul, punerea în funcțiune (legată de PV-ul semnat) și garanția. Aplicația arată ce date lipsesc la fiecare echipament și procentul de completare. Exportul COBie generează foile Contact, Facility, Floor, Space, Type, Component, Job și Document. Pentru predarea oficială, verificați fișierul și cu un instrument COBie QC.
- **Cartea tehnică:** opisul pe capitole A–D (art. 530), completat automat din PV-urile semnate, FAM-urile aprobate și livrările, condica de betoane, încercări și echipamente, plus documentele din afara aplicației (certificat de urbanism, autorizație, proiect, as-built), care nu se mai modifică după înregistrare. Lista „Ce mai lipsește pentru un dosar complet” arată ce e încă deschis. Manualul de utilizare și mentenanță (art. 528 alin. 3 lit. e) se generează din echipamente. **Arhiva electronică (.zip)** conține opisul, PV-urile, FAM-urile, condica, manualul și COBie generate, plus toate fișierele, pe capitole.

## Actualizare la 0.4 (condica de betoane și încercări)

1. **GitHub:** urcați din nou tot conținutul folderului (Add file → Upload files → Commit changes).
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0005_betoane_incercari.sql`, lipiți și **Run**. La avertismentul „destructive operations” apăsați **Run query**: scriptul doar extinde lista de documente care se pot atașa, nu șterge date.
3. Verificare: `select count(*) from pg_policies where tablename in ('turnari','incercari');` trebuie să dea **5**.

Ce aduce:
- **Condica de betoane:** constructorul (RTE) înregistrează fiecare turnare: elementul, clasa betonului (cu fck și fck,cub afișate), clasa de expunere, consistența, volumul, stația, bonurile, orele, temperaturile, punerea în operă, tratarea și probele prelevate. Turnarea se leagă doar de un FAM de beton aprobat și de un PV de armare semnat de toți. Se corectează până la viza dirigintelui; viza intră în registrul lui.
- **Încercări:** laboratorul (sau constructorul) introduce rezultatele, cu buletinul PDF, pe turnări sau pe materiale cu FAM. Rezultatele nu se modifică. Dirigintele le ia la cunoștință; un rezultat neconform intră în registru ca neconformitate. Conformitatea o stabilește laboratorul după normativ; aplicația o consemnează și arată media la 28 de zile față de fck,cub.

## Actualizare la 0.3 (FAM, livrări, atașamente)

1. **GitHub:** urcați din nou tot conținutul folderului (Add file → Upload files → Commit changes).
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0004_fam.sql`, lipiți și **Run**. La avertismentul „destructive operations” apăsați **Run query**: scriptul doar înlocuiește două reguli de acces pentru fișiere, nu șterge date.
3. Verificare: `select count(*) from pg_policies where schemaname in ('public','storage') and policyname like any (array['fam_%','livrari_%','atasamente_%','documente_%']);` trebuie să dea **9**. În **Storage** trebuie să apară bucket-ul privat `documente`.

Ce aduce:
- **FAM:** constructorul (sau subcontractorul) întocmește fișa: materialul și performanțele cerute în proiect, produsul propus, performanțele declarate, datele de mediu (art. 386 lit. h) și documentele însoțitoare (art. 563), cu fișierele atașate. O depune; proiectantul avizează conform / echivalent / neconform (neconform îl întoarce la completări); dirigintele aprobă, aprobă cu observații sau respinge. Un FAM respins se reia ca revizie nouă (FAM-COD-002/R2). După depunere fișa nu se mai modifică. Dacă echipa nu are proiectant, FAM-ul merge direct la diriginte.
- **Verificarea la livrare:** dirigintele înregistrează fiecare livrare (cantitate, lot, document de însoțire) ca conformă sau neconformă; nu se poate înregistra livrarea unui material fără FAM aprobat. Deciziile pe FAM și livrările intră automat în registrul electronic al dirigintelui; o livrare neconformă intră ca neconformitate.
- **Atașamente:** fișiere de până la 50 MB în bucket-ul privat `documente`, vizibile doar membrilor proiectului; la FAM, la livrări și la procese verbale (PV-ul semnat, scanat sau semnat electronic calificat, și fotografii). Fișierele nu se șterg.

## Actualizare la 0.2.1 (conținutul și concluziile PV-ului)

1. **GitHub:** urcați din nou tot conținutul folderului (Add file → Upload files → Commit changes).
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0003_continut_pv.sql`, lipiți și **Run**. Se poate rula și de mai multe ori.
3. Verificare: `select count(*) from information_schema.columns where table_name = 'procese_verbale' and column_name in ('descriere_lucrari','concluzii');` trebuie să dea **2**.

Ce aduce: fiecare PV are documentația de referință, descrierea lucrărilor executate și concluziile. Le completează constructorul (RTE) sau cine a convocat; butonul „Generează propunere de text” compune un text standard pe tipul de PV, din datele introduse, pe care constructorul îl verifică și îl corectează. Nimeni nu confirmă un PV fără conținut, iar după prima confirmare textul se blochează.

## Actualizare de la 0.1 la 0.2

1. **GitHub:** dezarhivați arhiva nouă; în depozit, **Add file → Upload files**, trageți din nou tot conținutul folderului `conpro-bim` (fișierele existente se înlocuiesc) și apăsați **Commit changes**. Netlify publică singur versiunea nouă în 1–2 minute.
2. **Supabase → SQL Editor → New query:** copiați `supabase/migrations/0002_procese_verbale.sql`, lipiți și **Run**. Se rulează o singură dată. Nu rulați din nou `0001`.
3. Verificare: în SQL Editor, `select count(*) from pg_policies where schemaname = 'public';` trebuie să dea **23**.

---

## Instalare, pas cu pas

### 1. Urcați codul în GitHub

1. Dezarhivați `conpro-bim.zip` pe calculator.
2. Pe github.com deschideți depozitul `conpro-bim` și apăsați **uploading an existing file** (sau **Add file → Upload files**).
3. Trageți în pagină **tot conținutul** folderului dezarhivat: fișierele și folderele `src`, `supabase`, `tests`.
4. Jos, la „Commit changes”, scrieți „Versiunea 0.1” și apăsați **Commit changes**.

Pe Mac, fișierele care încep cu punct (`.gitignore`, `.env.example`) pot fi ascunse la tragere. Nu e grav, aplicația funcționează și fără ele.

### 2. Creați baza de date în Supabase

1. Pe supabase.com: **New project**, numele `conpro-bim`, regiunea **Central EU (Frankfurt)**. Generați parola bazei de date și păstrați-o doar la dumneavoastră.
2. După ce proiectul pornește: **SQL Editor → New query**.
3. Deschideți fișierul `supabase/migrations/0001_fundatie.sql`, copiați tot textul, lipiți-l în editor și apăsați **Run**. Trebuie să apară „Success. No rows returned”.
4. **Authentication → Sign In / Providers → Email**: lăsați **Confirm email** pornit. Invitațiile se acceptă doar de pe un email confirmat.
5. **Project Settings → API**: notați **Project URL** și cheia **anon / publishable**.

Migrarea se rulează o singură dată. Dacă o rulați a doua oară, primiți erori „already exists”; nu stricați nimic.

### 3. Publicați aplicația în Netlify

1. În Netlify: **Add new site → Import an existing project → GitHub** și alegeți `conpro-bim`. Netlify vă cere acces la GitHub prin aplicația lui proprie; aprobați doar pentru acest depozit.
2. Setările de build se citesc singure din `netlify.toml` (comanda `npm run build`, folderul `dist`).
3. Înainte de **Deploy**, la **Environment variables**, adăugați:
   - `VITE_SUPABASE_URL` = Project URL din Supabase
   - `VITE_SUPABASE_ANON_KEY` = cheia anon / publishable
4. Apăsați **Deploy**. Peste 1–2 minute aplicația are o adresă de forma `nume.netlify.app`.
5. Opțional: **Domain management → Add a domain** → `app.conpro.ro`.

**Niciodată** cheia `service_role` / „secret” în Netlify sau în cod.

### 4. Legați adresa aplicației de Supabase

În Supabase → **Authentication → URL Configuration**:

- **Site URL**: adresa aplicației, de exemplu `https://app.conpro.ro`;
- **Redirect URLs**: adăugați aceeași adresă, urmată de `/**`.

Fără acest pas, linkurile din emailurile de confirmare și de resetare duc la o adresă greșită.

### 5. Primul test

1. Deschideți aplicația → **Creează cont** → confirmați din email → intrați.
2. **Profilul meu**: numele, firma, autorizația ISC și polița.
3. **Proiect nou**: cod (ex. `BLC01`), denumire, stadiu, clasă de consecințe.
4. **Echipa → Invitați pe cineva**: un al doilea email al dumneavoastră, rol „Beneficiar”. Copiați linkul și deschideți-l într-o fereastră privată. Faceți cont cu acel email, confirmați-l, intrați: proiectul apare singur, cu rolul de beneficiar, iar câmpurile nu se pot modifica.

Supabase trimite gratuit doar câteva emailuri pe oră. Pentru pilot e suficient; pentru mai mulți utilizatori se leagă un serviciu de email (SMTP) la **Authentication → Emails → SMTP Settings**.

---

## Pentru programatorul care verifică

- **Stack:** React 18 + TypeScript + Vite, `@supabase/supabase-js` v2, PostgreSQL în Supabase.
- **Securitate:** toate drepturile sunt impuse în baza de date prin Row Level Security (`supabase/migrations/0001_fundatie.sql`). Interfața doar ascunde ce oricum nu e permis. Funcțiile de acces (`este_membru`, `are_rol`, `lucreaza_impreuna`, `email_curent`) sunt `security definer` cu `search_path` fixat, ca politicile să nu se apeleze recursiv.
- **Reguli cheie:**
  - creatorul unui proiect devine administrator printr-un trigger;
  - un proiect nu rămâne niciodată fără administrator;
  - emailul profilului nu se poate modifica din aplicație (grant pe coloane);
  - jurnalul se scrie doar prin triggere;
  - invitațiile se acceptă prin `accepta_invitatiile()`, doar pentru un email confirmat;
  - proiectele nu se șterg, se arhivează.
- **Inserarea unui proiect** se face fără `returning`: politica de citire cere calitatea de membru, care apare abia în triggerul `after insert`.
- **Teste:** `npm install && npm run test:db` rulează 194 de verificări pe un Postgres local (PGlite), cu utilizatori simulați: 40 pentru regulile de bază, 54 pentru procese verbale, conținutul lor și registru, 43 pentru FAM, livrări, atașamente și Storage, 33 pentru condica de betoane și încercări, 24 pentru spații, echipamente și Cartea tehnică (ordinea art. 426, participanți obligatorii, imuabilitate, vizibilitate).
- **PV-uri:** scrierea se face doar prin funcțiile `convoaca_pv`, `confirma_pv`, `anuleaza_pv` (`security definer`); tabelele au doar drept de citire pentru utilizatori. Intrările automate în registru sunt scrise de `confirma_pv`; cele manuale trec prin triggerul `verifica_intrare_registru`.
- **Local:** copiați `.env.example` în `.env`, completați, apoi `npm run dev`.

## Structura

```
supabase/migrations/   schema bazei de date și regulile de acces
tests/                 testele regulilor de acces
src/lib/               clientul Supabase, sesiunea, denumirile din CATUC și ISO 19650, exportul COBie, Cartea tehnică și arhiva
src/pages/             autentificare, proiecte, proiect (detalii, procese verbale, materiale FAM, betoane și încercări, echipamente, Cartea tehnică, echipă, istoric), registru, profil
src/components/        elemente comune de interfață
```
