-- =====================================================================
-- Conpro BIM · migrarea 0023 · EIR și BEP generate din aplicație
--
-- Cerințele de schimb de informații (EIR, ISO 19650-2, 5.2.1) și planul de
-- execuție BIM (BEP, 5.3.2 și 5.4.1) se generează din datele proiectului:
-- echipa, convenția de denumire, momentele și planul de livrare, regulile
-- modelului (IDS), cerințele de predare. Aici se păstrează doar textele pe
-- care aplicația nu le are (scopul, strategia, software-ul, coordonarea...),
-- pe secțiuni, și versiunea fiecărui document.
--   · EIR-ul îl scriu beneficiarul, administratorul proiectului sau dirigintele;
--   · BEP-ul, administratorul, constructorul sau proiectantul (partea principală).
--
-- Se rulează o singură dată, după 0022, în Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.documente_bim (
  proiect_id    uuid not null references public.proiecte(id) on delete cascade,
  tip           text not null check (tip in ('eir', 'bep')),
  sectiuni      jsonb not null default '{}' check (jsonb_typeof(sectiuni) = 'object'),
  versiune      integer not null default 1,
  actualizat_de uuid not null default auth.uid() references public.persoane(id),
  actualizat_la timestamptz not null default now(),
  primary key (proiect_id, tip)
);

create or replace function public.document_bim_verifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tip = 'eir' and not public.are_rol(new.proiect_id, array['administrator','beneficiar','diriginte']::rol_proiect[]) then
    raise exception 'EIR-ul îl stabilesc beneficiarul, administratorul proiectului sau dirigintele.';
  end if;
  if new.tip = 'bep' and not public.are_rol(new.proiect_id, array['administrator','constructor','proiectant']::rol_proiect[]) then
    raise exception 'BEP-ul îl scriu administratorul proiectului, constructorul sau proiectantul.';
  end if;
  if tg_op = 'INSERT' then
    new.versiune := 1;
  else
    new.proiect_id := old.proiect_id; new.tip := old.tip;
    new.versiune := old.versiune + case when new.sectiuni is distinct from old.sectiuni then 1 else 0 end;
  end if;
  new.actualizat_de := auth.uid(); new.actualizat_la := now();
  return new;
end $$;
drop trigger if exists document_bim_verificare on public.documente_bim;
create trigger document_bim_verificare before insert or update on public.documente_bim
  for each row execute function public.document_bim_verifica();

drop trigger if exists jurnal_documente_bim on public.documente_bim;
create trigger jurnal_documente_bim after insert or update or delete on public.documente_bim
  for each row execute function public.scrie_jurnal();

alter table public.documente_bim enable row level security;
drop policy if exists documente_bim_citire on public.documente_bim;
create policy documente_bim_citire on public.documente_bim for select to authenticated using (public.este_membru(proiect_id));
drop policy if exists documente_bim_scriere on public.documente_bim;
create policy documente_bim_scriere on public.documente_bim for all to authenticated
  using ((tip = 'eir' and public.are_rol(proiect_id, array['administrator','beneficiar','diriginte']::public.rol_proiect[]))
      or (tip = 'bep' and public.are_rol(proiect_id, array['administrator','constructor','proiectant']::public.rol_proiect[])))
  with check ((tip = 'eir' and public.are_rol(proiect_id, array['administrator','beneficiar','diriginte']::public.rol_proiect[]))
      or (tip = 'bep' and public.are_rol(proiect_id, array['administrator','constructor','proiectant']::public.rol_proiect[])));

revoke all on public.documente_bim from anon, authenticated;
grant select on public.documente_bim to authenticated;
grant insert (proiect_id, tip, sectiuni) on public.documente_bim to authenticated;
grant update (sectiuni) on public.documente_bim to authenticated;
