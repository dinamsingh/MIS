-- Owner-approved teaching scope. Never changes batches.current_sem or seeds students.
begin;

create table if not exists public.teacher_academic_scopes (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  batch_id text not null references public.batches(id),
  semester integer not null check (semester between 1 and 8),
  department text not null default 'CSE' check (department = 'CSE'),
  sections text[] not null check (cardinality(sections) > 0 and sections <@ array['A','B','C']::text[]),
  semester_override boolean not null default false,
  enabled boolean not null default true,
  primary key (teacher_id, batch_id)
);
alter table public.teacher_academic_scopes enable row level security;
revoke all on public.teacher_academic_scopes from anon, authenticated;
grant select on public.teacher_academic_scopes to authenticated;
drop policy if exists scope_read_own on public.teacher_academic_scopes;
create policy scope_read_own on public.teacher_academic_scopes for select to authenticated
using (teacher_id = auth.uid());

-- Preserve already configured CURRENT classes; do not infer historical approvals.
-- Owners must approve new teachers and any exceptional semester explicitly.
insert into public.teacher_academic_scopes (teacher_id,batch_id,semester,sections)
select ta.teacher_id,ta.batch_id,b.current_sem,array_agg(distinct ta.section)
from public.teacher_assignments ta
join auth.users u on u.id=ta.teacher_id and u.email_confirmed_at is not null
join public.teachers t on t.id=u.id and lower(btrim(t.email))=lower(btrim(u.email))
join public.allowed_teacher_emails approved on lower(btrim(approved.email))=lower(btrim(u.email))
join public.batches b on b.id=ta.batch_id and b.status <> 'graduated'
join public.syllabus_subjects ss on ss.id=ta.subject_id and ss.sem=b.current_sem
join public.sections s on s.batch=ta.batch_id and s.department='CSE'
  and s.name='CSE-'||ss.sem::text||ta.section
  and substring(s.semester from '^[0-9]+')::integer=ss.sem
group by ta.teacher_id,ta.batch_id,b.current_sem
on conflict (teacher_id,batch_id) do nothing;

create or replace function public.verified_account_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(btrim(u.email)) from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null;
$$;
revoke all on function public.verified_account_email() from public,anon;
grant execute on function public.verified_account_email() to authenticated;

