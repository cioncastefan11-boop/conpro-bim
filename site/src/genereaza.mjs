// Generează paginile statice ale site-ului de prezentare (site/public) din conținutul de mai jos.
// Rulare: node site/src/genereaza.mjs   · Paginile generate se publică așa cum sunt (Netlify, fără build).
import fs from 'node:fs';
import path from 'node:path';

const RADACINA = new URL('../public/', import.meta.url).pathname;
const DOMENIU = 'https://bim.conpro.ro';
const APP = 'https://app.conpro.ro';
const FIRMA = { nume: 'Conpro Solutions SRL', cui: '40247566', reg: 'J2018002059247', sediu: 'Str. Metalurgiei nr. 8, Baia Mare, jud. Maramureș', email: 'office@conpro.ro', telefon: '0745 667 495', tel: '+40745667495' };

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- piese comune
const MARCA_SVG = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="1" y="1" width="28" height="28" fill="none" stroke="#1c2b3a" stroke-width="2"/><path d="M1 20h28M20 20v9" stroke="#1c2b3a" stroke-width="2"/><rect x="5" y="5" width="11" height="11" fill="#f26b1d"/></svg>`;
const PAGINI_ROL = [
  { cale: '/diriginti/', nume: 'Pentru diriginți' },
  { cale: '/constructori/', nume: 'Pentru constructori' },
  { cale: '/beneficiari-publici/', nume: 'Pentru beneficiari publici' },
];

function antet(cale, demo = '#demo') {
  const linkuri = PAGINI_ROL.map(p => `<a href="${p.cale}"${p.cale === cale ? ' aria-current="page"' : ''}>${p.nume}</a>`).join('');
  return `<a class="sari" href="#continut">Sari la conținut</a>
<header class="antet"><div class="cadru">
  <a class="marca" href="/" aria-label="Conpro BIM, pagina principală">${MARCA_SVG}<span>CON<b>PRO</b> BIM</span></a>
  <nav class="meniu" aria-label="Principal">${linkuri}<a href="${APP}">Intră în aplicație</a><a class="buton principal mic" href="${demo}">Programează o demonstrație</a></nav>
  <details class="meniu-telefon"><summary>Meniu</summary><nav aria-label="Principal, telefon">${linkuri}<a href="${APP}">Intră în aplicație</a><a href="${demo}">Programează o demonstrație</a></nav></details>
</div></header>`;
}

function formular(rolImplicit = '') {
  const roluri = ['Diriginte de șantier', 'Consultant / manager de proiect', 'Constructor / RTE', 'Proiectant', 'Beneficiar public', 'Beneficiar privat / dezvoltator', 'Administrator de clădire', 'Altul'];
  return `<section class="demo" id="demo" aria-labelledby="demo-titlu"><div class="cadru">
  <div>
    <h2 id="demo-titlu">Programează o demonstrație</h2>
    <p class="lead">O oră, online, pe un proiect de exemplu sau pe unul de-al dumneavoastră.</p>
    <p>Vă arătăm drumul complet: procesul verbal confirmat, registrul, modelul colorat, recepția și Cartea tehnică. Vă contactăm ca să stabilim ora și vă trimitem oferta după ce vedem ce vă trebuie.</p>
    <p class="contact">Sau direct: <b><a href="mailto:${FIRMA.email}">${FIRMA.email}</a></b>, telefon <b><a href="tel:${FIRMA.tel}">${FIRMA.telefon}</a></b></p>
  </div>
  <form class="formular" name="demo" method="POST" action="/multumim/" data-netlify="true" netlify-honeypot="adresa-web">
    <input type="hidden" name="form-name" value="demo">
    <input type="hidden" name="pagina" value="">
    <p class="ascuns"><label>Nu completați acest câmp <input name="adresa-web" tabindex="-1" autocomplete="off"></label></p>
    <label>Numele <input name="nume" autocomplete="name" required></label>
    <label>Firma sau instituția <input name="firma" autocomplete="organization" required></label>
    <label>Rolul dumneavoastră
      <select name="rol" required><option value="">Alegeți</option>${roluri.map(r => `<option${r === rolImplicit ? ' selected' : ''}>${r}</option>`).join('')}</select>
    </label>
    <label><span class="et">Telefon <span>(opțional)</span></span><input name="telefon" type="tel" autocomplete="tel"></label>
    <label class="lat">E-mail <input name="email" type="email" autocomplete="email" required></label>
    <label class="lat"><span class="et">Despre proiect <span>(opțional: ce construiți, în ce stadiu, câți participanți)</span></span><textarea name="mesaj"></textarea></label>
    <label class="acord lat"><input type="checkbox" name="acord" value="da" required> <span>Sunt de acord ca ${FIRMA.nume} să folosească aceste date ca să mă contacteze pentru demonstrație și ofertă. Detalii în <a href="${APP}/confidentialitate">politica de confidențialitate</a>.</span></label>
    <button class="buton principal" type="submit">Trimite cererea</button>
    <p class="nota lat">Nu trimitem newslettere și nu dăm datele mai departe.</p>
  </form>
