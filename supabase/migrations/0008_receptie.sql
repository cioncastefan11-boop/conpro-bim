-- =====================================================================
-- Conpro BIM · migrarea 0008 · Recepția construcției
--
-- Legea 169/2026: recepția la terminarea lucrărilor și recepția finală
-- (art. 527 alin. 2), recepții parțiale (art. 527 alin. 3, art. 574),
-- documentele de recepție (art. 528 alin. 3), dirigintele asigură
-- secretariatul comisiei și întocmește documentele (art. 456 alin. 1
-- lit. j), reprezentantul emitentului autorizației participă obligatoriu
-- (art. 280 alin. 3), construcțiile fără autorizație nu se recepționează
-- (art. 280 alin. 8), perioada de garanție minimă după clasa de
-- consecințe și curgerea ei de la recepția la terminare (art. 531),
-- recepția finală și prelungirea garanției (art. 532).
-- Procedura de detaliu urmează regulamentul de recepție în vigoare
-- (art. 528 alin. 5): reprezentanții autorităților și ai organelor de
-- control au drept de veto, motivat în scris; investitorul aprobă sau
-- respinge recepția pe baza deciziei comisiei.
--
-- Fluxul: pregătire → convocată → decisă (comisia) → aprobată / respinsă
-- (beneficiarul). Obiecțiile se remediază de executant și se confirmă
-- de diriginte.
--
-- Se rulează o singură dată, după 0007, în Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Recepțiile
-- ---------------------------------------------------------------------
create table public.receptii (
  id                       uuid primary key default gen_random_uuid(),
  proiect_id               uuid not null references public.proiecte(id) on delete cascade,
  numar                    integer not null,
  tip                      text not null check (tip in ('terminare', 'finala')),
  partiala                 boolean not null default false,
  obiect                   text not null check (length(trim(obiect)) > 2),  -- întreaga construcție sau partea recepționată
  receptie_terminare_id    uuid references public.receptii(id),             -- la recepția finală
  data_finalizare_lucrari  date,                                            -- înștiințarea emitentului AC (art. 280 alin. 10)
  data_receptie            date,
  loc                      text,
  garantie_luni            integer check (garantie_luni is null or garantie_luni between 1 and 600),
  stare                    text not null default 'pregatire'
                           check (stare in ('pregatire', 'convocata', 'decisa', 'aprobata', 'respinsa', 'anulata')),
  constatari               text,
  decizie                  text check (decizie in ('admitere', 'admitere_cu_obiectii', 'suspendare', 'respingere', 'prelungire_garantie')),
  motivare_decizie         text,
  decis_de                 uuid references public.persoane(id),
  decis_la                 timestamptz,
  aprobat_de               uuid references public.persoane(id),
  aprobat_la               timestamptz,
  observatii_beneficiar    text,
  garantie_pana            date,           -- sfârșitul garanției (la terminare) sau noul termen (la prelungire)
  motiv_anulare            text,
  convocat_la              timestamptz,
  creat_de                 uuid not null default auth.uid() references public.persoane(id),
  creat_la                 timestamptz not null default now(),
  unique (proiect_id, numar),
  constraint finala_cere_terminare check ((tip = 'finala') = (receptie_terminare_id is not null))
);
create index on public.receptii (proiect_id, numar desc);
-- o singură recepție la terminare a întregii construcții în lucru
create unique index receptie_terminare_unica on public.receptii (proiect_id)
  where tip = 'terminare' and not partiala and stare not in ('respinsa', 'anulata');

create table public.comisie_receptie (
  id             uuid primary key default gen_random_uuid(),
  receptie_id    uuid not null references public.receptii(id) on delete cascade,
  proiect_id     uuid not null references public.proiecte(id) on delete cascade,
  ordine         integer not null default 0,
  nume           text not null check (length(trim(nume)) > 2),
  calitate       text not null check (calitate in (
                   'presedinte', 'reprezentant_ac', 'specialist', 'isc', 'isu', 'cultura', 'ordonator_credite',
                   'invitat_executant', 'invitat_proiectant', 'invitat_altul')),
  institutie     text,
  pozitie        text check (pozitie in ('de_acord', 'obiectii', 'veto')),
  motivare       text,
  inregistrat_la timestamptz,
  constraint invitatii_nu_voteaza check (pozitie is null or calitate not like 'invitat%'),
  constraint veto_doar_autoritati check (pozitie is distinct from 'veto'
    or calitate in ('reprezentant_ac', 'isc', 'isu', 'cultura', 'ordonator_credite')),
  constraint veto_motivat check (pozitie is distinct from 'veto' or length(trim(coalesce(motivare, ''))) > 5)
);
create index on public.comisie_receptie (receptie_id, ordine);

