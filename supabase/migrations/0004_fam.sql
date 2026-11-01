-- =====================================================================
-- Conpro BIM · migrarea 0004 · FAM (fișa de aprobare a materialelor),
-- verificarea la livrare și atașamentele (fișiere).
--
-- Circuitul: constructorul întocmește și depune FAM-ul înainte de comandă,
-- cu documentele însoțitoare (art. 563 din Legea 169/2026) → proiectantul
-- avizează (conform / echivalent / neconform) → dirigintele aprobă, aprobă
-- cu observații sau respinge. Un FAM respins se reia ca revizie nouă.
-- La livrare, dirigintele verifică dacă produsul adus e cel aprobat;
-- o livrare neconformă intră automat în registrul lui ca neconformitate.
--
-- Fișierele stau în Supabase Storage, în bucket-ul privat „documente”,
-- pe calea <proiect>/<entitate>/<id>/<fișier>. Le văd doar membrii proiectului.
--
-- Se rulează o singură dată, după 0003, în Supabase → SQL Editor.
-- =====================================================================

create type public.stare_fam as enum
  ('ciorna', 'depus', 'completari', 'avizat', 'aprobat', 'aprobat_cu_observatii', 'respins');
create type public.aviz_fam as enum ('conform', 'echivalent', 'neconform');
create type public.decizie_fam as enum ('aprobat', 'aprobat_cu_observatii', 'respins');

alter type public.tip_registru add value if not exists 'aprobare_fam';
alter type public.tip_registru add value if not exists 'verificare_livrare';

-- ---------------------------------------------------------------------
-- FAM
-- ---------------------------------------------------------------------
create table public.fam (
  id                     uuid primary key default gen_random_uuid(),
  proiect_id             uuid not null references public.proiecte(id) on delete cascade,
  numar                  integer not null,
  revizie                integer not null default 1,
  fam_anterior_id        uuid references public.fam(id),
  -- ce se cere și unde se folosește
  material               text not null check (length(trim(material)) > 2),   -- ex. Polistiren expandat EPS 100
  utilizare              text,      -- elementele / zona unde se pune în operă
  cerinte_proiect        text,      -- performanțele cerute în proiect și caietul de sarcini
  -- ce propune constructorul
  producator             text,
  produs                 text,      -- denumirea comercială / tipul
  furnizor               text,
  performante_declarate  text,
  date_mediu             text,      -- cerința fundamentală h), art. 386
  -- documente însoțitoare (art. 563)
  dop_numar              text,      -- declarația de performanță (și de conformitate)
  dop_data               date,
  marcaj_ce              boolean not null default false,
  agrement_numar         text,      -- agrement tehnic + declarația națională de conformitate
  agrement_valabil_pana  date,
  alte_documente         text,
  -- circuit
  stare                  public.stare_fam not null default 'ciorna',
  creat_de               uuid not null default auth.uid() references public.persoane(id),
  creat_la               timestamptz not null default now(),
  depus_de               uuid references public.persoane(id),
  depus_la               timestamptz,
  aviz                   public.aviz_fam,
  aviz_observatii        text,
  avizat_de              uuid references public.persoane(id),
  avizat_la              timestamptz,
  decizie                public.decizie_fam,
  decizie_observatii     text,
  decis_de               uuid references public.persoane(id),
  decis_la               timestamptz,
  unique (proiect_id, numar, revizie)
);
create index on public.fam (proiect_id, numar desc, revizie desc);