</div></section>
<script>document.querySelectorAll('input[name="pagina"]').forEach(function (i) { i.value = location.pathname; });</script>`;
}

function subsol() {
  return `<footer class="subsol"><div class="cadru">
  <div>
    <h3>${FIRMA.nume}</h3>
    <p>CUI ${FIRMA.cui} · ${FIRMA.reg}<br>${FIRMA.sediu}<br><a href="mailto:${FIRMA.email}">${FIRMA.email}</a> · <a href="tel:${FIRMA.tel}">${FIRMA.telefon}</a></p>
  </div>
  <div>
    <h3>Conpro BIM</h3>
    <ul>${PAGINI_ROL.map(p => `<li><a href="${p.cale}">${p.nume}</a></li>`).join('')}<li><a href="${APP}">Intră în aplicație</a></li><li><a href="${APP}/ghid">Ghidul pe roluri</a></li></ul>
  </div>
  <div>
    <h3>Legal</h3>
    <ul><li><a href="${APP}/confidentialitate">Politica de confidențialitate</a></li><li><a href="${APP}/termeni">Termenii de utilizare</a></li><li><a href="${APP}/acord-prelucrare">Acordul de prelucrare (art. 28 GDPR)</a></li><li><a href="/cookie-uri/">Cookie-uri</a></li><li><button class="legatura" type="button" data-setari-cookie>Setări cookie-uri</button></li></ul>
  </div>
</div></footer>`;
}

const SCHEMA_ORG = {
  '@context': 'https://schema.org', '@type': 'Organization', name: FIRMA.nume, url: 'https://conpro.ro', email: FIRMA.email, telephone: FIRMA.tel,
  taxID: `RO${FIRMA.cui}`, address: { '@type': 'PostalAddress', streetAddress: 'Str. Metalurgiei nr. 8', addressLocality: 'Baia Mare', addressRegion: 'Maramureș', addressCountry: 'RO' },
};
const SCHEMA_APP = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Conpro BIM', applicationCategory: 'BusinessApplication', operatingSystem: 'Web',
  url: DOMENIU, inLanguage: 'ro', publisher: { '@type': 'Organization', name: FIRMA.nume },
  description: 'Aplicație pentru documentarea execuției construcțiilor: procese verbale, FAM, condica de betoane, registrul dirigintelui, recepția și Cartea tehnică, legate de modelul BIM (IFC). Conformă cu Legea 169/2026 și SR EN ISO 19650.',
  featureList: ['Procese verbale de lucrări ascunse și faze determinante', 'Fișe de aprobare a materialelor (FAM)', 'Condica de betoane și încercări', 'Registrul electronic al dirigintelui și RTE', 'Model IFC colorat după starea execuției', 'Observații pe model în format BCF 2.1', 'Verificarea modelului după reguli IDS 1.0', 'Recepția la terminarea lucrărilor', 'Cartea tehnică electronică și COBie', 'EIR și BEP după ISO 19650', 'Urmărirea în timp, mentenanță și reclamații în exploatare'],
};

function pagina({ cale, titlu, descriere, corp, rol = '', faraIndex = false, conversie = false, schema = [], imagineOg = '/assets/og.png', faraDemo = false }) {
  const url = DOMENIU + cale;
  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titlu)}</title>
<meta name="description" content="${esc(descriere)}">
${faraIndex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta property="og:type" content="website">
<meta property="og:locale" content="ro_RO">
<meta property="og:site_name" content="Conpro BIM">
<meta property="og:title" content="${esc(titlu)}">
<meta property="og:description" content="${esc(descriere)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${DOMENIU}${imagineOg}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#eef0f1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/barlow-semi-condensed-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/barlow-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/config.js"></script>
<script src="/assets/site.js" defer></script>
${schema.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')}
</head>
<body${rol ? ` data-rol="${esc(rol)}"` : ''}${conversie ? ' data-conversie' : ''}>
${antet(cale, faraDemo ? '/#demo' : '#demo')}
<main id="continut">
${corp}
</main>
${faraDemo ? '' : formular(rol)}
${subsol()}
</body>
</html>
`;
}

// planșa din hero: modelul colorat, cu cartușul
function plansa(campuri, alt) {
  return `<figure class="plansa" style="margin:0">
  <div class="desen"><img src="/assets/img/model-executie.webp" width="652" height="588" alt="${esc(alt)}" fetchpriority="high"></div>
  <figcaption class="cartus">
    ${campuri.map(([e, v, cls]) => `<div${cls ? ` class="${cls}"` : ''}><small>${esc(e)}</small><strong>${v}</strong></div>`).join('')}
    <div class="lat"><small>Legenda</small><ul class="legenda">
      <li><i style="background:var(--verificat)"></i>Verificat prin PV semnat</li>
      <li><i style="background:var(--in-verificare)"></i>PV în curs</li>
      <li><i style="background:var(--executat)"></i>Executat</li>
      <li><i style="background:var(--observatie)"></i>Observație deschisă</li>
    </ul></div>
  </figcaption>
</figure>`;
}

