-- =====================================================================
-- Conpro BIM · migrarea 0010 · Documentele proiectului (CDE, ISO 19650)
--
-- Mediul comun de date: fiecare document (planșă, model, raport, calcul,
-- caiet de sarcini) are un cod standard, compus după convenția
-- ISO 19650-2 (anexa națională): Proiect-Inițiator-Volum-Nivel-Tip-Rol-Număr,
-- de exemplu BLC01-CVS-ZZ-01-DR-S-0101.
--
-- Fiecare document are revizii. O revizie trece prin stările CDE:
--   lucru în curs (WIP, S0)  → o vede doar echipa autorului
--   partajată (S1–S4)        → o vede tot proiectul, pentru coordonare,
--                              informare, comentarii sau aprobarea etapei
--   publicată (A, B, CR)     → aprobată pentru execuție / ca executat;
--                              publicarea o aprobă beneficiarul, dirigintele
--                              sau administratorul proiectului
--   arhivată                 → înlocuită de o revizie mai nouă; rămâne în istoric
-- Fișierele unei revizii se încarcă doar cât e în lucru și nu se mai schimbă.
--
-- Se rulează o singură dată, după 0009, în Supabase → SQL Editor.
-- =====================================================================

create table public.documente_proiect (
  id           uuid primary key default gen_random_uuid(),
  proiect_id   uuid not null references public.proiecte(id) on delete cascade,
  initiator    text not null check (initiator ~ '^[A-Z0-9]{2,6}$'),   -- organizația care produce documentul
  volum        text not null default 'ZZ' check (volum ~ '^[A-Z0-9]{1,4}$'),   -- volum / sistem / corp (ZZ = toate)
  nivel        text not null default 'ZZ' check (nivel ~ '^[A-Z0-9]{2,4}$'),   -- nivel (00, 01, B1, ZZ = mai multe, XX = niciunul)
  tip          text not null check (tip ~ '^[A-Z0-9]{2}$'),                    -- DR planșă, M3 model 3D, RP raport...
  rol          text not null check (rol ~ '^[A-Z]$'),                          -- A arhitectură, S structură, M instalații...
  numar        text not null check (numar ~ '^[0-9]{4,6}$'),
  cod          text not null,
  titlu        text not null check (length(trim(titlu)) > 2),
  descriere    text,
  autor_rol    public.rol_proiect not null,
  creat_de     uuid not null default auth.uid() references public.persoane(id),
  creat_la     timestamptz not null default now(),
  unique (proiect_id, initiator, volum, nivel, tip, rol, numar),
  unique (proiect_id, cod)
);
create index on public.documente_proiect (proiect_id, cod);

create table public.revizii_document (
  id                 uuid primary key default gen_random_uuid(),
  document_id        uuid not null references public.documente_proiect(id) on delete cascade,
  proiect_id         uuid not null references public.proiecte(id) on delete cascade,
  revizie            text not null check (revizie ~ '^[PC][0-9]{2}(\.[0-9]{1,2})?$'),   -- P01, P01.1, C01
  stare              text not null default 'wip' check (stare in ('wip', 'partajat', 'publicare_ceruta', 'publicat', 'arhivat')),
  cod_stare          text not null default 'S0' check (cod_stare ~ '^(S[0-4]|A[0-9]{1,2}|B[0-9]{1,2}|CR)$'),
  modificari         text,                       -- ce s-a schimbat față de revizia anterioară
  autor_rol          public.rol_proiect not null,
  creat_de           uuid not null default auth.uid() references public.persoane(id),
  creat_la           timestamptz not null default now(),
  partajat_de        uuid references public.persoane(id),
  partajat_la        timestamptz,
  publicare_ceruta_de uuid references public.persoane(id),
  publicare_ceruta_la timestamptz,
  cod_stare_cerut    text check (cod_stare_cerut is null or cod_stare_cerut ~ '^(A[0-9]{1,2}|B[0-9]{1,2}|CR)$'),
  aprobat_de         uuid references public.persoane(id),
  aprobat_la         timestamptz,
  observatii_aprobare text,
  arhivat_la         timestamptz,
  unique (document_id, revizie)
);
create index on public.revizii_document (document_id, creat_la desc);
create index on public.revizii_document (proiect_id, stare);

