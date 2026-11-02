-- =====================================================================
-- Conpro BIM · migrarea 0012 · Convenția de denumire și sarcinile fiecăruia
--
-- 1. Convenția de denumire a documentelor, pe proiect (ISO 19650-2):
--    listele de inițiatori, volume și niveluri, numărul de cifre și, opțional,
--    modul strict (se acceptă doar codurile din liste). Se păstrează în
--    proiecte.standard_info și o editează administratorul proiectului.
-- 2. „De făcut”: ce are de făcut fiecare persoană, în toate proiectele
--    (PV-uri de confirmat, FAM-uri de avizat / decis / completat, turnări de
--    vizat, rezultate de luat la cunoștință, recepții, obiecții, documente
--    de aprobat).
-- 3. Preferința pentru rezumatul zilnic pe e-mail.
--
-- Se rulează o singură dată, după 0011, în Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Convenția de denumire
-- ---------------------------------------------------------------------
-- standard_info = { "strict": true/false, "cifre": 4,
--   "initiatori": [{"cod": "SP", "nume": "Studio Proiect SRL"}, ...],
--   "volume":     [{"cod": "ZZ", "nume": "Toate corpurile"}, ...],
--   "niveluri":   [{"cod": "00", "nume": "Parter"}, ...] }
create or replace function public.in_lista(conventie jsonb, cheie text, cod text)
returns boolean language sql immutable as $$
  select jsonb_typeof(conventie -> cheie) is distinct from 'array'
      or jsonb_array_length(conventie -> cheie) = 0
      or exists (select 1 from jsonb_array_elements(conventie -> cheie) e where upper(e ->> 'cod') = upper(cod));
$$;

create or replace function public.document_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rol rol_proiect; c jsonb; v_cifre int;
begin
  v_rol := public.rol_in_proiect(new.proiect_id);
  if v_rol is null or v_rol = 'cititor' then
    raise exception 'Documentele le adaugă membrii echipei de proiect.';
  end if;
  new.autor_rol := v_rol;
  new.initiator := upper(trim(new.initiator)); new.volum := upper(trim(new.volum)); new.nivel := upper(trim(new.nivel));
  new.tip := upper(trim(new.tip)); new.rol := upper(trim(new.rol));
  select standard_info into c from proiecte where id = new.proiect_id;
  if coalesce((c ->> 'strict')::boolean, false) then
    if not public.in_lista(c, 'initiatori', new.initiator) then
      raise exception 'Inițiatorul % nu e în convenția de denumire a proiectului.', new.initiator;
    end if;
    if not public.in_lista(c, 'volume', new.volum) then
      raise exception 'Volumul % nu e în convenția de denumire a proiectului.', new.volum;
    end if;
    if not public.in_lista(c, 'niveluri', new.nivel) then
      raise exception 'Nivelul % nu e în convenția de denumire a proiectului.', new.nivel;
    end if;
    v_cifre := coalesce((c ->> 'cifre')::int, 0);
    if v_cifre between 4 and 6 and length(new.numar) <> v_cifre then
      raise exception 'Numărul documentului are % cifre în convenția proiectului.', v_cifre;
    end if;
  end if;
  new.cod := concat_ws('-', (select cod from proiecte where id = new.proiect_id), new.initiator, new.volum, new.nivel, new.tip, new.rol, new.numar);
  new.creat_de := auth.uid(); new.creat_la := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Sarcinile unei persoane
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
  order by 7 nulls last;
$$;

-- fiecare își vede doar sarcinile lui; pentru alte persoane funcția o folosește doar serverul (rezumatul pe e-mail)
create or replace function public.sarcinile_mele()
returns table (proiect_id uuid, cod_proiect text, denumire_proiect text, tip text, titlu text, cale text, din timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public.sarcini_persoana(auth.uid());
$$;

revoke execute on function public.sarcini_persoana(uuid) from public, anon, authenticated;
revoke execute on function public.sarcinile_mele() from public, anon;
grant execute on function public.sarcinile_mele() to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.sarcini_persoana(uuid) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Rezumatul zilnic pe e-mail
-- ---------------------------------------------------------------------
alter table public.persoane add column if not exists rezumat_zilnic boolean not null default true;
grant update (rezumat_zilnic) on public.persoane to authenticated;