const captura = (img, w, h, alt, titlu, text, puncte) => `<article class="captura">
  <div class="text"><h3>${titlu}</h3><p>${text}</p>${puncte ? `<ul>${puncte.map(p => `<li>${p}</li>`).join('')}</ul>` : ''}</div>
  <figure><img src="/assets/img/${img}.webp" width="${w}" height="${h}" alt="${esc(alt)}" loading="lazy"></figure>
</article>`;
const IMG = {
  pv: ['proces-verbal', 1000, 1008, 'Procesul verbal de lucrări ascunse în Conpro BIM: obiectul, descrierea, concluziile, confirmările participanților și elementele din model'],
  carte: ['cartea-tehnica', 1000, 869, 'Cartea tehnică în Conpro BIM: capitolele A–D, arhiva electronică și cerințele de predare verificate automat'],
  prez: ['prezentare-proiect', 1000, 903, 'Prezentarea unui proiect: ce așteaptă după fiecare, procesele verbale, materialele, betoanele, observațiile și predarea'],
  verif: ['verificare-model', 984, 760, 'Verificarea modelului IFC după regulile proiectului: câte elemente trec fiecare regulă și motivul celor care nu trec'],
  eir: ['eir-bep', 1000, 624, 'EIR și BEP generate din datele proiectului, cu lista de completat înainte de emitere'],
};

const functii = lista => `<div class="functii">${lista.map(([t, p, u]) => `<div><h3>${t}</h3><p>${p}</p>${u ? `<span class="unde">${u}</span>` : ''}</div>`).join('')}</div>`;

