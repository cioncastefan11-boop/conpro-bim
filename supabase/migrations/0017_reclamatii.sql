-- =====================================================================
-- Conpro BIM · migrarea 0017 · Locatarii și reclamațiile (exploatare, etapa 4)
--
-- Locatarii (proprietari, chiriași, utilizatori ai clădirii) NU sunt membri ai
-- proiectului: nu văd procesele verbale, documentele sau datele echipei. Văd
-- doar clădirea în care locuiesc și reclamațiile trimise de ei.
--
-- 1. Lista locatarilor, pe care o ține administrarea (beneficiarul, administratorul
--    proiectului sau al clădirii): e-mailul și unitatea (ex. „Ap. 14, scara A”).
--    Cu un cont pe același e-mail, locatarul e legat automat de clădire.
-- 2. Reclamațiile: categoria, locul, descrierea, urgența, fotografii.
--    noua → preluata (de administrare) sau la_constructor (în garanție)
--         → rezolvata → confirmata de cel care a raportat (sau redeschisă)
--    sau respinsa, motivat. Fiecare pas se face prin funcțiile de mai jos și
--    rămâne în Istoric.
-- 3. „De făcut”: reclamațiile noi (administrarea), cele în garanție
--    (constructorul) și confirmarea rezolvării (cel care a raportat, inclusiv
--    locatarul, și în rezumatul pe e-mail).
--
-- Se rulează o singură dată, după 0016, în Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Locatarii
-- ---------------------------------------------------------------------
create table if not exists public.locatari (
  id           uuid primary key default gen_random_uuid(),
  proiect_id   uuid not null references public.proiecte(id) on delete cascade,
  email        text not null check (email = lower(trim(email)) and email like '%_@_%'),
  unitate      text not null check (length(trim(unitate)) > 0),
  persoana_id  uuid references public.persoane(id) on delete set null,
  activ        boolean not null default true,
  invitat_de   uuid not null default auth.uid() references public.persoane(id),
  invitat_la   timestamptz not null default now(),
  acceptat_la  timestamptz,
  unique (proiect_id, email)
);
create index if not exists locatari_persoana on public.locatari (persoana_id);

create or replace function public.administreaza_cladirea(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.are_rol(p, array['beneficiar', 'administrator', 'administrator_cladire']::rol_proiect[]);
$$;

create or replace function public.este_locatar(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from locatari where proiect_id = p and persoana_id = auth.uid() and activ);
$$;

create or replace function public.locatar_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select exploatare_din from proiecte where id = new.proiect_id) is null then
      raise exception 'Locatarii se adaugă după trecerea construcției în exploatare.';
    end if;
    new.email := lower(trim(new.email));
    new.invitat_de := auth.uid(); new.invitat_la := now();
    -- dacă persoana are deja cont, se leagă imediat
    select id into new.persoana_id from persoane where email = new.email;
    if new.persoana_id is not null then new.acceptat_la := now(); end if;
  else
    new.proiect_id := old.proiect_id; new.email := old.email;
    new.invitat_de := old.invitat_de; new.invitat_la := old.invitat_la;
    -- legarea de cont o face doar accepta_invitatiile()
    if coalesce(current_setting('conpro.leaga_locatar', true), '') <> 'da' then
      new.persoana_id := old.persoana_id; new.acceptat_la := old.acceptat_la;
    end if;
  end if;
  new.unitate := trim(new.unitate);
  return new;
end $$;
drop trigger if exists locatar_verificare on public.locatari;
create trigger locatar_verificare before insert or update on public.locatari
  for each row execute function public.locatar_verifica();
drop trigger if exists jurnal_locatari on public.locatari;
create trigger jurnal_locatari after insert or update on public.locatari
  for each row execute function public.scrie_jurnal();

-- invitațiile în proiecte și legarea de clădiri, la intrarea în cont
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
  perform set_config('conpro.leaga_locatar', 'da', true);
  update locatari set persoana_id = auth.uid(), acceptat_la = now() where email = e and persoana_id is null;
  perform set_config('conpro.leaga_locatar', '', true);
  return n;
end $$;

