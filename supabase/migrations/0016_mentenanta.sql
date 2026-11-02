-- =====================================================================
-- Conpro BIM · migrarea 0016 · Mentenanța echipamentelor și garanțiile (exploatare, etapa 3)
--
-- 1. Administratorul clădirii poate completa și actualiza echipamentele
--    (înlocuiri, echipamente noi) și documentația lor, ca în ISO 19650-3:
--    modelul informațiilor despre construcție se ține la zi în exploatare.
-- 2. Intervențiile la echipamente: revizii, verificări periodice (de ex. ISCIR,
--    PSI), reparații, înlocuiri, defecte. Nu se modifică după înregistrare.
-- 3. Scadențele de mentenanță: ultima revizie / verificare periodică (sau
--    punerea în funcțiune) plus intervalul de mentenanță al tipului (COBie).
-- 4. Garanțiile: garanția de bună execuție a construcției (de la recepție) și
--    garanția fiecărui echipament (începutul garanției plus durata tipului).
-- 5. „De făcut”: mentenanța scadentă în 14 zile; garanțiile care expiră
--    (construcția cu 90 de zile înainte, echipamentele cu 60).
--
-- Se rulează o singură dată, după 0015, în Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Echipamentele în exploatare
-- ---------------------------------------------------------------------
drop policy if exists tipuri_scriere on public.tipuri_echipament;
create policy tipuri_scriere on public.tipuri_echipament for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','constructor','subcontractor','administrator_cladire']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','constructor','subcontractor','administrator_cladire']::public.rol_proiect[]));
drop policy if exists echipamente_scriere on public.echipamente;
create policy echipamente_scriere on public.echipamente for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','constructor','subcontractor','administrator_cladire']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','constructor','subcontractor','administrator_cladire']::public.rol_proiect[]));

-- ---------------------------------------------------------------------
-- 2. Intervențiile la echipamente
-- ---------------------------------------------------------------------
create table if not exists public.interventii_echipament (
  id              uuid primary key default gen_random_uuid(),
  proiect_id      uuid not null references public.proiecte(id) on delete cascade,
  echipament_id   uuid not null references public.echipamente(id),
  numar           integer not null,
  tip             text not null check (tip in ('revizie', 'verificare_periodica', 'reparatie', 'inlocuire', 'defect')),
  data            date not null,
  descriere       text not null check (length(trim(descriere)) > 2),
  executant       text,                         -- firma / persoana autorizată
  in_garantie     boolean not null default false,
  functional      boolean not null default true, -- echipamentul funcționează după intervenție
  creat_de        uuid not null default auth.uid() references public.persoane(id),
  creat_la        timestamptz not null default now(),
  unique (proiect_id, numar)
);
create index if not exists interventii_echipament_echip on public.interventii_echipament (echipament_id, data desc);

create or replace function public.interventie_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol text := public.rol_in_proiect(new.proiect_id)::text;
begin
  if v_rol is null or v_rol = 'cititor' then
    raise exception 'Intervențiile le înregistrează membrii echipei, nu cititorii.';
  end if;
  if not exists (select 1 from echipamente where id = new.echipament_id and proiect_id = new.proiect_id) then
    raise exception 'Echipamentul nu aparține proiectului.';
  end if;
  if new.data > current_date then raise exception 'Data intervenției nu poate fi în viitor.'; end if;
  new.descriere := trim(new.descriere);
  new.numar := coalesce((select max(numar) from interventii_echipament where proiect_id = new.proiect_id), 0) + 1;
  new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;
drop trigger if exists interventie_verificare on public.interventii_echipament;
create trigger interventie_verificare before insert on public.interventii_echipament
  for each row execute function public.interventie_verifica();
drop trigger if exists jurnal_interventii_echipament on public.interventii_echipament;
create trigger jurnal_interventii_echipament after insert on public.interventii_echipament
  for each row execute function public.scrie_jurnal();

