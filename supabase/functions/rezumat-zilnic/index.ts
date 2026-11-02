// Conpro BIM · funcția Edge „rezumat-zilnic”
//
// În fiecare dimineață lucrătoare trimite pe e-mail fiecărei persoane care are ceva de făcut
// (și nu a oprit rezumatul din Profil) lista sarcinilor din toate proiectele, cu legături.
// E-mailurile pleacă prin Resend (https://resend.com).
//
// Secrete (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   cheia API din contul Resend
//   EMAIL_EXPEDITOR  ex. "Conpro BIM <notificari@conpro.ro>" (domeniu verificat în Resend)
//   APP_URL          ex. https://conpro-bim.netlify.app
//   REZUMAT_SECRET   un text lung, ales de dumneavoastră; programarea zilnică îl trimite în antet
// SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY le pune Supabase singur.
//
// Fișierul nu are dependențe, ca să poată fi lipit direct în editorul din panoul Supabase.

export type Sarcina = { proiect_id: string; cod_proiect: string; denumire_proiect: string; tip: string; titlu: string; cale: string; din: string | null };
export type Persoana = { id: string; nume: string; email: string };

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Subiectul și corpul e-mailului pentru o persoană. */
export function compuneRezumat(p: Persoana, sarcini: Sarcina[], appUrl: string): { subiect: string; html: string; text: string } {
  const n = sarcini.length;
  const subiect = `Conpro BIM: ${n} ${n === 1 ? 'lucru de făcut' : 'lucruri de făcut'} azi`;
  const proiecte = [...new Map(sarcini.map(s => [s.proiect_id, s])).values()];
  const url = appUrl.replace(/\/$/, '');
  let html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px">
<p style="font-size:18px;font-weight:bold;margin:0 0 4px">Bună dimineața${p.nume ? `, ${esc(p.nume)}` : ''}!</p>
<p style="color:#64748b;margin:0 0 16px">Aveți ${n} ${n === 1 ? 'lucru' : 'lucruri'} de făcut în Conpro BIM:</p>`;
  let text = `Bună dimineața${p.nume ? `, ${p.nume}` : ''}!\nAveți ${n} ${n === 1 ? 'lucru' : 'lucruri'} de făcut în Conpro BIM:\n`;
  for (const pr of proiecte) {
    const ale = sarcini.filter(s => s.proiect_id === pr.proiect_id);
    html += `<p style="margin:16px 0 6px;font-weight:bold"><span style="background:#0f172a;color:#fff;border-radius:4px;padding:2px 6px;font-family:monospace">${esc(pr.cod_proiect)}</span> ${esc(pr.denumire_proiect)}</p><ul style="margin:0;padding-left:18px">`;
    text += `\n${pr.cod_proiect} · ${pr.denumire_proiect}\n`;
    for (const s of ale) {
      const link = `${url}/proiect/${s.proiect_id}/${s.cale}`;
      html += `<li style="margin:4px 0"><a href="${esc(link)}" style="color:#c2410c">${esc(s.titlu)}</a></li>`;
      text += `- ${s.titlu}: ${link}\n`;
    }
    html += '</ul>';
  }
  html += `<p style="margin:20px 0 0"><a href="${esc(url)}/de-facut" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Deschide lista De făcut</a></p>
<p style="color:#94a3b8;font-size:12px;margin-top:24px">Primiți acest rezumat pentru că sunteți membru în proiecte Conpro BIM. Îl puteți opri din Profil.</p></div>`;
  text += `\nLista completă: ${url}/de-facut\nRezumatul se poate opri din Profil.\n`;
  return { subiect, html, text };
}

type Env = { get(k: string): string | undefined };

/** Trimite rezumatele; întoarce câte au plecat și câte au eșuat. */
export async function trimiteRezumate(env: Env, f: typeof fetch = fetch): Promise<{ trimise: number; erori: string[]; persoane: number }> {
  const sb = env.get('SUPABASE_URL')!, cheie = env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const h = { apikey: cheie, Authorization: `Bearer ${cheie}`, 'Content-Type': 'application/json' };
  const r = await f(`${sb}/rest/v1/persoane?select=id,nume,email&rezumat_zilnic=eq.true`, { headers: h });
  if (!r.ok) throw new Error(`Persoanele nu au putut fi citite: ${r.status}`);
  const persoane = (await r.json()) as Persoana[];
  let trimise = 0; const erori: string[] = [];
  for (const p of persoane) {
    const rs = await f(`${sb}/rest/v1/rpc/sarcini_persoana`, { method: 'POST', headers: h, body: JSON.stringify({ p: p.id }) });
    if (!rs.ok) { erori.push(`${p.email}: sarcinile nu au putut fi citite (${rs.status})`); continue; }
    const sarcini = (await rs.json()) as Sarcina[];
    if (!sarcini.length) continue;
    const { subiect, html, text } = compuneRezumat(p, sarcini, env.get('APP_URL') ?? '');
    const e = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.get('EMAIL_EXPEDITOR'), to: [p.email], subject: subiect, html, text }),
    });
    if (e.ok) trimise++; else erori.push(`${p.email}: ${e.status} ${await e.text()}`);
  }
  return { trimise, erori, persoane: persoane.length };
}

// Pornirea funcției în Supabase (Deno). Acceptă doar apelurile care au secretul programării.
const deno = (globalThis as { Deno?: { env: Env; serve(h: (req: Request) => Response | Promise<Response>): void } }).Deno;
if (deno) {
  deno.serve(async req => {
    const secret = deno.env.get('REZUMAT_SECRET');
    if (!secret || req.headers.get('x-rezumat-secret') !== secret) return new Response('Neautorizat', { status: 401 });
    try {
      const rez = await trimiteRezumate(deno.env);
      return new Response(JSON.stringify(rez), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ eroare: (e as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  });
}