// ---------------------------------------------------------------- pagina principală
const acasa = pagina({
  cale: '/',
  titlu: 'Conpro BIM · documentele șantierului, legate de modelul BIM',
  descriere: 'Procese verbale, FAM-uri, condica de betoane, registrul dirigintelui, recepția și Cartea tehnică într-o singură aplicație, legată de modelul IFC. Conform Legii 169/2026 și SR EN ISO 19650.',
  schema: [SCHEMA_ORG, SCHEMA_APP],
  corp: `<section class="hero"><div class="cadru">
  <div>
    <h1>Șantierul, documentat pe măsură ce se construiește</h1>
    <p class="lead">Procesele verbale, FAM-urile, condica de betoane, recepția și Cartea tehnică, într-o singură aplicație legată de modelul BIM al clădirii.</p>
    <p class="sub">Pentru diriginți, constructori și beneficiari. Conform Legii 169/2026 și SR EN ISO 19650, cu formate deschise: IFC, BCF, IDS, COBie.</p>
    <div class="actiuni"><a class="buton principal" href="#demo">Programează o demonstrație</a><a class="buton" href="#roluri">Ce face pentru dumneavoastră</a></div>
  </div>
  ${plansa([['Proiect', 'BLC01 · Bloc de locuințe P+4'], ['Planșa', 'Starea execuției pe model'], ['Faza', 'Execuție', 'ascunde-mic'], ['Sursa', 'Modelul IFC, 3 discipline'], ['Actualizat', 'la fiecare PV confirmat'], ['Scara', 'întreaga clădire', 'ascunde-mic']], 'Modelul 3D al clădirii colorat după starea execuției: verde verificat prin PV semnat, galben PV în curs, albastru executat, roșu cu observație deschisă')}
</div></section>

<section class="sectiune alba" aria-labelledby="drum-titlu"><div class="cadru">
  <h2 id="drum-titlu">De la șantier la Cartea tehnică, fără să rescrieți nimic</h2>
  <p class="intro">Fiecare document se introduce o singură dată, de cine îl face. Restul se completează singur.</p>
  <ol class="drum">
    <li><h3>Constructorul convoacă</h3><p>Procesul verbal, FAM-ul sau turnarea, cu planșa din CDE și elementele din model.</p></li>
    <li><h3>Dirigintele confirmă</h3><p>Un clic pe telefon sau calculator. Confirmarea intră singură în registrul electronic.</p></li>
    <li><h3>Modelul se colorează</h3><p>Elementul devine verde când PV-ul e semnat de toți. Vedeți dintr-o privire ce e verificat.</p></li>
    <li><h3>Recepția se pregătește</h3><p>Aplicația verifică documentele de la art. 528 și arată ce mai lipsește înainte de convocare.</p></li>
    <li><h3>Cartea tehnică e gata</h3><p>Capitolele A–D, arhiva electronică și COBie se generează din tot ce s-a lucrat.</p></li>
  </ol>
</div></section>

<section class="sectiune" id="roluri" aria-labelledby="roluri-titlu"><div class="cadru">
  <h2 id="roluri-titlu">Fiecare lucrează în rolul lui</h2>
  <p class="intro">Fiecare participant vede și face doar ce ține de rolul lui, iar tot ce se face rămâne în istoric, cu autorul și data.</p>
  <div class="roluri">
    <a href="/diriginti/"><h3>Diriginți și consultanți</h3><ul><li>Confirmați PV-uri și aprobați FAM-uri dintr-un clic</li><li>Registrul electronic se completează singur</li><li>Cartea tehnică și recepția, fără dosare adunate la final</li></ul><span class="mai-mult">Ce face pentru diriginți</span></a>
    <a href="/constructori/"><h3>Constructori și RTE</h3><ul><li>PV-uri cu text propus, FAM-uri cu avizele vizibile</li><li>Condica de betoane în Excel și PDF</li><li>BEP și modele IFC pentru licitațiile cu cerințe BIM</li></ul><span class="mai-mult">Ce face pentru constructori</span></a>
    <a href="/beneficiari-publici/"><h3>Beneficiari publici</h3><ul><li>Cerințele BIM (EIR) generate pentru caietul de sarcini</li><li>Modelele primite, verificate automat</li><li>Clădirea urmărită și după recepție</li></ul><span class="mai-mult">Ce face pentru beneficiari</span></a>
  </div>
</div></section>

<section class="sectiune alba" aria-labelledby="capturi-titlu"><div class="cadru">
  <h2 id="capturi-titlu">Ce vedeți în aplicație</h2>
  <div class="capturi">
    ${captura(...IMG.prez, 'Proiectul, dintr-o privire', 'Prima pagină a fiecărui proiect arată ce așteaptă după dumneavoastră și unde sunt problemele: PV-uri contestate, materiale neconforme, livrabile întârziate, lipsuri din dosar.')}
    ${captura(...IMG.pv, 'Procesul verbal, de la convocare la semnătură', 'Constructorul îl întocmește, participanții îl confirmă în ordinea cerută de lege, iar după prima confirmare textul nu se mai poate schimba.', ['documentația de referință aleasă din CDE, cu revizia în vigoare', 'elementele din model legate de PV', 'semnătura electronică calificată, verificată la încărcare'])}
    ${captura(...IMG.verif, 'Modelul, verificat după reguli', 'Regulile de informații ale proiectului se rulează pe modelele IFC: ce proprietăți, materiale sau niveluri lipsesc și la ce elemente. Regulile se exportă ca fișier IDS, pentru proiectanți.')}
    ${captura(...IMG.carte, 'Cartea tehnică se strânge singură', 'Opisul pe capitolele A–D, arhiva electronică, manualul de mentenanță și COBie, plus lista a ce mai lipsește pentru un dosar complet.')}
  </div>
</div></section>

<section class="sectiune" aria-labelledby="conf-titlu"><div class="cadru">
  <h2 id="conf-titlu">Construită pe ce cere legea</h2>
  <p class="intro">Aplicația urmează Codul amenajării teritoriului, urbanismului și construcțiilor (Legea 169/2026, în vigoare din 25 august 2026) și standardul SR EN ISO 19650.</p>
  <div class="tabel-wrap"><table class="specificatie">
    <thead><tr><th scope="col">Cerința</th><th scope="col">Ce face aplicația</th><th scope="col">Unde</th></tr></thead>
    <tbody>
      <tr><th scope="row">Registrul electronic de evidență (art. 456, 459)</th><td>Intrările automate din PV-uri, FAM-uri, vize, încercări și recepții; intrările manuale nu se modifică și nu se șterg</td><td>Registru</td></tr>
      <tr><th scope="row">Ordinea confirmărilor la fazele determinante (art. 426)</th><td>Proiectantul primește PV-ul abia după diriginte și RTE</td><td>Procese verbale</td></tr>
      <tr><th scope="row">Recepția (art. 527–532)</th><td>Comisia, documentele de la art. 528 alin. 3 verificate automat, obiecțiile, decizia, garanția după clasa de consecințe</td><td>Recepție</td></tr>
      <tr><th scope="row">Cartea tehnică (art. 529–530)</th><td>Capitolele A–D completate automat, arhiva electronică, manualul de utilizare și mentenanță</td><td>Cartea tehnică</td></tr>
      <tr><th scope="row">Semnătura electronică calificată (art. 581, eIDAS)</th><td>Fiecare semnătură verificată la încărcare: semnatarul, certificatul, marca temporală</td><td>PV-uri, recepții</td></tr>
      <tr><th scope="row">Mediul comun de date, SR EN ISO 19650-2</th><td>Codul standard al documentelor, stările În lucru, Partajat, Publicat, Arhivat, aprobarea publicării</td><td>Documente</td></tr>
      <tr><th scope="row">Planificarea livrării, EIR și BEP (ISO 19650-2, 5.1–5.4)</th><td>Momentele de livrare, MIDP/TIDP, matricea de responsabilități, EIR și BEP generate</td><td>Documente</td></tr>
      <tr><th scope="row">Exploatarea, SR EN ISO 19650-3</th><td>Jurnalul evenimentelor, urmărirea comportării în timp, mentenanța, garanțiile, reclamațiile</td><td>Exploatare</td></tr>
      <tr><th scope="row">Formate deschise</th><td>IFC 4 (modele), BCF 2.1 (observații), IDS 1.0 (cerințe), COBie (echipamente)</td><td>Model 3D, Echipamente</td></tr>
    </tbody>
  </table></div>
</div></section>

<section class="sectiune alba" aria-labelledby="date-titlu"><div class="cadru">
  <h2 id="date-titlu">Datele rămân ale dumneavoastră</h2>
  <ul class="garantii">
    <li><b>Stocate în Uniunea Europeană</b>Baza de date și fișierele proiectelor sunt pe servere din UE (Paris).</li>
    <li><b>Acces pe roluri, verificat în baza de date</b>Fiecare vede doar proiectele în care e invitat și face doar ce ține de rolul lui.</li>
    <li><b>Istoric care nu se poate modifica</b>Cine, ce și când, pentru orice schimbare. Evidențele legale nu se șterg, se corectează prin intrări noi.</li>
    <li><b>Export complet, oricând</b>Arhiva Cărții tehnice, COBie în Excel, registrul și condica. Nu depindeți de aplicație ca să vă păstrați documentele.</li>
  </ul>
</div></section>

<section class="sectiune" aria-labelledby="faq-titlu"><div class="cadru">
  <h2 id="faq-titlu">Întrebări frecvente</h2>
  <div class="intrebari">
    <details><summary>Trebuie să știu BIM ca să folosesc aplicația?</summary><p>Nu. Procesele verbale, FAM-urile, condica, registrul, recepția și Cartea tehnică funcționează și fără model. Dacă proiectul are un model IFC, adăugați colorarea după execuție, observațiile pe model și verificarea informațiilor.</p></details>
    <details><summary>Ce programe trebuie să instalez?</summary><p>Niciunul. Aplicația se deschide în browser, pe calculator, tabletă sau telefon. Modelele IFC se pot exporta din orice program de proiectare (Revit, Archicad, Allplan, Tekla).</p></details>
    <details><summary>Se poate folosi pe un proiect deja început?</summary><p>Da. Porniți de la stadiul în care e lucrarea: încărcați documentele existente cu încărcarea multiplă și continuați cu PV-urile și FAM-urile de acum înainte.</p></details>
    <details><summary>Câte persoane pot lucra pe un proiect?</summary><p>Toată echipa: beneficiarul, dirigintele, constructorul, proiectanții, subcontractorii, laboratorul și cititorii (ISC, comisia de recepție). Fiecare intră cu contul lui, în rolul lui.</p></details>
    <details><summary>Cât costă?</summary><p>Oferta se face pe proiect sau pe firmă, după numărul de proiecte și de participanți. Programați o demonstrație și vă trimitem oferta după ce vedem ce vă trebuie.</p></details>
    <details><summary>Ce se întâmplă cu documentele după recepție?</summary><p>Cartea tehnică se descarcă oricând ca arhivă electronică. Beneficiarul sau administratorul clădirii poate continua în aplicație cu exploatarea: evenimentele, urmărirea în timp, mentenanța și garanțiile.</p></details>
  </div>
</div></section>`,
});

