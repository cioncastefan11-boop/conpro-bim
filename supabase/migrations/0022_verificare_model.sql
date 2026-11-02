-- =====================================================================
-- Conpro BIM · migrarea 0022 · Verificarea modelului după cerințe (IDS)
--
-- 1. Regulile de informații pentru model: ce trebuie să aibă elementele
--    unei clase IFC (un atribut completat, o proprietate dintr-un set,
--    o clasificare, un material, nivelul). Sunt cerințele de informații
--    din EIR (ISO 19650-2, 5.2.1) scrise așa încât să le verifice
--    calculatorul; se exportă ca fișier IDS 1.0 (buildingSMART) pentru
--    proiectanți și pentru alte programe (Solibri, BIMcollab, Revit...).
--    Le stabilesc beneficiarul, administratorul proiectului sau dirigintele.
-- 2. Rapoartele de verificare: rezultatul rulării regulilor pe modelele
--    deschise, păstrat ca dovadă (cine, când, ce modele, câte elemente
--    trec / nu trec la fiecare regulă). Nu se mai modifică după salvare.
--
-- Se rulează o singură dată, după 0021, în Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.reguli_model (
  id            uuid primary key default gen_random_uuid(),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  denumire      text not null check (length(trim(denumire)) > 2),
  clasa         text not null check (clasa ~ '^IFC[A-Z]+$'),     -- ex. IFCWALL; include și subtipurile
  predefinit    text,                                              -- PredefinedType (opțional)
  tip_cerinta   text not null check (tip_cerinta in ('atribut', 'proprietate', 'clasificare', 'material', 'nivel')),
  pset          text,                                              -- la proprietate: setul (ex. Pset_WallCommon)
  proprietate   text,                                              -- la atribut: Name/Description/ObjectType/Tag; la proprietate: numele
  valoare       text,                                              -- valoarea cerută (gol = doar să existe); la clasificare: sistemul
  obligatorie   boolean not null default true,
  sursa         text not null default 'EIR' check (sursa in ('EIR', 'AIR', 'BEP', 'normativ')),
  ordine        integer not null default 0,
  creat_de      uuid not null default auth.uid() references public.persoane(id),
  creat_la      timestamptz not null default now(),
  constraint regula_completa check (
    (tip_cerinta = 'atribut' and proprietate in ('Name', 'Description', 'ObjectType', 'Tag', 'LongName'))
    or (tip_cerinta = 'proprietate' and length(trim(coalesce(pset, ''))) > 0 and length(trim(coalesce(proprietate, ''))) > 0)
    or tip_cerinta in ('clasificare', 'material', 'nivel'))
);
create index if not exists reguli_model_proiect on public.reguli_model (proiect_id, ordine);

create or replace function public.regula_model_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.are_rol(new.proiect_id, array['administrator','beneficiar','diriginte']::rol_proiect[]) then
    raise exception 'Regulile modelului le stabilesc beneficiarul, administratorul proiectului sau dirigintele.';
  end if;
  if tg_op = 'INSERT' then new.creat_de := auth.uid(); new.creat_la := now();
  else new.proiect_id := old.proiect_id; new.creat_de := old.creat_de; new.creat_la := old.creat_la; end if;
  new.clasa := upper(trim(new.clasa));
  new.predefinit := nullif(upper(trim(coalesce(new.predefinit, ''))), '');
  new.pset := nullif(trim(coalesce(new.pset, '')), '');
  new.proprietate := nullif(trim(coalesce(new.proprietate, '')), '');
  new.valoare := nullif(trim(coalesce(new.valoare, '')), '');
  return new;
end $$;
drop trigger if exists regula_model_verificare on public.reguli_model;
create trigger regula_model_verificare before insert or update on public.reguli_model
  for each row execute function public.regula_model_verifica();

create table if not exists public.verificari_model (
  id            uuid primary key default gen_random_uuid(),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  modele        text[] not null default '{}',                      -- numele fișierelor verificate (cu revizia)
  reguli        integer not null default 0,
  elemente      integer not null default 0,                        -- elemente verificate în total
  neconforme    integer not null default 0,                        -- elemente care nu trec cel puțin o regulă obligatorie
  rezultat      jsonb not null default '[]',                       -- pe regulă: denumire, verificate, trec, guid-urile care nu trec
  nota          text,
  creat_de      uuid not null default auth.uid() references public.persoane(id),
  creat_la      timestamptz not null default now()
);
create index if not exists verificari_model_proiect on public.verificari_model (proiect_id, creat_la desc);

create or replace function public.verificare_model_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.lucreaza_in_proiect(new.proiect_id) then raise exception 'Rapoartele de verificare le salvează membrii echipei, nu cititorii.'; end if;
  if jsonb_typeof(new.rezultat) <> 'array' then raise exception 'Rezultatul verificării trebuie să fie o listă.'; end if;
  new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;
drop trigger if exists verificare_model_verificare on public.verificari_model;
create trigger verificare_model_verificare before insert on public.verificari_model
  for each row execute function public.verificare_model_verifica();

drop trigger if exists jurnal_reguli_model on public.reguli_model;
create trigger jurnal_reguli_model after insert or update or delete on public.reguli_model
  for each row execute function public.scrie_jurnal();
drop trigger if exists jurnal_verificari_model on public.verificari_model;
create trigger jurnal_verificari_model after insert or delete on public.verificari_model
  for each row execute function public.scrie_jurnal();

alter table public.reguli_model enable row level security;
alter table public.verificari_model enable row level security;
drop policy if exists reguli_model_citire on public.reguli_model;
create policy reguli_model_citire on public.reguli_model for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists reguli_model_scriere on public.reguli_model;
create policy reguli_model_scriere on public.reguli_model for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','beneficiar','diriginte']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','beneficiar','diriginte']::public.rol_proiect[]));
drop policy if exists verificari_model_citire on public.verificari_model;
create policy verificari_model_citire on public.verificari_model for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists verificari_model_creare on public.verificari_model;
create policy verificari_model_creare on public.verificari_model for insert to authenticated with check (public.lucreaza_in_proiect(proiect_id));
drop policy if exists verificari_model_stergere on public.verificari_model;
create policy verificari_model_stergere on public.verificari_model for delete to authenticated
  using (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));

revoke all on public.reguli_model, public.verificari_model from anon, authenticated;
grant select, delete on public.reguli_model, public.verificari_model to authenticated;
grant insert (id, proiect_id, denumire, clasa, predefinit, tip_cerinta, pset, proprietate, valoare, obligatorie, sursa, ordine) on public.reguli_model to authenticated;
grant update (denumire, clasa, predefinit, tip_cerinta, pset, proprietate, valoare, obligatorie, sursa, ordine) on public.reguli_model to authenticated;
grant insert (id, proiect_id, modele, reguli, elemente, neconforme, rezultat, nota) on public.verificari_model to authenticated;
