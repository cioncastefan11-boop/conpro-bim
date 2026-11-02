-- =====================================================================
-- Conpro BIM · migrarea 0011 · Modelul IFC
--
-- Nivelurile, încăperile, tipurile și echipamentele preluate din modelul
-- IFC păstrează identificatorul elementului din model (GlobalId), ca:
--   - o nouă preluare să actualizeze, nu să dubleze;
--   - un element ales în vizualizare să ducă la echipamentul din COBie.
--
-- Se rulează o singură dată, după 0010, în Supabase → SQL Editor.
--
-- Când treceți pe planul Supabase Pro, ridicați limita de mărime pe fișier
-- (planul gratuit acceptă cel mult 50 MB), de exemplu la 1 GB:
--   update storage.buckets set file_size_limit = 1073741824 where id = 'documente';
-- =====================================================================

alter table public.niveluri          add column if not exists ifc_guid text;
alter table public.incaperi          add column if not exists ifc_guid text;
alter table public.tipuri_echipament add column if not exists ifc_guid text;
alter table public.echipamente       add column if not exists ifc_guid text;

create unique index if not exists niveluri_ifc_guid          on public.niveluri (proiect_id, ifc_guid)          where ifc_guid is not null;
create unique index if not exists incaperi_ifc_guid          on public.incaperi (proiect_id, ifc_guid)          where ifc_guid is not null;
create unique index if not exists tipuri_echipament_ifc_guid on public.tipuri_echipament (proiect_id, ifc_guid) where ifc_guid is not null;
create unique index if not exists echipamente_ifc_guid       on public.echipamente (proiect_id, ifc_guid)       where ifc_guid is not null;
