-- =====================================================================
-- Conpro BIM · migrarea 0019 · Legăturile cu modelul și starea execuției
--
-- Harta BIM, liniile PV, MAT și IFC: fiecare proces verbal (lucrări ascunse,
-- faze determinante, probe), fiecare turnare din condica de betoane și fiecare
-- FAM se leagă de elementele din modelul IFC pe care le privește (după
-- GlobalId). Din legături și din observațiile deschise, aplicația colorează
-- modelul: verificat (PV semnat), în verificare, executat, cu observație.
-- Constructorul poate marca elementele executate și fără PV sau turnare.
--
-- Se rulează o singură dată, după 0018, în Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.elemente_legate (
  id           uuid primary key default gen_random_uuid(),
  proiect_id   uuid not null references public.proiecte(id) on delete cascade,
  entitate     text not null check (entitate in ('pv', 'turnare', 'fam')),
  entitate_id  uuid not null,
  guid         text not null check (length(guid) between 1 and 64),   -- IfcGloballyUniqueId
  nume         text,
  clasa        text,
  creat_de     uuid not null default auth.uid() references public.persoane(id),
  creat_la     timestamptz not null default now(),
  unique (entitate, entitate_id, guid)
);
create index if not exists elemente_legate_proiect on public.elemente_legate (proiect_id, guid);
create index if not exists elemente_legate_entitate on public.elemente_legate (entitate, entitate_id);

-- cine leagă ce: PV-urile — dirigintele, constructorul, subcontractorul, proiectantul;
-- turnările — constructorul, subcontractorul, dirigintele; FAM-urile — și proiectantul
create or replace function public.poate_lega(p_entitate text, p_id uuid, p_proiect uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_entitate = 'pv' then
    return exists (select 1 from procese_verbale where id = p_id and proiect_id = p_proiect and stare <> 'anulat')
       and public.are_rol(p_proiect, array['diriginte','constructor','subcontractor','proiectant','administrator']::rol_proiect[]);
  elsif p_entitate = 'turnare' then
    return exists (select 1 from turnari where id = p_id and proiect_id = p_proiect)
       and public.are_rol(p_proiect, array['diriginte','constructor','subcontractor','administrator']::rol_proiect[]);
  elsif p_entitate = 'fam' then
    return exists (select 1 from fam where id = p_id and proiect_id = p_proiect)
       and public.are_rol(p_proiect, array['diriginte','constructor','subcontractor','proiectant','administrator']::rol_proiect[]);
  end if;
  return false;
end $$;

create or replace function public.legatura_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.poate_lega(new.entitate, new.entitate_id, new.proiect_id) then
    raise exception 'Nu puteți lega elemente de acest document (rolul nu permite sau documentul nu e în proiect).';
  end if;
  new.guid := trim(new.guid); new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;
drop trigger if exists legatura_verificare on public.elemente_legate;
create trigger legatura_verificare before insert on public.elemente_legate
  for each row execute function public.legatura_verifica();

-- elementele marcate executate de constructor (fără PV sau turnare)
create table if not exists public.elemente_executate (
  proiect_id   uuid not null references public.proiecte(id) on delete cascade,
  guid         text not null check (length(guid) between 1 and 64),
  nume         text,
  executat_la  date not null default current_date,
  creat_de     uuid not null default auth.uid() references public.persoane(id),
  creat_la     timestamptz not null default now(),
  primary key (proiect_id, guid)
);

create or replace function public.executat_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.are_rol(new.proiect_id, array['constructor','subcontractor','diriginte']::rol_proiect[]) then
    raise exception 'Elementele executate le marchează constructorul, subcontractorul sau dirigintele.';
  end if;
  if new.executat_la > current_date then raise exception 'Data execuției nu poate fi în viitor.'; end if;
  new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;
drop trigger if exists executat_verificare on public.elemente_executate;
create trigger executat_verificare before insert on public.elemente_executate
  for each row execute function public.executat_verifica();

-- jurnalul: cine a legat / dezlegat, cine a marcat executat
drop trigger if exists jurnal_elemente_legate on public.elemente_legate;
create trigger jurnal_elemente_legate after insert or delete on public.elemente_legate
  for each row execute function public.scrie_jurnal();
drop trigger if exists jurnal_elemente_executate on public.elemente_executate;
create trigger jurnal_elemente_executate after insert or delete on public.elemente_executate
  for each row execute function public.scrie_jurnal();

alter table public.elemente_legate enable row level security;
alter table public.elemente_executate enable row level security;
drop policy if exists legate_citire on public.elemente_legate;
create policy legate_citire on public.elemente_legate for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists legate_creare on public.elemente_legate;
create policy legate_creare on public.elemente_legate for insert to authenticated with check (public.este_membru(proiect_id));
-- o legătură greșită o șterge cel care a făcut-o sau dirigintele; după semnarea PV-ului, doar dirigintele
drop policy if exists legate_stergere on public.elemente_legate;
create policy legate_stergere on public.elemente_legate for delete to authenticated
  using (public.are_rol(proiect_id, array['diriginte']::public.rol_proiect[])
         or (creat_de = auth.uid() and not (entitate = 'pv' and exists (select 1 from public.procese_verbale v where v.id = entitate_id and v.stare = 'semnat'))));
drop policy if exists executate_citire on public.elemente_executate;
create policy executate_citire on public.elemente_executate for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists executate_creare on public.elemente_executate;
create policy executate_creare on public.elemente_executate for insert to authenticated with check (public.este_membru(proiect_id));
drop policy if exists executate_stergere on public.elemente_executate;
create policy executate_stergere on public.elemente_executate for delete to authenticated
  using (creat_de = auth.uid() or public.are_rol(proiect_id, array['diriginte']::public.rol_proiect[]));

revoke all on public.elemente_legate, public.elemente_executate from anon, authenticated;
grant select, delete on public.elemente_legate, public.elemente_executate to authenticated;
grant insert (id, proiect_id, entitate, entitate_id, guid, nume, clasa) on public.elemente_legate to authenticated;
grant insert (proiect_id, guid, nume, executat_la) on public.elemente_executate to authenticated;
revoke execute on function public.poate_lega(text, uuid, uuid) from public, anon;
grant execute on function public.poate_lega(text, uuid, uuid) to authenticated;