// ---------------------------------------------------------------- pagini pe roluri
function paginaRol({ cale, titlu, descriere, h1, lead, sub, cartus, functiiLista, capturi, rol, context = '' }) {
  return pagina({
    cale, titlu, descriere, rol, schema: [SCHEMA_APP],
    corp: `<section class="hero"><div class="cadru">
  <div>
    <h1>${h1}</h1>
    <p class="lead">${lead}</p>
    <p class="sub">${sub}</p>
    <div class="actiuni"><a class="buton principal" href="#demo">Programează o demonstrație</a><a class="buton" href="#functii">Ce face, pe scurt</a></div>
  </div>
  ${plansa(cartus, 'Modelul 3D al clădirii colorat după starea execuției, în Conpro BIM')}
</div></section>
${context}
<section class="sectiune alba" id="functii" aria-labelledby="functii-titlu"><div class="cadru">
  <h2 id="functii-titlu">Ce face aplicația pentru dumneavoastră</h2>
  ${functii(functiiLista)}
</div></section>
<section class="sectiune" aria-labelledby="capturi-titlu"><div class="cadru">
  <h2 id="capturi-titlu">Cum arată</h2>
  <div class="capturi">${capturi.join('')}</div>
</div></section>`,
  });
}

const diriginti = paginaRol({
  cale: '/diriginti/', rol: 'Diriginte de șantier',
  titlu: 'Conpro BIM pentru diriginți de șantier · registru electronic, PV-uri și Cartea tehnică',
  descriere: 'Confirmați procesele verbale și aprobați FAM-urile dintr-un clic; registrul electronic, recepția și Cartea tehnică se completează singure. Conform Legii 169/2026.',
  h1: 'Registrul și Cartea tehnică se completează singure',
  lead: 'Confirmați procesele verbale, aprobați materialele și vizați turnările din aplicație. Fiecare decizie intră în registrul electronic și în Cartea tehnică, fără să o mai scrieți încă o dată.',
  sub: 'Pentru diriginții de șantier și pentru consultanții care verifică lucrarea în numele beneficiarului.',
  cartus: [['Rolul', 'Diriginte de șantier'], ['Registru', 'art. 456 din Legea 169/2026'], ['Faza', 'Execuție', 'ascunde-mic'], ['Recepție', 'art. 527–532'], ['Cartea tehnică', 'art. 529–530'], ['Semnătură', 'eIDAS', 'ascunde-mic']],
  functiiLista: [
    ['Procesele verbale, confirmate dintr-un clic', 'Citiți descrierea și concluziile scrise de constructor, apoi confirmați, confirmați cu observații sau refuzați. La fazele determinante, proiectantul confirmă după dumneavoastră și RTE, cum cere art. 426.', 'Procese verbale'],
    ['Registrul electronic, fără dublă scriere', 'Confirmările, deciziile pe FAM, livrările, vizele și încercările intră singure. Dispozițiile de șantier, opririle și înștiințările ISC le adăugați în câteva secunde. Export Excel și tipărire.', 'Registru'],
    ['Materialele, cu tot dosarul la vedere', 'Fișa, declarația de performanță, avizul proiectantului și livrările cu lotul și documentul de însoțire. O livrare neconformă intră în registru ca neconformitate.', 'Materiale (FAM)'],
    ['Betoanele și încercările', 'Vizați turnările din condică și luați la cunoștință rezultatele. Un rezultat sub fck,cub apare evidențiat și intră în registru.', 'Betoane și încercări'],
    ['Neconformități pe model, cu termen', 'Alegeți elementul în model, deschideți observația cu captură și termen, atribuiți-o constructorului. O închideți după ce verificați remedierea.', 'Model 3D'],
    ['Recepția și Cartea tehnică, fără dosare adunate la final', 'Comisia, documentele de la art. 528 verificate automat, obiecțiile cu termen, PV-ul de recepție generat. Cartea tehnică pe capitolele A–D, cu arhiva electronică.', 'Recepție, Cartea tehnică'],
  ],
  capturi: [
    captura(...IMG.pv, 'Procesul verbal semnat', 'Confirmările fiecărui participant, cu data și ora, elementele din model și semnătura electronică calificată.'),
    captura(...IMG.carte, 'Ce mai lipsește, înainte de recepție', 'Cerințele de predare ale beneficiarului verificate automat și lista lipsurilor din dosar, cu legătura spre locul unde se rezolvă fiecare.'),
  ],
});