-- clădirile locatarului (nu vede proiectul, doar datele de identificare ale clădirii)
create or replace function public.locuintele_mele()
returns table (locatar_id uuid, proiect_id uuid, cod text, denumire text, adresa text, unitate text, administrator text)
language sql stable security definer set search_path = public as $$
  select l.id, pr.id, pr.cod, pr.denumire, pr.adresa, l.unitate,
         (select string_agg(coalesce(nullif(pe.nume, ''), pe.email) || coalesce(', ' || pe.telefon, ''), '; ')
            from membri_proiect mp join persoane pe on pe.id = mp.persoana_id
           where mp.proiect_id = pr.id and mp.rol = 'administrator_cladire')
    from locatari l join proiecte pr on pr.id = l.proiect_id
   where l.persoana_id = auth.uid() and l.activ and not pr.arhivat
   order by pr.denumire, l.unitate;
$$;

-- ---------------------------------------------------------------------
-- 2. Reclamațiile
-- ---------------------------------------------------------------------
create table if not exists public.reclamatii (
  id                          uuid primary key default gen_random_uuid(),
  proiect_id                  uuid not null references public.proiecte(id) on delete cascade,
  numar                       integer not null,
  categorie                   text not null check (categorie in ('apa_canal', 'incalzire', 'electric', 'infiltratii', 'tamplarie',
                                                   'finisaje', 'lift', 'parti_comune', 'structura', 'altul')),
  unitate                     text,                -- apartamentul / spațiul
  loc                         text,                -- unde anume
  titlu                       text not null check (length(trim(titlu)) > 2),
  descriere                   text not null check (length(trim(descriere)) > 4),
  urgenta                     boolean not null default false,
  echipament_id               uuid references public.echipamente(id),
  stare                       text not null default 'noua'
                              check (stare in ('noua', 'preluata', 'la_constructor', 'rezolvata', 'confirmata', 'respinsa')),
  raportat_de                 uuid not null default auth.uid() references public.persoane(id),
  de_locatar                  boolean not null default false,
  preluata_de                 uuid references public.persoane(id),
  preluata_la                 timestamptz,
  trimisa_constructorului_la  timestamptz,
  rezolvare                   text,
  rezolvata_de                uuid references public.persoane(id),
  rezolvata_la                timestamptz,
  confirmata_la               timestamptz,
  motiv_respingere            text,
  redeschideri                integer not null default 0,
  nota_redeschidere           text,
  creat_la                    timestamptz not null default now(),
  unique (proiect_id, numar)
);
create index if not exists reclamatii_proiect on public.reclamatii (proiect_id, stare);
create index if not exists reclamatii_raportat on public.reclamatii (raportat_de);

create or replace function public.reclamatie_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare l locatari; v_rol text := public.rol_in_proiect(new.proiect_id)::text;
begin
  if (select exploatare_din from proiecte where id = new.proiect_id) is null then
    raise exception 'Reclamațiile se trimit după trecerea construcției în exploatare.';
  end if;
  if v_rol is not null and v_rol <> 'cititor' then
    new.de_locatar := false;
  else
    select * into l from locatari where proiect_id = new.proiect_id and persoana_id = auth.uid() and activ;
    if l.id is null then raise exception 'Reclamațiile le trimit locatarii clădirii și echipa de administrare.'; end if;
    new.de_locatar := true;
    new.unitate := l.unitate;                    -- locatarul raportează pentru unitatea lui
  end if;
  if new.echipament_id is not null and not exists (select 1 from echipamente where id = new.echipament_id and proiect_id = new.proiect_id) then
    raise exception 'Echipamentul nu aparține clădirii.';
  end if;
  new.titlu := trim(new.titlu); new.descriere := trim(new.descriere);
  new.numar := coalesce((select max(numar) from reclamatii where proiect_id = new.proiect_id), 0) + 1;
  new.stare := 'noua'; new.raportat_de := auth.uid(); new.creat_la := now();
  new.preluata_de := null; new.preluata_la := null; new.trimisa_constructorului_la := null; new.rezolvare := null;
  new.rezolvata_de := null; new.rezolvata_la := null; new.confirmata_la := null; new.motiv_respingere := null;
  new.redeschideri := 0; new.nota_redeschidere := null;
  return new;
end $$;
drop trigger if exists reclamatie_verificare on public.reclamatii;
create trigger reclamatie_verificare before insert on public.reclamatii
  for each row execute function public.reclamatie_verifica();
