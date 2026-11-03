-- =====================================================================
-- Conpro BIM · verificarea instalării bazei de date
--
-- Arată, pentru fiecare migrare 0001–0024, dacă tabelele, funcțiile și
-- coloanele ei există în Supabase și, la funcțiile rescrise de migrările
-- următoare, dacă e instalată ultima versiune.
--
-- Doar citește: nu creează, nu modifică și nu șterge nimic. Se poate rula
-- oricând, de câte ori vreți: Supabase → SQL Editor → New query → Run.
--
-- Rezultatul: un rând pe verificare, cu „OK” sau „LIPSEȘTE”, iar primul
-- rând e rezumatul. Dacă o migrare are rânduri „LIPSEȘTE”, rulați din nou
-- fișierul ei din supabase/migrations/, apoi pe toate cele de după ea,
-- în ordine (sunt scrise să poată fi rulate de mai multe ori).
-- =====================================================================

with
fn as (
  select p.proname, string_agg(pg_get_functiondef(p.oid), ' ') as corp
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  group by p.proname
),
verificari(migr, ce, ok) as (
  -- tabel: există în schema public
  select m, 'tabelul ' || x, to_regclass('public.' || x) is not null
  from (values
    ('0001', 'proiecte'), ('0001', 'persoane'), ('0001', 'firme'), ('0001', 'membri_proiect'), ('0001', 'invitatii'), ('0001', 'documente_persoana'), ('0001', 'jurnal'),
    ('0002', 'procese_verbale'), ('0002', 'participanti_pv'), ('0002', 'registru_intrari'),
    ('0004', 'fam'), ('0004', 'livrari_fam'), ('0004', 'atasamente'),
    ('0005', 'turnari'), ('0005', 'incercari'),
    ('0006', 'niveluri'), ('0006', 'incaperi'), ('0006', 'tipuri_echipament'), ('0006', 'echipamente'), ('0006', 'documente_carte'),
    ('0008', 'receptii'), ('0008', 'comisie_receptie'), ('0008', 'obiectii_receptie'),
    ('0009', 'semnaturi_electronice'),
    ('0010', 'documente_proiect'), ('0010', 'revizii_document'),
    ('0014', 'evenimente_exploatare'),
    ('0015', 'puncte_urmarire'), ('0015', 'inspectii_urmarire'), ('0015', 'constatari_inspectie'),
    ('0016', 'interventii_echipament'),
    ('0017', 'locatari'), ('0017', 'reclamatii'),
    ('0018', 'observatii'), ('0018', 'comentarii_observatie'),
    ('0019', 'elemente_legate'), ('0019', 'elemente_executate'),
    ('0020', 'momente_livrare'), ('0020', 'livrabile_planificate'),
    ('0021', 'cerinte_predare'), ('0021', 'lectii_invatate'),
    ('0022', 'reguli_model'), ('0022', 'verificari_model'),
    ('0023', 'documente_bim')
  ) as v(m, x)

  union all
  -- funcție: există
  select m, 'funcția ' || x || '()', exists (select 1 from fn where fn.proname = x)
  from (values
    ('0001', 'este_membru'), ('0001', 'are_rol'), ('0001', 'scrie_jurnal'),
    ('0002', 'convoaca_pv'), ('0002', 'confirma_pv'), ('0002', 'anuleaza_pv'),
    ('0003', 'completeaza_pv'),
    ('0004', 'fam_depune'), ('0004', 'fam_avizeaza'), ('0004', 'fam_decide'),
    ('0005', 'vizeaza_turnare'), ('0005', 'ia_la_cunostinta_incercare'),
    ('0007', 'inregistreaza_decofrare'),
    ('0008', 'receptie_convoaca'), ('0008', 'receptie_decide'), ('0008', 'receptie_aproba'),
    ('0009', 'semnatura_verifica'),
    ('0010', 'revizie_partajeaza'), ('0010', 'revizie_aproba_publicarea'), ('0010', 'rol_in_proiect'),
    ('0012', 'sarcinile_mele'),
    ('0013', 'accepta_termenii'), ('0013', 'datele_mele'),
    ('0014', 'trece_in_exploatare'),
    ('0015', 'inregistreaza_inspectie'), ('0015', 'scadente_urmarire'),
    ('0016', 'scadente_mentenanta'), ('0016', 'garantii'),
    ('0017', 'reclamatie_preia'), ('0017', 'reclamatie_rezolva'), ('0017', 'locuintele_mele'),
    ('0018', 'observatie_stare'), ('0018', 'coordoneaza_observatia'), ('0018', 'lucreaza_in_proiect'),
    ('0019', 'poate_lega'),
    ('0020', 'livrabile_stare'),
    ('0021', 'cerinta_verifica'), ('0021', 'lectie_verifica'),
    ('0022', 'regula_model_verifica'), ('0022', 'verificare_model_verifica'),
    ('0023', 'document_bim_verifica'),
    ('0024', 'semnal_activ')
  ) as v(m, x)

  union all
  -- coloane adăugate în tabele existente
  select m, 'coloana ' || tb || '.' || col,
         exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = tb and c.column_name = col)
  from (values
    ('0003', 'procese_verbale', 'descriere_lucrari'), ('0003', 'procese_verbale', 'concluzii'),
    ('0011', 'tipuri_echipament', 'ifc_guid'),
    ('0012', 'persoane', 'rezumat_zilnic'),
    ('0013', 'persoane', 'termeni_versiune'),
    ('0014', 'proiecte', 'exploatare_din')
  ) as v(m, tb, col)

  union all
  -- funcțiile rescrise de migrările următoare: e instalată ultima versiune?
  select m, ce, coalesce((select fn.corp ilike '%' || urma || '%' from fn where fn.proname = x), false)
  from (values
    ('0012', 'document_verifica() verifică convenția de denumire', 'document_verifica', 'in_lista'),
    ('0013', 'creeaza_persoana() păstrează acceptarea termenilor', 'creeaza_persoana', 'termeni_versiune'),
    ('0017', 'accepta_invitatiile() leagă și locatarii', 'accepta_invitatiile', 'leaga_locatar'),
    ('0018', 'poate_atasa() acceptă fotografii la observații', 'poate_atasa', '''observatie'''),
    ('0020', 'sarcini_persoana() include livrabilele întârziate', 'sarcini_persoana', '''livrabil''')
  ) as v(m, ce, x, urma)

  union all
  -- piese din afara schemei public
  select '0001', 'contul nou creează persoana (trigger pe auth.users)',
         exists (select 1 from pg_trigger g where g.tgrelid = 'auth.users'::regclass and g.tgname = 'la_cont_nou' and not g.tgisinternal)
  union all
  select '0004', 'spațiul de fișiere „documente” (Storage)', exists (select 1 from storage.buckets b where b.id = 'documente')
  union all
  select '0004', 'accesul la fișiere doar pentru membrii proiectului', exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = 'documente_citire')
  union all
  select '0018', 'atașamentele acceptă observațiile (constrângerea)',
         coalesce((select pg_get_constraintdef(c.oid) ilike '%observatie%' from pg_constraint c where c.conname = 'atasamente_entitate_check' and c.conrelid = to_regclass('public.atasamente')), false)

  union all
  -- securitatea: fiecare tabel al aplicației are RLS pornit
  select 'RLS', 'RLS pornit pe tabelul ' || c.relname, c.relrowsecurity
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
),
rezumat as (
  select count(*) filter (where not ok) as lipsa, count(*) as total,
         string_agg(distinct migr, ', ' order by migr) filter (where not ok) as migrari
  from verificari
)
select '0000' as migrarea,
       case when lipsa = 0 then 'Totul e instalat: ' || total || ' verificări' else lipsa || ' din ' || total || ' verificări lipsesc' end as verificarea,
       case when lipsa = 0 then 'OK' else 'De rulat: ' || migrari end as starea
from rezumat
union all
select migr, ce, case when ok then 'OK' else 'LIPSEȘTE' end
from verificari
order by 1, 3, 2;
