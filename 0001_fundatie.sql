-- =====================================================================
-- Conpro BIM · migrarea 0001 · Fundația
-- Firme, persoane, proiecte, roluri pe proiect, invitații,
-- atestate și polițe, jurnal de activitate.
--
-- Regula de bază: drepturile vin din rolul persoanei pe proiect.
-- Toate regulile de acces sunt în baza de date (Row Level Security),
-- nu în interfață.
--
-- Se rulează o singură dată, în Supabase → SQL Editor.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tipuri
-- ---------------------------------------------------------------------
create type public.rol_proiect as enum (
  'administrator',        -- administratorul proiectului (funcția de management al informației)
  'beneficiar',           -- partea care numește (ISO 19650)
  'diriginte',            -- dirigintele de șantier (art. 456 Legea 169/2026)
  'constructor',          -- antreprenor, șef de șantier, RTE (art. 459)
  'proiectant',           -- proiectant general sau de specialitate
  'subcontractor',
  'laborator',
  'cititor',              -- ISC, comisia de recepție, auditor
  'administrator_cladire' -- exploatare, ISO 19650-3
);

create type public.clasa_consecinte as enum ('CC1', 'CC2', 'CC3', 'CC4');

create type public.tip_document_persoana as enum (
  'autorizatie_isc',      -- autorizația de diriginte / RTE
  'atestat',              -- verificator, expert, auditor energetic
  'polita_rc',            -- asigurarea de răspundere civilă profesională
  'legitimatie_anre',     -- electrician / instalator gaze autorizat
  'alt'
);

-- ---------------------------------------------------------------------
-- Firme și persoane
-- ---------------------------------------------------------------------
create table public.firme (
  id          uuid primary key default gen_random_uuid(),
  denumire    text not null check (length(trim(denumire)) > 1),
  cui         text unique,
  adresa      text,
  creat_de    uuid default auth.uid() references auth.users(id) on delete set null,
  creat_la    timestamptz not null default now()
);

create table public.persoane (
  id          uuid primary key references auth.users(id) on delete cascade,
  nume        text not null default '',
  email       text not null,
  telefon     text,
  firma_id    uuid references public.firme(id) on delete set null,
  creat_la    timestamptz not null default now()
);

-- Profilul se creează automat la înregistrarea contului.
create or replace function public.creeaza_persoana()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.persoane (id, email, nume)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data->>'nume', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger la_cont_nou
  after insert on auth.users
  for each row execute function public.creeaza_persoana();

-- Atestate, autorizații și polițe (art. 456, 459, 556 din Legea 169/2026)
create table public.documente_persoana (
  id           uuid primary key default gen_random_uuid(),
  persoana_id  uuid not null default auth.uid() references public.persoane(id) on delete cascade,
  tip          public.tip_document_persoana not null,
  domeniu      text,               -- ex. domeniile/subdomeniile autorizate
  numar        text,
  emitent      text,               -- ex. ISC, asigurătorul
  valabil_de   date,
  valabil_pana date,
  anulat       boolean not null default false,
  creat_la     timestamptz not null default now(),
  check (valabil_pana is null or valabil_de is null or valabil_pana >= valabil_de)
);
create index on public.documente_persoana (persoana_id);

-- ---------------------------------------------------------------------
-- Proiecte
-- ---------------------------------------------------------------------
create table public.proiecte (
  id                 uuid primary key default gen_random_uuid(),
  cod                text not null check (cod ~ '^[A-Z0-9]{3,6}$'),
  denumire           text not null check (length(trim(denumire)) > 2),
  adresa             text,
  beneficiar         text,                                   -- denumirea beneficiarului
  stadiu_catuc       smallint not null default 0 check (stadiu_catuc between 0 and 7),  -- art. 479
  clasa_consecinte   public.clasa_consecinte,                -- art. 370
  -- Autorizația de construire
  data_cerere_ac     date,                                   -- stabilește regimul legal (art. 582)
  regim_legal        text generated always as (
                       case
                         when data_cerere_ac is null then null
                         when data_cerere_ac <= date '2026-08-24' then 'Legea 50/1991'
                         else 'Legea 169/2026'
                       end) stored,
  ac_numar           text,
  ac_emis_la         date,
  ac_valabil_pana    date,                                   -- termenul de execuție
  ac_prelungit_pana  date,                                   -- o singură prelungire, max. 12 luni (art. 310)
  standard_info      jsonb not null default '{}'::jsonb,     -- convenția de denumire ISO 19650
  arhivat            boolean not null default false,
  creat_de           uuid default auth.uid() references auth.users(id) on delete set null,
  creat_la           timestamptz not null default now(),
  actualizat_la      timestamptz not null default now(),
  unique (cod),
  constraint ac_termen_valid check (ac_valabil_pana is null or ac_emis_la is null or ac_valabil_pana >= ac_emis_la),
  constraint ac_prelungire_max_12_luni check (ac_prelungit_pana is null or (ac_valabil_pana is not null
         and ac_prelungit_pana > ac_valabil_pana
         and ac_prelungit_pana <= ac_valabil_pana + interval '12 months'))
);

