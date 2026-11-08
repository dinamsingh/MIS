-- READ ONLY owner validation; do not fake an authenticated session in production.
begin read only;
select * from public.batches where id='2025-29'; -- must remain at global semester 5
select a.* from public.teacher_academic_scopes a
join auth.users u on u.id=a.teacher_id
where lower(u.email)=lower('REPLACE_WITH_VERIFIED_TEACHER_EMAIL');
select s.id,s.name,s.batch,s.semester,s.department,count(distinct st.id) as students,
 count(distinct ro.id) as authoritative_roster_rows
from public.sections s left join public.students st on st.section_id=s.id
left join public.student_roster ro on ro.enrollment_number=st.enrollment_number
  and ro.section_id=s.id
where s.id in ('7f3a9cea-bdf2-4300-8645-9237f1b4e342','6ce610f0-2f0c-459e-b55e-f6a900d94852','30311f08-0ed9-4138-a1a2-8f239a5066a6')
group by s.id order by s.name;
-- Both conflict queries should return zero rows for newly imported pilot data.
select st.id,st.enrollment_number,st.section_id,ro.section_id as roster_section
from public.students st join public.student_roster ro using(enrollment_number)
where ro.section_id is not null and st.section_id is distinct from ro.section_id;
select enrollment_number,count(*) from public.students group by 1 having count(*)>1;
select ta.teacher_id,ss.code,ss.sem,ta.batch_id,ta.section,ta.is_lab
from public.teacher_assignments ta join public.syllabus_subjects ss on ss.id=ta.subject_id
join auth.users u on u.id=ta.teacher_id
where lower(u.email)=lower('REPLACE_WITH_VERIFIED_TEACHER_EMAIL') order by ss.sem,ss.code,ta.section;
select count(*) as anonymous_sensitive_grants from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('add_admin','remove_admin','add_allowed_teacher','remove_allowed_teacher',
 'grant_teacher_extra_power','revoke_teacher_extra_power','permanently_delete_student','reset_student_binding',
 'create_quiz_with_questions','save_syllabus_structure','save_teacher_onboarding','import_section_roster')
 and has_function_privilege('anon',p.oid,'execute'); -- expect 0
commit;
