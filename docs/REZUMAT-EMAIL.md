# Activarea rezumatului zilnic pe e-mail

În fiecare dimineață lucrătoare, fiecare persoană care are ceva de făcut în proiecte (și nu a oprit
rezumatul din Profil) primește un e-mail cu lista, cu legături direct în aplicație. Se face o singură dată.

## 1. Contul Resend (serviciul care trimite e-mailurile)
1. Faceți cont pe https://resend.com (planul gratuit ajunge pentru început).
2. **Domains → Add domain**: adăugați domeniul de pe care pleacă e-mailurile (ex. `conpro.ro`) și puneți
   la firma de domenii înregistrările DNS pe care vi le arată Resend. Așteptați să apară „Verified”.
3. **API Keys → Create API key** (drept „Sending access”). Copiați cheia; nu o trimiteți nimănui.

## 2. Funcția în Supabase
1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Numele: `rezumat-zilnic`. Lipiți tot conținutul fișierului `supabase/functions/rezumat-zilnic/index.ts`
   și apăsați **Deploy**.
3. În detaliile funcției, opriți **Verify JWT** (funcția își verifică singură secretul din pasul 3).
4. **Edge Functions → Secrets** (sau Settings → Edge Functions): adăugați
   - `RESEND_API_KEY` = cheia din Resend
   - `EMAIL_EXPEDITOR` = ex. `Conpro BIM <notificari@conpro.ro>` (pe domeniul verificat)
   - `APP_URL` = `https://conpro-bim.netlify.app`
   - `REZUMAT_SECRET` = un text lung, inventat de dumneavoastră (ex. 40 de litere și cifre la întâmplare)

## 3. Programarea zilnică
Supabase → **SQL Editor → New query**, înlocuiți `TEXTUL_DIN_REZUMAT_SECRET` cu același text de la pasul 2 și apăsați **Run**:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- secretele stau în Vault, nu în textul programării
select vault.create_secret('https://xebjeqajxdxawtnlyquv.supabase.co', 'project_url');
select vault.create_secret('TEXTUL_DIN_REZUMAT_SECRET', 'rezumat_secret');

-- de luni până vineri la 05:00 UTC = 07:00 ora României iarna (08:00 vara)
select cron.schedule('rezumat-zilnic', '0 5 * * 1-5', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/rezumat-zilnic',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-rezumat-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rezumat_secret')),
    body := '{}'::jsonb);
$$);
```

## 4. Probă
Rulați o dată, imediat, aceeași cerere (fără programare):

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/rezumat-zilnic',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-rezumat-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rezumat_secret')),
  body := '{}'::jsonb);
```

Rezultatul apare în Supabase → Edge Functions → `rezumat-zilnic` → **Logs** (câte e-mailuri au plecat și eventualele erori,
de exemplu „domeniu neverificat”). Cine are ceva de făcut ar trebui să primească e-mailul în câteva secunde.

Oprirea pentru toată lumea: `select cron.unschedule('rezumat-zilnic');`