drop trigger if exists jurnal_reclamatii on public.reclamatii;
create trigger jurnal_reclamatii after insert or update on public.reclamatii
  for each row execute function public.scrie_jurnal();

-- preluarea: de administrare, sau trimisă constructorului (în garanție)
create or replace function public.reclamatie_preia(p_id uuid, p_la_constructor boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r reclamatii;
begin
  select * into r from reclamatii where id = p_id for update;
  if r.id is null or not public.administreaza_cladirea(r.proiect_id) then
    raise exception 'Reclamațiile le preia administrarea clădirii (beneficiarul sau administratorul).';
  end if;
  if r.stare not in ('noua', 'preluata', 'la_constructor') then raise exception 'Reclamația e deja închisă.'; end if;
  if p_la_constructor and not exists (select 1 from membri_proiect where proiect_id = r.proiect_id and rol in ('constructor', 'subcontractor')) then
    raise exception 'Constructorul nu mai face parte din echipa proiectului; invitați-l din fila Echipa.';
  end if;
  update reclamatii set stare = case when p_la_constructor then 'la_constructor' else 'preluata' end,
         preluata_de = auth.uid(), preluata_la = coalesce(preluata_la, now()),
         trimisa_constructorului_la = case when p_la_constructor then now() else trimisa_constructorului_la end
   where id = p_id;
end $$;

create or replace function public.reclamatie_rezolva(p_id uuid, p_rezolvare text)
returns void language plpgsql security definer set search_path = public as $$
declare r reclamatii;
begin
  select * into r from reclamatii where id = p_id for update;
  if r.id is null then raise exception 'Reclamația nu există.'; end if;
  if not (public.administreaza_cladirea(r.proiect_id)
          or (r.stare = 'la_constructor' and public.are_rol(r.proiect_id, array['constructor', 'subcontractor']::rol_proiect[]))) then
    raise exception 'Rezolvarea o consemnează administrarea clădirii sau, în garanție, constructorul.';
  end if;
  if r.stare not in ('noua', 'preluata', 'la_constructor') then raise exception 'Reclamația e deja închisă.'; end if;
  if coalesce(length(trim(p_rezolvare)), 0) < 3 then raise exception 'Descrieți ce s-a făcut.'; end if;
  update reclamatii set stare = 'rezolvata', rezolvare = trim(p_rezolvare), rezolvata_de = auth.uid(), rezolvata_la = now(),
         preluata_la = coalesce(preluata_la, now()), preluata_de = coalesce(preluata_de, auth.uid())
   where id = p_id;
end $$;

-- confirmarea sau redeschiderea, de cel care a raportat
create or replace function public.reclamatie_confirma(p_id uuid, p_rezolvata boolean, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare r reclamatii;
begin
  select * into r from reclamatii where id = p_id for update;
  if r.id is null or r.raportat_de <> auth.uid() then raise exception 'Rezolvarea o confirmă cel care a trimis reclamația.'; end if;
  if r.stare <> 'rezolvata' then raise exception 'Reclamația nu e marcată ca rezolvată.'; end if;
  if p_rezolvata then
    update reclamatii set stare = 'confirmata', confirmata_la = now() where id = p_id;
  else
    if coalesce(length(trim(p_nota)), 0) < 3 then raise exception 'Spuneți ce nu s-a rezolvat.'; end if;
    update reclamatii set stare = case when trimisa_constructorului_la is not null then 'la_constructor' else 'noua' end,
           redeschideri = redeschideri + 1, nota_redeschidere = trim(p_nota)
     where id = p_id;
  end if;
end $$;

create or replace function public.reclamatie_respinge(p_id uuid, p_motiv text)
returns void language plpgsql security definer set search_path = public as $$
declare r reclamatii;
begin
  select * into r from reclamatii where id = p_id for update;
  if r.id is null or not public.administreaza_cladirea(r.proiect_id) then
    raise exception 'Reclamațiile le respinge administrarea clădirii.';
  end if;
  if r.stare not in ('noua', 'preluata', 'la_constructor') then raise exception 'Reclamația e deja închisă.'; end if;
  if coalesce(length(trim(p_motiv)), 0) < 3 then raise exception 'Scrieți motivul respingerii.'; end if;
  update reclamatii set stare = 'respinsa', motiv_respingere = trim(p_motiv), preluata_de = coalesce(preluata_de, auth.uid()),
         preluata_la = coalesce(preluata_la, now()) where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Reguli de acces
-- ---------------------------------------------------------------------
alter table public.locatari enable row level security;
alter table public.reclamatii enable row level security;

drop policy if exists locatari_citire on public.locatari;
create policy locatari_citire on public.locatari for select to authenticated
  using (public.administreaza_cladirea(proiect_id) or persoana_id = auth.uid());
drop policy if exists locatari_creare on public.locatari;
create policy locatari_creare on public.locatari for insert to authenticated with check (public.administreaza_cladirea(proiect_id));
drop policy if exists locatari_editare on public.locatari;
create policy locatari_editare on public.locatari for update to authenticated
  using (public.administreaza_cladirea(proiect_id)) with check (public.administreaza_cladirea(proiect_id));

-- echipa vede toate reclamațiile clădirii; locatarul doar pe ale lui
drop policy if exists reclamatii_citire on public.reclamatii;
create policy reclamatii_citire on public.reclamatii for select to authenticated
  using (public.este_membru(proiect_id) or (raportat_de = auth.uid() and public.este_locatar(proiect_id)));
drop policy if exists reclamatii_creare on public.reclamatii;
create policy reclamatii_creare on public.reclamatii for insert to authenticated
  with check (public.este_membru(proiect_id) or public.este_locatar(proiect_id));

revoke all on public.locatari, public.reclamatii from anon, authenticated;
grant select on public.locatari, public.reclamatii to authenticated;
grant insert (id, proiect_id, email, unitate) on public.locatari to authenticated;
grant update (unitate, activ) on public.locatari to authenticated;
grant insert (id, proiect_id, categorie, unitate, loc, titlu, descriere, urgenta, echipament_id) on public.reclamatii to authenticated;
-- starea se schimbă doar prin funcțiile reclamatie_*

-- fotografiile reclamațiilor: locatarul le vede și le încarcă doar pe ale lui
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte',
                      'receptie', 'obiectie_receptie', 'revizie_document', 'eveniment_exploatare', 'inspectie_urmarire',
                      'interventie_echipament', 'reclamatie'));

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
  end if;
  return false;
