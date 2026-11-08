-- READ ONLY. Run as project owner before reviewing/applying 0058-0060.
begin read only;
select version,name from supabase_migrations.schema_migrations order by version;
select * from public.batches where id='2025-29';
select s.id,s.name,s.batch,s.semester,s.department,count(st.id) as existing_students
from public.sections s left join public.students st on st.section_id=s.id
where s.batch='2025-29' group by s.id order by s.name;
select sem,code,name,kind,lab_name from public.syllabus_subjects where sem=3 order by code;
select ta.teacher_id,ta.batch_id,ss.sem,ta.section,ta.is_lab,count(*)
from public.teacher_assignments ta join public.syllabus_subjects ss on ss.id=ta.subject_id
where ta.batch_id='2025-29' group by 1,2,3,4,5 order by 3,4;
select name,batch,semester,department,count(*) from public.sections
group by 1,2,3,4 having count(*)>1;
-- Inventory what scope bootstrap would preserve; review before applying 0059.
select ta.teacher_id,ta.batch_id,b.current_sem,array_agg(distinct ta.section) as current_sections
from public.teacher_assignments ta join public.batches b on b.id=ta.batch_id
join public.syllabus_subjects ss on ss.id=ta.subject_id and ss.sem=b.current_sem
join auth.users u on u.id=ta.teacher_id and u.email_confirmed_at is not null
join public.teachers t on t.id=u.id and lower(btrim(t.email))=lower(btrim(u.email))
join public.allowed_teacher_emails approved on lower(btrim(approved.email))=lower(btrim(u.email))
join public.sections s on s.batch=ta.batch_id and s.department='CSE'
 and s.name='CSE-'||ss.sem::text||ta.section
 and substring(s.semester from '^[0-9]+')::integer=ss.sem
where b.status<>'graduated' group by 1,2,3;
select tablename,policyname,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('teachers','teacher_assignments','students','student_roster','sections','attendance');
select p.oid::regprocedure as signature,p.proconfig,
  has_function_privilege('anon',p.oid,'execute') as anon_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('enforce_teacher_eligibility','normalize_subject_code',
 'add_admin','remove_admin','add_allowed_teacher','remove_allowed_teacher',
 'grant_teacher_extra_power','revoke_teacher_extra_power','permanently_delete_student',
 'reset_student_binding','create_quiz_with_questions','save_syllabus_structure');
commit;
