-- =====================================================================
-- Conpro BIM · migrarea 0018 · Observațiile pe model (BCF)
--
-- ISO 19650-2, 5.6–5.7, și harta BIM (linia BCF): neconformitățile,
-- întrebările către proiectant, dispozițiile și lista de remedieri se
-- deschid pe elementele din modelul IFC, cu punctul de vedere (camera),
-- captura, responsabilul, termenul și discuția. Se pot exporta și importa
-- în formatul BCF 2.1, ca să circule și cu Revit, Archicad, BIMcollab, Solibri.
--
-- Stări (ca în BCF): deschisă → în lucru → rezolvată → închisă (de autor sau
-- de diriginte / administrator, după verificare); se poate redeschide.
-- Fiecare schimbare de stare se face prin observatie_stare() și rămâne în
-- discuție și în Istoric.
--
-- Se rulează o singură dată, după 0017, în Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.observatii (
  id               uuid primary key default gen_random_uuid(),
  proiect_id       uuid not null references public.proiecte(id) on delete cascade,
  numar            integer not null,
  bcf_guid         uuid not null default gen_random_uuid(),   -- identificatorul topicului BCF (la import, cel din fișier)
  tip              text not null default 'neconformitate'
                   check (tip in ('neconformitate', 'intrebare', 'dispozitie', 'remediere', 'comentariu')),
  prioritate       text not null default 'normala' check (prioritate in ('mica', 'normala', 'mare', 'critica')),
  titlu            text not null check (length(trim(titlu)) > 2),
  descriere        text,
  stare            text not null default 'deschisa' check (stare in ('deschisa', 'in_lucru', 'rezolvata', 'inchisa')),
  atribuita_rol    text,                        -- rolul care răspunde (ex. proiectant)
  atribuita_catre  uuid references public.persoane(id),
  termen           date,
  zona             text,                        -- nivel, ax, încăpere
  elemente         jsonb not null default '[]', -- [{"guid": "...", "nume": "...", "clasa": "IFCBEAM"}]
  punct_vedere     jsonb,                       -- camera BCF, în coordonatele IFC
  sursa            text,                        -- „aplicatie” sau numele fișierului BCF importat
  autor_extern     text,                        -- autorul din fișierul BCF, dacă nu are cont
  creat_de         uuid not null default auth.uid() references public.persoane(id),
  creat_la         timestamptz not null default now(),
  rezolvata_la     timestamptz,
  inchisa_la       timestamptz,
  inchisa_de       uuid references public.persoane(id),
  unique (proiect_id, numar),
  unique (proiect_id, bcf_guid)
);
create index if not exists observatii_proiect on public.observatii (proiect_id, stare);

create table if not exists public.comentarii_observatie (
  id             uuid primary key default gen_random_uuid(),
  observatie_id  uuid not null references public.observatii(id) on delete cascade,
  proiect_id     uuid not null references public.proiecte(id) on delete cascade,
  text           text not null check (length(trim(text)) > 0),
  stare_noua     text,                          -- dacă a însoțit o schimbare de stare
  autor_extern   text,                          -- la import: autorul din BCF
  data_externa   timestamptz,                   -- la import: data din BCF
  bcf_guid       uuid not null default gen_random_uuid(),
  creat_de       uuid not null default auth.uid() references public.persoane(id),
  creat_la       timestamptz not null default now()
);
create index if not exists comentarii_observatie_obs on public.comentarii_observatie (observatie_id, creat_la);

