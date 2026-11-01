-- =====================================================================
-- Conpro BIM · 0002 · REINSTALARE
-- Folosiți acest fișier dacă migrarea 0002 nu a mers din prima.
-- Șterge ce a rămas din încercările anterioare ale modulului de procese
-- verbale (tabele, funcții, tipuri) și îl instalează din nou, curat.
-- NU atinge proiectele, echipele, profilurile sau polițele (migrarea 0001).
-- Atenție: dacă ați creat deja procese verbale reale, ele se șterg.
-- =====================================================================

drop table if exists public.registru_intrari cascade;
drop table if exists public.participanti_pv cascade;
drop table if exists public.procese_verbale cascade;
drop function if exists public.convoaca_pv(uuid, public.tip_pv, text, text, date, text, uuid[], text) cascade;
drop function if exists public.confirma_pv(uuid, public.decizie_pv, text) cascade;
drop function if exists public.anuleaza_pv(uuid, text) cascade;
drop function if exists public.verifica_intrare_registru() cascade;
drop function if exists public.cod_pv(uuid) cascade;
drop function if exists public.roluri_obligatorii_pv(public.tip_pv) cascade;
drop function if exists public.ordine_art_426(public.tip_pv) cascade;
drop function if exists public.tip_registru_din_pv(public.tip_pv) cascade;
drop type if exists public.tip_registru cascade;
drop type if exists public.decizie_pv cascade;
drop type if exists public.stare_pv cascade;
drop type if exists public.tip_pv cascade;

-- =====================================================================
-- Conpro BIM · migrarea 0002 · Procese verbale și registrul electronic
--
-- Procesele verbale se convoacă, apoi fiecare participant confirmă cu
-- contul lui. La fazele determinante și la recepția la terminarea
-- lucrărilor, proiectantul confirmă doar după diriginte și RTE
-- (art. 426 alin. 3 din Legea 169/2026). Ce s-a semnat nu se mai
-- modifică: se anulează și se întocmește un PV nou.
--
-- Registrul electronic de evidență a activității dirigintelui și al
-- RTE-ului (art. 456 lit. f și art. 459 lit. i) se completează automat
-- din confirmări și manual, fără ștergeri sau modificări.
--
-- Se rulează o singură dată, după 0001, în Supabase → SQL Editor.
-- =====================================================================

create type public.tip_pv as enum (
  'lucrari_ascunse',
  'faza_determinanta',
  'proba',                 -- probe de presiune, etanșeitate, funcționale
  'punere_in_functiune',
  'receptie_stadiu_fizic', -- art. 527 alin. 6–7
  'receptie_partiala',     -- art. 527 alin. 3
  'receptie_terminare',    -- art. 528
  'receptie_finala',
  'alt'
);

create type public.stare_pv as enum ('convocat', 'in_semnare', 'semnat', 'contestat', 'anulat');
create type public.decizie_pv as enum ('confirm', 'confirm_cu_observatii', 'refuz');

create type public.tip_registru as enum (
  'verificare', 'lucrari_ascunse', 'faza_determinanta', 'proba', 'receptie',
  'neconformitate', 'oprire_lucrari', 'notificare_isc', 'dispozitie_santier', 'alt'
);

-- ---------------------------------------------------------------------
-- Tabele
-- ---------------------------------------------------------------------
create table public.procese_verbale (
  id                 uuid primary key default gen_random_uuid(),
  proiect_id         uuid not null references public.proiecte(id) on delete cascade,
  numar              integer not null,
  tip                public.tip_pv not null,
  obiect             text not null check (length(trim(obiect)) > 2),
  elemente           text,            -- elementele / zona din model (legătura IFC vine cu modulul de model)
  data_pv            date not null,
  loc                text,
  alti_participanti  text,            -- participanți fără cont (ex. inspector ISC, membri ai comisiei)
  stare              public.stare_pv not null default 'convocat',
  convocat_de        uuid not null default auth.uid() references public.persoane(id),
  convocat_la        timestamptz not null default now(),
  semnat_la          timestamptz,
  anulat_de          uuid references public.persoane(id),
  anulat_la          timestamptz,
  motiv_anulare      text,
  unique (proiect_id, numar)
);
create index on public.procese_verbale (proiect_id, numar desc);