const constructori = paginaRol({
  cale: '/constructori/', rol: 'Constructor / RTE',
  titlu: 'Conpro BIM pentru constructori și RTE · PV-uri, FAM, condica de betoane, COBie',
  descriere: 'Convocați PV-uri cu text propus, depuneți FAM-uri, țineți condica de betoane și completați echipamentele COBie din model. BEP și IFC pentru licitațiile cu cerințe BIM.',
  h1: 'Dovada calității, pe măsură ce lucrați',
  lead: 'Procesele verbale, FAM-urile, condica de betoane și echipamentele montate, completate pe șantier, nu adunate la recepție. Vedeți oricând ce e confirmat, ce așteaptă și la cine.',
  sub: 'Pentru antreprenori generali, subcontractori și responsabili tehnici cu execuția.',
  cartus: [['Rolul', 'Constructor / RTE'], ['Condica', 'Excel și PDF'], ['Faza', 'Execuție', 'ascunde-mic'], ['Echipamente', 'COBie din modelul IFC'], ['Licitații BIM', 'BEP, IFC, BCF'], ['Registru RTE', 'art. 459', 'ascunde-mic']],
  functiiLista: [
    ['Procese verbale cu text propus', 'Alegeți tipul și obiectul, iar aplicația propune descrierea și concluziile, pe care le verificați. Participanții primesc PV-ul în „De făcut” și pe e-mail.', 'Procese verbale'],
    ['FAM-uri fără drumuri', 'Depuneți fișa cu fișa tehnică și DoP-ul, vedeți avizul proiectantului și decizia dirigintelui. Completările se fac în aceeași fișă.', 'Materiale (FAM)'],
    ['Condica de betoane, gata de predare', 'Fiecare turnare cu betonul, bonurile, temperaturile și probele; data decofrării; rezultatele încercărilor. Condica se descarcă în Excel sau PDF.', 'Betoane și încercări'],
    ['Echipamentele COBie, din model', 'Nivelurile, spațiile și echipamentele se preiau din modelul IFC dintr-un clic. Completați producătorul, seria și garanția la montaj.', 'Echipamente'],
    ['Lucrările, legate de model', 'Legați elementele de PV-uri, turnări și FAM-uri. Modelul arată verde ce e verificat, galben ce e în curs și roșu ce are observații.', 'Model 3D'],
    ['Pregătit pentru licitațiile cu cerințe BIM', 'BEP-ul se generează din echipă, planul de livrare și cerințele beneficiarului. Modelele circulă în IFC, observațiile în BCF.', 'Documente → EIR și BEP'],
  ],
  capturi: [
    captura(...IMG.prez, 'Ce așteaptă și la cine', 'PV-urile în curs, FAM-urile în avizare, turnările nevizate și obiecțiile de remediat, într-o singură pagină.'),
    captura(...IMG.pv, 'Procesul verbal, de la convocare la semnătură', 'Documentația de referință din CDE, descrierea, concluziile și confirmările, cu elementele din model legate de PV.'),
  ],
});