alter table public.interventii_echipament enable row level security;
drop policy if exists interventii_citire on public.interventii_echipament;
create policy interventii_citire on public.interventii_echipament for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists interventii_creare on public.interventii_echipament;
create policy interventii_creare on public.interventii_echipament for insert to authenticated with check (public.este_membru(proiect_id));
revoke all on public.interventii_echipament from anon, authenticated;
grant select on public.interventii_echipament to authenticated;
grant insert (id, proiect_id, echipament_id, tip, data, descriere, executant, in_garantie, functional) on public.interventii_echipament to authenticated;

-- ---------------------------------------------------------------------
-- 3. Scadențele de mentenanță
-- ---------------------------------------------------------------------
create or replace function public.scadente_mentenanta_intern(p uuid)
returns table (echipament_id uuid, cod text, denumire text, interval_luni int, ultima date, urmatoarea date)
language sql stable security definer set search_path = public as $$
  select e.id, e.cod, t.denumire, t.interval_mentenanta_luni, ult.d,
         (coalesce(ult.d, e.data_punere_functiune, e.garantie_start, pr.exploatare_din) + make_interval(months => t.interval_mentenanta_luni))::date
    from echipamente e join tipuri_echipament t on t.id = e.tip_id join proiecte pr on pr.id = e.proiect_id
    left join lateral (select max(i.data) d from interventii_echipament i
                        where i.echipament_id = e.id and i.tip in ('revizie', 'verificare_periodica', 'inlocuire')) ult on true
   where e.proiect_id = p and t.interval_mentenanta_luni is not null and not pr.arhivat
     and coalesce(ult.d, e.data_punere_functiune, e.garantie_start, pr.exploatare_din) is not null;
$$;
create or replace function public.scadente_mentenanta(p uuid)
returns table (echipament_id uuid, cod text, denumire text, interval_luni int, ultima date, urmatoarea date)
language sql stable security definer set search_path = public as $$
  select * from public.scadente_mentenanta_intern(p) where public.este_membru(p) order by 6;
$$;

-- ---------------------------------------------------------------------
-- 4. Garanțiile
-- ---------------------------------------------------------------------
create or replace function public.garantii_intern(p uuid)
returns table (ce text, id uuid, denumire text, garant text, garantie_start date, garantie_pana date)
language sql stable security definer set search_path = public as $$
  select 'constructie', r.id, 'Garanția de bună execuție a construcției', null::text, r.aprobat_la::date, r.garantie_pana
    from receptii r
   where r.proiect_id = p and r.tip = 'terminare' and not r.partiala and r.stare = 'aprobata' and r.garantie_pana is not null
     and r.decizie in ('admitere', 'admitere_cu_obiectii')
  union all
  select 'echipament', e.id, e.cod || ' · ' || t.denumire, t.garant, e.garantie_start,
         (e.garantie_start + make_interval(months => t.garantie_luni))::date
    from echipamente e join tipuri_echipament t on t.id = e.tip_id
   where e.proiect_id = p and e.garantie_start is not null and t.garantie_luni is not null and t.garantie_luni > 0;
$$;
create or replace function public.garantii(p uuid)
returns table (ce text, id uuid, denumire text, garant text, garantie_start date, garantie_pana date)
language sql stable security definer set search_path = public as $$
  select * from public.garantii_intern(p) where public.este_membru(p) order by 6;
$$;

revoke execute on function public.scadente_mentenanta_intern(uuid), public.garantii_intern(uuid) from public, anon, authenticated;
revoke execute on function public.scadente_mentenanta(uuid), public.garantii(uuid) from public, anon;
grant execute on function public.scadente_mentenanta(uuid), public.garantii(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Atașamente: fișele de intervenție, rapoartele ISCIR, fotografiile
-- ---------------------------------------------------------------------
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte',
                      'receptie', 'obiectie_receptie', 'revizie_document', 'eveniment_exploatare', 'inspectie_urmarire',
                      'interventie_echipament'));

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
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 5. „De făcut”: mentenanța și garanțiile
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
  order by 7 nulls last;
$$;