create or replace function public.can_teach_scope(p_batch text,p_sem integer,p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.verified_account_email() is not null
    and exists(select 1 from public.allowed_teacher_emails e where lower(btrim(e.email))=public.verified_account_email())
    and exists (
    select 1 from public.teacher_academic_scopes a join public.batches b on b.id=a.batch_id
    where a.teacher_id=auth.uid() and a.batch_id=p_batch and a.semester=p_sem
      and a.enabled and a.department='CSE' and p_section=any(a.sections)
      and b.status <> 'graduated' and (a.semester_override or b.current_sem=a.semester)
  );
$$;
revoke all on function public.can_teach_scope(text,integer,text) from public,anon;
grant execute on function public.can_teach_scope(text,integer,text) to authenticated;

create or replace function public.can_manage_section(p_section_id uuid,p_subject_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.verified_account_email() is not null and (public.is_admin() or
    (public.is_teacher() and exists (
      select 1 from public.sections s
      join public.teacher_assignments ta on ta.batch_id=s.batch and ta.teacher_id=auth.uid()
      join public.syllabus_subjects ss on ss.id=ta.subject_id
      where s.id=p_section_id and s.department='CSE'
        and s.name='CSE-'||ss.sem::text||ta.section
        and substring(s.semester from '^[0-9]+')::integer=ss.sem
        and (p_subject_id is null or ta.subject_id=p_subject_id)
        and public.can_teach_scope(ta.batch_id,ss.sem,ta.section)
    )));
$$;
revoke all on function public.can_manage_section(uuid,uuid) from public,anon;
grant execute on function public.can_manage_section(uuid,uuid) to authenticated;

create or replace function public.get_my_academic_batches()
returns table(id text,start_year integer,current_sem integer,status text,sections text[])
language sql stable security definer set search_path = '' as $$
  select b.id,b.start_year,a.semester,b.status,a.sections
  from public.teacher_academic_scopes a join public.batches b on b.id=a.batch_id
  where a.teacher_id=auth.uid() and a.enabled and public.verified_account_email() is not null
    and b.status <> 'graduated' and (a.semester_override or a.semester=b.current_sem)
  order by b.start_year desc;
$$;
revoke all on function public.get_my_academic_batches() from public,anon;
grant execute on function public.get_my_academic_batches() to authenticated;

create or replace function public.get_my_teaching_sections()
returns setof public.sections language sql stable security definer set search_path = '' as $$
  select s.* from public.sections s where public.can_manage_section(s.id) order by s.batch,s.name;
$$;
revoke all on function public.get_my_teaching_sections() from public,anon;
grant execute on function public.get_my_teaching_sections() to authenticated;

create or replace function public.save_teacher_onboarding(p_name text,p_email text,p_assignments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.verified_account_email();
begin
  if v_email is null or lower(btrim(p_email)) is distinct from v_email then
    raise exception 'Teacher profile email must match your verified login email.' using errcode='42501';
  end if;
  if not exists (select 1 from public.allowed_teacher_emails a where lower(btrim(a.email))=v_email) then
    raise exception 'This email is not on the approved teacher list.' using errcode='42501';
  end if;
  if nullif(btrim(p_name),'') is null or length(p_name)>200 then
    raise exception 'A teacher name of 1 to 200 characters is required.';
  end if;
  if p_assignments is null or jsonb_typeof(p_assignments)<>'array' or jsonb_array_length(p_assignments)>300 then
    raise exception 'Invalid teaching assignments.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mis-onboarding:'||v_uid::text,0));
  -- Scope rows remain locked until commit, so approval cannot change mid-save.
  perform 1 from public.teacher_academic_scopes where teacher_id=v_uid for share;
  if exists (
    select 1 from jsonb_to_recordset(p_assignments)
      as a(subject_id uuid,batch_id text,section text,is_lab boolean)
    left join public.syllabus_subjects ss on ss.id=a.subject_id
    where ss.id is null or a.is_lab is null
      or not public.can_teach_scope(a.batch_id,ss.sem,a.section)
      or not exists (select 1 from public.sections s where s.batch=a.batch_id and s.department='CSE'
        and s.name='CSE-'||ss.sem::text||a.section
        and substring(s.semester from '^[0-9]+')::integer=ss.sem)
      or (a.is_lab and (ss.kind<>'theory' or ss.lab_name is null))
  ) then raise exception 'Assignment is outside your approved academic scope or its section is not configured.' using errcode='42501'; end if;
  if exists (select 1 from jsonb_to_recordset(p_assignments)
    as a(subject_id uuid,batch_id text,section text,is_lab boolean)
    group by subject_id,batch_id,section,is_lab having count(*)>1) then
    raise exception 'Duplicate teaching assignment.' using errcode='23505';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_assignments)
    as a(subject_id uuid,batch_id text,section text,is_lab boolean)
    where a.is_lab and not exists (select 1 from jsonb_to_recordset(p_assignments)
      as theory(subject_id uuid,batch_id text,section text,is_lab boolean)
      where theory.subject_id=a.subject_id and theory.batch_id=a.batch_id and theory.section=a.section and not theory.is_lab)) then
    raise exception 'A lab attachment requires its theory assignment.';
  end if;
  insert into public.teachers(id,name,email,onboarded) values(v_uid,btrim(p_name),v_email,true)
  on conflict(id) do update set name=excluded.name,email=excluded.email,onboarded=true;
  -- Historical/out-of-scope rows stay in place for teaching history.
  delete from public.teacher_assignments ta using public.syllabus_subjects ss
  where ta.teacher_id=v_uid and ss.id=ta.subject_id
    and public.can_teach_scope(ta.batch_id,ss.sem,ta.section)
    and not exists (select 1 from jsonb_to_recordset(p_assignments)
      as a(subject_id uuid,batch_id text,section text,is_lab boolean)
      where a.subject_id=ta.subject_id and a.batch_id=ta.batch_id and a.section=ta.section and a.is_lab=ta.is_lab);
  insert into public.teacher_assignments(teacher_id,subject_id,batch_id,section,is_lab)
  select v_uid,a.subject_id,a.batch_id,a.section,a.is_lab
  from jsonb_to_recordset(p_assignments) as a(subject_id uuid,batch_id text,section text,is_lab boolean)
  on conflict (teacher_id,subject_id,batch_id,section,is_lab) do nothing;
  -- Any validation/unique/FK error aborts the entire RPC, including the profile.
end;
$$;
revoke all on function public.save_teacher_onboarding(text,text,jsonb) from public,anon;
grant execute on function public.save_teacher_onboarding(text,text,jsonb) to authenticated;
-- Assignment changes must pass the atomic, scope-checked RPC; reads are unchanged.
revoke insert,update,delete on public.teacher_assignments from authenticated,anon;