create table public.membri_proiect (
  proiect_id   uuid not null references public.proiecte(id) on delete cascade,
  persoana_id  uuid not null references public.persoane(id) on delete cascade,
  rol          public.rol_proiect not null,
  zona         text,                      -- restrângere opțională (ex. o zonă a clădirii)
  adaugat_de   uuid default auth.uid() references auth.users(id) on delete set null,
  adaugat_la   timestamptz not null default now(),
  primary key (proiect_id, persoana_id)
);
create index on public.membri_proiect (persoana_id);

create table public.invitatii (
  id           uuid primary key default gen_random_uuid(),
  proiect_id   uuid not null references public.proiecte(id) on delete cascade,
  email        text not null check (email = lower(email) and email like '%_@_%'),
  rol          public.rol_proiect not null,
  zona         text,
  invitat_de   uuid default auth.uid() references auth.users(id) on delete set null,
  creat_la     timestamptz not null default now(),
  acceptat_la  timestamptz,
  unique (proiect_id, email)
);

-- ---------------------------------------------------------------------
-- Funcții de acces (rulează cu drepturi ridicate, ca regulile să nu
-- se apeleze recursiv)
-- ---------------------------------------------------------------------
create or replace function public.este_membru(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from membri_proiect
                 where proiect_id = p and persoana_id = auth.uid());
$$;

create or replace function public.are_rol(p uuid, roluri public.rol_proiect[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from membri_proiect
                 where proiect_id = p and persoana_id = auth.uid() and rol = any(roluri));
$$;

create or replace function public.lucreaza_impreuna(alta_persoana uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from membri_proiect a
                 join membri_proiect b on a.proiect_id = b.proiect_id
                 where a.persoana_id = auth.uid() and b.persoana_id = alta_persoana);
$$;

-- Doar un email confirmat poate primi invitații: altfel cineva și-ar putea face cont
-- pe adresa altcuiva și ar intra în proiectele la care a fost invitat acela.
create or replace function public.email_curent()
returns text language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null;
$$;

-- ---------------------------------------------------------------------
-- Reguli de integritate
-- ---------------------------------------------------------------------

-- Cine creează proiectul devine administratorul lui.
create or replace function public.creator_devine_administrator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    insert into membri_proiect (proiect_id, persoana_id, rol, adaugat_de)
    values (new.id, auth.uid(), 'administrator', auth.uid());
  end if;
  return new;
end $$;

create trigger proiect_nou_administrator
  after insert on public.proiecte
  for each row execute function public.creator_devine_administrator();

-- Un proiect nu poate rămâne fără administrator.
create or replace function public.pastreaza_un_administrator()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p uuid := coalesce(old.proiect_id, new.proiect_id);
begin
  if old.rol = 'administrator'
     and (tg_op = 'DELETE' or new.rol <> 'administrator')
     and exists (select 1 from proiecte where id = p)
     and not exists (select 1 from membri_proiect
                     where proiect_id = p and rol = 'administrator'
                       and persoana_id <> old.persoana_id) then
    raise exception 'Proiectul trebuie să aibă cel puțin un administrator.';
  end if;
  return coalesce(new, old);
end $$;

create trigger un_administrator_minim
  before update or delete on public.membri_proiect
  for each row execute function public.pastreaza_un_administrator();

-- Câmpurile de sistem nu se modifică din aplicație.
create or replace function public.protejeaza_proiect()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.creat_de := old.creat_de;
  new.creat_la := old.creat_la;
  new.actualizat_la := now();
  return new;
end $$;

create trigger proiect_campuri_sistem
  before update on public.proiecte
  for each row execute function public.protejeaza_proiect();

-- Invitațiile se acceptă de persoana cu același email, după autentificare.
create or replace function public.accepta_invitatiile()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
  e text := public.email_curent();
begin
  if auth.uid() is null or e is null then
    return 0;
  end if;
  for r in select * from invitatii where email = e and acceptat_la is null loop
    insert into membri_proiect (proiect_id, persoana_id, rol, zona, adaugat_de)
    values (r.proiect_id, auth.uid(), r.rol, r.zona, r.invitat_de)
    on conflict (proiect_id, persoana_id) do nothing;
    update invitatii set acceptat_la = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Jurnal de activitate: cine, ce, când, valoarea anterioară
-- ---------------------------------------------------------------------
create table public.jurnal (
  id          bigint generated always as identity primary key,
  proiect_id  uuid,
  tabel       text not null,
  operatie    text not null,
  rand_id     text,
  inainte     jsonb,
  dupa        jsonb,
  autor       uuid default auth.uid(),
  la          timestamptz not null default now()
);
create index on public.jurnal (proiect_id, la desc);

create or replace function public.scrie_jurnal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rand jsonb := to_jsonb(coalesce(new, old));
  p uuid;
begin
  p := case tg_table_name
         when 'proiecte' then (rand->>'id')::uuid
         else (rand->>'proiect_id')::uuid
       end;
  insert into jurnal (proiect_id, tabel, operatie, rand_id, inainte, dupa, autor)
  values (p, tg_table_name, tg_op,
          coalesce(rand->>'id', rand->>'persoana_id'),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

create trigger jurnal_proiecte after insert or update or delete on public.proiecte
  for each row execute function public.scrie_jurnal();
create trigger jurnal_membri after insert or update or delete on public.membri_proiect
  for each row execute function public.scrie_jurnal();
create trigger jurnal_invitatii after insert or update or delete on public.invitatii
  for each row execute function public.scrie_jurnal();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.firme              enable row level security;
alter table public.persoane           enable row level security;
alter table public.documente_persoana enable row level security;
alter table public.proiecte           enable row level security;
alter table public.membri_proiect     enable row level security;
alter table public.invitatii          enable row level security;
alter table public.jurnal             enable row level security;

-- Firme: lista e vizibilă utilizatorilor autentificați; oricine își poate adăuga firma;
-- doar cine a creat-o o modifică.
create policy firme_citire  on public.firme for select to authenticated using (true);
create policy firme_creare  on public.firme for insert to authenticated with check (creat_de = auth.uid());
create policy firme_editare on public.firme for update to authenticated
  using (creat_de = auth.uid()) with check (creat_de = auth.uid());

-- Persoane: te vezi pe tine și pe cei cu care lucrezi; îți modifici doar profilul tău.
create policy persoane_citire on public.persoane for select to authenticated
  using (id = auth.uid() or public.lucreaza_impreuna(id));
create policy persoane_editare on public.persoane for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Atestate și polițe: le gestionezi pe ale tale; colegii de proiect le pot vedea,
-- ca beneficiarul să verifice autorizația și asigurarea dirigintelui.
create policy docpers_citire on public.documente_persoana for select to authenticated
  using (persoana_id = auth.uid() or public.lucreaza_impreuna(persoana_id));
create policy docpers_creare on public.documente_persoana for insert to authenticated
  with check (persoana_id = auth.uid());
create policy docpers_editare on public.documente_persoana for update to authenticated
  using (persoana_id = auth.uid()) with check (persoana_id = auth.uid());

-- Proiecte: le văd membrii; le creează orice utilizator autentificat
-- (devine administrator); le modifică doar administratorul. Nu se șterg, se arhivează.
create policy proiecte_citire on public.proiecte for select to authenticated
  using (public.este_membru(id));
create policy proiecte_creare on public.proiecte for insert to authenticated
  with check (creat_de = auth.uid());
create policy proiecte_editare on public.proiecte for update to authenticated
  using (public.are_rol(id, array['administrator']::public.rol_proiect[]))
  with check (public.are_rol(id, array['administrator']::public.rol_proiect[]));

-- Membri: îi văd toți membrii proiectului; îi administrează doar administratorul.
create policy membri_citire on public.membri_proiect for select to authenticated
  using (public.este_membru(proiect_id));
create policy membri_creare on public.membri_proiect for insert to authenticated
  with check (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));
create policy membri_editare on public.membri_proiect for update to authenticated
  using (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));
