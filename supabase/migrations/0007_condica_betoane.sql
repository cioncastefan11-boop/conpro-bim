-- =====================================================================
-- Conpro BIM · migrarea 0007 · Condica de betoane, date suplimentare
--
-- Coloane noi la turnări:
--   punctul de lucru (opțional, pentru lucrări cu mai multe corpuri),
--   schimbul, nivelul / axele / travea, data decofrării
--   și cine a supravegheat turnarea.
-- Data decofrării se trece și după viza dirigintelui, o singură dată,
-- pentru că decofrarea se face la câteva zile după turnare.
--
-- Se rulează o singură dată, după 0006, în Supabase → SQL Editor.
-- =====================================================================

alter table public.turnari
  add column if not exists punct_lucru     text,
  add column if not exists schimb          text,
  add column if not exists identificare    text,
  add column if not exists data_decofrare  date,
  add column if not exists supravegheat_de text;

grant insert (punct_lucru, schimb, identificare, data_decofrare, supravegheat_de) on public.turnari to authenticated;
grant update (punct_lucru, schimb, identificare, data_decofrare, supravegheat_de) on public.turnari to authenticated;

create or replace function public.inregistreaza_decofrare(p_turnare uuid, p_data date)
returns void language plpgsql security definer set search_path = public as $$
declare t turnari%rowtype;
begin
  select * into t from turnari where id = p_turnare for update;
  if not found then raise exception 'Turnarea nu există.'; end if;
  if not public.are_rol(t.proiect_id, array['constructor','subcontractor']::rol_proiect[]) then
    raise exception 'Data decofrării o trece executantul (constructor / RTE).';
  end if;
  if t.data_decofrare is not null then raise exception 'Data decofrării e deja înregistrată.'; end if;
  if p_data is null or p_data < t.data then raise exception 'Decofrarea nu poate fi înaintea turnării.'; end if;
  if p_data > current_date then raise exception 'Data decofrării nu poate fi în viitor.'; end if;
  update turnari set data_decofrare = p_data where id = p_turnare;
end $$;

revoke execute on function public.inregistreaza_decofrare(uuid, date) from public, anon;
grant execute on function public.inregistreaza_decofrare(uuid, date) to authenticated;
