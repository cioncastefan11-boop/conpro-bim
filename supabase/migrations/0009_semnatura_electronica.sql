-- =====================================================================
-- Conpro BIM · migrarea 0009 · Semnătura electronică, etapa 1
--
-- Procesele verbale și documentele de recepție se pot semna cu semnătură
-- electronică calificată (art. 581 alin. 4 din Legea 169/2026: Legea
-- 214/2024 și Regulamentul eIDAS nr. 910/2014; semnătura calificată are
-- efectul juridic al semnăturii olografe).
--
-- Etapa 1: fiecare semnează PDF-ul cu certificatul calificat (Adobe
-- Reader sau aplicația furnizorului), succesiv pe același fișier, și îl
-- încarcă. Aplicația citește semnăturile din fișier în browser și le
-- înregistrează aici. Fișierele încărcate nu se pot modifica sau șterge,
-- iar fiecare vizualizare reverifică semnăturile din fișierul stocat.
--
-- Se rulează o singură dată, după 0008, în Supabase → SQL Editor.
-- =====================================================================

create table public.semnaturi_electronice (
  id               uuid primary key default gen_random_uuid(),
  proiect_id       uuid not null references public.proiecte(id) on delete cascade,
  atasament_id     uuid not null references public.atasamente(id) on delete cascade,
  ordine           integer not null check (ordine > 0),
  semnatar         text not null,
  emitent          text,
  serie_certificat text,
  calificata       boolean not null,
  integra          boolean not null,
  acopera_tot      boolean not null,
  marca_temporala  boolean not null default false,
  semnat_la        timestamptz,
  persoana_id      uuid references public.persoane(id),   -- persoana din proiect recunoscută după nume
  inregistrat_de   uuid not null default auth.uid() references public.persoane(id),
  inregistrat_la   timestamptz not null default now(),
  unique (atasament_id, ordine)
);
create index on public.semnaturi_electronice (proiect_id);

create or replace function public.semnatura_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
declare a atasamente%rowtype;
begin
  select * into a from atasamente where id = new.atasament_id;
  if not found then raise exception 'Documentul nu există.'; end if;
  if a.incarcat_de <> auth.uid() then
    raise exception 'Semnăturile unui document le înregistrează cel care l-a încărcat.';
  end if;
  if a.incarcat_la < now() - interval '1 hour' then
    raise exception 'Semnăturile se înregistrează la încărcarea documentului.';
  end if;
  if a.tip_document not in ('pv_semnat', 'pv_receptie_semnat') then
    raise exception 'Doar procesele verbale semnate au semnături electronice înregistrate.';
  end if;
  new.proiect_id := a.proiect_id;
  new.inregistrat_de := auth.uid();
  new.inregistrat_la := now();
  if new.persoana_id is not null and not exists (
       select 1 from membri_proiect where proiect_id = a.proiect_id and persoana_id = new.persoana_id) then
    raise exception 'Persoana recunoscută nu face parte din proiect.';
  end if;
  return new;
end $$;

create trigger semnatura_verificare before insert on public.semnaturi_electronice
  for each row execute function public.semnatura_verifica();

create trigger jurnal_semnaturi after insert on public.semnaturi_electronice
  for each row execute function public.scrie_jurnal();

alter table public.semnaturi_electronice enable row level security;
create policy semnaturi_citire on public.semnaturi_electronice for select to authenticated
  using (public.este_membru(proiect_id));
create policy semnaturi_creare on public.semnaturi_electronice for insert to authenticated
  with check (inregistrat_de = auth.uid());

revoke all on public.semnaturi_electronice from anon, authenticated;
grant select on public.semnaturi_electronice to authenticated;
grant insert (atasament_id, proiect_id, ordine, semnatar, emitent, serie_certificat, calificata, integra, acopera_tot,
              marca_temporala, semnat_la, persoana_id, inregistrat_de)
  on public.semnaturi_electronice to authenticated;
