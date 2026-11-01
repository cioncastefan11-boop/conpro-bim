-- =====================================================================
-- Conpro BIM · migrarea 0006 · Spații, echipamente (COBie) și
-- documentele Cărții tehnice
--
-- Spațiile (niveluri, încăperi) le stabilește administratorul,
-- proiectantul sau constructorul. Tipurile de echipamente și echipamentele
-- montate le completează constructorul sau subcontractorul, la montaj.
-- Din ele se generează fișierul COBie și manualul de utilizare și
-- mentenanță (art. 528 alin. 3 lit. e din Legea 169/2026).
--
-- Documentele Cărții tehnice care nu se nasc în aplicație (proiectul,
-- autorizația, avizele, certificatele) se înregistrează pe capitole și nu
-- se mai modifică. Opisul complet se generează în aplicație.
--
-- Se rulează o singură dată, după 0005, în Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Spații
-- ---------------------------------------------------------------------
create table public.niveluri (
  id          uuid primary key default gen_random_uuid(),
  proiect_id  uuid not null references public.proiecte(id) on delete cascade,
  cod         text not null check (length(trim(cod)) between 1 and 12),     -- ex. P, E1, S
  denumire    text not null,                                                -- ex. Parter
  cota        numeric(7,2),                                                 -- m
  ordine      integer not null default 0,
  creat_de    uuid not null default auth.uid() references public.persoane(id),
  unique (proiect_id, cod)
);

create table public.incaperi (
  id          uuid primary key default gen_random_uuid(),
  proiect_id  uuid not null references public.proiecte(id) on delete cascade,
  nivel_id    uuid not null references public.niveluri(id),
  cod         text not null check (length(trim(cod)) between 1 and 20),     -- ex. P.01
  denumire    text not null,                                                -- ex. Hol intrare
  functiune   text,
  arie        numeric(9,2) check (arie is null or arie > 0),                 -- m²
  creat_de    uuid not null default auth.uid() references public.persoane(id),
  unique (proiect_id, cod)
);
create index on public.incaperi (nivel_id);

-- ---------------------------------------------------------------------
-- Tipuri de echipamente și echipamente montate
-- ---------------------------------------------------------------------
create table public.tipuri_echipament (
  id                         uuid primary key default gen_random_uuid(),
  proiect_id                 uuid not null references public.proiecte(id) on delete cascade,
  denumire                   text not null check (length(trim(denumire)) > 2),  -- ex. Pompă de căldură aer-apă 12 kW
  categorie                  text,                                               -- ex. Încălzire, Ventilare, Sanitare
  producator                 text,
  model                      text,
  fam_id                     uuid references public.fam(id),
  garantie_luni              integer check (garantie_luni is null or garantie_luni between 0 and 600),
  garant                     text,
  interval_mentenanta_luni   integer check (interval_mentenanta_luni is null or interval_mentenanta_luni between 1 and 240),
  durata_viata_ani           integer check (durata_viata_ani is null or durata_viata_ani between 1 and 150),
  instructiuni_mentenanta    text,
  creat_de                   uuid not null default auth.uid() references public.persoane(id),
  creat_la                   timestamptz not null default now()
);
create index on public.tipuri_echipament (proiect_id);

create table public.echipamente (
  id                      uuid primary key default gen_random_uuid(),
  proiect_id              uuid not null references public.proiecte(id) on delete cascade,
  tip_id                  uuid not null references public.tipuri_echipament(id),
  incapere_id             uuid references public.incaperi(id),
  cod                     text not null check (length(trim(cod)) between 1 and 40),   -- eticheta, ex. PC-01
  serie                   text,
  data_montaj             date,
  data_punere_functiune   date,
  pv_id                   uuid references public.procese_verbale(id),            -- PV de punere în funcțiune
  garantie_start          date,
  observatii              text,
  creat_de                uuid not null default auth.uid() references public.persoane(id),
  creat_la                timestamptz not null default now(),
  unique (proiect_id, cod)
);
create index on public.echipamente (tip_id);
create index on public.echipamente (incapere_id);