create table public.participanti_pv (
  id            uuid primary key default gen_random_uuid(),
  pv_id         uuid not null references public.procese_verbale(id) on delete cascade,
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  persoana_id   uuid not null references public.persoane(id),
  rol           public.rol_proiect not null,   -- rolul din proiect la data convocării
  decizie       public.decizie_pv,
  observatii    text,
  confirmat_la  timestamptz,
  unique (pv_id, persoana_id)
);
create index on public.participanti_pv (persoana_id) where confirmat_la is null;

create table public.registru_intrari (
  id            uuid primary key default gen_random_uuid(),
  persoana_id   uuid not null default auth.uid() references public.persoane(id),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  rol           public.rol_proiect not null,
  data          date not null default current_date,
  tip           public.tip_registru not null,
  descriere     text not null check (length(trim(descriere)) > 2),
  pv_id         uuid references public.procese_verbale(id),
  corecteaza_id uuid references public.registru_intrari(id),  -- o corectură e o intrare nouă
  automat       boolean not null default false,
  creat_la      timestamptz not null default now()
);
create index on public.registru_intrari (persoana_id, data desc);
create index on public.registru_intrari (proiect_id, data desc);

-- ---------------------------------------------------------------------
-- Reguli pe tipuri de PV
-- ---------------------------------------------------------------------
-- Rolurile care trebuie să fie printre participanți
create or replace function public.roluri_obligatorii_pv(t public.tip_pv)
returns public.rol_proiect[] language sql immutable as $$
  select case t
    when 'lucrari_ascunse'       then array['diriginte','constructor']::public.rol_proiect[]
    when 'faza_determinanta'     then array['diriginte','constructor','proiectant']::public.rol_proiect[]
    when 'proba'                 then array['diriginte','constructor']::public.rol_proiect[]
    when 'punere_in_functiune'   then array['diriginte','constructor']::public.rol_proiect[]
    when 'receptie_stadiu_fizic' then array['diriginte','beneficiar']::public.rol_proiect[]
    when 'receptie_partiala'     then array['diriginte','beneficiar']::public.rol_proiect[]
    when 'receptie_terminare'    then array['diriginte','beneficiar','constructor']::public.rol_proiect[]
    when 'receptie_finala'       then array['diriginte','beneficiar']::public.rol_proiect[]
    else array[]::public.rol_proiect[]
  end;
$$;

-- Tipurile la care proiectantul semnează după diriginte și RTE (art. 426 alin. 3)
create or replace function public.ordine_art_426(t public.tip_pv)
returns boolean language sql immutable as $$
  select t in ('faza_determinanta', 'receptie_terminare');
$$;

create or replace function public.tip_registru_din_pv(t public.tip_pv)
returns public.tip_registru language sql immutable as $$
  select case t
    when 'lucrari_ascunse'   then 'lucrari_ascunse'
    when 'faza_determinanta' then 'faza_determinanta'
    when 'proba'             then 'proba'
    when 'alt'               then 'verificare'
    else 'receptie'
  end::public.tip_registru;
$$;

