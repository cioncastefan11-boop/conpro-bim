-- =====================================================================
-- Conpro BIM · migrarea 0020 · Planul de livrare a informațiilor (MIDP / TIDP)
--
-- ISO 19650-2: momentele de livrare a informațiilor (5.1.3), planurile de
-- livrare pe echipe (TIDP, 5.4.4) centralizate în planul general (MIDP, 5.4.5)
-- și matricea detaliată de responsabilități (5.4.2), care în aplicație se
-- vede din plan: cine (inițiatorul) produce ce disciplină pentru fiecare moment.
--
-- Fiecare livrabil planificat are codul din convenția proiectului; aplicația îl
-- găsește singură în CDE când documentul cu același cod e creat, partajat sau
-- publicat, și arată ce întârzie. Livrabilele scadente apar în „De făcut”.
--
-- Se rulează o singură dată, după 0019, în Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.momente_livrare (
  id                uuid primary key default gen_random_uuid(),
  proiect_id        uuid not null references public.proiecte(id) on delete cascade,
  cod               text not null check (cod ~ '^[A-Z0-9.-]{1,10}$'),     -- ex. M1, DTAC, PTE, REC
  denumire          text not null check (length(trim(denumire)) > 2),     -- ex. Depunerea documentației pentru AC
  data_planificata  date not null,
  ordine            integer not null default 0,
  creat_de          uuid not null default auth.uid() references public.persoane(id),
  creat_la          timestamptz not null default now(),
  unique (proiect_id, cod)
);

create table if not exists public.livrabile_planificate (
  id            uuid primary key default gen_random_uuid(),
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  moment_id     uuid references public.momente_livrare(id) on delete set null,
  initiator     text not null check (initiator ~ '^[A-Z0-9]{2,6}$'),
  volum         text not null default 'ZZ' check (volum ~ '^[A-Z0-9]{1,4}$'),
  nivel         text not null default 'ZZ' check (nivel ~ '^[A-Z0-9]{2,4}$'),
  tip           text not null check (tip ~ '^[A-Z0-9]{2}$'),
  rol           text not null check (rol ~ '^[A-Z]$'),
  numar         text not null check (numar ~ '^[0-9]{4,6}$'),
  cod           text not null,
  titlu         text not null check (length(trim(titlu)) > 2),
  nivel_informatii text,                               -- nivelul necesar de informații (ISO 7817-1), ex. „detalii de execuție”
  stare_ceruta  text not null default 'publicat' check (stare_ceruta in ('partajat', 'publicat')),
  termen        date,                                  -- dacă lipsește, data momentului
  responsabil   uuid references public.persoane(id),
  creat_de      uuid not null default auth.uid() references public.persoane(id),
  creat_la      timestamptz not null default now(),
  unique (proiect_id, cod)
);
create index if not exists livrabile_proiect on public.livrabile_planificate (proiect_id, termen);

