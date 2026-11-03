-- =====================================================================
-- Conpro BIM · migrarea 0024 · Semnalul de activitate
--
-- Pe planul gratuit, Supabase suspendă proiectul după o săptămână fără
-- cereri din afară. Un job GitHub (.github/workflows/mentine-activ.yml)
-- cheamă de două ori pe săptămână funcția de mai jos, ca proiectul să
-- rămână pornit. Funcția doar întoarce ora serverului: nu citește și nu
-- scrie nicio dată din aplicație.
--
-- Se rulează o singură dată, după 0023, în Supabase → SQL Editor.
-- =====================================================================

create or replace function public.semnal_activ()
returns timestamptz language sql stable security invoker set search_path = public as $$
  select now();
$$;

revoke all on function public.semnal_activ() from public;
grant execute on function public.semnal_activ() to anon, authenticated;