create or replace function public.lucreaza_in_proiect(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.rol_in_proiect(p) is not null and public.rol_in_proiect(p)::text <> 'cititor';
$$;

-- poate modifica observația: autorul, dirigintele, administratorul
create or replace function public.coordoneaza_observatia(o public.observatii)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(o.creat_de = auth.uid(), false) or public.are_rol(o.proiect_id, array['diriginte', 'administrator']::rol_proiect[]);
$$;

create or replace function public.observatie_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.lucreaza_in_proiect(new.proiect_id) then
    raise exception 'Observațiile le deschid membrii echipei, nu cititorii.';
  end if;
  if new.atribuita_catre is not null and not exists (select 1 from membri_proiect where proiect_id = new.proiect_id and persoana_id = new.atribuita_catre) then
    raise exception 'Persoana căreia îi atribuiți observația nu face parte din proiect.';
  end if;
  if new.atribuita_rol is not null and new.atribuita_rol not in ('administrator', 'beneficiar', 'diriginte', 'constructor', 'proiectant', 'subcontractor', 'laborator', 'administrator_cladire') then
    raise exception 'Rolul atribuit nu există.';
  end if;
  if jsonb_typeof(new.elemente) is distinct from 'array' then raise exception 'Elementele trebuie să fie o listă.'; end if;
  if tg_op = 'INSERT' then
    new.titlu := trim(new.titlu);
    new.numar := coalesce((select max(numar) from observatii where proiect_id = new.proiect_id), 0) + 1;
    new.creat_de := auth.uid();
    new.inchisa_de := null; new.inchisa_la := null; new.rezolvata_la := null;
    -- la import se păstrează starea din fișier; în aplicație orice observație începe deschisă
    if new.sursa is null or new.sursa = 'aplicatie' then new.stare := 'deschisa'; new.sursa := 'aplicatie'; new.creat_la := now(); new.autor_extern := null; end if;
    if new.creat_la is null or new.creat_la > now() then new.creat_la := now(); end if;
    if new.stare = 'inchisa' then new.inchisa_la := now(); new.inchisa_de := auth.uid(); end if;
    if new.stare = 'rezolvata' then new.rezolvata_la := now(); end if;
  else
    new.proiect_id := old.proiect_id; new.numar := old.numar; new.bcf_guid := old.bcf_guid; new.creat_de := old.creat_de;
    new.creat_la := old.creat_la; new.sursa := old.sursa; new.autor_extern := old.autor_extern;
    if coalesce(current_setting('conpro.stare_observatie', true), '') <> 'da' then
      if old.stare = 'inchisa' then raise exception 'Observația e închisă; redeschideți-o întâi.'; end if;
      new.stare := old.stare; new.rezolvata_la := old.rezolvata_la; new.inchisa_la := old.inchisa_la; new.inchisa_de := old.inchisa_de;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists observatie_verificare on public.observatii;
create trigger observatie_verificare before insert or update on public.observatii
  for each row execute function public.observatie_verifica();

create or replace function public.comentariu_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare o observatii;
begin
  select * into o from observatii where id = new.observatie_id;
  if o.id is null or o.proiect_id <> new.proiect_id then raise exception 'Observația nu există în acest proiect.'; end if;
  if not public.lucreaza_in_proiect(new.proiect_id) then raise exception 'Comentează membrii echipei, nu cititorii.'; end if;
  new.text := trim(new.text); new.creat_de := auth.uid(); new.creat_la := now();
  if coalesce(current_setting('conpro.stare_observatie', true), '') <> 'da' then new.stare_noua := null; end if;
  if new.data_externa is not null and new.data_externa > now() then new.data_externa := now(); end if;
  return new;
end $$;
drop trigger if exists comentariu_verificare on public.comentarii_observatie;
create trigger comentariu_verificare before insert on public.comentarii_observatie
  for each row execute function public.comentariu_verifica();

-- schimbarea stării, cu comentariul care o explică
create or replace function public.observatie_stare(p_id uuid, p_stare text, p_comentariu text)
returns void language plpgsql security definer set search_path = public as $$
declare o observatii; v_rol text; atribuit boolean;
begin
  select * into o from observatii where id = p_id for update;
  if o.id is null or not public.lucreaza_in_proiect(o.proiect_id) then raise exception 'Observația nu există sau nu aveți drept.'; end if;
  v_rol := public.rol_in_proiect(o.proiect_id)::text;
  atribuit := coalesce(o.atribuita_catre = auth.uid(), false) or (o.atribuita_catre is null and coalesce(o.atribuita_rol = v_rol, false));
  if p_stare = o.stare then raise exception 'Observația e deja în această stare.'; end if;
  if p_stare in ('in_lucru', 'rezolvata') then
    if o.stare = 'inchisa' then raise exception 'Observația e închisă; redeschideți-o întâi.'; end if;
    if not (atribuit or public.coordoneaza_observatia(o)) then
      raise exception 'Starea o schimbă cel căruia i-a fost atribuită observația, autorul sau dirigintele.';
    end if;
    if p_stare = 'rezolvata' and coalesce(length(trim(p_comentariu)), 0) < 3 then raise exception 'Descrieți rezolvarea.'; end if;
  elsif p_stare = 'inchisa' then
    if not public.coordoneaza_observatia(o) then raise exception 'Observația o închide autorul, dirigintele sau administratorul, după verificare.'; end if;
  elsif p_stare = 'deschisa' then
    if not (public.coordoneaza_observatia(o) or atribuit) then raise exception 'Observația o redeschide autorul sau dirigintele.'; end if;
    if coalesce(length(trim(p_comentariu)), 0) < 3 then raise exception 'Spuneți de ce se redeschide.'; end if;
  else
    raise exception 'Starea nu există.';
  end if;
  perform set_config('conpro.stare_observatie', 'da', true);
  update observatii set stare = p_stare,
         rezolvata_la = case when p_stare = 'rezolvata' then now() when p_stare = 'deschisa' then null else rezolvata_la end,
         inchisa_la = case when p_stare = 'inchisa' then now() else null end,
         inchisa_de = case when p_stare = 'inchisa' then auth.uid() else null end
   where id = p_id;
  insert into comentarii_observatie (observatie_id, proiect_id, text, stare_noua)
  values (p_id, o.proiect_id, coalesce(nullif(trim(p_comentariu), ''), case p_stare when 'in_lucru' then 'Preluată.' when 'inchisa' then 'Verificată și închisă.' else '—' end), p_stare);
  perform set_config('conpro.stare_observatie', '', true);
end $$;

drop trigger if exists jurnal_observatii on public.observatii;
create trigger jurnal_observatii after insert or update on public.observatii
  for each row execute function public.scrie_jurnal();

alter table public.observatii enable row level security;
alter table public.comentarii_observatie enable row level security;
drop policy if exists observatii_citire on public.observatii;
create policy observatii_citire on public.observatii for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists observatii_creare on public.observatii;
create policy observatii_creare on public.observatii for insert to authenticated with check (public.este_membru(proiect_id));
drop policy if exists observatii_editare on public.observatii;
create policy observatii_editare on public.observatii for update to authenticated
  using (public.coordoneaza_observatia(observatii)) with check (public.coordoneaza_observatia(observatii));
drop policy if exists comentarii_obs_citire on public.comentarii_observatie;
create policy comentarii_obs_citire on public.comentarii_observatie for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists comentarii_obs_creare on public.comentarii_observatie;
create policy comentarii_obs_creare on public.comentarii_observatie for insert to authenticated with check (public.este_membru(proiect_id));

revoke all on public.observatii, public.comentarii_observatie from anon, authenticated;
grant select on public.observatii, public.comentarii_observatie to authenticated;
grant insert (id, proiect_id, bcf_guid, tip, prioritate, titlu, descriere, stare, atribuita_rol, atribuita_catre, termen, zona,
              elemente, punct_vedere, sursa, autor_extern, creat_la) on public.observatii to authenticated;
grant update (tip, prioritate, titlu, descriere, atribuita_rol, atribuita_catre, termen, zona, elemente, punct_vedere) on public.observatii to authenticated;
grant insert (id, observatie_id, proiect_id, text, autor_extern, data_externa, bcf_guid) on public.comentarii_observatie to authenticated;

revoke execute on function public.observatie_stare(uuid, text, text), public.lucreaza_in_proiect(uuid),
  public.coordoneaza_observatia(public.observatii) from public, anon;
grant execute on function public.observatie_stare(uuid, text, text), public.lucreaza_in_proiect(uuid),
  public.coordoneaza_observatia(public.observatii) to authenticated;

-- atașamente: captura punctului de vedere și fotografiile de pe șantier
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte',
                      'receptie', 'obiectie_receptie', 'revizie_document', 'eveniment_exploatare', 'inspectie_urmarire',
                      'interventie_echipament', 'reclamatie', 'observatie'));

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
       and public.are_rol(p_proiect, array['constructor','subcontractor','administrator','administrator_cladire']::rol_proiect[]);
  elsif p_entitate = 'echipament' then
    return exists (select 1 from echipamente where id = p_id and proiect_id = p_proiect)
       and public.are_rol(p_proiect, array['constructor','subcontractor','administrator','diriginte','administrator_cladire']::rol_proiect[]);
  elsif p_entitate = 'document_carte' then
    return exists (select 1 from documente_carte where id = p_id and proiect_id = p_proiect and creat_de = auth.uid());
  elsif p_entitate = 'receptie' then
    return exists (select 1 from receptii where id = p_id and proiect_id = p_proiect and stare <> 'anulata')
       and public.are_rol(p_proiect, array['diriginte','proiectant','constructor','beneficiar']::rol_proiect[]);
  elsif p_entitate = 'obiectie_receptie' then
    return exists (select 1 from obiectii_receptie where id = p_id and proiect_id = p_proiect and stare <> 'confirmata')
       and public.are_rol(p_proiect, array['constructor','subcontractor','diriginte']::rol_proiect[]);
  elsif p_entitate = 'revizie_document' then
    return exists (select 1 from revizii_document r where r.id = p_id and r.proiect_id = p_proiect and r.stare = 'wip'
                   and (r.creat_de = auth.uid() or public.are_rol(p_proiect, array[r.autor_rol])));
  elsif p_entitate = 'eveniment_exploatare' then
    -- cel care a înregistrat evenimentul, plus beneficiarul și administratorii (de ex. raportul expertului, venit ulterior)
    return exists (select 1 from evenimente_exploatare e where e.id = p_id and e.proiect_id = p_proiect
                   and (e.creat_de = auth.uid()
                        or public.are_rol(p_proiect, array['beneficiar','administrator','administrator_cladire']::rol_proiect[])));
  elsif p_entitate = 'inspectie_urmarire' then
    return exists (select 1 from inspectii_urmarire i where i.id = p_id and i.proiect_id = p_proiect
                   and (i.creat_de = auth.uid()
                        or public.are_rol(p_proiect, array['beneficiar','administrator','administrator_cladire']::rol_proiect[])));
  elsif p_entitate = 'interventie_echipament' then
    return exists (select 1 from interventii_echipament i where i.id = p_id and i.proiect_id = p_proiect
                   and (i.creat_de = auth.uid()
                        or public.are_rol(p_proiect, array['beneficiar','administrator','administrator_cladire']::rol_proiect[])));
  elsif p_entitate = 'reclamatie' then
    return exists (select 1 from reclamatii r where r.id = p_id and r.proiect_id = p_proiect
                   and r.stare not in ('confirmata', 'respinsa')
                   and (r.raportat_de = auth.uid()
                        or public.are_rol(p_proiect, array['beneficiar','administrator','administrator_cladire']::rol_proiect[])
                        or (r.stare = 'la_constructor' and public.are_rol(p_proiect, array['constructor','subcontractor']::rol_proiect[]))));
  elsif p_entitate = 'observatie' then
    return exists (select 1 from observatii o where o.id = p_id and o.proiect_id = p_proiect and o.stare <> 'inchisa')
       and public.rol_in_proiect(p_proiect) is not null and public.rol_in_proiect(p_proiect)::text <> 'cititor';
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- „De făcut”: observațiile
-- ---------------------------------------------------------------------
create or replace function public.sarcini_persoana(p uuid)
returns table (proiect_id uuid, cod_proiect text, denumire_proiect text, tip text, titlu text, cale text, din timestamptz)
language sql stable security definer set search_path = public as $$
  with m as (
    select mp.proiect_id, mp.rol, pr.cod, pr.denumire from membri_proiect mp join proiecte pr on pr.id = mp.proiect_id
     where mp.persoana_id = p and not pr.arhivat
  )
  -- procese verbale de confirmat (proiectantul după diriginte și RTE, art. 426)
  select pv.proiect_id, m.cod, m.denumire, 'pv', format('PV nr. %s de confirmat: %s', pv.numar, pv.obiect), 'pv/' || pv.id, pv.convocat_la
    from participanti_pv pp join procese_verbale pv on pv.id = pp.pv_id join m on m.proiect_id = pv.proiect_id and m.rol = pp.rol
   where pp.persoana_id = p and pp.decizie is null and pv.stare in ('convocat', 'in_semnare')
     and pv.descriere_lucrari is not null
     and not (pp.rol = 'proiectant' and public.ordine_art_426(pv.tip) and exists (
       select 1 from participanti_pv x where x.pv_id = pv.id and x.rol in ('diriginte', 'constructor') and x.decizie is null))
  union all
  -- FAM
  select f.proiect_id, m.cod, m.denumire, 'fam',
         case f.stare when 'depus' then format('FAM nr. %s de avizat: %s', f.numar, f.material)
                      when 'avizat' then format('FAM nr. %s de aprobat: %s', f.numar, f.material)
                      else format('FAM nr. %s de completat: %s', f.numar, f.material) end,
         'fam/' || f.id, coalesce(f.avizat_la, f.depus_la, f.creat_la)
    from fam f join m on m.proiect_id = f.proiect_id
   where (f.stare = 'depus' and m.rol = 'proiectant')
      or (f.stare = 'avizat' and m.rol = 'diriginte')
      or (f.stare = 'completari' and f.creat_de = p)
  union all
  -- condica de betoane și încercările
  select t.proiect_id, m.cod, m.denumire, 'turnare', format('Turnarea nr. %s de vizat: %s', t.numar, t.element), 'beton/' || t.id, t.creat_la
    from turnari t join m on m.proiect_id = t.proiect_id and m.rol = 'diriginte'
   where t.vizat_la is null
  union all
  select i.proiect_id, m.cod, m.denumire, 'incercare',
         format('Rezultat de luat la cunoștință%s: %s', case when i.conform then '' else ' (NECONFORM)' end, coalesce(nullif(i.descriere, ''), i.tip)),
         case when i.turnare_id is not null then 'beton/' || i.turnare_id else 'beton' end, i.creat_la
    from incercari i join m on m.proiect_id = i.proiect_id and m.rol = 'diriginte'
   where i.verificat_la is null
  union all
  -- recepția
  select r.proiect_id, m.cod, m.denumire, 'receptie',
         case r.stare when 'pregatire' then format('Recepția nr. %s: de convocat comisia', r.numar)
                      when 'convocata' then format('Recepția nr. %s: de consemnat decizia comisiei', r.numar)
                      else format('Recepția nr. %s: de aprobat', r.numar) end,
         'receptie/' || r.id, coalesce(r.decis_la, r.convocat_la, r.creat_la)
    from receptii r join m on m.proiect_id = r.proiect_id
   where (r.stare in ('pregatire', 'convocata') and m.rol = 'diriginte') or (r.stare = 'decisa' and m.rol = 'beneficiar')
  union all
  select o.proiect_id, m.cod, m.denumire, 'obiectie',
         case o.stare when 'deschisa' then format('Obiecție de remediat până la %s: %s', to_char(o.termen, 'DD.MM.YYYY'), o.descriere)
                      else format('Remediere de confirmat: %s', o.descriere) end,
         'receptie/' || o.receptie_id, coalesce(o.remediat_la, o.creat_la)
    from obiectii_receptie o join m on m.proiect_id = o.proiect_id
   where (o.stare = 'deschisa' and m.rol in ('constructor', 'subcontractor')) or (o.stare = 'remediata' and m.rol = 'diriginte')
  union all
  -- documentele de aprobat pentru publicare
  select v.proiect_id, m.cod, m.denumire, 'document', format('Document de aprobat pentru publicare: %s %s (%s)', d.cod, v.revizie, v.cod_stare_cerut),
         'documente/' || d.id, v.publicare_ceruta_la
    from revizii_document v join documente_proiect d on d.id = v.document_id join m on m.proiect_id = v.proiect_id
   where v.stare = 'publicare_ceruta' and m.rol in ('beneficiar', 'diriginte', 'administrator')
  union all
  -- exploatarea: după recepția la terminarea lucrărilor aprobată
  select pr.id, m.cod, m.denumire, 'exploatare', 'Recepția e aprobată: construcția poate trece în exploatare', 'exploatare', r.aprobat_la
    from m join proiecte pr on pr.id = m.proiect_id
    join lateral (select x.aprobat_la from receptii x where x.proiect_id = pr.id and x.tip = 'terminare' and not x.partiala
                    and x.stare = 'aprobata' and x.decizie in ('admitere', 'admitere_cu_obiectii') order by x.aprobat_la desc limit 1) r on true
   where m.rol in ('beneficiar', 'administrator') and pr.exploatare_din is null
  union all
  -- urmărirea în timp: inspecțiile scadente în următoarele 14 zile, câte o sarcină pe proiect
  select pr.id, m.cod, m.denumire, 'urmarire',
         case when count(*) = 1 then format('Urmărirea în timp: o verificare scadentă la %s (%s)', to_char(min(s.urmatoarea), 'DD.MM.YYYY'), min(s.ce))
              else format('Urmărirea în timp: %s verificări scadente, prima la %s', count(*), to_char(min(s.urmatoarea), 'DD.MM.YYYY')) end,
         'exploatare/urmarire', min(s.urmatoarea)::timestamptz
    from m join proiecte pr on pr.id = m.proiect_id
    cross join lateral public.scadente_urmarire_intern(pr.id) s
   where m.rol in ('beneficiar', 'administrator_cladire') and s.urmatoarea <= current_date + 14
   group by pr.id, m.cod, m.denumire
  union all
  -- mentenanța echipamentelor scadentă în următoarele 14 zile, câte o sarcină pe proiect
  select pr.id, m.cod, m.denumire, 'mentenanta',
         case when count(*) = 1 then format('Mentenanță scadentă la %s: %s %s', to_char(min(s.urmatoarea), 'DD.MM.YYYY'), min(s.cod), min(s.denumire))
              else format('Mentenanță: %s echipamente scadente, primul la %s', count(*), to_char(min(s.urmatoarea), 'DD.MM.YYYY')) end,
         'exploatare/mentenanta', min(s.urmatoarea)::timestamptz
    from m join proiecte pr on pr.id = m.proiect_id
    cross join lateral public.scadente_mentenanta_intern(pr.id) s
   where m.rol in ('beneficiar', 'administrator_cladire') and pr.exploatare_din is not null and s.urmatoarea <= current_date + 14
   group by pr.id, m.cod, m.denumire
  union all
  -- garanțiile care expiră: a construcției (90 de zile înainte) și a echipamentelor (60 de zile înainte)
  select pr.id, m.cod, m.denumire, 'garantie',
         case when g.ce = 'constructie' then format('Garanția de bună execuție expiră la %s: semnalați constructorului defectele', to_char(g.pana, 'DD.MM.YYYY'))
              else format('Garanția expiră la %s echipamente până la %s', g.n, to_char(g.pana, 'DD.MM.YYYY')) end,
         'exploatare/mentenanta', g.pana::timestamptz
    from m join proiecte pr on pr.id = m.proiect_id
    cross join lateral (
      select 'constructie' ce, max(x.garantie_pana) pana, 1 n from public.garantii_intern(pr.id) x
       where x.ce = 'constructie' and x.garantie_pana between current_date and current_date + 90
      having count(*) > 0
      union all
      select 'echipamente', max(x.garantie_pana), count(*)::int from public.garantii_intern(pr.id) x
       where x.ce = 'echipament' and x.garantie_pana between current_date and current_date + 60
      having count(*) > 0
    ) g
   where m.rol in ('beneficiar', 'administrator_cladire') and pr.exploatare_din is not null
  union all
  -- reclamațiile: noi sau redeschise (administrarea), în garanție (constructorul)
  select r.proiect_id, m.cod, m.denumire, 'reclamatie',
         format('Reclamație %s%s: %s%s', case r.stare when 'la_constructor' then 'în garanție de rezolvat' else 'nouă' end,
                case when r.urgenta then ' (URGENTĂ)' else '' end, coalesce(r.unitate || ' · ', ''), r.titlu),
         'exploatare/reclamatii/' || r.id, coalesce(r.trimisa_constructorului_la, r.creat_la)
    from reclamatii r join m on m.proiect_id = r.proiect_id
   where (r.stare = 'noua' and m.rol in ('beneficiar', 'administrator', 'administrator_cladire'))
      or (r.stare = 'la_constructor' and m.rol in ('constructor', 'subcontractor'))
  union all
  -- locatarul: confirmarea rezolvării (locatarul nu e membru al proiectului)
  select r.proiect_id, pr.cod, pr.denumire, 'reclamatie', format('Confirmați rezolvarea: %s', r.titlu),
         '/locuinta/' || r.id, r.rezolvata_la
    from reclamatii r join proiecte pr on pr.id = r.proiect_id
   where r.raportat_de = p and r.stare = 'rezolvata' and not pr.arhivat
     and not exists (select 1 from m where m.proiect_id = r.proiect_id)
  union all
  -- membrul echipei care a raportat: confirmarea rezolvării
  select r.proiect_id, m.cod, m.denumire, 'reclamatie', format('Confirmați rezolvarea: %s', r.titlu),
         'exploatare/reclamatii/' || r.id, r.rezolvata_la
    from reclamatii r join m on m.proiect_id = r.proiect_id
   where r.raportat_de = p and r.stare = 'rezolvata'
  union all
  -- observațiile pe model (BCF): de rezolvat de cel căruia i-au fost atribuite, de verificat de autor
  select o.proiect_id, m.cod, m.denumire, 'observatie',
         case when o.stare = 'rezolvata' then format('Observație rezolvată, de verificat și închis: %s', o.titlu)
              else format('Observație de rezolvat%s: %s', case when o.termen is not null then ' până la ' || to_char(o.termen, 'DD.MM.YYYY') else '' end, o.titlu) end,
         'model/observatii/' || o.id, coalesce(o.rezolvata_la, o.creat_la)
    from observatii o join m on m.proiect_id = o.proiect_id
   where (o.stare in ('deschisa', 'in_lucru')
          and (o.atribuita_catre = p or (o.atribuita_catre is null and o.atribuita_rol is not null and m.rol::text = o.atribuita_rol)))
      or (o.stare = 'rezolvata' and o.creat_de = p)
  order by 7 nulls last;
$$;
