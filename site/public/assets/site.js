// Consimțământul pentru cookie-uri (GDPR și Legea 506/2004) și încărcarea instrumentelor de măsurare doar după acord.
(function () {
  'use strict';
  var CHEIE = 'conpro-consimtamant';
  var VERSIUNE = 1;
  var cfg = window.CONPRO_CONFIG || {};
  var incarcate = {};

  function citeste() {
    try { var v = JSON.parse(localStorage.getItem(CHEIE) || 'null'); return v && v.v === VERSIUNE ? v : null; } catch (e) { return null; }
  }
  function scrie(masurare, marketing) {
    var v = { v: VERSIUNE, masurare: !!masurare, marketing: !!marketing, data: new Date().toISOString() };
    try { localStorage.setItem(CHEIE, JSON.stringify(v)); } catch (e) { /* fără stocare: întrebăm din nou data viitoare */ }
    return v;
  }
  function script(src, id) {
    if (incarcate[id]) return; incarcate[id] = true;
    var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s);
  }

  // Google (Analytics și Ads) cu Consent Mode v2: implicit totul refuzat
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });

  function aplica(c) {
    if (!c) return;
    window.gtag('consent', 'update', {
      analytics_storage: c.masurare ? 'granted' : 'denied',
      ad_storage: c.marketing ? 'granted' : 'denied', ad_user_data: c.marketing ? 'granted' : 'denied', ad_personalization: c.marketing ? 'granted' : 'denied',
    });
    var google = (c.masurare && cfg.ga4) || (c.marketing && cfg.googleAds);
    if (google) {
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4 || cfg.googleAds), 'gtag');
      if (!incarcate.gtagCfg) {
        incarcate.gtagCfg = true;
        window.gtag('js', new Date());
        if (cfg.ga4 && c.masurare) window.gtag('config', cfg.ga4, { anonymize_ip: true });
        if (cfg.googleAds && c.marketing) window.gtag('config', cfg.googleAds);
      }
    }
    if (c.marketing && cfg.metaPixel && !incarcate.meta) {
      incarcate.meta = true;
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', cfg.metaPixel); window.fbq('track', 'PageView');
    }
    if (c.marketing && cfg.linkedinPartener && !incarcate.linkedin) {
      incarcate.linkedin = true;
      window._linkedin_partner_id = cfg.linkedinPartener;
      window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
      window._linkedin_data_partner_ids.push(cfg.linkedinPartener);
      window.lintrk = window.lintrk || function (a, b) { window.lintrk.q.push([a, b]); }; window.lintrk.q = window.lintrk.q || [];
      script('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'linkedin-js');
    }
  }

  // cererea de demonstrație trimisă: conversia, pe pagina de mulțumire
  function conversie() {
    var c = citeste(); if (!c) return;
    if (c.masurare && cfg.ga4) window.gtag('event', 'generate_lead', { form: 'demo' });
    if (c.marketing && cfg.googleAds && cfg.googleAdsEticheta) window.gtag('event', 'conversion', { send_to: cfg.googleAds + '/' + cfg.googleAdsEticheta });
    if (c.marketing && window.fbq) window.fbq('track', 'Lead');
    if (c.marketing && cfg.linkedinConversie && window.lintrk) window.lintrk('track', { conversion_id: Number(cfg.linkedinConversie) });
  }

  function fereastra(cuOptiuni) {
    var vechi = document.getElementById('consimtamant'); if (vechi) vechi.remove();
    var c = citeste() || { masurare: false, marketing: false };
    var d = document.createElement('section');
    d.id = 'consimtamant'; d.className = 'consimtamant'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-labelledby', 'consimtamant-titlu');
    d.innerHTML =
      '<h2 id="consimtamant-titlu">Cookie-uri</h2>' +
      '<p>Folosim cookie-uri doar dacă sunteți de acord: pentru a măsura câte persoane vizitează site-ul și pentru a vedea ce reclame aduc cereri de demonstrație. Site-ul funcționează la fel și dacă refuzați. <a href="/cookie-uri/">Detalii</a></p>' +
      (cuOptiuni ? '<div class="optiuni">' +
        '<label><input type="checkbox" checked disabled> Necesare: țin minte alegerea dumneavoastră (fără cookie, în browser)</label>' +
        '<label><input type="checkbox" id="c-masurare"' + (c.masurare ? ' checked' : '') + '> Măsurare: Google Analytics, statistici de vizitare</label>' +
        '<label><input type="checkbox" id="c-marketing"' + (c.marketing ? ' checked' : '') + '> Marketing: Google Ads, Meta și LinkedIn, măsurarea reclamelor</label>' +
        '</div>' : '') +
      '<div class="butoane">' +
        '<button class="buton principal" data-c="toate">Accept toate</button>' +
        '<button class="buton" data-c="refuz">Refuz</button>' +
        (cuOptiuni ? '<button class="buton" data-c="alese">Salvează alegerea</button>' : '<button class="buton" data-c="aleg">Aleg eu</button>') +
      '</div>';
    document.body.appendChild(d);
    d.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-c]'); if (!b) return;
      var k = b.getAttribute('data-c');
      if (k === 'aleg') { fereastra(true); return; }
      var v = k === 'toate' ? scrie(true, true) : k === 'refuz' ? scrie(false, false)
        : scrie(document.getElementById('c-masurare').checked, document.getElementById('c-marketing').checked);
      d.remove(); aplica(v);
      // retragerea acordului: instrumentele deja încărcate se opresc la reîncărcarea paginii
      if ((!v.masurare || !v.marketing) && (incarcate.gtag || incarcate.meta || incarcate.linkedin)) location.reload();
    });
    var primul = d.querySelector('button'); if (primul && cuOptiuni) primul.focus();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var c = citeste();
    if (c) aplica(c); else fereastra(false);
    document.querySelectorAll('[data-setari-cookie]').forEach(function (b) { b.addEventListener('click', function () { fereastra(true); }); });
    if (document.body.hasAttribute('data-conversie')) setTimeout(conversie, 1200);
    // formularul: rolul ales din pagina de rol vine completat
    var rol = document.body.getAttribute('data-rol');
    var sel = document.querySelector('select[name="rol"]');
    if (rol && sel) sel.value = rol;
  });
})();