alter table public.student_roster add column if not exists section_id uuid references public.sections(id);
create index if not exists student_roster_section_id_idx on public.student_roster(section_id);

create or replace function public.import_section_roster(p_section_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  st public.students%rowtype;
  ro public.student_roster%rowtype;
  v_inserted integer:=0;
  v_updated integer:=0;
  v_unchanged integer:=0;
  v_has_student boolean;
begin
  -- Serialize coordinated imports (including cross-section enrollment claims).
  perform pg_advisory_xact_lock(hashtextextended('mis-roster-import',0));
  perform 1 from public.teacher_academic_scopes where teacher_id=auth.uid() for share;
  if not public.can_manage_section(p_section_id) then
    raise exception 'You are not authorized to import this section.' using errcode='42501';
  end if;
  if not exists (select 1 from public.sections where id=p_section_id) then raise exception 'Unknown section.'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'Upload between 1 and 2000 valid CSV rows.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(enrollment_number text,name text,email text)
    where x.enrollment_number is null or x.enrollment_number !~ '^[0-9]{4}[A-Z]{2}[0-9A-Z]{6}$'
      or nullif(btrim(x.name),'') is null or length(x.name)>200
      or (x.email is not null and (length(x.email)>254 or x.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))) then
    raise exception 'Invalid enrollment, name or email. No rows were imported.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as x(enrollment_number text)
    group by enrollment_number having count(*)>1) then
    raise exception 'Duplicate enrollment in CSV. No rows were imported.';
  end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(enrollment_number text,name text,email text)
    order by enrollment_number loop
    -- Use the same roster-then-student lock order as quiz registration.
    select * into ro from public.student_roster where enrollment_number=r.enrollment_number for update;
    select * into st from public.students where enrollment_number=r.enrollment_number for update;
    v_has_student:=found;
    if (v_has_student and st.section_id is distinct from p_section_id)
       or (ro.section_id is not null and ro.section_id<>p_section_id) then
      raise exception 'Enrollment % belongs to another or unverified section; owner review is required. No rows were imported.',r.enrollment_number using errcode='23505';
    end if;
    if (st.email is not null and ro.email is not null and lower(st.email)<>lower(ro.email))
      or (r.email is not null and ((st.email is not null and lower(st.email)<>lower(r.email))
        or (ro.email is not null and lower(ro.email)<>lower(r.email)))) then
      raise exception 'Enrollment % has an existing email binding. No rows were imported.',r.enrollment_number using errcode='23505';
    end if;
    if not v_has_student then
      insert into public.students(section_id,enrollment_number,name,email)
      values(p_section_id,r.enrollment_number,btrim(r.name),lower(coalesce(ro.email,r.email)));
      v_inserted:=v_inserted+1;
    elsif st.name is distinct from btrim(r.name) or (st.email is null and coalesce(ro.email,r.email) is not null)
      or ro.id is null or ro.section_id is distinct from p_section_id or ro.name is distinct from btrim(r.name)
      or (ro.email is null and coalesce(st.email,r.email) is not null) then
      update public.students set name=btrim(r.name),email=coalesce(st.email,lower(coalesce(ro.email,r.email))) where id=st.id;
      v_updated:=v_updated+1;
    else v_unchanged:=v_unchanged+1;
    end if;
    insert into public.student_roster(enrollment_number,name,email,section_id)
    values(r.enrollment_number,btrim(r.name),lower(coalesce(ro.email,st.email,r.email)),p_section_id)
    on conflict(enrollment_number) do update set name=excluded.name,
      email=coalesce(public.student_roster.email,excluded.email),section_id=excluded.section_id;
  end loop;
  return jsonb_build_object('imported',jsonb_array_length(p_rows),'inserted',v_inserted,
    'updated',v_updated,'unchanged',v_unchanged,'deleted',0);
end;
$$;
revoke all on function public.import_section_roster(uuid,jsonb) from public,anon;
grant execute on function public.import_section_roster(uuid,jsonb) to authenticated;

-- Shared-class reads remain possible for each assigned teacher; sensitive writes
-- use the atomic RPC. Existing admin maintenance remains admin-only.
drop policy if exists teacher_all_students on public.students;
drop policy if exists teacher_all_student_roster on public.student_roster;
drop policy if exists teacher_all_sections on public.sections;
drop policy if exists teacher_read_sections on public.sections;
drop policy if exists scoped_students_read on public.students;
create policy scoped_students_read on public.students for select to authenticated
using (public.can_manage_section(section_id)
  or (public.verified_account_email() is not null and public.has_extra_power('cross_section_visibility'))
  or exists(select 1 from public.attendance a where a.student_id=students.id and a.owner_id=auth.uid())
  or exists(select 1 from public.quiz_attempts a join public.quizzes q on q.id=a.quiz_id
    where a.student_id=students.id and q.owner_id=auth.uid()));