-- ---------------------------------------------------------------------
-- Reguli
-- ---------------------------------------------------------------------
create or replace function public.rol_in_proiect(p uuid)
returns public.rol_proiect language sql stable security definer set search_path = public as $$
  select rol from membri_proiect where proiect_id = p and persoana_id = auth.uid() limit 1;
$$;

-- poate vedea o revizie în lucru: autorul și cei cu același rol (echipa de lucru)
create or replace function public.vede_revizia(r public.revizii_document)
returns boolean language sql stable security definer set search_path = public as $$
  select public.este_membru(r.proiect_id)
     and (r.stare <> 'wip' or r.creat_de = auth.uid() or public.are_rol(r.proiect_id, array[r.autor_rol]));
$$;

create or replace function public.document_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol rol_proiect;
begin
  v_rol := public.rol_in_proiect(new.proiect_id);
  if v_rol is null or v_rol = 'cititor' then
    raise exception 'Documentele le adaugă membrii echipei de proiect.';
  end if;
  new.autor_rol := v_rol;
  new.initiator := upper(trim(new.initiator)); new.volum := upper(trim(new.volum)); new.nivel := upper(trim(new.nivel));
  new.tip := upper(trim(new.tip)); new.rol := upper(trim(new.rol));
  new.cod := concat_ws('-', (select cod from proiecte where id = new.proiect_id), new.initiator, new.volum, new.nivel, new.tip, new.rol, new.numar);
  new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;
create trigger document_verificare before insert on public.documente_proiect
  for each row execute function public.document_verifica();

-- titlul și descrierea se corectează de autor sau de echipa lui; codul nu se schimbă
create or replace function public.document_protejeaza()
returns trigger language plpgsql as $$
begin
  new.id := old.id; new.proiect_id := old.proiect_id; new.initiator := old.initiator; new.volum := old.volum;
  new.nivel := old.nivel; new.tip := old.tip; new.rol := old.rol; new.numar := old.numar; new.cod := old.cod;
  new.autor_rol := old.autor_rol; new.creat_de := old.creat_de; new.creat_la := old.creat_la;
  return new;
end $$;
create trigger document_protejare before update on public.documente_proiect
  for each row execute function public.document_protejeaza();

create or replace function public.revizie_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare d documente_proiect%rowtype;
begin
  select * into d from documente_proiect where id = new.document_id;
  if not found then raise exception 'Documentul nu există.'; end if;
  if not (d.creat_de = auth.uid() or public.are_rol(d.proiect_id, array[d.autor_rol])) then
    raise exception 'Reviziile le face echipa care a produs documentul.';
  end if;
  if exists (select 1 from revizii_document where document_id = d.id and stare in ('wip', 'publicare_ceruta')) then
    raise exception 'Există deja o revizie în lucru sau la aprobare pentru acest document.';
  end if;
  new.proiect_id := d.proiect_id;
  new.autor_rol := d.autor_rol;
  new.stare := 'wip'; new.cod_stare := 'S0';
  new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;
create trigger revizie_verificare before insert on public.revizii_document
  for each row execute function public.revizie_verifica();

-- arhivează reviziile anterioare înlocuite
create or replace function public.arhiveaza_anterioare(p_rev uuid)
returns void language sql security definer set search_path = public as $$
  update revizii_document v set stare = 'arhivat', arhivat_la = now()
   where v.document_id = (select document_id from revizii_document where id = p_rev)
     and v.id <> p_rev and v.stare in ('partajat', 'publicat');
$$;

