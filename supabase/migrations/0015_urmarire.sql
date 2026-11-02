-- =====================================================================
-- Conpro BIM · migrarea 0015 · Urmărirea comportării în timp (exploatare, etapa 2)
--
-- Legea 169/2026, programul de urmărire în timp: urmărirea curentă se aplică
-- tuturor construcțiilor, mai puțin celor din CC1, are caracter permanent și se
-- face la intervale de cel mult un an, după programul stabilit de proiectant
-- (sau de un expert tehnic, la construcțiile existente). Urmărirea specială se
-- aplică la CC3–CC4 și, temporar sau permanent, la CC2. Beneficiarul răspunde
-- de urmărirea în timp pe perioada de utilizare.
--
-- 1. Programul de urmărire: ce se urmărește, cum, cât de des (maximum 12 luni),
--    pragul de alarmă. Îl stabilesc proiectantul, beneficiarul, administratorul
--    proiectului sau al clădirii. Punctele nu se șterg; se dezactivează.
-- 2. Inspecțiile: data, cine a verificat, starea fiecărui punct (normal,
--    atenție, alarmă), concluziile și măsurile. Nu se modifică după înregistrare.
--    Fiecare inspecție intră automat în jurnalul evenimentelor; dacă un punct e
--    în alarmă, evenimentul se marchează „necesită expertiză”.
-- 3. Scadențele: fiecare punct are următoarea verificare la ultima verificare
--    (sau la intrarea în exploatare, chiar dacă programul e introdus mai târziu) plus intervalul. Ce e scadent în 14 zile
--    apare în „De făcut” și în rezumatul pe e-mail al beneficiarului și al
--    administratorului clădirii.
--
-- Se rulează o singură dată, după 0014, în Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Programul de urmărire
-- ---------------------------------------------------------------------
create table if not exists public.puncte_urmarire (
  id              uuid primary key default gen_random_uuid(),
  proiect_id      uuid not null references public.proiecte(id) on delete cascade,
  ordine          integer not null default 0,
  ce              text not null check (length(trim(ce)) > 2),       -- fenomenul / parametrul urmărit
  zona            text,                                             -- elementele, zona
  categorie       text not null default 'curenta' check (categorie in ('curenta', 'speciala')),
  metoda          text,                                             -- examinare vizuală, măsurători, instrumente
  interval_luni   integer not null default 12 check (interval_luni between 1 and 12),
  prag_alarma     text,                                             -- ce înseamnă „alarmă”
  activ           boolean not null default true,
  creat_de        uuid not null default auth.uid() references public.persoane(id),
  creat_la        timestamptz not null default now()
);
create index if not exists puncte_urmarire_proiect on public.puncte_urmarire (proiect_id, ordine);

