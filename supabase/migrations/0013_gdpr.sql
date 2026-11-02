-- =====================================================================
-- Conpro BIM · migrarea 0013 · Termenii acceptați și datele personale (GDPR)
--
-- 1. Se păstrează ce versiune a termenilor și a politicii de confidențialitate
--    a acceptat fiecare persoană și când (art. 7 alin. 1 GDPR: operatorul
--    trebuie să poată demonstra informarea / acordul).
--    La cont nou, versiunea vine din formularul de înregistrare; conturile
--    existente acceptă la prima intrare după publicarea unei versiuni noi.
-- 2. „Descarcă datele mele”: dreptul de acces și la portabilitate
--    (art. 15 și 20 GDPR), pentru datele personale ale celui care cere.
--
-- Se rulează o singură dată, după 0012, în Supabase → SQL Editor.
-- =====================================================================

alter table public.persoane add column if not exists termeni_versiune text;
alter table public.persoane add column if not exists termeni_acceptati_la timestamptz;

-- profilul la cont nou: numele și, dacă vin din formular, termenii acceptați
create or replace function public.creeaza_persoana()
returns trigger language plpgsql security definer set search_path = public as $$
declare v text := nullif(trim(new.raw_user_meta_data->>'termeni_versiune'), '');
begin
  insert into public.persoane (id, email, nume, termeni_versiune, termeni_acceptati_la)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'nume', ''),
          left(v, 20), case when v is not null then now() end)
  on conflict (id) do nothing;
  return new;
end $$;

-- acceptarea unei versiuni noi (momentul îl pune serverul, nu browserul)
create or replace function public.accepta_termenii(versiune text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Intrați în cont.'; end if;
  if versiune is null or versiune !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Versiunea termenilor nu e validă.';
  end if;
  update persoane set termeni_versiune = versiune, termeni_acceptati_la = now() where id = auth.uid();
end $$;

-- datele personale ale celui care cere, într-un singur fișier JSON
create or replace function public.datele_mele()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generat_la', now(),
    'persoana', (select to_jsonb(p) - 'id' from persoane p where p.id = auth.uid()),
    'cont', (select jsonb_build_object('email', u.email, 'email_confirmat_la', u.email_confirmed_at) from auth.users u where u.id = auth.uid()),
    'firma', (select to_jsonb(f) from firme f join persoane p on p.firma_id = f.id where p.id = auth.uid()),
    'documente_personale', coalesce((select jsonb_agg(to_jsonb(d) - 'persoana_id' order by d.creat_la) from documente_persoana d where d.persoana_id = auth.uid()), '[]'),
    'proiecte', coalesce((select jsonb_agg(jsonb_build_object('cod', pr.cod, 'denumire', pr.denumire, 'rol', m.rol, 'adaugat_la', m.adaugat_la) order by m.adaugat_la)
                          from membri_proiect m join proiecte pr on pr.id = m.proiect_id where m.persoana_id = auth.uid()), '[]'),
    'actiuni_in_istoric', coalesce((select jsonb_agg(jsonb_build_object('la', j.la, 'proiect', pr.cod, 'tabel', j.tabel, 'operatie', j.operatie) order by j.la)
                          from jurnal j left join proiecte pr on pr.id = j.proiect_id where j.autor = auth.uid()), '[]')
  ) where auth.uid() is not null;
$$;

revoke execute on function public.accepta_termenii(text) from public, anon;
revoke execute on function public.datele_mele() from public, anon;
grant execute on function public.accepta_termenii(text) to authenticated;
grant execute on function public.datele_mele() to authenticated;
-- termeni_versiune și termeni_acceptati_la nu au grant de update: se schimbă doar prin accepta_termenii()
