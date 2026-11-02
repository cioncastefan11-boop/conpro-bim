-- =====================================================================
-- Conpro BIM · migrarea 0014 · Exploatarea construcției (etapa 1)
--
-- Stadiul 7 din Legea 169/2026 și ISO 19650-3 (faza de exploatare):
-- 1. Trecerea proiectului în exploatare, după recepția la terminarea
--    lucrărilor aprobată. O face beneficiarul sau administratorul proiectului.
--    De atunci, proprietarul ține la zi Cartea tehnică (Legea 169/2026,
--    conținutul cărții tehnice: păstrarea și completarea la zi).
-- 2. Jurnalul evenimentelor: avarii, seisme, fenomene meteo, incendii,
--    intervenții, inspecții, schimbări de utilizare. Intrările nu se modifică
--    și nu se șterg; o greșeală se corectează cu o intrare nouă.
--    Fiecare eveniment poate avea fotografii și documente atașate și apare
--    în capitolul D al Cărții tehnice.
--
-- Se rulează o singură dată, după 0013, în Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Trecerea în exploatare
-- ---------------------------------------------------------------------
alter table public.proiecte add column if not exists exploatare_din date;

-- data intrării în exploatare se schimbă doar prin trece_in_exploatare()
create or replace function public.proiect_exploatare_protejata()
returns trigger language plpgsql as $$
begin
  if new.exploatare_din is distinct from old.exploatare_din
     and coalesce(current_setting('conpro.exploatare', true), '') <> 'da' then
    raise exception 'Intrarea în exploatare se înregistrează din fila Exploatare.';
  end if;
  return new;
end $$;

drop trigger if exists exploatare_protejata on public.proiecte;
create trigger exploatare_protejata before update on public.proiecte
  for each row execute function public.proiect_exploatare_protejata();

-- recepția la terminarea lucrărilor (a întregii construcții) admisă și aprobată
create or replace function public.receptie_terminare_aprobata(p uuid)
returns table (id uuid, aprobat_la timestamptz, garantie_pana date)
language sql stable security definer set search_path = public as $$
  select r.id, r.aprobat_la, r.garantie_pana from receptii r
   where r.proiect_id = p and public.este_membru(p) and r.tip = 'terminare' and not r.partiala and r.stare = 'aprobata'
     and r.decizie in ('admitere', 'admitere_cu_obiectii')
   order by r.aprobat_la desc limit 1;
$$;

