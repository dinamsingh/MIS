-- OWNER ONLY, after reviewing/applying 0058-0060 and saving preflight output.
-- Edit the one email literal. No student, assignment, batch or section is changed.
begin;
do $$
declare
  v_email text := 'REPLACE_WITH_VERIFIED_TEACHER_EMAIL';
  v_teacher uuid;
  v_matches integer;
begin
  if v_email='REPLACE_WITH_VERIFIED_TEACHER_EMAIL' then raise exception 'Set the actual verified teacher email first.'; end if;
  v_email:=lower(btrim(v_email));
  select id into strict v_teacher from auth.users where lower(email)=v_email and email_confirmed_at is not null;
  if exists(select 1 from public.admins where lower(email)=v_email) then
    raise exception 'Use a teacher-only pilot identity. Do not remove an admin automatically.';
  end if;
  if exists(select 1 from public.students where lower(email)=v_email) then
    raise exception 'This identity already belongs to a student; review it separately.';
  end if;
  if not exists(select 1 from public.batches where id='2025-29' and current_sem=5 and status='classes') then
    raise exception 'Batch state differs from reviewed preflight. Stop and review; do not demote it.';
  end if;
  select count(*) into v_matches from public.sections s
  join (values
    ('7f3a9cea-bdf2-4300-8645-9237f1b4e342'::uuid,'CSE-3A'),
    ('6ce610f0-2f0c-459e-b55e-f6a900d94852'::uuid,'CSE-3B'),
    ('30311f08-0ed9-4138-a1a2-8f239a5066a6'::uuid,'CSE-3C')
  ) expected(id,name) on expected.id=s.id and expected.name=s.name
  where s.batch='2025-29' and s.department='CSE' and substring(s.semester from '^[0-9]+')::integer=3;
  if v_matches<>3 then raise exception 'Reviewed real section mapping changed. Do not create duplicate sections.'; end if;
  if exists(select 1 from public.students where section_id in
    ('7f3a9cea-bdf2-4300-8645-9237f1b4e342','6ce610f0-2f0c-459e-b55e-f6a900d94852','30311f08-0ed9-4138-a1a2-8f239a5066a6')) then
    raise exception 'Pilot sections are no longer empty. Review existing data; do not delete or auto-import it.';
  end if;
  if not exists(select 1 from public.syllabus_subjects where sem=3) then raise exception 'Semester 3 catalog is missing.'; end if;
  insert into public.allowed_teacher_emails(email) values(v_email) on conflict(email) do nothing;
  -- This dedicated pilot teacher sees only the approved pilot batch. Other
  -- teachers and the batches table are untouched. Save prior scopes first.
  update public.teacher_academic_scopes set enabled=false where teacher_id=v_teacher and batch_id<>'2025-29';
  insert into public.teacher_academic_scopes(teacher_id,batch_id,semester,department,sections,semester_override,enabled)
  values(v_teacher,'2025-29',3,'CSE',array['A','B','C'],true,true)
  on conflict(teacher_id,batch_id) do update set semester=3,department='CSE',
    sections=array['A','B','C'],semester_override=true,enabled=true;
end;
$$;
commit;