-- codul livrabilului: aceeași regulă și aceeași convenție ca la documente (0012)
create or replace function public.livrabil_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare c jsonb; v_cifre int;
begin
  if not public.lucreaza_in_proiect(new.proiect_id) then raise exception 'Planul îl completează membrii echipei, nu cititorii.'; end if;
  new.initiator := upper(trim(new.initiator)); new.volum := upper(trim(new.volum)); new.nivel := upper(trim(new.nivel));
  new.tip := upper(trim(new.tip)); new.rol := upper(trim(new.rol));
  select standard_info into c from proiecte where id = new.proiect_id;
  if coalesce((c ->> 'strict')::boolean, false) then
    if not public.in_lista(c, 'initiatori', new.initiator) then raise exception 'Inițiatorul % nu e în convenția de denumire a proiectului.', new.initiator; end if;
    if not public.in_lista(c, 'volume', new.volum) then raise exception 'Volumul % nu e în convenția de denumire a proiectului.', new.volum; end if;
    if not public.in_lista(c, 'niveluri', new.nivel) then raise exception 'Nivelul % nu e în convenția de denumire a proiectului.', new.nivel; end if;
    v_cifre := coalesce((c ->> 'cifre')::int, 0);
    if v_cifre between 4 and 6 and length(new.numar) <> v_cifre then raise exception 'Numărul documentului are % cifre în convenția proiectului.', v_cifre; end if;
  end if;
  if new.moment_id is not null and not exists (select 1 from momente_livrare where id = new.moment_id and proiect_id = new.proiect_id) then
    raise exception 'Momentul de livrare nu e din acest proiect.';
  end if;
  if new.responsabil is not null and not exists (select 1 from membri_proiect where proiect_id = new.proiect_id and persoana_id = new.responsabil) then
    raise exception 'Responsabilul nu face parte din proiect.';
  end if;
  new.cod := concat_ws('-', (select cod from proiecte where id = new.proiect_id), new.initiator, new.volum, new.nivel, new.tip, new.rol, new.numar);
  if tg_op = 'INSERT' then new.creat_de := auth.uid(); new.creat_la := now();
  else new.proiect_id := old.proiect_id; new.creat_de := old.creat_de; new.creat_la := old.creat_la; end if;
  return new;
end $$;
drop trigger if exists livrabil_verificare on public.livrabile_planificate;
create trigger livrabil_verificare before insert or update on public.livrabile_planificate
  for each row execute function public.livrabil_verifica();

create or replace function public.moment_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.are_rol(new.proiect_id, array['administrator','beneficiar']::rol_proiect[]) then
    raise exception 'Momentele de livrare le stabilesc beneficiarul sau administratorul proiectului (managementul informației).';
  end if;
  new.cod := upper(trim(new.cod));
  if tg_op = 'INSERT' then new.creat_de := auth.uid(); new.creat_la := now();
  else new.proiect_id := old.proiect_id; new.creat_de := old.creat_de; new.creat_la := old.creat_la; end if;
  return new;
end $$;
drop trigger if exists moment_verificare on public.momente_livrare;
create trigger moment_verificare before insert or update on public.momente_livrare
  for each row execute function public.moment_verifica();

-- starea fiecărui livrabil, din documentul cu același cod din CDE
-- neinceput < in_lucru < partajat < publicat; „atins” = a ajuns la starea cerută
create or replace function public.livrabile_stare_intern(p uuid)
returns table (livrabil_id uuid, proiect_id uuid, cod text, titlu text, moment_id uuid, termen date, stare_ceruta text,
               stare text, atins boolean, document_id uuid, responsabil uuid)
language sql stable security definer set search_path = public as $$
  with st as (
    select l.*, coalesce(l.termen, m.data_planificata) as t, d.id as doc,
           case when bool_or(r.stare = 'publicat') then 'publicat'
                when bool_or(r.stare in ('partajat', 'publicare_ceruta', 'arhivat')) then 'partajat'
                when d.id is not null then 'in_lucru' else 'neinceput' end as s
      from livrabile_planificate l
      left join momente_livrare m on m.id = l.moment_id
      left join documente_proiect d on d.proiect_id = l.proiect_id and d.cod = l.cod
      left join revizii_document r on r.document_id = d.id
     where l.proiect_id = p
     group by l.id, m.data_planificata, d.id
  )
  select id, proiect_id, cod, titlu, moment_id, t, stare_ceruta, s,
         case when stare_ceruta = 'partajat' then s in ('partajat', 'publicat') else s = 'publicat' end, doc, responsabil
    from st;
$$;
create or replace function public.livrabile_stare(p uuid)
returns table (livrabil_id uuid, proiect_id uuid, cod text, titlu text, moment_id uuid, termen date, stare_ceruta text,
               stare text, atins boolean, document_id uuid, responsabil uuid)
language sql stable security definer set search_path = public as $$
  select * from public.livrabile_stare_intern(p) where public.este_membru(p);
$$;

drop trigger if exists jurnal_momente_livrare on public.momente_livrare;
create trigger jurnal_momente_livrare after insert or update or delete on public.momente_livrare
  for each row execute function public.scrie_jurnal();