create or replace function public.poate_programa_urmarirea(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.are_rol(p, array['beneficiar', 'administrator', 'administrator_cladire', 'proiectant']::rol_proiect[]);
$$;

create or replace function public.punct_urmarire_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.creat_de := auth.uid(); new.creat_la := now();
  else
    new.proiect_id := old.proiect_id; new.creat_de := old.creat_de; new.creat_la := old.creat_la;
  end if;
  new.ce := trim(new.ce);
  return new;
end $$;
drop trigger if exists punct_urmarire_verificare on public.puncte_urmarire;
create trigger punct_urmarire_verificare before insert or update on public.puncte_urmarire
  for each row execute function public.punct_urmarire_verifica();

-- ---------------------------------------------------------------------
-- 2. Inspecțiile
-- ---------------------------------------------------------------------
create table if not exists public.inspectii_urmarire (
  id               uuid primary key default gen_random_uuid(),
  proiect_id       uuid not null references public.proiecte(id) on delete cascade,
  numar            integer not null,
  data_inspectiei  date not null,
  efectuata_de     text not null check (length(trim(efectuata_de)) > 2),  -- numele și calitatea (ex. expert tehnic atestat)
  concluzii        text not null check (length(trim(concluzii)) > 2),
  masuri           text,
  stare            text not null check (stare in ('normal', 'atentie', 'alarma')),   -- cea mai gravă dintre constatări
  eveniment_id     uuid references public.evenimente_exploatare(id),
  creat_de         uuid not null default auth.uid() references public.persoane(id),
  creat_la         timestamptz not null default now(),
  unique (proiect_id, numar)
);
create index if not exists inspectii_urmarire_proiect on public.inspectii_urmarire (proiect_id, data_inspectiei desc);

create table if not exists public.constatari_inspectie (
  inspectie_id  uuid not null references public.inspectii_urmarire(id) on delete cascade,
  punct_id      uuid not null references public.puncte_urmarire(id),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  stare         text not null check (stare in ('normal', 'atentie', 'alarma', 'neverificat')),
  observatii    text,
  primary key (inspectie_id, punct_id)
);

-- o inspecție se înregistrează dintr-o dată, cu toate constatările
-- p_constatari = [{"punct_id": "...", "stare": "normal|atentie|alarma|neverificat", "observatii": "..."}, ...]
create or replace function public.inregistreaza_inspectie(p_proiect uuid, p_data date, p_efectuata_de text, p_concluzii text,
  p_masuri text, p_constatari jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pr proiecte; v_id uuid := gen_random_uuid(); v_nr int; v_stare text; v_ev uuid; c jsonb; n_ok int := 0;
  v_rol rol_proiect := public.rol_in_proiect(p_proiect);
begin
  if v_rol is null or v_rol = 'cititor' then
    raise exception 'Inspecțiile le înregistrează membrii echipei, nu cititorii.';
  end if;
  select * into pr from proiecte where id = p_proiect;
  if pr.exploatare_din is null then
    raise exception 'Urmărirea în timp se înregistrează după trecerea construcției în exploatare.';
  end if;
  if p_data is null or p_data > current_date then raise exception 'Data inspecției nu poate fi în viitor.'; end if;
  if p_data < pr.exploatare_din then raise exception 'Data inspecției e înaintea intrării în exploatare.'; end if;
  if jsonb_typeof(p_constatari) is distinct from 'array' or jsonb_array_length(p_constatari) = 0 then
    raise exception 'Completați constatările pentru punctele din program.';
  end if;
  for c in select * from jsonb_array_elements(p_constatari) loop
    if not exists (select 1 from puncte_urmarire where id = (c->>'punct_id')::uuid and proiect_id = p_proiect) then
      raise exception 'Un punct nu face parte din programul de urmărire al proiectului.';
    end if;
    if coalesce(c->>'stare', '') not in ('normal', 'atentie', 'alarma', 'neverificat') then
      raise exception 'Starea unui punct trebuie să fie normal, atenție, alarmă sau neverificat.';
    end if;
    if c->>'stare' in ('atentie', 'alarma') and coalesce(trim(c->>'observatii'), '') = '' then
      raise exception 'Descrieți ce s-a constatat la punctele în atenție sau alarmă.';
    end if;
    if c->>'stare' <> 'neverificat' then n_ok := n_ok + 1; end if;
  end loop;
  if n_ok = 0 then raise exception 'Nu a fost verificat niciun punct.'; end if;
  select case when bool_or(e->>'stare' = 'alarma') then 'alarma' when bool_or(e->>'stare' = 'atentie') then 'atentie' else 'normal' end
    into v_stare from jsonb_array_elements(p_constatari) e;
  v_nr := coalesce((select max(numar) from inspectii_urmarire where proiect_id = p_proiect), 0) + 1;

  -- intră și în jurnalul evenimentelor
  insert into evenimente_exploatare (proiect_id, tip, data_eveniment, titlu, descriere, efecte, masuri, necesita_expertiza, executant)
  values (p_proiect, 'inspectie', p_data,
          format('Inspecția de urmărire în timp nr. %s%s', v_nr, case v_stare when 'alarma' then ' · ALARMĂ' when 'atentie' then ' · atenție' else '' end),
          trim(p_concluzii),
          nullif((select string_agg(format('%s: %s', pu.ce, trim(e->>'observatii')), E'\n' order by pu.ordine)
                    from jsonb_array_elements(p_constatari) e join puncte_urmarire pu on pu.id = (e->>'punct_id')::uuid
                   where e->>'stare' in ('atentie', 'alarma')), ''),
          nullif(trim(p_masuri), ''), v_stare = 'alarma', trim(p_efectuata_de))
  returning id into v_ev;

  insert into inspectii_urmarire (id, proiect_id, numar, data_inspectiei, efectuata_de, concluzii, masuri, stare, eveniment_id, creat_de)
  values (v_id, p_proiect, v_nr, p_data, trim(p_efectuata_de), trim(p_concluzii), nullif(trim(p_masuri), ''), v_stare, v_ev, auth.uid());
  insert into constatari_inspectie (inspectie_id, punct_id, proiect_id, stare, observatii)
  select v_id, (e->>'punct_id')::uuid, p_proiect, e->>'stare', nullif(trim(e->>'observatii'), '') from jsonb_array_elements(p_constatari) e;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. Scadențele
-- ---------------------------------------------------------------------
create or replace function public.scadente_urmarire_intern(p uuid)
returns table (punct_id uuid, ce text, interval_luni int, ultima date, urmatoarea date)
language sql stable security definer set search_path = public as $$
  select pu.id, pu.ce, pu.interval_luni, ult.d,
         (coalesce(ult.d, pr.exploatare_din) + make_interval(months => pu.interval_luni))::date
    from puncte_urmarire pu join proiecte pr on pr.id = pu.proiect_id
    left join lateral (select max(i.data_inspectiei) d from constatari_inspectie c join inspectii_urmarire i on i.id = c.inspectie_id
                        where c.punct_id = pu.id and c.stare <> 'neverificat') ult on true
   where pu.proiect_id = p and pu.activ and pr.exploatare_din is not null and not pr.arhivat;
$$;

create or replace function public.scadente_urmarire(p uuid)
returns table (punct_id uuid, ce text, interval_luni int, ultima date, urmatoarea date)
language sql stable security definer set search_path = public as $$
  select * from public.scadente_urmarire_intern(p) where public.este_membru(p) order by 5;
$$;

-- ---------------------------------------------------------------------
-- Jurnal, reguli de acces, drepturi
-- ---------------------------------------------------------------------
drop trigger if exists jurnal_puncte_urmarire on public.puncte_urmarire;
create trigger jurnal_puncte_urmarire after insert or update on public.puncte_urmarire
  for each row execute function public.scrie_jurnal();
drop trigger if exists jurnal_inspectii_urmarire on public.inspectii_urmarire;
create trigger jurnal_inspectii_urmarire after insert on public.inspectii_urmarire
  for each row execute function public.scrie_jurnal();

alter table public.puncte_urmarire enable row level security;
alter table public.inspectii_urmarire enable row level security;
alter table public.constatari_inspectie enable row level security;

drop policy if exists puncte_urmarire_citire on public.puncte_urmarire;
create policy puncte_urmarire_citire on public.puncte_urmarire for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists puncte_urmarire_creare on public.puncte_urmarire;
create policy puncte_urmarire_creare on public.puncte_urmarire for insert to authenticated with check (public.poate_programa_urmarirea(proiect_id));
drop policy if exists puncte_urmarire_editare on public.puncte_urmarire;
create policy puncte_urmarire_editare on public.puncte_urmarire for update to authenticated
  using (public.poate_programa_urmarirea(proiect_id)) with check (public.poate_programa_urmarirea(proiect_id));
drop policy if exists inspectii_citire on public.inspectii_urmarire;
create policy inspectii_citire on public.inspectii_urmarire for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists constatari_citire on public.constatari_inspectie;
create policy constatari_citire on public.constatari_inspectie for select to authenticated using (public.este_membru(proiect_id));

revoke all on public.puncte_urmarire, public.inspectii_urmarire, public.constatari_inspectie from anon, authenticated;
grant select on public.puncte_urmarire, public.inspectii_urmarire, public.constatari_inspectie to authenticated;
grant insert (id, proiect_id, ordine, ce, zona, categorie, metoda, interval_luni, prag_alarma) on public.puncte_urmarire to authenticated;
grant update (ordine, ce, zona, categorie, metoda, interval_luni, prag_alarma, activ) on public.puncte_urmarire to authenticated;
-- inspecțiile se înregistrează doar prin inregistreaza_inspectie(); nu se modifică și nu se șterg

revoke execute on function public.inregistreaza_inspectie(uuid, date, text, text, text, jsonb) from public, anon;
revoke execute on function public.scadente_urmarire(uuid) from public, anon;
revoke execute on function public.scadente_urmarire_intern(uuid) from public, anon, authenticated;
revoke execute on function public.poate_programa_urmarirea(uuid) from public, anon;
grant execute on function public.inregistreaza_inspectie(uuid, date, text, text, text, jsonb) to authenticated;
grant execute on function public.scadente_urmarire(uuid) to authenticated;
grant execute on function public.poate_programa_urmarirea(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Atașamente: fotografiile și rapoartele inspecțiilor
-- ---------------------------------------------------------------------
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte',
                      'receptie', 'obiectie_receptie', 'revizie_document', 'eveniment_exploatare', 'inspectie_urmarire'));

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
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- „De făcut”: verificările scadente
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
  order by 7 nulls last;
$$;