-- Legăturile trebuie să rămână în același proiect
create or replace function public.verifica_legaturi_echipament()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'incaperi' then
    if not exists (select 1 from niveluri where id = new.nivel_id and proiect_id = new.proiect_id) then
      raise exception 'Nivelul nu aparține proiectului.';
    end if;
  elsif tg_table_name = 'tipuri_echipament' then
    if new.fam_id is not null and not exists (select 1 from fam where id = new.fam_id and proiect_id = new.proiect_id) then
      raise exception 'FAM-ul nu aparține proiectului.';
    end if;
  elsif tg_table_name = 'echipamente' then
    if not exists (select 1 from tipuri_echipament where id = new.tip_id and proiect_id = new.proiect_id) then
      raise exception 'Tipul de echipament nu aparține proiectului.';
    end if;
    if new.incapere_id is not null and not exists (select 1 from incaperi where id = new.incapere_id and proiect_id = new.proiect_id) then
      raise exception 'Încăperea nu aparține proiectului.';
    end if;
    if new.pv_id is not null and not exists (
         select 1 from procese_verbale where id = new.pv_id and proiect_id = new.proiect_id and stare = 'semnat') then
      raise exception 'Procesul verbal de punere în funcțiune trebuie să fie semnat.';
    end if;
    if new.data_punere_functiune is not null and new.data_montaj is not null and new.data_punere_functiune < new.data_montaj then
      raise exception 'Punerea în funcțiune nu poate fi înaintea montajului.';
    end if;
  end if;
  return new;
end $$;

create trigger incaperi_legaturi before insert or update on public.incaperi
  for each row execute function public.verifica_legaturi_echipament();
create trigger tipuri_legaturi before insert or update on public.tipuri_echipament
  for each row execute function public.verifica_legaturi_echipament();
create trigger echipamente_legaturi before insert or update on public.echipamente
  for each row execute function public.verifica_legaturi_echipament();

-- ---------------------------------------------------------------------
-- Documentele Cărții tehnice din afara aplicației
-- Capitolele: A proiectare, B execuție, C recepție, D exploatare
-- (art. 530 din Legea 169/2026)
-- ---------------------------------------------------------------------
create table public.documente_carte (
  id          uuid primary key default gen_random_uuid(),
  proiect_id  uuid not null references public.proiecte(id) on delete cascade,
  capitol     text not null check (capitol in ('A', 'B', 'C', 'D')),
  titlu       text not null check (length(trim(titlu)) > 2),
  numar       text,
  data        date,
  emitent     text,
  observatii  text,
  creat_de    uuid not null default auth.uid() references public.persoane(id),
  creat_la    timestamptz not null default now()
);
create index on public.documente_carte (proiect_id, capitol);

-- ---------------------------------------------------------------------
-- Atașamente: fișe tehnice și manuale la tipuri, poze și certificate la
-- echipamente, fișierele documentelor din Cartea tehnică
-- ---------------------------------------------------------------------
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte'));