drop policy if exists scoped_roster_read on public.student_roster;
create policy scoped_roster_read on public.student_roster for select to authenticated
using (public.can_manage_section(section_id)
  or (public.verified_account_email() is not null and public.has_extra_power('cross_section_visibility')));
drop policy if exists scoped_sections_read on public.sections;
create policy scoped_sections_read on public.sections for select to authenticated
using (public.can_manage_section(id) or exists (select 1 from public.teacher_academic_scopes a
  where a.teacher_id=auth.uid() and public.can_teach_scope(a.batch_id,a.semester,right(sections.name,1))
    and a.batch_id=sections.batch and sections.department=a.department
    and sections.name=a.department||'-'||a.semester::text||right(sections.name,1)
    and substring(sections.semester from '^[0-9]+')::integer=a.semester)
  or exists(select 1 from public.attendance a where a.section_id=sections.id and a.owner_id=auth.uid())
  or exists(select 1 from public.quizzes q where q.section_id=sections.id and q.owner_id=auth.uid())
  or exists(select 1 from public.quiz_target_sections t join public.quizzes q on q.id=t.quiz_id
    where t.section_id=sections.id and q.owner_id=auth.uid())
  or (public.verified_account_email() is not null and public.has_extra_power('cross_section_visibility')));
drop policy if exists admin_students_maintenance on public.students;
create policy admin_students_maintenance on public.students for all to authenticated
using (public.is_admin() and public.verified_account_email() is not null)
with check (public.is_admin() and public.verified_account_email() is not null);
drop policy if exists admin_roster_maintenance on public.student_roster;
create policy admin_roster_maintenance on public.student_roster for all to authenticated
using (public.is_admin() and public.verified_account_email() is not null)
with check (public.is_admin() and public.verified_account_email() is not null);
drop policy if exists admin_sections_maintenance on public.sections;
create policy admin_sections_maintenance on public.sections for all to authenticated
using (public.is_admin() and public.verified_account_email() is not null)
with check (public.is_admin() and public.verified_account_email() is not null);

-- Owner isolation alone cannot prevent forged cross-section attendance rows.
drop policy if exists attendance_scope_insert on public.attendance;
create policy attendance_scope_insert on public.attendance as restrictive for insert to authenticated
with check (public.can_manage_section(section_id,subject_id) and exists
  (select 1 from public.students st where st.id=student_id and st.section_id=attendance.section_id));
drop policy if exists attendance_scope_update on public.attendance;
create policy attendance_scope_update on public.attendance as restrictive for update to authenticated
using (public.can_manage_section(section_id,subject_id))
with check (public.can_manage_section(section_id,subject_id) and exists
  (select 1 from public.students st where st.id=student_id and st.section_id=attendance.section_id));
drop policy if exists attendance_scope_delete on public.attendance;
create policy attendance_scope_delete on public.attendance as restrictive for delete to authenticated
using (public.can_manage_section(section_id,subject_id));

-- The old teacher-wide reset deleted every teacher's quiz attempts for an
-- enrollment. Keep the maintenance API but make identity rebinding owner/admin
-- controlled, and preserve attempts. Per-quiz resets retain their owner gate.
create or replace function public.reset_student_binding(p_enrollment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.verified_account_email() is null or not public.is_admin() then
    return jsonb_build_object('status','denied','reason','not-admin');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mis-roster-import',0));
  update public.student_roster set email=null where enrollment_number=p_enrollment;
  update public.students set email=null where enrollment_number=p_enrollment;
  return jsonb_build_object('status','reset','enrollment',p_enrollment,'clearedAttempts',0);
end;
$$;
revoke all on function public.reset_student_binding(text) from public,anon;
grant execute on function public.reset_student_binding(text) to authenticated;

create or replace function public.list_student_registrations()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('enrollment',ro.enrollment_number,'name',ro.name,'email',ro.email)
    order by ro.enrollment_number),'[]'::jsonb)
  from public.student_roster ro left join public.students st on st.enrollment_number=ro.enrollment_number
  where ro.email is not null and public.can_manage_section(coalesce(ro.section_id,st.section_id));
$$;
revoke all on function public.list_student_registrations() from public,anon;
grant execute on function public.list_student_registrations() to authenticated;

notify pgrst, 'reload schema';
commit;