create or replace function public.cod_pv(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'PV-' || pr.cod || '-' || lpad(pv.numar::text, 4, '0')
  from procese_verbale pv join proiecte pr on pr.id = pv.proiect_id where pv.id = p;
$$;

-- ---------------------------------------------------------------------
-- Convocarea: o face constructorul, dirigintele sau administratorul
-- ---------------------------------------------------------------------
create or replace function public.convoaca_pv(
  p_proiect uuid, p_tip public.tip_pv, p_obiect text, p_elemente text,
  p_data date, p_loc text, p_participanti uuid[], p_alti text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_nr integer;
  v_lipsa text;
  v_eu uuid := auth.uid();
begin
  if not public.are_rol(p_proiect, array['constructor','diriginte','administrator']::rol_proiect[]) then
    raise exception 'Procesele verbale le convoacă constructorul, dirigintele sau administratorul proiectului.';
  end if;
  if p_participanti is null or cardinality(p_participanti) = 0 then
    raise exception 'Alegeți cel puțin un participant.';
  end if;
  if exists (select 1 from unnest(p_participanti) x
             where not exists (select 1 from membri_proiect m where m.proiect_id = p_proiect and m.persoana_id = x)) then
    raise exception 'Toți participanții trebuie să facă parte din echipa proiectului.';
  end if;
  select string_agg(r::text, ', ') into v_lipsa
  from unnest(public.roluri_obligatorii_pv(p_tip)) r
  where not exists (select 1 from membri_proiect m
                    where m.proiect_id = p_proiect and m.rol = r and m.persoana_id = any(p_participanti));
  if v_lipsa is not null then
    raise exception 'La acest tip de proces verbal trebuie să participe: %.', replace(v_lipsa, 'constructor', 'constructor/RTE');
  end if;

  -- numerotare continuă pe proiect
  perform pg_advisory_xact_lock(hashtext(p_proiect::text));
  select coalesce(max(numar), 0) + 1 into v_nr from procese_verbale where proiect_id = p_proiect;

  insert into procese_verbale (proiect_id, numar, tip, obiect, elemente, data_pv, loc, alti_participanti, convocat_de)
  values (p_proiect, v_nr, p_tip, trim(p_obiect), nullif(trim(p_elemente), ''), p_data,
          nullif(trim(p_loc), ''), nullif(trim(p_alti), ''), v_eu)
  returning id into v_id;

  insert into participanti_pv (pv_id, proiect_id, persoana_id, rol)
  select v_id, p_proiect, m.persoana_id, m.rol
  from membri_proiect m
  where m.proiect_id = p_proiect and m.persoana_id = any(p_participanti);

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Confirmarea: fiecare doar pentru el, o singură dată
-- ---------------------------------------------------------------------
create or replace function public.confirma_pv(p_pv uuid, p_decizie public.decizie_pv, p_observatii text)
returns public.stare_pv language plpgsql security definer set search_path = public as $$
declare
  v_pv procese_verbale%rowtype;
  v_part participanti_pv%rowtype;
  v_stare stare_pv;
begin
  select * into v_pv from procese_verbale where id = p_pv for update;
  if not found then raise exception 'Procesul verbal nu există.'; end if;

  select * into v_part from participanti_pv where pv_id = p_pv and persoana_id = auth.uid();
  if not found then raise exception 'Nu sunteți participant la acest proces verbal.'; end if;
  if v_pv.stare not in ('convocat', 'in_semnare') then
    raise exception 'Procesul verbal este %. Nu mai primește confirmări.', v_pv.stare;
  end if;
  if v_part.confirmat_la is not null then raise exception 'Ați confirmat deja. Confirmarea nu se mai modifică.'; end if;
  if p_decizie in ('confirm_cu_observatii', 'refuz') and coalesce(length(trim(p_observatii)), 0) < 3 then
    raise exception 'Scrieți observațiile sau motivul refuzului.';
  end if;
  if public.ordine_art_426(v_pv.tip) and v_part.rol = 'proiectant'
     and exists (select 1 from participanti_pv
                 where pv_id = p_pv and rol in ('diriginte', 'constructor')
                   and (confirmat_la is null or decizie = 'refuz')) then
    raise exception 'Proiectantul confirmă după diriginte și RTE (art. 426 alin. 3 din Legea 169/2026).';
  end if;

  update participanti_pv
     set decizie = p_decizie, observatii = nullif(trim(p_observatii), ''), confirmat_la = now()
   where id = v_part.id;

  -- starea procesului verbal
  if exists (select 1 from participanti_pv where pv_id = p_pv and decizie = 'refuz') then
    v_stare := 'contestat';
  elsif not exists (select 1 from participanti_pv where pv_id = p_pv and confirmat_la is null) then
    v_stare := 'semnat';
  else
    v_stare := 'in_semnare';
  end if;
  update procese_verbale
     set stare = v_stare, semnat_la = case when v_stare = 'semnat' then now() end
   where id = p_pv;

  -- registrul electronic al dirigintelui și al RTE-ului
  if v_part.rol in ('diriginte', 'constructor') then
    insert into registru_intrari (persoana_id, proiect_id, rol, data, tip, descriere, pv_id, automat)
    values (auth.uid(), v_pv.proiect_id, v_part.rol, current_date, public.tip_registru_din_pv(v_pv.tip),
            format('%s %s: %s. %s%s', public.cod_pv(p_pv),
                   case p_decizie when 'confirm' then 'confirmat' when 'confirm_cu_observatii' then 'confirmat cu observații' else 'refuzat' end,
                   v_pv.obiect,
                   coalesce('Observații: ' || nullif(trim(p_observatii), '') || '. ', ''),
                   coalesce('Elemente: ' || v_pv.elemente || '.', '')),
            p_pv, true);
  end if;

  return v_stare;
end $$;

-- ---------------------------------------------------------------------
-- Anularea: cine a convocat sau administratorul, doar înainte de semnare
-- ---------------------------------------------------------------------
create or replace function public.anuleaza_pv(p_pv uuid, p_motiv text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pv procese_verbale%rowtype;
begin
  select * into v_pv from procese_verbale where id = p_pv for update;
  if not found then raise exception 'Procesul verbal nu există.'; end if;
  if not (v_pv.convocat_de = auth.uid()
          or public.are_rol(v_pv.proiect_id, array['administrator']::rol_proiect[])) then
    raise exception 'Doar cine a convocat procesul verbal sau administratorul îl poate anula.';
  end if;
  if v_pv.stare in ('semnat', 'anulat') then
    raise exception 'Procesul verbal este %. Nu se mai anulează; se întocmește unul nou.', v_pv.stare;
  end if;
  if coalesce(length(trim(p_motiv)), 0) < 3 then raise exception 'Scrieți motivul anulării.'; end if;
  update procese_verbale
     set stare = 'anulat', anulat_de = auth.uid(), anulat_la = now(), motiv_anulare = trim(p_motiv)
   where id = p_pv;
end $$;

-- ---------------------------------------------------------------------
-- Registrul: intrările manuale le face doar dirigintele sau RTE-ul
-- proiectului; nu se modifică și nu se șterg.
-- ---------------------------------------------------------------------
create or replace function public.verifica_intrare_registru()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.automat then
    if new.persoana_id is distinct from auth.uid() then
      raise exception 'Fiecare scrie doar în registrul lui.';
    end if;
    select m.rol into new.rol from membri_proiect m
     where m.proiect_id = new.proiect_id and m.persoana_id = new.persoana_id
       and m.rol in ('diriginte', 'constructor');
    if new.rol is null then
      raise exception 'Registrul electronic îl țin dirigintele de șantier și RTE-ul proiectului (art. 456, 459).';
    end if;
    if new.corecteaza_id is not null and not exists (
         select 1 from registru_intrari where id = new.corecteaza_id and persoana_id = new.persoana_id) then
      raise exception 'Se pot corecta doar intrările din propriul registru.';
    end if;
    new.pv_id := null;
    new.creat_la := now();
  end if;
  return new;
end $$;

create trigger registru_verificare
  before insert on public.registru_intrari
  for each row execute function public.verifica_intrare_registru();

-- ---------------------------------------------------------------------
-- Jurnal
-- ---------------------------------------------------------------------
create trigger jurnal_pv after insert or update or delete on public.procese_verbale
  for each row execute function public.scrie_jurnal();
create trigger jurnal_participanti_pv after insert or update or delete on public.participanti_pv
  for each row execute function public.scrie_jurnal();
-- Registrul nu intră în jurnalul proiectului: e imuabil și are propriile reguli de vizibilitate.

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.procese_verbale  enable row level security;
alter table public.participanti_pv  enable row level security;
alter table public.registru_intrari enable row level security;

-- PV-urile și participanții le văd membrii proiectului. Scrierea se face
-- doar prin funcțiile de mai sus (convocare, confirmare, anulare).
create policy pv_citire on public.procese_verbale for select to authenticated
  using (public.este_membru(proiect_id));
create policy participanti_citire on public.participanti_pv for select to authenticated
  using (public.este_membru(proiect_id));

-- Registrul: fiecare își vede registrul; administratorul și beneficiarul
-- văd intrările de pe proiectul lor.
create policy registru_citire on public.registru_intrari for select to authenticated
  using (persoana_id = auth.uid()
         or public.are_rol(proiect_id, array['administrator','beneficiar']::public.rol_proiect[]));
create policy registru_creare on public.registru_intrari for insert to authenticated
  with check (persoana_id = auth.uid() and automat = false);

revoke all on public.procese_verbale, public.participanti_pv, public.registru_intrari from anon, authenticated;
grant select on public.procese_verbale, public.participanti_pv to authenticated;
grant select, insert on public.registru_intrari to authenticated;

revoke execute on function public.convoaca_pv(uuid, public.tip_pv, text, text, date, text, uuid[], text),
  public.confirma_pv(uuid, public.decizie_pv, text), public.anuleaza_pv(uuid, text) from public, anon;
grant execute on function public.convoaca_pv(uuid, public.tip_pv, text, text, date, text, uuid[], text),
  public.confirma_pv(uuid, public.decizie_pv, text), public.anuleaza_pv(uuid, text) to authenticated;
