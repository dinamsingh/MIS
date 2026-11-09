-- Restore the existing allowlisted-teacher claim workflow. Owner scopes are
-- semester exceptions / explicit suspensions, not a prerequisite for each class.
begin;

create or replace function public.can_teach_scope(p_batch text,p_sem integer,p_section text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.verified_account_email() is not null
    and exists(select 1 from public.allowed_teacher_emails e where lower(btrim(e.email))=public.verified_account_email())
    and exists (
      select 1 from public.batches b
      left join public.teacher_academic_scopes a on a.teacher_id=auth.uid() and a.batch_id=b.id
      join public.sections s on s.batch=b.id and s.department='CSE'
        and s.name='CSE-'||p_sem::text||p_section
        and substring(s.semester from '^[0-9]+')::integer=p_sem
      where b.id=p_batch and b.status<>'graduated' and p_section in ('A','B','C')
        and coalesce(a.enabled,true)
        and p_sem=case when a.semester_override then a.semester else b.current_sem end
        and (not coalesce(a.semester_override,false) or p_section=any(a.sections))
    );
$$;
revoke all on function public.can_teach_scope(text,integer,text) from public,anon;
grant execute on function public.can_teach_scope(text,integer,text) to authenticated;

create or replace function public.get_my_academic_batches()
returns table(id text,start_year integer,current_sem integer,status text,sections text[])
language sql stable security definer set search_path = '' as $$
  select b.id,b.start_year,
    case when a.semester_override then a.semester else b.current_sem end,b.status,
    array_agg(distinct right(s.name,1) order by right(s.name,1))
  from public.batches b
  left join public.teacher_academic_scopes a on a.teacher_id=auth.uid() and a.batch_id=b.id
  join public.sections s on s.batch=b.id and s.department='CSE'
    and s.name='CSE-'||(case when a.semester_override then a.semester else b.current_sem end)::text||right(s.name,1)
    and public.can_teach_scope(b.id,case when a.semester_override then a.semester else b.current_sem end,right(s.name,1))
  group by b.id,b.start_year,b.current_sem,b.status,a.semester_override,a.semester
  order by b.start_year desc;
$$;
revoke all on function public.get_my_academic_batches() from public,anon;
grant execute on function public.get_my_academic_batches() to authenticated;

-- Assignment ownership is still required by can_manage_section. Merely seeing
-- an available class here grants no student/attendance/quiz modification access.

create or replace function public.save_teacher_onboarding(p_name text,p_email text,p_assignments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.verified_account_email();
  v_conflict text;
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
  select format('%s already teaches %s in batch %s, Section %s. Choose another available subject or section.',
      coalesce(nullif(btrim(t.name),''),'Another teacher'),ss.code,a.batch_id,a.section)
    into v_conflict
  from jsonb_to_recordset(p_assignments) as a(subject_id uuid,batch_id text,section text,is_lab boolean)
  join public.teacher_assignments claimed on claimed.subject_id=a.subject_id
    and claimed.batch_id=a.batch_id and claimed.section=a.section and not claimed.is_lab
    and claimed.teacher_id<>v_uid
  join public.teachers t on t.id=claimed.teacher_id
  join public.syllabus_subjects ss on ss.id=a.subject_id
  order by a.batch_id,a.section,ss.code limit 1;
  if v_conflict is not null then
    raise exception '%',v_conflict using errcode='23505';
  end if;
  -- The existing unique index also rejects a concurrent competing claim.
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

notify pgrst, 'reload schema';
commit;
