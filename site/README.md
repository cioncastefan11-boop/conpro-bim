# Site-ul de prezentare Conpro BIM (bim.conpro.ro)

Pagini statice, fără build: acasă, câte o pagină pentru diriginți, constructori și beneficiari publici (destinațiile reclamelor), formularul de demonstrație, pagina de mulțumire (pentru măsurarea conversiilor), cookie-urile și 404.

- Conținutul se schimbă în `src/genereaza.mjs`, apoi `node site/src/genereaza.mjs` rescrie paginile din `public/`. Se publică ce e în `public/`.
- Stilul: `public/assets/site.css`. Fonturile Barlow sunt găzduite pe site (licență OFL), deci nu se trimite nimic la Google la încărcare.
- Măsurarea și reclamele: codurile se completează în `public/assets/config.js`. Nimic nu se încarcă înainte de acordul vizitatorului (fereastra de cookie-uri, Google Consent Mode v2).

## Publicarea, o singură dată

### 1. Aplicația pe app.conpro.ro

1. **Netlify →** site-ul aplicației (conpro-bim) **→ Domain management → Add a domain →** `app.conpro.ro`. Zona conpro.ro e deja în Netlify DNS, deci înregistrarea și certificatul HTTPS se fac singure, în câteva minute.
2. **Supabase → Authentication → URL Configuration:**
   - Site URL: `https://app.conpro.ro`;
   - Redirect URLs: adăugați `https://app.conpro.ro/**` și păstrați-l și pe cel vechi, `.netlify.app`.
3. **Supabase → Edge Functions → Secrets:** `APP_URL` = `https://app.conpro.ro`, pentru legăturile din rezumatul zilnic.
4. Adresa veche `conpro-bim.netlify.app` merge în continuare. Dacă vreți, setați `app.conpro.ro` ca domeniu principal (Set as primary), iar cea veche redirecționează singură.

### 2. Site-ul pe bim.conpro.ro

1. **Netlify → Add new site → Import an existing project → GitHub →** `conpro-bim`, apoi:
   - Branch: `main`;
   - **Base directory: `site`**;
   - Build command: gol;
   - Publish directory: `site/public`, așa cum îl completează Netlify din base.
2. **Domain management → Add a domain →** `bim.conpro.ro`.
3. **Formularul:**
   1. **Forms → Enable form detection**, apoi **Deploys → Trigger deploy**;
   2. **Forms → Form notifications → Email notification** către `office@conpro.ro`, pentru formularul `demo`.
4. **Test:** trimiteți o cerere de pe site. Trebuie să ajungeți pe pagina „Am primit cererea”, iar e-mailul vine în câteva minute. Cererile se văd și în Netlify, la Forms.

### 3. Google

1. **Google Search Console → Add property → Domain** `conpro.ro`, cu verificare prin DNS: înregistrarea TXT se adaugă în Netlify DNS.
2. **Sitemaps:** trimiteți `https://bim.conpro.ro/sitemap.xml`.
3. Puneți o legătură către `bim.conpro.ro` de pe conpro.ro, din meniu și din harta BIM.

### 4. Măsurarea și reclamele

După ce creați conturile (pașii sunt în kitul de promovare), completați codurile în `public/assets/config.js` și publicați. Conversia „Cerere demonstrație” se trimite singură de pe pagina `/multumim/`, doar dacă vizitatorul a acceptat cookie-urile de marketing sau de măsurare.