create table public.obiectii_receptie (
  id            uuid primary key default gen_random_uuid(),
  receptie_id   uuid not null references public.receptii(id) on delete cascade,
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  numar         integer not null,
  descriere     text not null check (length(trim(descriere)) > 4),
  termen        date not null,
  responsabil   text,
  stare         text not null default 'deschisa' check (stare in ('deschisa', 'remediata', 'confirmata')),
  remediere     text,
  remediat_de   uuid references public.persoane(id),
  remediat_la   timestamptz,
  confirmat_de  uuid references public.persoane(id),
  confirmat_la  timestamptz,
  creat_de      uuid not null default auth.uid() references public.persoane(id),
  creat_la      timestamptz not null default now(),
  unique (receptie_id, numar)
);

-- ---------------------------------------------------------------------
-- Reguli
-- ---------------------------------------------------------------------
create or replace function public.cod_receptie(r public.receptii)
returns text language sql stable set search_path = public as $$
  select format('%s %s nr. %s%s',
                case r.tip when 'terminare' then 'Recepția la terminarea lucrărilor' else 'Recepția finală' end,
                (select cod from proiecte where id = r.proiect_id), r.numar,
                case when r.partiala then ' (parțială)' else '' end);
$$;

create or replace function public.garantie_minima_luni(c public.clasa_consecinte)
returns integer language sql immutable as $$
  select case c when 'CC1' then 12 when 'CC2' then 36 when 'CC3' then 60 when 'CC4' then 60 end;
$$;

create or replace function public.receptie_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare t receptii%rowtype; p proiecte%rowtype;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('receptii' || new.proiect_id::text));
    select * into p from proiecte where id = new.proiect_id;
    if new.tip = 'terminare' and p.ac_numar is null then
      raise exception 'Construcțiile fără autorizație de construire nu se pot recepționa (art. 280 alin. 8). Completați autorizația în detaliile proiectului.';
    end if;
    if new.tip = 'finala' then
      select * into t from receptii where id = new.receptie_terminare_id;
      if not found or t.proiect_id <> new.proiect_id or t.tip <> 'terminare' or t.stare <> 'aprobata'
         or t.decizie not in ('admitere', 'admitere_cu_obiectii') then
        raise exception 'Recepția finală se face după o recepție la terminarea lucrărilor admisă și aprobată.';
      end if;
      new.partiala := t.partiala;
    end if;
    if new.garantie_luni is null and new.tip = 'terminare' then
      new.garantie_luni := public.garantie_minima_luni(p.clasa_consecinte);
    end if;
    new.numar := coalesce((select max(numar) from receptii where proiect_id = new.proiect_id), 0) + 1;
    new.stare := 'pregatire';
    new.creat_la := now();
  end if;
  return new;
end $$;

create trigger receptie_verificare before insert on public.receptii
  for each row execute function public.receptie_verifica();

create or replace function public.receptie_editabila(p_receptie uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from receptii r where r.id = p_receptie and r.stare in ('pregatire', 'convocata')
                 and public.are_rol(r.proiect_id, array['diriginte']::rol_proiect[]));
$$;

create or replace function public.obiectie_numar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('obiectii' || new.receptie_id::text));
  new.proiect_id := (select proiect_id from receptii where id = new.receptie_id);
  new.numar := coalesce((select max(numar) from obiectii_receptie where receptie_id = new.receptie_id), 0) + 1;
  new.stare := 'deschisa';
  return new;
end $$;
create trigger obiectie_numerotare before insert on public.obiectii_receptie
  for each row execute function public.obiectie_numar();

