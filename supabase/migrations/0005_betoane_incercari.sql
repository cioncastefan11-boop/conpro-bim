-- =====================================================================
-- Conpro BIM · migrarea 0005 · Condica de betoane și încercările
--
-- Condica: fiecare turnare se înregistrează de constructor (RTE), cu
-- elementul, clasa betonului, volumul, bonurile, condițiile și probele
-- prelevate. Se leagă de FAM-ul aprobat al betonului și de PV-ul semnat
-- pentru armătură. Dirigintele vizează turnarea; după viză nu se mai
-- modifică.
--
-- Încercările: rezultatele de laborator (pe turnări sau pe materiale cu
-- FAM), cu buletinul atașat. Nu se modifică; dirigintele le ia la
-- cunoștință, iar luarea la cunoștință intră în registrul lui.
--
-- Se rulează o singură dată, după 0004, în Supabase → SQL Editor.
-- =====================================================================

alter type public.tip_registru add value if not exists 'condica_betoane';
alter type public.tip_registru add value if not exists 'incercare';

-- ---------------------------------------------------------------------
-- Condica de betoane
-- ---------------------------------------------------------------------
create table public.turnari (
  id                uuid primary key default gen_random_uuid(),
  proiect_id        uuid not null references public.proiecte(id) on delete cascade,
  numar             integer not null,
  data              date not null,
  element           text not null check (length(trim(element)) > 2),   -- ex. Placa +3,00, axele 1–6 / A–D
  clasa_beton       text not null check (clasa_beton ~ '^L?C[0-9]{1,3}/[0-9]{1,3}$'),  -- ex. C25/30
  clasa_expunere    text,          -- ex. XC1, XC4+XF1
  consistenta       text,          -- ex. S3
  dmax              integer check (dmax is null or dmax between 4 and 63),
  volum             numeric(8,2) check (volum is null or volum > 0),       -- m³
  statie            text,          -- producătorul betonului / stația
  fam_id            uuid references public.fam(id),
  pv_id             uuid references public.procese_verbale(id),
  bonuri            text,          -- numerele bonurilor de livrare
  ora_inceput       time,
  ora_sfarsit       time,
  temp_aer          numeric(4,1),
  temp_beton        numeric(4,1),
  mod_punere        text,          -- ex. pompă, vibrare cu pervibrator
  tratare           text,          -- protecție și tratare după turnare
  probe_prelevate   integer check (probe_prelevate is null or probe_prelevate >= 0),
  coduri_probe      text,
  observatii        text,
  inregistrat_de    uuid not null default auth.uid() references public.persoane(id),
  creat_la          timestamptz not null default now(),
  vizat_de          uuid references public.persoane(id),
  vizat_la          timestamptz,
  observatii_viza   text,
  unique (proiect_id, numar)
);
create index on public.turnari (proiect_id, numar desc);

create or replace function public.turnare_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('turnari' || new.proiect_id::text));
    select coalesce(max(numar), 0) + 1 into new.numar from turnari where proiect_id = new.proiect_id;
    new.creat_la := now();
  end if;
  if new.fam_id is not null and not exists (
       select 1 from fam where id = new.fam_id and proiect_id = new.proiect_id and stare in ('aprobat', 'aprobat_cu_observatii')) then
    raise exception 'Betonul trebuie să aibă FAM aprobat pe acest proiect.';
  end if;
  if new.pv_id is not null and not exists (
       select 1 from procese_verbale where id = new.pv_id and proiect_id = new.proiect_id and stare = 'semnat') then
    raise exception 'Procesul verbal pentru armătură trebuie să fie semnat de toți participanții înainte de turnare.';
  end if;
  return new;
end $$;

create trigger turnare_inainte before insert or update on public.turnari
  for each row execute function public.turnare_verifica();