-- ---------------------------------------------------------------------
-- Tranziții (ISO 19650-2, 5.6 și 5.7)
-- ---------------------------------------------------------------------
create or replace function public.revizie_partajeaza(p_rev uuid, p_cod_stare text)
returns void language plpgsql security definer set search_path = public as $$
declare r revizii_document%rowtype;
begin
  select * into r from revizii_document where id = p_rev for update;
  if not found then raise exception 'Revizia nu există.'; end if;
  if not (r.creat_de = auth.uid() or public.are_rol(r.proiect_id, array[r.autor_rol])) then
    raise exception 'Partajarea o face echipa care a produs documentul, după verificarea internă.';
  end if;
  if r.stare <> 'wip' then raise exception 'Doar o revizie în lucru se partajează.'; end if;
  if p_cod_stare not in ('S1', 'S2', 'S3', 'S4') then raise exception 'Alegeți scopul partajării (S1–S4).'; end if;
  if not exists (select 1 from atasamente where entitate = 'revizie_document' and entitate_id = p_rev) then
    raise exception 'Încărcați fișierul revizie înainte de partajare.';
  end if;
  update revizii_document set stare = 'partajat', cod_stare = p_cod_stare, partajat_de = auth.uid(), partajat_la = now() where id = p_rev;
  -- o revizie partajată mai nouă înlocuiește partajările anterioare (cele publicate rămân în vigoare)
  update revizii_document v set stare = 'arhivat', arhivat_la = now()
   where v.document_id = r.document_id and v.id <> p_rev and v.stare = 'partajat';
end $$;

create or replace function public.revizie_cere_publicarea(p_rev uuid, p_cod_stare text)
returns void language plpgsql security definer set search_path = public as $$
declare r revizii_document%rowtype;
begin
  select * into r from revizii_document where id = p_rev for update;
  if not found then raise exception 'Revizia nu există.'; end if;
  if not (r.creat_de = auth.uid() or public.are_rol(r.proiect_id, array[r.autor_rol])) then
    raise exception 'Publicarea o cere echipa care a produs documentul.';
  end if;
  if r.stare <> 'partajat' then raise exception 'Se cere publicarea doar pentru o revizie partajată.'; end if;
  if p_cod_stare !~ '^(A[0-9]{1,2}|B[0-9]{1,2}|CR)$' then raise exception 'Alegeți codul de publicare (A, B sau CR).'; end if;
  update revizii_document set stare = 'publicare_ceruta', cod_stare_cerut = p_cod_stare,
         publicare_ceruta_de = auth.uid(), publicare_ceruta_la = now()
   where id = p_rev;
end $$;

create or replace function public.revizie_aproba_publicarea(p_rev uuid, p_aproba boolean, p_observatii text)
returns void language plpgsql security definer set search_path = public as $$
declare r revizii_document%rowtype;
begin
  select * into r from revizii_document where id = p_rev for update;
  if not found then raise exception 'Revizia nu există.'; end if;
  if not public.are_rol(r.proiect_id, array['beneficiar', 'diriginte', 'administrator']::rol_proiect[]) then
    raise exception 'Publicarea o aprobă beneficiarul, dirigintele sau administratorul proiectului (ISO 19650-2, 5.7).';
  end if;
  if r.stare <> 'publicare_ceruta' then raise exception 'Nu s-a cerut publicarea acestei revizii.'; end if;
  if not p_aproba and length(trim(coalesce(p_observatii, ''))) < 5 then
    raise exception 'Scrieți de ce nu aprobați publicarea.';
  end if;
  if p_aproba then
    update revizii_document set stare = 'publicat', cod_stare = r.cod_stare_cerut, aprobat_de = auth.uid(), aprobat_la = now(),
           observatii_aprobare = nullif(trim(p_observatii), '')
     where id = p_rev;
    perform public.arhiveaza_anterioare(p_rev);
  else
    update revizii_document set stare = 'partajat', cod_stare_cerut = null, publicare_ceruta_de = null, publicare_ceruta_la = null,
           observatii_aprobare = trim(p_observatii)
     where id = p_rev;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Atașamente: fișierele reviziilor
