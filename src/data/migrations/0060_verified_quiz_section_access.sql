-- Verified roster membership and exact academic-section authorization.
-- Full definitions were compared against the live schema read on 2026-11-08.
begin;
create or replace function public.quiz_allows_section(p_quiz_id uuid,p_section_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.quizzes q join public.syllabus_units u on u.id=q.unit_id
    join public.syllabus_subjects ss on ss.id=u.subject_id
    join public.sections s on s.id=p_section_id
    where q.id=p_quiz_id and s.department='CSE'
      and substring(s.semester from '^[0-9]+')::integer=ss.sem
      and s.name='CSE-'||ss.sem::text||right(s.name,1)
      and (q.section_id=s.id or exists (select 1 from public.quiz_target_sections t where t.quiz_id=q.id and t.section_id=s.id)
        or (q.section_id is null and not exists (select 1 from public.quiz_target_sections t where t.quiz_id=q.id)
          and exists (select 1 from public.teacher_assignments a where a.teacher_id=q.owner_id
            and a.subject_id=ss.id and a.batch_id=s.batch and a.section=right(s.name,1))))
  );
$$;
revoke all on function public.quiz_allows_section(uuid,uuid) from public,anon;
grant execute on function public.quiz_allows_section(uuid,uuid) to authenticated;

create or replace function public.can_create_quiz(p_unit_id uuid,p_section_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.syllabus_units u join public.sections s
   on public.can_manage_section(s.id,u.subject_id)
   where u.id=p_unit_id and (p_section_id is null or s.id=p_section_id));
$$;
revoke all on function public.can_create_quiz(uuid,uuid) from public,anon;
grant execute on function public.can_create_quiz(uuid,uuid) to authenticated;

drop policy if exists quiz_scope_insert on public.quizzes;
create policy quiz_scope_insert on public.quizzes as restrictive for insert to authenticated
with check(public.can_create_quiz(unit_id,section_id));
drop policy if exists quiz_scope_update on public.quizzes;
create policy quiz_scope_update on public.quizzes as restrictive for update to authenticated
using (owner_id=auth.uid()) with check(public.can_create_quiz(unit_id,section_id));