create or replace function public.trece_in_exploatare(p_proiect uuid, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare r record; pr proiecte;
begin
  if not public.are_rol(p_proiect, array['beneficiar', 'administrator']::rol_proiect[]) then
    raise exception 'Trecerea în exploatare o face beneficiarul sau administratorul proiectului.';
  end if;
  select * into pr from proiecte where id = p_proiect;
  if pr.exploatare_din is not null then
    raise exception 'Construcția e deja în exploatare din %.', to_char(pr.exploatare_din, 'DD.MM.YYYY');
  end if;
  select * into r from public.receptie_terminare_aprobata(p_proiect);
  if r.id is null and not exists (select 1 from procese_verbale where proiect_id = p_proiect and tip = 'receptie_terminare' and stare = 'semnat') then
    raise exception 'Construcția trece în exploatare după recepția la terminarea lucrărilor, admisă și aprobată de beneficiar.';
  end if;
  if p_data is null or p_data > current_date then
    raise exception 'Data intrării în exploatare nu poate fi în viitor.';
  end if;
  if r.aprobat_la is not null and p_data < r.aprobat_la::date then
    raise exception 'Data intrării în exploatare nu poate fi înaintea aprobării recepției (%).', to_char(r.aprobat_la, 'DD.MM.YYYY');
  end if;
  perform set_config('conpro.exploatare', 'da', true);
  update proiecte set exploatare_din = p_data, stadiu_catuc = 7 where id = p_proiect;
  perform set_config('conpro.exploatare', '', true);
end $$;

-- ---------------------------------------------------------------------
-- 2. Jurnalul evenimentelor
-- ---------------------------------------------------------------------
create table if not exists public.evenimente_exploatare (
  id                  uuid primary key default gen_random_uuid(),
  proiect_id          uuid not null references public.proiecte(id) on delete cascade,
  numar               integer not null,
  tip                 text not null check (tip in ('avarie', 'seism', 'fenomen_meteo', 'incendiu', 'interventie',
                                                   'inspectie', 'schimbare_utilizare', 'altul')),
  data_eveniment      date not null,
  titlu               text not null check (length(trim(titlu)) > 2),
  descriere           text not null check (length(trim(descriere)) > 4),
  zona                text,                 -- unde: corp, nivel, încăpere, element
  efecte              text,                 -- degradări constatate
  masuri              text,                 -- ce s-a făcut / ce urmează
  necesita_expertiza  boolean not null default false,
  executant           text,                 -- cine a intervenit (firmă, expert)
  corecteaza_id       uuid references public.evenimente_exploatare(id),
  creat_de            uuid not null default auth.uid() references public.persoane(id),
  creat_la            timestamptz not null default now(),
  unique (proiect_id, numar)
);
create index if not exists evenimente_exploatare_proiect on public.evenimente_exploatare (proiect_id, numar desc);

create or replace function public.eveniment_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare p proiecte;
begin
  select * into p from proiecte where id = new.proiect_id;
  if p.exploatare_din is null then
    raise exception 'Jurnalul evenimentelor se ține după trecerea construcției în exploatare.';
  end if;
  if public.rol_in_proiect(new.proiect_id) is null or public.rol_in_proiect(new.proiect_id) = 'cititor' then
    raise exception 'Evenimentele le înregistrează membrii echipei, nu cititorii.';
  end if;
  if new.data_eveniment > current_date then
    raise exception 'Data evenimentului nu poate fi în viitor.';
  end if;
  if new.corecteaza_id is not null and not exists (
       select 1 from evenimente_exploatare e where e.id = new.corecteaza_id and e.proiect_id = new.proiect_id) then
    raise exception 'Intrarea corectată nu e din acest proiect.';
  end if;
  new.titlu := trim(new.titlu); new.descriere := trim(new.descriere);
  new.numar := coalesce((select max(numar) from evenimente_exploatare where proiect_id = new.proiect_id), 0) + 1;
  new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;

drop trigger if exists eveniment_verificare on public.evenimente_exploatare;
create trigger eveniment_verificare before insert on public.evenimente_exploatare
  for each row execute function public.eveniment_verifica();
drop trigger if exists jurnal_evenimente_exploatare on public.evenimente_exploatare;
create trigger jurnal_evenimente_exploatare after insert on public.evenimente_exploatare
  for each row execute function public.scrie_jurnal();

alter table public.evenimente_exploatare enable row level security;
drop policy if exists evenimente_citire on public.evenimente_exploatare;
create policy evenimente_citire on public.evenimente_exploatare for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists evenimente_creare on public.evenimente_exploatare;
create policy evenimente_creare on public.evenimente_exploatare for insert to authenticated with check (public.este_membru(proiect_id));

revoke all on public.evenimente_exploatare from anon, authenticated;
grant select on public.evenimente_exploatare to authenticated;
grant insert (id, proiect_id, tip, data_eveniment, titlu, descriere, zona, efecte, masuri, necesita_expertiza, executant, corecteaza_id)
  on public.evenimente_exploatare to authenticated;
-- fără update și delete: jurnalul nu se modifică

-- ---------------------------------------------------------------------
-- 3. Atașamente: fotografiile și documentele evenimentelor
-- ---------------------------------------------------------------------
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte',
                      'receptie', 'obiectie_receptie', 'revizie_document', 'eveniment_exploatare'));

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
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 4. „De făcut”: trecerea în exploatare
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
  order by 7 nulls last;
$$;

-- ---------------------------------------------------------------------
-- Drepturi
-- ---------------------------------------------------------------------
revoke execute on function public.trece_in_exploatare(uuid, date) from public, anon;
revoke execute on function public.receptie_terminare_aprobata(uuid) from public, anon;
grant execute on function public.trece_in_exploatare(uuid, date) to authenticated;
grant execute on function public.receptie_terminare_aprobata(uuid) to authenticated;