create or replace function public.poate_atasa(p_entitate text, p_id uuid, p_proiect uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_entitate = 'fam' then
    return exists (select 1 from fam where id = p_id and proiect_id = p_proiect and stare in ('ciorna', 'completari'))
       and public.are_rol(p_proiect, array['constructor','subcontractor']::rol_proiect[]);
  elsif p_entitate = 'livrare_fam' then
    return exists (select 1 from livrari_fam where id = p_id and proiect_id = p_proiect)
       and public.are_rol(p_proiect, array['diriginte']::rol_proiect[]);
  elsif p_entitate = 'pv' then
    return exists (select 1 from procese_verbale pv where pv.id = p_id and pv.proiect_id = p_proiect and pv.stare <> 'anulat'
                   and (pv.convocat_de = auth.uid()
                        or exists (select 1 from participanti_pv pp where pp.pv_id = pv.id and pp.persoana_id = auth.uid())));
  elsif p_entitate = 'turnare' then
    return exists (select 1 from turnari where id = p_id and proiect_id = p_proiect)
       and public.are_rol(p_proiect, array['constructor','subcontractor','diriginte']::rol_proiect[]);
  elsif p_entitate = 'incercare' then
    return exists (select 1 from incercari where id = p_id and proiect_id = p_proiect
                   and introdus_de = auth.uid() and verificat_la is null);
  elsif p_entitate = 'tip_echipament' then
    return exists (select 1 from tipuri_echipament where id = p_id and proiect_id = p_proiect)
       and public.are_rol(p_proiect, array['constructor','subcontractor','administrator']::rol_proiect[]);
  elsif p_entitate = 'echipament' then
    return exists (select 1 from echipamente where id = p_id and proiect_id = p_proiect)
       and public.are_rol(p_proiect, array['constructor','subcontractor','administrator','diriginte']::rol_proiect[]);
  elsif p_entitate = 'document_carte' then
    return exists (select 1 from documente_carte where id = p_id and proiect_id = p_proiect and creat_de = auth.uid());
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- Jurnal
-- ---------------------------------------------------------------------
create trigger jurnal_tipuri_echipament after insert or update or delete on public.tipuri_echipament
  for each row execute function public.scrie_jurnal();
create trigger jurnal_echipamente after insert or update or delete on public.echipamente
  for each row execute function public.scrie_jurnal();
create trigger jurnal_documente_carte after insert on public.documente_carte
  for each row execute function public.scrie_jurnal();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.niveluri          enable row level security;
alter table public.incaperi          enable row level security;
alter table public.tipuri_echipament enable row level security;
alter table public.echipamente       enable row level security;
alter table public.documente_carte   enable row level security;

-- Spații: le văd membrii; le gestionează administratorul, proiectantul și constructorul
create policy niveluri_citire on public.niveluri for select to authenticated using (public.este_membru(proiect_id));
create policy niveluri_scriere on public.niveluri for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','proiectant','constructor']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','proiectant','constructor']::public.rol_proiect[]));
create policy incaperi_citire on public.incaperi for select to authenticated using (public.este_membru(proiect_id));
create policy incaperi_scriere on public.incaperi for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','proiectant','constructor']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','proiectant','constructor']::public.rol_proiect[]));

-- Echipamente: le completează constructorul, subcontractorul sau administratorul
create policy tipuri_citire on public.tipuri_echipament for select to authenticated using (public.este_membru(proiect_id));
create policy tipuri_scriere on public.tipuri_echipament for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','constructor','subcontractor']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','constructor','subcontractor']::public.rol_proiect[]));
create policy echipamente_citire on public.echipamente for select to authenticated using (public.este_membru(proiect_id));
create policy echipamente_scriere on public.echipamente for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','constructor','subcontractor']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','constructor','subcontractor']::public.rol_proiect[]));

-- Documentele Cărții tehnice: le adaugă orice membru cu rol activ; nu se modifică
create policy documente_carte_citire on public.documente_carte for select to authenticated
  using (public.este_membru(proiect_id));
create policy documente_carte_creare on public.documente_carte for insert to authenticated
  with check (creat_de = auth.uid()
              and public.are_rol(proiect_id, array['administrator','beneficiar','diriginte','constructor','proiectant']::public.rol_proiect[]));

revoke all on public.niveluri, public.incaperi, public.tipuri_echipament, public.echipamente, public.documente_carte
  from anon, authenticated;
grant select, insert, update, delete on public.niveluri, public.incaperi to authenticated;
grant select, insert, update, delete on public.tipuri_echipament, public.echipamente to authenticated;
grant select on public.documente_carte to authenticated;
grant insert (id, proiect_id, capitol, titlu, numar, data, emitent, observatii, creat_de) on public.documente_carte to authenticated;