const beneficiari = paginaRol({
  cale: '/beneficiari-publici/', rol: 'Beneficiar public',
  titlu: 'Conpro BIM pentru beneficiari publici · cerințe BIM (EIR), verificarea modelului, Cartea tehnică',
  descriere: 'Generați cerințele BIM (EIR) pentru caietul de sarcini, verificați automat modelele primite cu IDS, urmăriți livrările și primiți Cartea tehnică electronică.',
  h1: 'Cereți BIM în caietul de sarcini și verificați ce primiți',
  lead: 'Cerințele de informații (EIR) se generează din datele proiectului, iar modelele primite se verifică automat după aceleași reguli. La recepție primiți Cartea tehnică electronică și datele pentru exploatare.',
  sub: 'Pentru primării, consilii județene, spitale, școli și alți beneficiari de investiții publice.',
  cartus: [['Rolul', 'Beneficiar public'], ['Cerințe', 'EIR și fișier IDS 1.0'], ['Standard', 'SR EN ISO 19650', 'ascunde-mic'], ['Verificare', 'automată, pe modelele IFC'], ['Predare', 'Cartea tehnică și COBie'], ['Exploatare', 'ISO 19650-3', 'ascunde-mic']],
  context: `<section class="sectiune" aria-labelledby="context-titlu"><div class="cadru">
  <h2 id="context-titlu">BIM devine obligatoriu treptat în investițiile publice</h2>
  <div class="repere">
    <p>Foaia de parcurs pentru implementarea BIM în proiectele de investiții publice, aprobată de Guvern în 2022, introduce obligativitatea progresiv. În etapa a patra, din trimestrul IV 2026 până în trimestrul IV 2028, se extind categoriile de proiecte la care BIM devine obligatoriu.</p>
    <p>Pentru un beneficiar, asta înseamnă trei lucruri: să știe ce informații să ceară, să verifice ce primește și să păstreze datele clădirii după recepție.</p>
    <p class="sursa">Sursa: <a href="https://www.agendaconstructiilor.ro/stiri/digitalizarea-in-constructii-industrie/guvernul-are-in-plan-implementarea-bim-in-proiecte-publice-pana-in-2028" rel="noopener">Agenda Construcțiilor, despre memorandumul Guvernului din septembrie 2022</a></p>
  </div>
</div></section>`,
  functiiLista: [
    ['EIR-ul, generat pentru caietul de sarcini', 'Momentele de livrare, convenția de denumire, regulile pentru model și cerințele de predare, puse într-un document ISO 19650-2 gata de atașat la documentația de atribuire.', 'Documente → EIR și BEP'],
    ['Regulile modelului, ca fișier IDS', 'Stabiliți ce proprietăți, materiale și clasificări trebuie să aibă elementele, din șabloane. Fișierul IDS 1.0 îl primesc proiectanții, ca să-și verifice singuri modelul.', 'Model 3D → Verificarea modelului'],
    ['Modelele primite, verificate automat', 'Aceleași reguli se rulează pe modelele predate: câte elemente trec și ce lipsește la fiecare. Raportul rămâne ca dovadă.', 'Model 3D → Verificarea modelului'],
    ['Livrările urmărite, nu așteptate', 'Planul de livrare arată ce document e predat, ce e în lucru și ce întârzie, pe echipe și pe momente. Publicarea pentru execuție o aprobați dumneavoastră.', 'Documente → Planul de livrare'],
    ['Recepția și Cartea tehnică electronică', 'Cerințele de predare verificate automat, comisia, obiecțiile, aprobarea recepției și Cartea tehnică pe capitole, ca arhivă.', 'Recepție, Cartea tehnică'],
    ['Clădirea, și după recepție', 'Jurnalul evenimentelor, urmărirea comportării în timp, mentenanța echipamentelor, garanțiile și reclamațiile utilizatorilor.', 'Exploatare'],
  ],
  capturi: [
    captura(...IMG.eir, 'EIR și BEP, din datele proiectului', 'Documentele se completează singure din ce există în aplicație; scrieți doar scopul și cerințele proprii. Se descarcă în PDF sau Word.'),
    captura(...IMG.verif, 'Raportul de verificare a modelului', 'Pe fiecare regulă: elementele verificate, câte trec și motivul celor care nu trec, cu elementele evidențiate în model.'),
  ],
});