create or replace function public.cod_fam(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'FAM-' || pr.cod || '-' || lpad(f.numar::text, 3, '0') || '/R' || f.revizie
  from fam f join proiecte pr on pr.id = f.proiect_id where f.id = p;
$$;

-- Numerotarea și câmpurile de sistem la crearea unui FAM
create or replace function public.fam_la_creare()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.fam_anterior_id is null then
    perform pg_advisory_xact_lock(hashtext('fam' || new.proiect_id::text));
    select coalesce(max(numar), 0) + 1 into new.numar from fam where proiect_id = new.proiect_id;
    new.revizie := 1;
  end if;
  new.creat_la := now();
  return new;
end $$;

create trigger fam_numerotare before insert on public.fam
  for each row execute function public.fam_la_creare();

-- ---------------------------------------------------------------------
-- Tranzițiile circuitului
-- ---------------------------------------------------------------------
create or replace function public.fam_depune(p_fam uuid)
returns public.stare_fam language plpgsql security definer set search_path = public as $$
declare f fam%rowtype; v_stare stare_fam;
begin
  select * into f from fam where id = p_fam for update;
  if not found then raise exception 'FAM-ul nu există.'; end if;
  if not public.are_rol(f.proiect_id, array['constructor','subcontractor']::rol_proiect[]) then
    raise exception 'FAM-ul îl depune constructorul sau subcontractorul.';
  end if;
  if f.stare not in ('ciorna', 'completari') then raise exception 'FAM-ul a fost deja depus.'; end if;
  if coalesce(trim(f.producator), '') = '' or coalesce(trim(f.produs), '') = '' or coalesce(trim(f.utilizare), '') = '' then
    raise exception 'Completați producătorul, produsul și locul de utilizare înainte de depunere.';
  end if;
  if coalesce(trim(f.dop_numar), '') = '' and coalesce(trim(f.agrement_numar), '') = '' and coalesce(trim(f.alte_documente), '') = '' then
    raise exception 'Indicați documentele însoțitoare: declarația de performanță, agrementul tehnic sau alt document de conformitate (art. 563).';
  end if;
  -- fără proiectant în echipă, FAM-ul merge direct la diriginte
  v_stare := case when exists (select 1 from membri_proiect where proiect_id = f.proiect_id and rol = 'proiectant')
                  then 'depus' else 'avizat' end;
  update fam set stare = v_stare, depus_de = auth.uid(), depus_la = now() where id = p_fam;
  return v_stare;
end $$;

create or replace function public.fam_avizeaza(p_fam uuid, p_aviz public.aviz_fam, p_observatii text)
returns public.stare_fam language plpgsql security definer set search_path = public as $$
declare f fam%rowtype; v_stare stare_fam;
begin
  select * into f from fam where id = p_fam for update;
  if not found then raise exception 'FAM-ul nu există.'; end if;
  if not public.are_rol(f.proiect_id, array['proiectant']::rol_proiect[]) then
    raise exception 'Avizul îl dă proiectantul.';
  end if;
  if f.stare <> 'depus' then raise exception 'FAM-ul nu așteaptă avizul proiectantului.'; end if;
  if p_aviz in ('echivalent', 'neconform') and coalesce(length(trim(p_observatii)), 0) < 3 then
    raise exception 'Motivați avizul: ce e echivalent sau ce trebuie completat.';
  end if;
  v_stare := case when p_aviz = 'neconform' then 'completari' else 'avizat' end;
  update fam set stare = v_stare, aviz = p_aviz, aviz_observatii = nullif(trim(p_observatii), ''),
                 avizat_de = auth.uid(), avizat_la = now()
   where id = p_fam;
  return v_stare;
end $$;

create or replace function public.fam_decide(p_fam uuid, p_decizie public.decizie_fam, p_observatii text)
returns public.stare_fam language plpgsql security definer set search_path = public as $$
declare f fam%rowtype;
begin
  select * into f from fam where id = p_fam for update;
  if not found then raise exception 'FAM-ul nu există.'; end if;
  if not public.are_rol(f.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Decizia o ia dirigintele de șantier, pentru beneficiar.';
  end if;
  if f.stare <> 'avizat' then raise exception 'FAM-ul nu așteaptă decizia dirigintelui.'; end if;
  if p_decizie <> 'aprobat' and coalesce(length(trim(p_observatii)), 0) < 3 then
    raise exception 'Scrieți observațiile sau motivul respingerii.';
  end if;
  update fam set stare = p_decizie::text::stare_fam, decizie = p_decizie,
                 decizie_observatii = nullif(trim(p_observatii), ''), decis_de = auth.uid(), decis_la = now()
   where id = p_fam;
  insert into registru_intrari (persoana_id, proiect_id, rol, data, tip, descriere, automat)
  values (auth.uid(), f.proiect_id, 'diriginte', current_date, 'aprobare_fam',
          format('%s %s: %s, %s %s%s', public.cod_fam(p_fam),
                 case p_decizie when 'aprobat' then 'aprobat' when 'aprobat_cu_observatii' then 'aprobat cu observații' else 'respins' end,
                 f.material, coalesce(f.producator, ''), coalesce(f.produs, ''),
                 coalesce('. ' || nullif(trim(p_observatii), ''), '') || '.'),
          true);
  return p_decizie::text::stare_fam;
end $$;

create or replace function public.fam_revizie_noua(p_fam uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare f fam%rowtype; v_id uuid;
begin
  select * into f from fam where id = p_fam for update;
  if not found then raise exception 'FAM-ul nu există.'; end if;
  if not public.are_rol(f.proiect_id, array['constructor','subcontractor']::rol_proiect[]) then
    raise exception 'Revizia o întocmește constructorul sau subcontractorul.';
  end if;
  if f.stare <> 'respins' then raise exception 'Doar un FAM respins se reia ca revizie nouă.'; end if;
  if exists (select 1 from fam where fam_anterior_id = p_fam) then raise exception 'Există deja o revizie nouă.'; end if;
  insert into fam (proiect_id, numar, revizie, fam_anterior_id, material, utilizare, cerinte_proiect, producator, produs,
                   furnizor, performante_declarate, date_mediu, dop_numar, dop_data, marcaj_ce, agrement_numar,
                   agrement_valabil_pana, alte_documente, creat_de)
  values (f.proiect_id, f.numar, f.revizie + 1, f.id, f.material, f.utilizare, f.cerinte_proiect, f.producator, f.produs,
          f.furnizor, f.performante_declarate, f.date_mediu, f.dop_numar, f.dop_data, f.marcaj_ce, f.agrement_numar,
          f.agrement_valabil_pana, f.alte_documente, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Verificarea la livrare
-- ---------------------------------------------------------------------
create table public.livrari_fam (
  id            uuid primary key default gen_random_uuid(),
  fam_id        uuid not null references public.fam(id) on delete cascade,
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  data          date not null default current_date,
  cantitate     text,
  lot           text,
  document_insotire text,       -- aviz de însoțire, factură, certificat de calitate al lotului
  conform       boolean not null,
  observatii    text,
  verificat_de  uuid not null default auth.uid() references public.persoane(id),
  creat_la      timestamptz not null default now(),
  constraint livrare_neconforma_cere_observatii check (conform or length(trim(coalesce(observatii, ''))) >= 3)
);
create index on public.livrari_fam (fam_id);

create or replace function public.livrare_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare f fam%rowtype;
begin
  select * into f from fam where id = new.fam_id;
  if not found then raise exception 'FAM-ul nu există.'; end if;
  new.proiect_id := f.proiect_id;
  new.verificat_de := auth.uid();
  new.creat_la := now();
  if not public.are_rol(f.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Verificarea la livrare o face dirigintele de șantier.';
  end if;
  if f.stare not in ('aprobat', 'aprobat_cu_observatii') then
    raise exception 'Materialul nu are FAM aprobat. Nu se pune în operă până la aprobare.';
  end if;
  return new;
end $$;

create trigger livrare_inainte before insert on public.livrari_fam
  for each row execute function public.livrare_verifica();

create or replace function public.livrare_in_registru()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into registru_intrari (persoana_id, proiect_id, rol, data, tip, descriere, automat)
  values (new.verificat_de, new.proiect_id, 'diriginte', new.data,
          case when new.conform then 'verificare_livrare' else 'neconformitate' end::tip_registru,
          format('%s: livrare %s%s%s%s', public.cod_fam(new.fam_id),
                 case when new.conform then 'conformă cu FAM-ul aprobat' else 'NECONFORMĂ, produsul nu se pune în operă' end,
                 coalesce(', cantitate ' || nullif(trim(new.cantitate), ''), ''),
                 coalesce(', lot ' || nullif(trim(new.lot), ''), ''),
                 coalesce('. ' || nullif(trim(new.observatii), ''), '') || '.'),
          true);
  return new;
end $$;

create trigger livrare_dupa after insert on public.livrari_fam
  for each row execute function public.livrare_in_registru();

-- ---------------------------------------------------------------------
-- Atașamente (fișiere în Storage)
-- ---------------------------------------------------------------------
create table public.atasamente (
  id            uuid primary key default gen_random_uuid(),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  entitate      text not null check (entitate in ('fam', 'livrare_fam', 'pv')),
  entitate_id   uuid not null,
  tip_document  text not null default 'altul',
  nume_fisier   text not null,
  cale          text not null unique,
  marime        bigint,
  incarcat_de   uuid not null default auth.uid() references public.persoane(id),
  incarcat_la   timestamptz not null default now()
);
create index on public.atasamente (entitate, entitate_id);

-- Prima parte a căii e proiectul; o cale greșită dă null, nu eroare.
create or replace function public.proiect_din_cale(cale text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(cale, '/', 1)::uuid;
exception when others then
  return null;
end $$;

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
  end if;
  return false;
end $$;

create or replace function public.atasament_la_creare()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.incarcat_de := auth.uid();
  new.incarcat_la := now();
  if public.proiect_din_cale(new.cale) is distinct from new.proiect_id
     or new.cale not like new.proiect_id::text || '/' || new.entitate || '/' || new.entitate_id::text || '/%' then
    raise exception 'Calea fișierului nu corespunde proiectului.';
  end if;
  if not public.poate_atasa(new.entitate, new.entitate_id, new.proiect_id) then
    raise exception 'Nu puteți atașa fișiere aici (după depunere, FAM-ul nu se mai modifică).';
  end if;
  return new;
end $$;

create trigger atasament_verificare before insert on public.atasamente
  for each row execute function public.atasament_la_creare();

-- ---------------------------------------------------------------------
-- Jurnal
-- ---------------------------------------------------------------------
create trigger jurnal_fam after insert or update on public.fam
  for each row execute function public.scrie_jurnal();
create trigger jurnal_livrari_fam after insert on public.livrari_fam
  for each row execute function public.scrie_jurnal();
create trigger jurnal_atasamente after insert on public.atasamente
  for each row execute function public.scrie_jurnal();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.fam         enable row level security;
alter table public.livrari_fam enable row level security;
alter table public.atasamente  enable row level security;

create policy fam_citire on public.fam for select to authenticated
  using (public.este_membru(proiect_id));
create policy fam_creare on public.fam for insert to authenticated
  with check (creat_de = auth.uid()
              and public.are_rol(proiect_id, array['constructor','subcontractor']::public.rol_proiect[]));
-- se editează doar ciorna și FAM-ul întors la completări; stările se schimbă doar prin funcții
create policy fam_editare on public.fam for update to authenticated
  using (stare in ('ciorna', 'completari')
         and public.are_rol(proiect_id, array['constructor','subcontractor']::public.rol_proiect[]))
  with check (stare in ('ciorna', 'completari')
              and public.are_rol(proiect_id, array['constructor','subcontractor']::public.rol_proiect[]));

create policy livrari_citire on public.livrari_fam for select to authenticated
  using (public.este_membru(proiect_id));
create policy livrari_creare on public.livrari_fam for insert to authenticated
  with check (true);   -- verificările de rol și de stare sunt în triggerul livrare_verifica

create policy atasamente_citire on public.atasamente for select to authenticated
  using (public.este_membru(proiect_id));
create policy atasamente_creare on public.atasamente for insert to authenticated
  with check (true);   -- verificările sunt în triggerul atasament_la_creare

revoke all on public.fam, public.livrari_fam, public.atasamente from anon, authenticated;
grant select on public.fam, public.livrari_fam, public.atasamente to authenticated;
grant insert (proiect_id, material, utilizare, cerinte_proiect, producator, produs, furnizor, performante_declarate,
              date_mediu, dop_numar, dop_data, marcaj_ce, agrement_numar, agrement_valabil_pana, alte_documente, creat_de)
  on public.fam to authenticated;
grant update (material, utilizare, cerinte_proiect, producator, produs, furnizor, performante_declarate,
              date_mediu, dop_numar, dop_data, marcaj_ce, agrement_numar, agrement_valabil_pana, alte_documente)
  on public.fam to authenticated;
grant insert (fam_id, data, cantitate, lot, document_insotire, conform, observatii) on public.livrari_fam to authenticated;
grant insert (proiect_id, entitate, entitate_id, tip_document, nume_fisier, cale, marime) on public.atasamente to authenticated;

revoke execute on function public.fam_depune(uuid), public.fam_avizeaza(uuid, public.aviz_fam, text),
  public.fam_decide(uuid, public.decizie_fam, text), public.fam_revizie_noua(uuid) from public, anon;
grant execute on function public.fam_depune(uuid), public.fam_avizeaza(uuid, public.aviz_fam, text),
  public.fam_decide(uuid, public.decizie_fam, text), public.fam_revizie_noua(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket privat „documente”, accesibil doar membrilor proiectului
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documente', 'documente', false, 52428800)   -- 50 MB pe fișier
on conflict (id) do nothing;

drop policy if exists documente_citire on storage.objects;
create policy documente_citire on storage.objects for select to authenticated
  using (bucket_id = 'documente' and public.este_membru(public.proiect_din_cale(name)));

drop policy if exists documente_incarcare on storage.objects;
create policy documente_incarcare on storage.objects for insert to authenticated
  with check (bucket_id = 'documente'
              and public.este_membru(public.proiect_din_cale(name))
              and not public.are_rol(public.proiect_din_cale(name), array['cititor']::public.rol_proiect[]));