drop trigger if exists jurnal_livrabile on public.livrabile_planificate;
create trigger jurnal_livrabile after insert or update or delete on public.livrabile_planificate
  for each row execute function public.scrie_jurnal();

alter table public.momente_livrare enable row level security;
alter table public.livrabile_planificate enable row level security;
drop policy if exists momente_citire on public.momente_livrare;
create policy momente_citire on public.momente_livrare for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists momente_scriere on public.momente_livrare;
create policy momente_scriere on public.momente_livrare for all to authenticated
  using (public.are_rol(proiect_id, array['administrator','beneficiar']::public.rol_proiect[]))
  with check (public.are_rol(proiect_id, array['administrator','beneficiar']::public.rol_proiect[]));
drop policy if exists livrabile_citire on public.livrabile_planificate;
create policy livrabile_citire on public.livrabile_planificate for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists livrabile_creare on public.livrabile_planificate;
create policy livrabile_creare on public.livrabile_planificate for insert to authenticated with check (public.este_membru(proiect_id));
-- fiecare echipă își modifică rândurile; administratorul (managementul informației) pe toate
drop policy if exists livrabile_editare on public.livrabile_planificate;
create policy livrabile_editare on public.livrabile_planificate for update to authenticated
  using (creat_de = auth.uid() or public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]))
  with check (creat_de = auth.uid() or public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));
drop policy if exists livrabile_stergere on public.livrabile_planificate;
create policy livrabile_stergere on public.livrabile_planificate for delete to authenticated
  using (creat_de = auth.uid() or public.are_rol(proiect_id, array['administrator']::public.rol_proiect[]));

revoke all on public.momente_livrare, public.livrabile_planificate from anon, authenticated;
grant select, delete on public.momente_livrare, public.livrabile_planificate to authenticated;
grant insert (id, proiect_id, cod, denumire, data_planificata, ordine) on public.momente_livrare to authenticated;
grant update (cod, denumire, data_planificata, ordine) on public.momente_livrare to authenticated;
grant insert (id, proiect_id, moment_id, initiator, volum, nivel, tip, rol, numar, titlu, nivel_informatii, stare_ceruta, termen, responsabil)
  on public.livrabile_planificate to authenticated;
grant update (moment_id, initiator, volum, nivel, tip, rol, numar, titlu, nivel_informatii, stare_ceruta, termen, responsabil)
  on public.livrabile_planificate to authenticated;
revoke execute on function public.livrabile_stare_intern(uuid) from public, anon, authenticated;
revoke execute on function public.livrabile_stare(uuid) from public, anon;
grant execute on function public.livrabile_stare(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- „De făcut”: livrabilele
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
  union all
  -- planul de livrare: livrabilele întârziate sau scadente în 7 zile
  -- (la responsabil; la administratorul proiectului, câte o sarcină pe proiect pentru cele fără responsabil)
  select s.proiect_id, m.cod, m.denumire, 'livrabil',
         format('Livrabil %s până la %s: %s %s', case s.stare_ceruta when 'publicat' then 'de publicat' else 'de partajat' end,
                to_char(s.termen, 'DD.MM.YYYY'), s.cod, s.titlu),
         'documente/plan', s.termen::timestamptz
    from m cross join lateral public.livrabile_stare_intern(m.proiect_id) s
   where s.responsabil = p and not s.atins and s.termen <= current_date + 7
  union all
  select m.proiect_id, m.cod, m.denumire, 'livrabil',
         format('Planul de livrare: %s livrabile întârziate fără responsabil, primul din %s', count(*), to_char(min(s.termen), 'DD.MM.YYYY')),
         'documente/plan', min(s.termen)::timestamptz
    from m cross join lateral public.livrabile_stare_intern(m.proiect_id) s
   where m.rol = 'administrator' and s.responsabil is null and not s.atins and s.termen < current_date
   group by m.proiect_id, m.cod, m.denumire
  order by 7 nulls last;
$$;
