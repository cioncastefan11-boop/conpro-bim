-- =====================================================================
-- Conpro BIM · migrarea 0021 · Cerințele de predare (AIR / EIR) și lecțiile învățate
--
-- 1. Cerințele de informații ale beneficiarului pentru predare (ISO 19650-1:
--    cerințele activului, AIR; ISO 19650-2, 5.2.1: cerințele de schimb, EIR):
--    ce date trebuie să aibă fiecare echipament (câmpurile COBie și documentele
--    lui) și ce documente trebuie predate (as-built, manuale, avize...).
--    Aplicația verifică singură cât sunt îndeplinite și le pune în lista
--    „Ce mai lipsește” a Cărții tehnice și în pregătirea recepției.
--    Le stabilesc beneficiarul sau administratorul proiectului.
-- 2. Lecțiile învățate (ISO 19650-2, 5.8.2): ce a mers bine, ce nu, ce
--    recomandăm la proiectul următor. Le scrie oricine din echipă.
--
-- Se rulează o singură dată, după 0020, în Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.cerinte_predare (
  id            uuid primary key default gen_random_uuid(),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  categorie     text not null check (categorie in ('echipament', 'document')),
  -- la echipamente: câmpul cerut și categoria de echipamente (gol = toate)
  camp          text check (camp in ('producator', 'model', 'serie', 'garantie', 'mentenanta', 'incapere', 'punere_functiune',
                                     'fisa_tehnica', 'instructiuni', 'certificat_garantie')),
  aplicabil_la  text,
  -- la documente: titlul cerut, codul exact din CDE (opțional) și cuvintele după care se recunoaște
  titlu         text,
  cod_document  text,
  cuvinte       text,
  capitol       text check (capitol is null or capitol in ('A', 'B', 'C', 'D')),
  sursa         text not null default 'AIR' check (sursa in ('AIR', 'EIR')),
  obligatorie   boolean not null default true,
  ordine        integer not null default 0,
  creat_de      uuid not null default auth.uid() references public.persoane(id),
  creat_la      timestamptz not null default now(),
  constraint cerinta_completa check ((categorie = 'echipament' and camp is not null) or (categorie = 'document' and length(trim(coalesce(titlu, ''))) > 2))
);
create index if not exists cerinte_predare_proiect on public.cerinte_predare (proiect_id, ordine);

create or replace function public.cerinta_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.are_rol(new.proiect_id, array['administrator','beneficiar']::rol_proiect[]) then
    raise exception 'Cerințele de predare le stabilesc beneficiarul sau administratorul proiectului.';
  end if;
  if tg_op = 'INSERT' then new.creat_de := auth.uid(); new.creat_la := now();
  else new.proiect_id := old.proiect_id; new.creat_de := old.creat_de; new.creat_la := old.creat_la; end if;
  new.titlu := nullif(trim(coalesce(new.titlu, '')), ''); new.aplicabil_la := nullif(trim(coalesce(new.aplicabil_la, '')), '');
  new.cod_document := nullif(upper(trim(coalesce(new.cod_document, ''))), ''); new.cuvinte := nullif(trim(coalesce(new.cuvinte, '')), '');
  return new;
end $$;
drop trigger if exists cerinta_verificare on public.cerinte_predare;
create trigger cerinta_verificare before insert or update on public.cerinte_predare
  for each row execute function public.cerinta_verifica();

create table if not exists public.lectii_invatate (
  id            uuid primary key default gen_random_uuid(),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  categorie     text not null check (categorie in ('informatii', 'proces', 'tehnic', 'colaborare', 'instrumente', 'altul')),
  stadiu        smallint check (stadiu between 0 and 7),
  titlu         text not null check (length(trim(titlu)) > 2),
  ce_s_a_intamplat text,
  recomandare   text not null check (length(trim(recomandare)) > 2),
  pozitiva      boolean not null default false,       -- ce a mers bine (de repetat) sau ce nu (de evitat)
  creat_de      uuid not null default auth.uid() references public.persoane(id),
  creat_la      timestamptz not null default now()
);
create index if not exists lectii_proiect on public.lectii_invatate (proiect_id, creat_la desc);

create or replace function public.lectie_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.lucreaza_in_proiect(new.proiect_id) then raise exception 'Lecțiile le scriu membrii echipei, nu cititorii.'; end if;
  if tg_op = 'INSERT' then new.creat_de := auth.uid(); new.creat_la := now();
  else new.proiect_id := old.proiect_id; new.creat_de := old.creat_de; new.creat_la := old.creat_la; end if;
  return new;
end $$;
drop trigger if exists lectie_verificare on public.lectii_invatate;
create trigger lectie_verificare before insert or update on public.lectii_invatate
  for each row execute function public.lectie_verifica();

drop trigger if exists jurnal_cerinte_predare on public.cerinte_predare;
create trigger jurnal_cerinte_predare after insert or update or delete on public.cerinte_predare
  for each row execute function public.scrie_jurnal();
drop trigger if exists jurnal_lectii on public.lectii_invatate;
create trigger jurnal_lectii after insert or update or delete on public.lectii_invatate
  for each row execute function public.scrie_jurnal();

alter table public.cerinte_predare enable row level security;
alter table public.lectii_invatate enable row level security;
drop policy if exists cerinte_citire on public.cerinte_predare;
create policy cerinte_citire on public.cerinte_predare for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists cerinte_scriere on public.cerinte_predare;
create policy cerinte_scriere on public.cerinte_predare for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','beneficiar']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','beneficiar']::public.rol_proiect[]));
drop policy if exists lectii_citire on public.lectii_invatate;
create policy lectii_citire on public.lectii_invatate for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists lectii_creare on public.lectii_invatate;
create policy lectii_creare on public.lectii_invatate for insert to authenticated with check (public.este_membru(proiect_id));
drop policy if exists lectii_editare on public.lectii_invatate;
create policy lectii_editare on public.lectii_invatate for update to authenticated
  using (creat_de = auth.uid()) with check (creat_de = auth.uid());
drop policy if exists lectii_stergere on public.lectii_invatate;
create policy lectii_stergere on public.lectii_invatate for delete to authenticated
  using (creat_de = auth.uid() or public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));

revoke all on public.cerinte_predare, public.lectii_invatate from anon, authenticated;
grant select, delete on public.cerinte_predare, public.lectii_invatate to authenticated;
grant insert (id, proiect_id, categorie, camp, aplicabil_la, titlu, cod_document, cuvinte, capitol, sursa, obligatorie, ordine) on public.cerinte_predare to authenticated;
grant update (camp, aplicabil_la, titlu, cod_document, cuvinte, capitol, sursa, obligatorie, ordine) on public.cerinte_predare to authenticated;
grant insert (id, proiect_id, categorie, stadiu, titlu, ce_s_a_intamplat, recomandare, pozitiva) on public.lectii_invatate to authenticated;
grant update (categorie, stadiu, titlu, ce_s_a_intamplat, recomandare, pozitiva) on public.lectii_invatate to authenticated;