create or replace function public.comisie_proiect()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_stare text := (select stare from receptii where id = new.receptie_id);
begin
  new.proiect_id := (select proiect_id from receptii where id = new.receptie_id);
  if v_stare <> 'pregatire' and (tg_op = 'INSERT' or old.nume is distinct from new.nume or old.calitate is distinct from new.calitate
                                 or old.institutie is distinct from new.institutie) then
    raise exception 'Componența comisiei nu se mai schimbă după convocare.';
  end if;
  if new.pozitie is not null and (tg_op = 'INSERT' or old.pozitie is distinct from new.pozitie or old.motivare is distinct from new.motivare) then
    if (select stare from receptii where id = new.receptie_id) <> 'convocata' then
      raise exception 'Pozițiile membrilor se consemnează în ședința comisiei, după convocare.';
    end if;
    new.inregistrat_la := now();
  end if;
  return new;
end $$;
create trigger comisie_completare before insert or update on public.comisie_receptie
  for each row execute function public.comisie_proiect();

-- ---------------------------------------------------------------------
-- Convocarea comisiei (dirigintele, ca secretariat)
-- ---------------------------------------------------------------------
create or replace function public.receptie_convoaca(p_receptie uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r receptii%rowtype; c clasa_consecinte; v_min integer;
begin
  select * into r from receptii where id = p_receptie for update;
  if not found then raise exception 'Recepția nu există.'; end if;
  if not public.are_rol(r.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Convocarea o face dirigintele de șantier, care asigură secretariatul comisiei (art. 456 alin. 1 lit. j).';
  end if;
  if r.stare <> 'pregatire' then raise exception 'Recepția a fost deja convocată.'; end if;
  if r.data_receptie is null or nullif(trim(r.loc), '') is null then
    raise exception 'Completați data și locul recepției.';
  end if;
  if not exists (select 1 from comisie_receptie where receptie_id = p_receptie and calitate = 'presedinte') then
    raise exception 'Comisia trebuie să aibă un președinte, desemnat de investitor.';
  end if;
  if not exists (select 1 from comisie_receptie where receptie_id = p_receptie and calitate = 'specialist') then
    raise exception 'Comisia trebuie să aibă cel puțin un specialist.';
  end if;
  if r.tip = 'terminare' then
    if not exists (select 1 from comisie_receptie where receptie_id = p_receptie and calitate = 'reprezentant_ac') then
      raise exception 'La recepția la terminarea lucrărilor participă obligatoriu reprezentantul emitentului autorizației de construire (art. 280 alin. 3).';
    end if;
    select clasa_consecinte into c from proiecte where id = r.proiect_id;
    v_min := public.garantie_minima_luni(c);
    if r.garantie_luni is null then
      raise exception 'Completați perioada de garanție din contract (art. 531).';
    end if;
    if v_min is not null and r.garantie_luni < v_min then
      raise exception 'Perioada de garanție nu poate fi mai mică de % luni pentru clasa % (art. 531 alin. 6).', v_min, c;
    end if;
  end if;
  update receptii set stare = 'convocata', convocat_la = now() where id = p_receptie;
end $$;

-- ---------------------------------------------------------------------
-- Decizia comisiei, consemnată de secretariat (diriginte)
-- ---------------------------------------------------------------------
create or replace function public.receptie_decide(p_receptie uuid, p_decizie text, p_constatari text, p_motivare text,
                                                  p_garantie_pana date default null)
returns void language plpgsql security definer set search_path = public as $$
declare r receptii%rowtype; v_fara integer; v_veto boolean; v_desc integer; v_neconf integer;
begin
  select * into r from receptii where id = p_receptie for update;
  if not found then raise exception 'Recepția nu există.'; end if;
  if not public.are_rol(r.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Decizia comisiei o consemnează dirigintele de șantier, ca secretariat al comisiei.';
  end if;
  if r.stare <> 'convocata' then raise exception 'Decizia se consemnează doar pentru o recepție convocată.'; end if;
  if p_decizie not in ('admitere', 'admitere_cu_obiectii', 'suspendare', 'respingere', 'prelungire_garantie') then
    raise exception 'Decizie necunoscută.';
  end if;
  if p_decizie = 'prelungire_garantie' and r.tip <> 'finala' then
    raise exception 'Prelungirea garanției se decide doar la recepția finală (art. 532 alin. 3).';
  end if;
  if length(trim(coalesce(p_constatari, ''))) < 10 then
    raise exception 'Completați constatările comisiei.';
  end if;
  select count(*) filter (where pozitie is null), coalesce(bool_or(pozitie = 'veto'), false)
    into v_fara, v_veto
    from comisie_receptie where receptie_id = p_receptie and calitate not like 'invitat%';
  if v_fara > 0 then
    raise exception 'Consemnați poziția fiecărui membru al comisiei (mai sunt %).', v_fara;
  end if;
  if v_veto and p_decizie <> 'respingere' then
    raise exception 'Un membru cu drept de veto a propus respingerea; recepția nu poate fi admisă.';
  end if;
  if p_decizie in ('suspendare', 'respingere', 'prelungire_garantie') and length(trim(coalesce(p_motivare, ''))) < 10 then
    raise exception 'Motivați decizia în scris.';
  end if;
  select count(*) into v_desc from obiectii_receptie where receptie_id = p_receptie;
  if p_decizie in ('admitere_cu_obiectii', 'prelungire_garantie') and v_desc = 0 then
    raise exception 'Consemnați obiecțiile, cu termene de remediere.';
  end if;
  if p_decizie = 'admitere' and exists (select 1 from obiectii_receptie where receptie_id = p_receptie and stare <> 'confirmata') then
    raise exception 'Există obiecții nerezolvate: alegeți „admitere cu obiecții”.';
  end if;
  if r.tip = 'finala' and p_decizie = 'admitere' then
    select count(*) into v_neconf from obiectii_receptie where receptie_id = r.receptie_terminare_id and stare <> 'confirmata';
    if v_neconf > 0 then
      raise exception 'Obiecțiile de la recepția la terminare nu sunt toate remediate și confirmate (mai sunt %).', v_neconf;
    end if;
  end if;
  if p_decizie = 'prelungire_garantie' and (p_garantie_pana is null or p_garantie_pana <= r.data_receptie) then
    raise exception 'Indicați noul termen al garanției, până la remedierea defectelor.';
  end if;

  update receptii set stare = 'decisa', decizie = p_decizie, constatari = trim(p_constatari),
         motivare_decizie = nullif(trim(p_motivare), ''), decis_de = auth.uid(), decis_la = now(),
         garantie_pana = case when p_decizie = 'prelungire_garantie' then p_garantie_pana else garantie_pana end
   where id = p_receptie;

  insert into registru_intrari (persoana_id, proiect_id, rol, data, tip, descriere, automat)
  values (auth.uid(), r.proiect_id, 'diriginte', current_date, 'receptie',
          format('%s (%s), %s: comisia a decis %s%s.', public.cod_receptie(r), r.obiect, to_char(r.data_receptie, 'DD.MM.YYYY'),
                 case p_decizie when 'admitere' then 'admiterea recepției'
                                when 'admitere_cu_obiectii' then format('admiterea recepției cu %s obiecții', v_desc)
                                when 'suspendare' then 'suspendarea recepției'
                                when 'respingere' then 'respingerea recepției'
                                else 'prelungirea garanției până la ' || to_char(p_garantie_pana, 'DD.MM.YYYY') end,
                 coalesce(': ' || nullif(trim(p_motivare), ''), '')),
          true);
end $$;

-- ---------------------------------------------------------------------
-- Aprobarea de către beneficiar / investitor
-- ---------------------------------------------------------------------
create or replace function public.receptie_aproba(p_receptie uuid, p_aproba boolean, p_observatii text)
returns void language plpgsql security definer set search_path = public as $$
declare r receptii%rowtype;
begin
  select * into r from receptii where id = p_receptie for update;
  if not found then raise exception 'Recepția nu există.'; end if;
  if not public.are_rol(r.proiect_id, array['beneficiar']::rol_proiect[]) then
    raise exception 'Recepția o aprobă beneficiarul / investitorul (art. 527 alin. 2).';
  end if;
  if r.stare <> 'decisa' then raise exception 'Comisia nu a luat încă o decizie.'; end if;
  if p_aproba and r.decizie in ('suspendare', 'respingere') then
    raise exception 'Comisia a propus %; recepția nu se poate aproba.',
      case r.decizie when 'suspendare' then 'suspendarea' else 'respingerea' end;
  end if;
  if not p_aproba and length(trim(coalesce(p_observatii, ''))) < 5 then
    raise exception 'Motivați respingerea.';
  end if;

  update receptii set stare = case when p_aproba then 'aprobata' else 'respinsa' end,
         aprobat_de = auth.uid(), aprobat_la = now(), observatii_beneficiar = nullif(trim(p_observatii), ''),
         garantie_pana = case when p_aproba and r.tip = 'terminare'
                              then (r.data_receptie + make_interval(months => r.garantie_luni))::date
                              else garantie_pana end
   where id = p_receptie;

  -- stadiul proiectului (art. 479, art. 531): după recepția la terminare a întregii construcții
  -- începe stadiul 6; după recepția finală admisă, stadiul 7
  if p_aproba and not r.partiala then
    if r.tip = 'terminare' then
      update proiecte set stadiu_catuc = greatest(stadiu_catuc, 6) where id = r.proiect_id;
    elsif r.decizie = 'admitere' then
      update proiecte set stadiu_catuc = greatest(stadiu_catuc, 7) where id = r.proiect_id;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Anularea, înainte de decizie
-- ---------------------------------------------------------------------
create or replace function public.receptie_anuleaza(p_receptie uuid, p_motiv text)
returns void language plpgsql security definer set search_path = public as $$
declare r receptii%rowtype;
begin
  select * into r from receptii where id = p_receptie for update;
  if not found then raise exception 'Recepția nu există.'; end if;
  if not public.are_rol(r.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Doar dirigintele poate anula recepția.';
  end if;
  if r.stare not in ('pregatire', 'convocata') then raise exception 'După decizia comisiei recepția nu se mai anulează.'; end if;
  if length(trim(coalesce(p_motiv, ''))) < 5 then raise exception 'Scrieți motivul anulării.'; end if;
  update receptii set stare = 'anulata', motiv_anulare = trim(p_motiv) where id = p_receptie;
end $$;

-- ---------------------------------------------------------------------
-- Obiecții: executantul le remediază, dirigintele confirmă
-- ---------------------------------------------------------------------
create or replace function public.obiectie_remediata(p_obiectie uuid, p_remediere text)
returns void language plpgsql security definer set search_path = public as $$
declare o obiectii_receptie%rowtype;
begin
  select * into o from obiectii_receptie where id = p_obiectie for update;
  if not found then raise exception 'Obiecția nu există.'; end if;
  if not public.are_rol(o.proiect_id, array['constructor','subcontractor']::rol_proiect[]) then
    raise exception 'Remedierea o raportează executantul.';
  end if;
  if o.stare <> 'deschisa' then raise exception 'Obiecția nu mai e deschisă.'; end if;
  if length(trim(coalesce(p_remediere, ''))) < 5 then raise exception 'Descrieți remedierea.'; end if;
  update obiectii_receptie set stare = 'remediata', remediere = trim(p_remediere), remediat_de = auth.uid(), remediat_la = now()
   where id = p_obiectie;
end $$;

create or replace function public.obiectie_confirma(p_obiectie uuid, p_accept boolean, p_observatii text)
returns void language plpgsql security definer set search_path = public as $$
declare o obiectii_receptie%rowtype; r receptii%rowtype;
begin
  select * into o from obiectii_receptie where id = p_obiectie for update;
  if not found then raise exception 'Obiecția nu există.'; end if;
  if not public.are_rol(o.proiect_id, array['diriginte']::rol_proiect[]) then
    raise exception 'Remedierea o confirmă dirigintele de șantier.';
  end if;
  if o.stare <> 'remediata' then raise exception 'Obiecția nu a fost raportată ca remediată.'; end if;
  if not p_accept and length(trim(coalesce(p_observatii, ''))) < 5 then raise exception 'Scrieți de ce nu acceptați remedierea.'; end if;
  select * into r from receptii where id = o.receptie_id;
  if p_accept then
    update obiectii_receptie set stare = 'confirmata', confirmat_de = auth.uid(), confirmat_la = now() where id = p_obiectie;
  else
    update obiectii_receptie set stare = 'deschisa', remediere = remediere || E'\nNeacceptată: ' || trim(p_observatii),
           remediat_de = null, remediat_la = null
     where id = p_obiectie;
  end if;
  insert into registru_intrari (persoana_id, proiect_id, rol, data, tip, descriere, automat)
  values (auth.uid(), o.proiect_id, 'diriginte', current_date, 'receptie',
          format('%s, obiecția nr. %s (%s): remediere %s%s.', public.cod_receptie(r), o.numar, o.descriere,
                 case when p_accept then 'confirmată' else 'neacceptată' end,
                 coalesce(': ' || nullif(trim(p_observatii), ''), '')),
          true);
end $$;

-- ---------------------------------------------------------------------
-- Atașamente: documentele de recepție (art. 528 alin. 3) și dovezile remedierilor
-- ---------------------------------------------------------------------
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte',
                      'receptie', 'obiectie_receptie'));

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
  elsif p_entitate = 'receptie' then
    return exists (select 1 from receptii where id = p_id and proiect_id = p_proiect and stare <> 'anulata')
       and public.are_rol(p_proiect, array['diriginte','proiectant','constructor','beneficiar']::rol_proiect[]);
  elsif p_entitate = 'obiectie_receptie' then
    return exists (select 1 from obiectii_receptie where id = p_id and proiect_id = p_proiect and stare <> 'confirmata')
       and public.are_rol(p_proiect, array['constructor','subcontractor','diriginte']::rol_proiect[]);
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- Jurnal
-- ---------------------------------------------------------------------
create trigger jurnal_receptii after insert or update on public.receptii
  for each row execute function public.scrie_jurnal();
create trigger jurnal_comisie_receptie after insert or update or delete on public.comisie_receptie
  for each row execute function public.scrie_jurnal();
create trigger jurnal_obiectii_receptie after insert or update on public.obiectii_receptie
  for each row execute function public.scrie_jurnal();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.receptii          enable row level security;
alter table public.comisie_receptie  enable row level security;
alter table public.obiectii_receptie enable row level security;

create policy receptii_citire on public.receptii for select to authenticated using (public.este_membru(proiect_id));
create policy receptii_creare on public.receptii for insert to authenticated
  with check (creat_de = auth.uid() and public.are_rol(proiect_id, array['diriginte']::public.rol_proiect[]));
create policy receptii_editare on public.receptii for update to authenticated
  using (stare in ('pregatire', 'convocata') and public.are_rol(proiect_id, array['diriginte']::public.rol_proiect[]))
  with check (stare in ('pregatire', 'convocata') and public.are_rol(proiect_id, array['diriginte']::public.rol_proiect[]));

create policy comisie_citire on public.comisie_receptie for select to authenticated using (public.este_membru(proiect_id));
create policy comisie_creare on public.comisie_receptie for insert to authenticated with check (public.receptie_editabila(receptie_id));
create policy comisie_editare on public.comisie_receptie for update to authenticated
  using (public.receptie_editabila(receptie_id)) with check (public.receptie_editabila(receptie_id));
create policy comisie_stergere on public.comisie_receptie for delete to authenticated
  using (public.receptie_editabila(receptie_id)
         and (select stare from public.receptii where id = receptie_id) = 'pregatire');

create policy obiectii_citire on public.obiectii_receptie for select to authenticated using (public.este_membru(proiect_id));
create policy obiectii_creare on public.obiectii_receptie for insert to authenticated
  with check (creat_de = auth.uid() and public.receptie_editabila(receptie_id)
              and (select stare from public.receptii where id = receptie_id) = 'convocata');

revoke all on public.receptii, public.comisie_receptie, public.obiectii_receptie from anon, authenticated;
grant select on public.receptii, public.comisie_receptie, public.obiectii_receptie to authenticated;
grant insert (id, proiect_id, tip, partiala, obiect, receptie_terminare_id, data_finalizare_lucrari, data_receptie, loc, garantie_luni, creat_de)
  on public.receptii to authenticated;
grant update (obiect, data_finalizare_lucrari, data_receptie, loc, garantie_luni) on public.receptii to authenticated;
grant insert (receptie_id, ordine, nume, calitate, institutie, pozitie, motivare) on public.comisie_receptie to authenticated;
grant update (ordine, nume, calitate, institutie, pozitie, motivare) on public.comisie_receptie to authenticated;
grant delete on public.comisie_receptie to authenticated;
grant insert (receptie_id, descriere, termen, responsabil, creat_de) on public.obiectii_receptie to authenticated;

revoke execute on function public.receptie_convoaca(uuid), public.receptie_decide(uuid, text, text, text, date),
  public.receptie_aproba(uuid, boolean, text), public.receptie_anuleaza(uuid, text),
  public.obiectie_remediata(uuid, text), public.obiectie_confirma(uuid, boolean, text) from public, anon;
grant execute on function public.receptie_convoaca(uuid), public.receptie_decide(uuid, text, text, text, date),
  public.receptie_aproba(uuid, boolean, text), public.receptie_anuleaza(uuid, text),
  public.obiectie_remediata(uuid, text), public.obiectie_confirma(uuid, boolean, text) to authenticated;