create or replace function public.vizeaza_turnare(p_turnare uuid, p_observatii text)
returns void language plpgsql security definer set search_path = public as $$
declare t turnari%rowtype; v_cod text;
begin
  select * into t from turnari where id = p_turnare for update;
  if not found then raise exception 'Turnarea nu există.'; end if;
  if not public.are_rol(t.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Turnările le vizează dirigintele de șantier.';
  end if;
  if t.vizat_la is not null then raise exception 'Turnarea a fost deja vizată.'; end if;
  update turnari set vizat_de = auth.uid(), vizat_la = now(), observatii_viza = nullif(trim(p_observatii), '')
   where id = p_turnare;
  select cod into v_cod from proiecte where id = t.proiect_id;
  insert into registru_intrari (persoana_id, proiect_id, rol, data, tip, descriere, automat)
  values (auth.uid(), t.proiect_id, 'diriginte', current_date, 'condica_betoane',
          format('Condica de betoane %s, turnarea nr. %s din %s: %s, beton %s%s%s. Vizată%s',
                 v_cod, t.numar, to_char(t.data, 'DD.MM.YYYY'), t.element, t.clasa_beton,
                 coalesce(', ' || t.volum::text || ' m³', ''),
                 coalesce(', ' || t.probe_prelevate::text || ' probe prelevate', ''),
                 coalesce(': ' || nullif(trim(p_observatii), ''), '') || '.'),
          true);
end $$;

-- ---------------------------------------------------------------------
-- Încercări de laborator
-- ---------------------------------------------------------------------
create table public.incercari (
  id              uuid primary key default gen_random_uuid(),
  proiect_id      uuid not null references public.proiecte(id) on delete cascade,
  turnare_id      uuid references public.turnari(id),
  fam_id          uuid references public.fam(id),
  tip             text not null,         -- ex. compresiune_28, compresiune_7, consistenta, altul
  descriere       text,                  -- ex. Rezistența la compresiune pe cuburi 150 mm
  laborator       text,                  -- denumirea laboratorului autorizat
  buletin_numar   text,
  buletin_data    date,
  varsta_zile     integer check (varsta_zile is null or varsta_zile between 0 and 400),
  valoare         numeric(10,2),
  unitate         text,
  cerinta         text,                  -- ex. ≥ 30 MPa (fck,cub)
  conform         boolean not null,
  observatii      text,
  introdus_de     uuid not null default auth.uid() references public.persoane(id),
  creat_la        timestamptz not null default now(),
  verificat_de    uuid references public.persoane(id),
  verificat_la    timestamptz,
  check (turnare_id is not null or fam_id is not null),
  constraint incercare_neconforma_cere_observatii check (conform or length(trim(coalesce(observatii, ''))) >= 3)
);
create index on public.incercari (proiect_id, creat_la desc);
create index on public.incercari (turnare_id);

create or replace function public.incercare_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.introdus_de := auth.uid();
  new.creat_la := now();
  new.verificat_de := null;
  new.verificat_la := null;
  if new.turnare_id is not null and not exists (select 1 from turnari where id = new.turnare_id and proiect_id = new.proiect_id) then
    raise exception 'Turnarea nu aparține proiectului.';
  end if;
  if new.fam_id is not null and not exists (select 1 from fam where id = new.fam_id and proiect_id = new.proiect_id) then
    raise exception 'FAM-ul nu aparține proiectului.';
  end if;
  return new;
end $$;

create trigger incercare_inainte before insert on public.incercari
  for each row execute function public.incercare_verifica();

create or replace function public.ia_la_cunostinta_incercare(p_incercare uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i incercari%rowtype; v_ce text;
begin
  select * into i from incercari where id = p_incercare for update;
  if not found then raise exception 'Încercarea nu există.'; end if;
  if not public.are_rol(i.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Rezultatele le ia la cunoștință dirigintele de șantier.';
  end if;
  if i.verificat_la is not null then raise exception 'Rezultatul a fost deja luat la cunoștință.'; end if;
  update incercari set verificat_de = auth.uid(), verificat_la = now() where id = p_incercare;
  v_ce := case
    when i.turnare_id is not null then (select format('turnarea nr. %s (%s, %s)', numar, element, clasa_beton) from turnari where id = i.turnare_id)
    else (select public.cod_fam(i.fam_id))
  end;
  insert into registru_intrari (persoana_id, proiect_id, rol, data, tip, descriere, automat)
  values (auth.uid(), i.proiect_id, 'diriginte', current_date,
          case when i.conform then 'incercare' else 'neconformitate' end::tip_registru,
          format('Rezultat încercare %s pentru %s: %s%s%s, %s%s',
                 coalesce(nullif(i.descriere, ''), i.tip), v_ce,
                 coalesce(i.valoare::text || coalesce(' ' || i.unitate, ''), ''),
                 coalesce(' (cerință ' || i.cerinta || ')', ''),
                 coalesce(', buletin ' || i.buletin_numar, '') || coalesce(' / ' || i.laborator, ''),
                 case when i.conform then 'conform' else 'NECONFORM' end,
                 coalesce('. ' || nullif(trim(i.observatii), ''), '') || '.'),
          true);
end $$;

-- ---------------------------------------------------------------------
-- Atașamente: buletine la încercări, bonuri și poze la turnări
-- ---------------------------------------------------------------------
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare'));

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
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- Jurnal
-- ---------------------------------------------------------------------
create trigger jurnal_turnari after insert or update on public.turnari
  for each row execute function public.scrie_jurnal();
create trigger jurnal_incercari after insert or update on public.incercari
  for each row execute function public.scrie_jurnal();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.turnari   enable row level security;
alter table public.incercari enable row level security;

create policy turnari_citire on public.turnari for select to authenticated
  using (public.este_membru(proiect_id));
create policy turnari_creare on public.turnari for insert to authenticated
  with check (inregistrat_de = auth.uid()
              and public.are_rol(proiect_id, array['constructor','subcontractor']::public.rol_proiect[]));
-- o turnare se corectează doar înainte de viza dirigintelui
create policy turnari_editare on public.turnari for update to authenticated
  using (vizat_la is null and public.are_rol(proiect_id, array['constructor','subcontractor']::public.rol_proiect[]))
  with check (vizat_la is null and public.are_rol(proiect_id, array['constructor','subcontractor']::public.rol_proiect[]));

create policy incercari_citire on public.incercari for select to authenticated
  using (public.este_membru(proiect_id));
create policy incercari_creare on public.incercari for insert to authenticated
  with check (public.are_rol(proiect_id, array['laborator','constructor','subcontractor']::public.rol_proiect[]));

revoke all on public.turnari, public.incercari from anon, authenticated;
grant select on public.turnari, public.incercari to authenticated;
grant insert (proiect_id, data, element, clasa_beton, clasa_expunere, consistenta, dmax, volum, statie, fam_id, pv_id, bonuri,
              ora_inceput, ora_sfarsit, temp_aer, temp_beton, mod_punere, tratare, probe_prelevate, coduri_probe, observatii, inregistrat_de)
  on public.turnari to authenticated;
grant update (data, element, clasa_beton, clasa_expunere, consistenta, dmax, volum, statie, fam_id, pv_id, bonuri,
              ora_inceput, ora_sfarsit, temp_aer, temp_beton, mod_punere, tratare, probe_prelevate, coduri_probe, observatii)
  on public.turnari to authenticated;
grant insert (id, proiect_id, turnare_id, fam_id, tip, descriere, laborator, buletin_numar, buletin_data, varsta_zile,
              valoare, unitate, cerinta, conform, observatii)
  on public.incercari to authenticated;

revoke execute on function public.vizeaza_turnare(uuid, text), public.ia_la_cunostinta_incercare(uuid) from public, anon;
grant execute on function public.vizeaza_turnare(uuid, text), public.ia_la_cunostinta_incercare(uuid) to authenticated;