CREATE OR REPLACE FUNCTION public.set_quiz_target_sections(p_quiz_id uuid, p_section_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
    v_uid        uuid := auth.uid();
    v_subject_id uuid;
    v_valid_count integer;
    v_requested_count integer;
begin
    if v_uid is null or not public.is_teacher() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-teacher');
    end if;
    if not exists (
        select 1 from public.quizzes q where q.id = p_quiz_id and q.owner_id = v_uid
    ) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-owner');
    end if;
    select su.subject_id
    into v_subject_id
    from public.quizzes q
    join public.syllabus_units su on su.id = q.unit_id
    where q.id = p_quiz_id;
    p_section_ids := coalesce(p_section_ids, array[]::uuid[]);
    v_requested_count := array_length(p_section_ids, 1);
    if v_requested_count is not null and v_requested_count > 0 then
        -- Only accept sections the teacher actually teaches this subject in
        -- (same batch/section-letter join `list_quiz_roster_options` uses).
        select count(distinct s.id)
        into v_valid_count
        from public.sections s
        join public.teacher_assignments ta
          on s.batch = ta.batch_id
         and upper(right(s.name, 1)) = ta.section
        where ta.teacher_id = v_uid
          and ta.subject_id = v_subject_id
          and s.id = any(p_section_ids)
          and public.can_manage_section(s.id,ta.subject_id);
        if v_valid_count is distinct from v_requested_count then
            return jsonb_build_object('status', 'denied', 'reason', 'section-not-assigned');
        end if;
    end if;
    delete from public.quiz_target_sections where quiz_id = p_quiz_id;
    if v_requested_count is not null and v_requested_count > 0 then
        insert into public.quiz_target_sections (quiz_id, section_id)
        select p_quiz_id, sid from unnest(p_section_ids) as sid
        on conflict (quiz_id, section_id) do nothing;
    end if;
    return jsonb_build_object('status', 'saved', 'sectionCount', coalesce(v_requested_count, 0));
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_teacher_sections_for_subject(p_subject_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
    v_uid uuid := auth.uid();
    v_rows jsonb;
begin
    if v_uid is null or not public.is_teacher() then
        return '[]'::jsonb;
    end if;
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'batch', s.batch,
            'semester', s.semester,
            'department', s.department
        )
        order by s.name
    ), '[]'::jsonb)
    into v_rows
    from (
        select distinct s.id, s.name, s.batch, s.semester, s.department
        from public.teacher_assignments ta
        join public.sections s
          on s.batch = ta.batch_id
         and upper(right(s.name, 1)) = ta.section
        where ta.teacher_id = v_uid
          and ta.subject_id = p_subject_id
          and public.can_manage_section(s.id,ta.subject_id)
    ) s;
    return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_quiz_access(p_quiz_id text, p_provided_enrollment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
    v_uid       uuid := auth.uid();
    v_email     text := public.verified_account_email();
    v_quiz      public.quizzes%rowtype;
    v_roster    public.student_roster%rowtype;
    v_student   public.students%rowtype;
    v_questions jsonb;
    v_verified_section uuid;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authenticated');
    end if;
    select * into v_quiz
    from public.quizzes
    where share_token = p_quiz_id or id::text = p_quiz_id
    order by case when share_token = p_quiz_id then 0 else 1 end
    limit 1;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'quiz-not-found');
    end if;
    -- Teacher preview
    if v_quiz.owner_id is not null and v_quiz.owner_id = v_uid then
        select coalesce(
            jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options) order by q.id),
            '[]'::jsonb
        )
        into v_questions
        from public.questions q
        where q.quiz_id = v_quiz.id;
        return jsonb_build_object(
            'status', 'granted',
            'preview', true,
            'quiz', jsonb_build_object(
                'id', v_quiz.id, 'unitId', v_quiz.unit_id,
                'timeLimitMinutes', v_quiz.time_limit_minutes,
                'questions', v_questions,
                'shuffleQuestions', v_quiz.shuffle_questions
            )
        );
    end if;
    -- A teacher account (any teacher, not just this quiz's owner) must never
    -- fall through to self-registration as a student.
    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
    end if;
    -- Lock the authoritative allowlist before checking/binding identity.
    select * into v_roster from public.student_roster
      where lower(email)=lower(v_email) limit 1 for update;
    if not found then
      if p_provided_enrollment is null then return jsonb_build_object('status','enrollment-required'); end if;
      select * into v_roster from public.student_roster
        where enrollment_number=upper(btrim(p_provided_enrollment)) for update;
      if not found then return jsonb_build_object('status','denied','reason','enrollment-not-found'); end if;
      if v_roster.email is not null and lower(v_roster.email)<>v_email then
        return jsonb_build_object('status','denied','reason','enrollment-already-bound');
      end if;
    end if;
    if p_provided_enrollment is not null and upper(btrim(p_provided_enrollment))<>v_roster.enrollment_number then
      return jsonb_build_object('status','denied','reason','enrollment-already-bound');
    end if;
    select * into v_student from public.students where enrollment_number=v_roster.enrollment_number for update;
    v_verified_section:=coalesce(v_roster.section_id,v_student.section_id);
    if (v_roster.section_id is not null and v_student.section_id is not null and v_roster.section_id<>v_student.section_id)
      or v_verified_section is null then
      return jsonb_build_object('status','denied','reason','wrong-section');
    end if;
    if v_student.email is not null and lower(v_student.email)<>v_email then
      return jsonb_build_object('status','denied','reason','enrollment-already-bound');
    end if;
    -- Never infer membership from a quiz target or an enrollment-number pattern.
    if not public.quiz_allows_section(v_quiz.id,v_verified_section)
      and not exists(select 1 from public.quiz_attempts a where a.quiz_id=v_quiz.id and a.student_id=v_student.id) then
      return jsonb_build_object('status','denied','reason','wrong-section');
    end if;
    insert into public.students(name,email,enrollment_number,section_id)
    values(coalesce(v_roster.name,v_email),v_email,v_roster.enrollment_number,v_verified_section)
    on conflict(enrollment_number) do update set email=excluded.email,
      name=coalesce(public.students.name,excluded.name),
      section_id=coalesce(public.students.section_id,excluded.section_id)
    where public.students.email is null or lower(public.students.email)=v_email
    returning * into v_student;
    if not found then raise exception 'Enrollment identity changed during registration.' using errcode='42501'; end if;
    update public.student_roster set email=v_email where id=v_roster.id
      and (email is null or lower(email)=v_email);
    if not found then raise exception 'Enrollment already bound.' using errcode='42501'; end if;
    -- Attempt check
    declare
        v_attempt public.quiz_attempts%rowtype;
        v_can_review boolean;
    begin
        select * into v_attempt
        from public.quiz_attempts
        where quiz_id = v_quiz.id and student_id = v_student.id;
        if found then
            v_can_review := false;
            if v_quiz.show_answers_after_close then
                if v_quiz.active_until is null then
                    v_can_review := true;
                elsif v_quiz.active_until < now() then
                    v_can_review := true;
                end if;
            end if;
            return jsonb_build_object(
                'status', 'already-attempted',
                'result', jsonb_build_object(
                    'score', v_attempt.score,
                    'totalMarks', public.quiz_total_marks(v_quiz.id),
                    'canReview', v_can_review
                )
            );
        end if;
    end;
    -- Enforce window
    if (v_quiz.active_from is not null and now() < v_quiz.active_from)
       or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-active');
    end if;
    -- Grant
    select coalesce(
        jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text, 'options', q.options) order by q.id),
        '[]'::jsonb
    )
    into v_questions
    from public.questions q
    where q.quiz_id = v_quiz.id;
    return jsonb_build_object(
        'status', 'granted',
        'quiz', jsonb_build_object(
            'id', v_quiz.id, 'unitId', v_quiz.unit_id,
            'timeLimitMinutes', v_quiz.time_limit_minutes,
            'questions', v_questions,
            'shuffleQuestions', v_quiz.shuffle_questions
        )
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.start_quiz_attempt(p_quiz_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
    v_uid     uuid := auth.uid();
    v_email   text := public.verified_account_email();
    v_quiz    public.quizzes%rowtype;
    v_roster  public.student_roster%rowtype;
    v_student public.students%rowtype;
    v_attempt public.quiz_attempts%rowtype;
    v_session public.quiz_attempt_sessions%rowtype;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authenticated');
    end if;
    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'quiz-not-found');
    end if;
    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
    end if;
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;
    select * into v_student from public.students where id = v_uid;
    if not found then
        select * into v_student from public.students where lower(email) = lower(v_email);
    end if;
    if not found
       or v_student.enrollment_number is null
       or v_student.enrollment_number <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;
    if not public.quiz_allows_section(v_quiz.id,v_student.section_id) then
        return jsonb_build_object('status','denied','reason','wrong-section');
    end if;
    select * into v_attempt
    from public.quiz_attempts
    where quiz_id = v_quiz.id and student_id = v_student.id;
    if found then
        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object(
                'score', v_attempt.score,
                'totalMarks', public.quiz_total_marks(v_quiz.id)
            )
        );
    end if;
    if (v_quiz.active_from is not null and now() < v_quiz.active_from)
       or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-active');
    end if;
    insert into public.quiz_attempt_sessions (quiz_id, student_id)
    values (v_quiz.id, v_student.id)
    on conflict (quiz_id, student_id) do nothing;
    select * into v_session
    from public.quiz_attempt_sessions
    where quiz_id = v_quiz.id and student_id = v_student.id;
    if now() > v_session.started_at + make_interval(mins => coalesce(v_quiz.time_limit_minutes, 15)) + interval '30 seconds' then
        return jsonb_build_object('status', 'denied', 'reason', 'time-expired');
    end if;
    return jsonb_build_object(
        'status', 'started',
        'startedAt', v_session.started_at,
        'serverNow', now(),
        'timeLimitMinutes', v_quiz.time_limit_minutes
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_attempt(p_quiz_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
    v_uid           uuid := auth.uid();
    v_email         text := public.verified_account_email();
    v_quiz          public.quizzes%rowtype;
    v_roster        public.student_roster%rowtype;
    v_student       public.students%rowtype;
    v_student_found boolean := false;
    v_answers       jsonb := coalesce(p_answers, '{}'::jsonb);
    v_score         numeric;
    v_total         numeric;
    v_existing      public.quiz_attempts%rowtype;
    v_session       public.quiz_attempt_sessions%rowtype;
begin
    if v_uid is null or v_email is null then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authenticated');
    end if;
    select * into v_quiz from public.quizzes where id = p_quiz_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'quiz-not-found');
    end if;
    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
    end if;
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;
    select * into v_student from public.students where id = v_uid;
    if found then
        v_student_found := true;
    else
        select * into v_student from public.students where lower(email) = lower(v_email);
        if found then
            v_student_found := true;
        end if;
    end if;
    if not v_student_found
       or v_student.enrollment_number is null
       or v_student.enrollment_number <> v_roster.enrollment_number then
        return jsonb_build_object('status', 'denied', 'reason', 'not-registered');
    end if;
    if not public.quiz_allows_section(v_quiz.id,v_student.section_id) then
        return jsonb_build_object('status','denied','reason','wrong-section');
    end if;
    v_total := public.quiz_total_marks(v_quiz.id);
    select * into v_existing
    from public.quiz_attempts
    where quiz_id = v_quiz.id and student_id = v_student.id;
    if found then
        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object('score', v_existing.score, 'totalMarks', v_total)
        );
    end if;
    select * into v_session
    from public.quiz_attempt_sessions
    where quiz_id = v_quiz.id and student_id = v_student.id;
    if not found or now() > v_session.started_at + make_interval(mins => coalesce(v_quiz.time_limit_minutes, 15)) + interval '30 seconds' then
        return jsonb_build_object('status', 'denied', 'reason', 'time-expired');
    end if;
    select coalesce(sum(
        case
            when (v_answers -> q.id::text) = to_jsonb(q.correct_index) and q.marks > 0
            then q.marks
            else 0
        end
    ), 0)
    into v_score
    from public.questions q
    where q.quiz_id = v_quiz.id;
    insert into public.quiz_attempts (quiz_id, student_id, answers, score)
    values (v_quiz.id, v_student.id, v_answers, v_score)
    on conflict (quiz_id, student_id) do nothing;
    if not found then
        select * into v_existing
        from public.quiz_attempts
        where quiz_id = v_quiz.id and student_id = v_student.id;
        return jsonb_build_object(
            'status', 'already-attempted',
            'result', jsonb_build_object('score', v_existing.score, 'totalMarks', v_total)
        );
    end if;
    return jsonb_build_object(
        'status', 'recorded',
        'result', jsonb_build_object('score', v_score, 'totalMarks', v_total)
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_quiz_with_questions(p_quiz jsonb, p_questions jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
    v_uid       uuid := auth.uid();
    v_quiz_id   uuid;
    v_question  jsonb;
    v_position  integer := 0;
begin
    if v_uid is null or not public.is_teacher() then
        raise exception 'not authorized';
    end if;
    if p_quiz is null or p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
        raise exception 'invalid quiz payload';
    end if;
    if not public.can_create_quiz((p_quiz->>'unitId')::uuid,nullif(p_quiz->>'sectionId','')::uuid) then
      raise exception 'Quiz is outside your approved teaching scope.' using errcode='42501';
    end if;
    insert into public.quizzes (
        unit_id,
        title,
        section_id,
        time_limit_minutes,
        share_token,
        active_from,
        active_until,
        instructions,
        owner_id
    )
    values (
        (p_quiz ->> 'unitId')::uuid,
        nullif(trim(p_quiz ->> 'title'), ''),
        nullif(p_quiz ->> 'sectionId', '')::uuid,
        greatest(coalesce((p_quiz ->> 'timeLimitMinutes')::integer, 15), 1),
        nullif(trim(p_quiz ->> 'shareToken'), ''),
        nullif(p_quiz ->> 'activeFrom', '')::timestamptz,
        nullif(p_quiz ->> 'activeUntil', '')::timestamptz,
        nullif(trim(coalesce(p_quiz ->> 'instructions', '')), ''),
        v_uid
    )
    returning id into v_quiz_id;
    for v_question in select * from jsonb_array_elements(p_questions)
    loop
        v_position := v_position + 1;
        insert into public.questions (
            quiz_id,
            text,
            options,
            correct_index,
            marks,
            position,
            owner_id
        )
        values (
            v_quiz_id,
            nullif(trim(v_question ->> 'text'), ''),
            coalesce(v_question -> 'options', '[]'::jsonb),
            coalesce((v_question ->> 'correctIndex')::integer, 0),
            greatest(coalesce((v_question ->> 'marks')::integer, 1), 1),
            coalesce((v_question ->> 'position')::integer, v_position),
            v_uid
        );
    end loop;
    return v_quiz_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_quiz_roster_options(p_quiz_id text, p_search_prefix text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
    v_quiz       public.quizzes%rowtype;
    v_subject_id uuid;
    v_rows       jsonb;
begin
    if auth.uid() is null then
        return '[]'::jsonb;
    end if;
    -- Require at least 3 characters for the search to prevent bulk enumeration
    if length(trim(p_search_prefix)) < 3 then
        return '[]'::jsonb;
    end if;
    select * into v_quiz
    from public.quizzes
    where share_token = p_quiz_id or id::text = p_quiz_id
    order by case when share_token = p_quiz_id then 0 else 1 end
    limit 1;
    if not found then
        return '[]'::jsonb;
    end if;
    select subject_id into v_subject_id
    from public.syllabus_units
    where id = v_quiz.unit_id;
    with target_sections as (
      select s.id,s.name,s.batch,s.semester,s.department from public.sections s
      where public.quiz_allows_section(v_quiz.id,s.id)
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'enrollmentNumber', st.enrollment_number,
                'name', coalesce(nullif(btrim(st.name), ''), st.enrollment_number),
                'sectionId', ts.id,
                'sectionName', ts.name,
                'batch', ts.batch,
                'semester', ts.semester,
                'department', ts.department
            )
            order by ts.name, st.enrollment_number
        ),
        '[]'::jsonb
    )
    into v_rows
    from (
        select st_inner.*
        from public.students st_inner
        where st_inner.enrollment_number is not null
          and st_inner.enrollment_number ilike ('%' || trim(p_search_prefix) || '%')
          and exists(select 1 from target_sections ts where ts.id=st_inner.section_id)
        order by st_inner.enrollment_number
        limit 5
    ) st
    join target_sections ts on ts.id = st.section_id;
    return v_rows;
end;
$function$;

revoke all on function public.request_quiz_access(text,text) from public,anon;
grant execute on function public.request_quiz_access(text,text) to authenticated;

revoke all on function public.start_quiz_attempt(uuid) from public,anon;
grant execute on function public.start_quiz_attempt(uuid) to authenticated;

revoke all on function public.submit_attempt(uuid,jsonb) from public,anon;
grant execute on function public.submit_attempt(uuid,jsonb) to authenticated;

revoke all on function public.set_quiz_target_sections(uuid,uuid[]) from public,anon;
grant execute on function public.set_quiz_target_sections(uuid,uuid[]) to authenticated;

revoke all on function public.list_teacher_sections_for_subject(uuid) from public,anon;
grant execute on function public.list_teacher_sections_for_subject(uuid) to authenticated;

revoke all on function public.list_quiz_roster_options(text,text) from public,anon;
grant execute on function public.list_quiz_roster_options(text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