end $$;

create or replace function public.reclamatie_a_mea(p_cale text)
returns boolean language sql stable security definer set search_path = public as $$
  select split_part(p_cale, '/', 2) = 'reclamatie' and exists (
    select 1 from reclamatii r where r.id::text = split_part(p_cale, '/', 3) and r.proiect_id::text = split_part(p_cale, '/', 1)
       and r.raportat_de = auth.uid() and public.este_locatar(r.proiect_id));
$$;

drop policy if exists atasamente_citire_locatar on public.atasamente;
create policy atasamente_citire_locatar on public.atasamente for select to authenticated
  using (entitate = 'reclamatie' and public.reclamatie_a_mea(cale));

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists documente_citire_locatar on storage.objects';
    execute $p$create policy documente_citire_locatar on storage.objects for select to authenticated
      using (bucket_id = 'documente' and public.reclamatie_a_mea(name))$p$;
    execute 'drop policy if exists documente_incarcare_locatar on storage.objects';
    execute $p$create policy documente_incarcare_locatar on storage.objects for insert to authenticated
      with check (bucket_id = 'documente' and public.reclamatie_a_mea(name))$p$;
  end if;
end $$;

revoke execute on function public.reclamatie_preia(uuid, boolean), public.reclamatie_rezolva(uuid, text),
  public.reclamatie_confirma(uuid, boolean, text), public.reclamatie_respinge(uuid, text), public.locuintele_mele(),
  public.administreaza_cladirea(uuid), public.este_locatar(uuid), public.reclamatie_a_mea(text) from public, anon;
grant execute on function public.reclamatie_preia(uuid, boolean), public.reclamatie_rezolva(uuid, text),
  public.reclamatie_confirma(uuid, boolean, text), public.reclamatie_respinge(uuid, text), public.locuintele_mele(),
  public.administreaza_cladirea(uuid), public.este_locatar(uuid), public.reclamatie_a_mea(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. „De făcut”
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
  order by 7 nulls last;
$$;