create policy membri_stergere on public.membri_proiect for delete to authenticated
  using (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));

-- Invitații: le vede și le gestionează administratorul; persoana invitată își vede invitațiile.
create policy invitatii_citire on public.invitatii for select to authenticated
  using (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[])
         or email = public.email_curent());
create policy invitatii_creare on public.invitatii for insert to authenticated
  with check (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));
create policy invitatii_stergere on public.invitatii for delete to authenticated
  using (public.are_rol(proiect_id, array['administrator']::public.rol_proiect[])
         and acceptat_la is null);

-- Jurnal: îl văd membrii proiectului; nimeni nu scrie direct în el.
create policy jurnal_citire on public.jurnal for select to authenticated
  using (proiect_id is not null and public.este_membru(proiect_id));

-- Drepturi de bază pentru rolul utilizatorilor autentificați
grant usage on schema public to authenticated;
revoke all on public.firme, public.persoane, public.documente_persoana, public.proiecte,
              public.membri_proiect, public.invitatii, public.jurnal from anon, authenticated;
grant select, insert, update on public.firme, public.documente_persoana, public.proiecte to authenticated;
grant select on public.persoane to authenticated;
grant update (nume, telefon, firma_id) on public.persoane to authenticated;   -- emailul nu se schimbă de aici
grant select, insert, update, delete on public.membri_proiect to authenticated;
grant select, insert, delete on public.invitatii to authenticated;
grant select on public.jurnal to authenticated;
revoke execute on function public.este_membru(uuid), public.are_rol(uuid, public.rol_proiect[]),
  public.lucreaza_impreuna(uuid), public.email_curent() from anon;
grant execute on function public.accepta_invitatiile() to authenticated;
revoke execute on function public.accepta_invitatiile() from anon;
