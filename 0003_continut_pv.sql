-- =====================================================================
-- Conpro BIM · migrarea 0003 · Conținutul și concluziile PV-ului
--
-- Fiecare proces verbal are descrierea lucrărilor executate, referințele
-- la proiect și concluziile. Le completează constructorul (RTE) sau cine
-- a convocat PV-ul. Fără ele, nimeni nu poate confirma. După prima
-- confirmare, textul se blochează: toți confirmă același conținut.
--
-- Se rulează o singură dată, după 0002, în Supabase → SQL Editor.
-- =====================================================================

alter table public.procese_verbale
  add column if not exists descriere_lucrari text,
  add column if not exists referinte_proiect text,
  add column if not exists concluzii text,
  add column if not exists completat_de uuid references public.persoane(id),
  add column if not exists completat_la timestamptz;

create or replace function public.completeaza_pv(p_pv uuid, p_descriere text, p_referinte text, p_concluzii text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pv procese_verbale%rowtype;
begin
  select * into v_pv from procese_verbale where id = p_pv for update;
  if not found then raise exception 'Procesul verbal nu există.'; end if;
  if not (v_pv.convocat_de = auth.uid()
          or exists (select 1 from participanti_pv
                     where pv_id = p_pv and persoana_id = auth.uid() and rol = 'constructor')) then
    raise exception 'Conținutul PV-ului îl completează constructorul (RTE) sau cine l-a convocat.';
  end if;
  if v_pv.stare <> 'convocat'
     or exists (select 1 from participanti_pv where pv_id = p_pv and confirmat_la is not null) then
    raise exception 'Procesul verbal are deja confirmări. Conținutul nu se mai modifică; dacă e greșit, PV-ul se anulează și se convoacă altul.';
  end if;
  if coalesce(length(trim(p_descriere)), 0) < 10 then
    raise exception 'Descrieți pe scurt lucrările executate (cel puțin o propoziție).';
  end if;
  if coalesce(length(trim(p_concluzii)), 0) < 10 then
    raise exception 'Scrieți concluziile procesului verbal.';
  end if;
  update procese_verbale
     set descriere_lucrari = trim(p_descriere),
         referinte_proiect = nullif(trim(p_referinte), ''),
         concluzii = trim(p_concluzii),
         completat_de = auth.uid(),
         completat_la = now()
   where id = p_pv;
end $$;

-- Nicio confirmare fără conținut
create or replace function public.cere_continut_pv()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.confirmat_la is null and new.confirmat_la is not null
     and exists (select 1 from procese_verbale
                 where id = new.pv_id and (descriere_lucrari is null or concluzii is null)) then
    raise exception 'Procesul verbal nu are încă descrierea lucrărilor și concluziile. Le completează constructorul (RTE) înainte de confirmări.';
  end if;
  return new;
end $$;

drop trigger if exists confirmare_cere_continut on public.participanti_pv;
create trigger confirmare_cere_continut
  before update on public.participanti_pv
  for each row execute function public.cere_continut_pv();

revoke execute on function public.completeaza_pv(uuid, text, text, text) from public, anon;
grant execute on function public.completeaza_pv(uuid, text, text, text) to authenticated;
