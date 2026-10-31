export default function Configurare() {
  return (
    <div className="pagina-centru">
      <div className="card ingust">
        <h1>Aplicația nu e legată de baza de date</h1>
        <p>Lipsesc adresa proiectului Supabase și cheia publică.</p>
        <ol>
          <li>În Supabase deschideți <b>Project Settings → API</b>.</li>
          <li>În Netlify, la <b>Site configuration → Environment variables</b>, adăugați
            <code>VITE_SUPABASE_URL</code> și <code>VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Publicați din nou site-ul (<b>Deploys → Trigger deploy</b>).</li>
        </ol>
        <p className="nota">Folosiți doar cheia publică (anon / publishable), niciodată cheia service_role.</p>
      </div>
    </div>
  );
}
