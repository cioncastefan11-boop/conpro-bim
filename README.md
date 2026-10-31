# Conpro BIM · versiunea 0.1

Platforma în care beneficiarul, dirigintele, constructorul și proiectantul lucrează pe aceleași informații ale unei lucrări, fiecare cu contul și răspunderea lui (SR EN ISO 19650, Legea 169/2026).

**Ce face versiunea 0.1**

- conturi cu email și parolă, resetare de parolă;
- firme și profiluri;
- proiecte cu stadiul CATUC (art. 479), clasa de consecințe (art. 370), regimul legal calculat din data cererii (art. 582) și autorizația de construire cu avertizare pentru prelungire (art. 310);
- echipa pe roluri, cu invitații pe email;
- autorizațiile ISC, atestatele și polițele fiecărei persoane, cu avertizare la expirare (art. 456, 459, 556); beneficiarul le vede pe ale echipei;
- istoricul complet al modificărilor: cine, ce, când, valoarea anterioară.

Următoarele module (CDE, procese verbale, FAM, condica de betoane, echipamente COBie, registrul electronic al dirigintelui, Cartea tehnică) se construiesc peste această fundație.

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
- **Teste:** `npm install && npm run test:db` rulează 40 de verificări ale regulilor de acces pe un Postgres local (PGlite), cu utilizatori simulați: străin, beneficiar, constructor, administrator.
- **Local:** copiați `.env.example` în `.env`, completați, apoi `npm run dev`.

## Structura

```
supabase/migrations/   schema bazei de date și regulile de acces
tests/                 testele regulilor de acces
src/lib/               clientul Supabase, sesiunea, denumirile din CATUC și ISO 19650
src/pages/             autentificare, proiecte, proiect (detalii, echipă, istoric), profil
src/components/        elemente comune de interfață
```