// ---------------------------------------------------------------- pagini simple
const multumim = pagina({
  cale: '/multumim/', titlu: 'Cererea a fost trimisă · Conpro BIM', descriere: 'Am primit cererea de demonstrație.', faraIndex: true, conversie: true, faraDemo: true,
  corp: `<section class="pagina-text"><div class="cadru">
  <h1>Am primit cererea de demonstrație</h1>
  <p class="lead">Vă contactăm pe e-mail sau la telefon ca să stabilim ora. Dacă e urgent, scrieți-ne la <a href="mailto:${FIRMA.email}">${FIRMA.email}</a>.</p>
  <div class="actiuni"><a class="buton" href="/">Înapoi la pagina principală</a><a class="buton" href="${APP}/ghid">Citiți ghidul pe roluri</a></div>
</div></section>`,
});

const cookie = pagina({
  cale: '/cookie-uri/', titlu: 'Cookie-uri · Conpro BIM', descriere: 'Ce cookie-uri folosește site-ul Conpro BIM și cum vă schimbați alegerea.', faraDemo: true,
  corp: `<section class="pagina-text"><div class="cadru">
  <h1>Cookie-urile de pe acest site</h1>
  <p>Site-ul de prezentare bim.conpro.ro folosește cookie-uri de măsurare și de marketing doar dacă sunteți de acord. Alegerea se păstrează în browserul dumneavoastră, fără cookie, și o puteți schimba oricând.</p>
  <p><button class="buton" type="button" data-setari-cookie>Schimbă setările cookie-urilor</button></p>
  <h2>Categoriile</h2>
  <div class="tabel-simplu"><table>
    <thead><tr><th>Categoria</th><th>La ce folosește</th><th>Furnizorul</th><th>Cât se păstrează</th></tr></thead>
    <tbody>
      <tr><td>Necesare</td><td>Țin minte alegerea dumneavoastră despre cookie-uri (stocare locală în browser, nu cookie)</td><td>${FIRMA.nume}</td><td>până o ștergeți</td></tr>
      <tr><td>Măsurare</td><td>Numărul de vizitatori, paginile văzute, de unde vin (cookie-urile <code>_ga</code>, <code>_ga_*</code>)</td><td>Google Ireland Ltd. (Google Analytics)</td><td>până la 2 ani</td></tr>
      <tr><td>Marketing</td><td>Ce reclame aduc cereri de demonstrație și afișarea reclamelor către vizitatorii site-ului (cookie-urile <code>_gcl_*</code>, <code>_fbp</code>, <code>li_*</code>, <code>bcookie</code>)</td><td>Google Ireland Ltd. (Google Ads), Meta Platforms Ireland Ltd., LinkedIn Ireland Unlimited Company</td><td>de la 3 luni la 2 ani, după furnizor</td></tr>
    </tbody>
  </table></div>
  <p>Aplicația Conpro BIM (app.conpro.ro) nu folosește cookie-uri de măsurare sau de marketing; păstrează doar sesiunea de autentificare.</p>
  <p>Despre prelucrarea datelor personale, inclusiv drepturile dumneavoastră, citiți <a href="${APP}/confidentialitate">politica de confidențialitate</a>. Întrebări: <a href="mailto:${FIRMA.email}">${FIRMA.email}</a>.</p>
</div></section>`,
});

const p404 = pagina({
  cale: '/404.html', titlu: 'Pagina nu există · Conpro BIM', descriere: 'Pagina căutată nu există.', faraIndex: true, faraDemo: true,
  corp: `<section class="pagina-text"><div class="cadru">
  <h1>Pagina nu există</h1>
  <p class="lead">Adresa a fost scrisă greșit sau pagina a fost mutată. Căutați aplicația? Intrați la <a href="${APP}">app.conpro.ro</a>.</p>
  <div class="actiuni"><a class="buton principal" href="/">Pagina principală</a></div>
</div></section>`,
});

// ---------------------------------------------------------------- scrierea fișierelor
const fisiere = { 'index.html': acasa, 'diriginti/index.html': diriginti, 'constructori/index.html': constructori, 'beneficiari-publici/index.html': beneficiari, 'multumim/index.html': multumim, 'cookie-uri/index.html': cookie, '404.html': p404 };
for (const [f, c] of Object.entries(fisiere)) { fs.mkdirSync(path.dirname(RADACINA + f), { recursive: true }); fs.writeFileSync(RADACINA + f, c); }

const azi = new Date().toISOString().slice(0, 10);
fs.writeFileSync(RADACINA + 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/diriginti/', '/constructori/', '/beneficiari-publici/', '/cookie-uri/'].map(u => `  <url><loc>${DOMENIU}${u}</loc><lastmod>${azi}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(RADACINA + 'robots.txt', `User-agent: *\nAllow: /\nDisallow: /multumim/\n\nSitemap: ${DOMENIU}/sitemap.xml\n`);
fs.writeFileSync(RADACINA + 'favicon.svg', MARCA_SVG.replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"').replace('<rect x="1"', '<rect x="0" y="0" width="30" height="30" fill="#eef0f1"/><rect x="1"'));
console.log('Generate:', Object.keys(fisiere).length, 'pagini + sitemap.xml, robots.txt, favicon.svg');