-- ---------------------------------------------------------------------
alter table public.atasamente drop constraint if exists atasamente_entitate_check;
alter table public.atasamente add constraint atasamente_entitate_check
  check (entitate in ('fam', 'livrare_fam', 'pv', 'turnare', 'incercare', 'tip_echipament', 'echipament', 'document_carte',
                      'receptie', 'obiectie_receptie', 'revizie_document'));

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
  end if;
  return false;
end $$;

-- mesaj de refuz pe înțelesul fiecărui caz
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
    raise exception '%', case new.entitate
      when 'fam' then 'Nu puteți atașa fișiere aici (după depunere, FAM-ul nu se mai modifică).'
      when 'revizie_document' then 'Fișierele se încarcă doar la o revizie în lucru, de echipa care a produs documentul.'
      else 'Nu puteți atașa fișiere aici.' end;
  end if;
  return new;
end $$;

-- fișierele unei revizii în lucru le văd doar cei care văd revizia
drop policy if exists atasamente_citire on public.atasamente;
create policy atasamente_citire on public.atasamente for select to authenticated
  using (public.este_membru(proiect_id)
         and (entitate <> 'revizie_document'
              or exists (select 1 from public.revizii_document r where r.id = entitate_id and public.vede_revizia(r))));

-- ---------------------------------------------------------------------
-- Jurnal și drepturi
-- ---------------------------------------------------------------------
create trigger jurnal_documente_proiect after insert or update on public.documente_proiect
  for each row execute function public.scrie_jurnal();
create trigger jurnal_revizii_document after insert or update on public.revizii_document
  for each row execute function public.scrie_jurnal();

alter table public.documente_proiect enable row level security;
alter table public.revizii_document  enable row level security;

create policy documente_citire on public.documente_proiect for select to authenticated using (public.este_membru(proiect_id));
create policy documente_creare on public.documente_proiect for insert to authenticated
  with check (public.este_membru(proiect_id) and not public.are_rol(proiect_id, array['cititor']::public.rol_proiect[]));
create policy documente_editare on public.documente_proiect for update to authenticated
  using (creat_de = auth.uid() or public.are_rol(proiect_id, array[autor_rol]))
  with check (creat_de = auth.uid() or public.are_rol(proiect_id, array[autor_rol]));

create policy revizii_citire on public.revizii_document for select to authenticated using (public.vede_revizia(revizii_document));
create policy revizii_creare on public.revizii_document for insert to authenticated with check (true);
-- doar descrierea modificărilor, cât revizia e în lucru
create policy revizii_editare on public.revizii_document for update to authenticated
  using (stare = 'wip' and (creat_de = auth.uid() or public.are_rol(proiect_id, array[autor_rol])))
  with check (stare = 'wip');

revoke all on public.documente_proiect, public.revizii_document from anon, authenticated;
grant select on public.documente_proiect, public.revizii_document to authenticated;
grant insert (proiect_id, initiator, volum, nivel, tip, rol, numar, titlu, descriere) on public.documente_proiect to authenticated;
grant update (titlu, descriere) on public.documente_proiect to authenticated;
grant insert (document_id, revizie, modificari) on public.revizii_document to authenticated;
grant update (modificari) on public.revizii_document to authenticated;

revoke execute on function public.revizie_partajeaza(uuid, text), public.revizie_cere_publicarea(uuid, text),
  public.revizie_aproba_publicarea(uuid, boolean, text), public.arhiveaza_anterioare(uuid) from public, anon;
grant execute on function public.revizie_partajeaza(uuid, text), public.revizie_cere_publicarea(uuid, text),
  public.revizie_aproba_publicarea(uuid, boolean, text) to authenticated;
