-- ============================================================================
-- Migration: 0040_quiz_multi_section_assignment
-- Let a teacher assign one quiz to several of their own sections at once.
--
-- Problem
-- -------
-- A teacher who teaches the same subject in multiple sections (A, B, C) wants
-- to author ONE quiz and hand the same link to all of them (the common
-- "share one Google-Form-style quiz with every section" workflow). The
-- current schema only supports `quizzes.section_id` pointing at a single
-- section (or NULL = open to every section of the subject) — there is no way
-- to target "sections A and B, but not C".
--
-- Fix
-- ---
--   1. New junction table `quiz_target_sections (quiz_id, section_id)` — one
--      row per section a quiz is explicitly assigned to. A quiz with zero rows
--      here keeps behaving exactly as it does today (governed solely by the
--      legacy single `quizzes.section_id` column) — this is purely additive,
--      no existing quiz's behavior changes.
--   2. `set_quiz_target_sections(quiz_id, section_ids[])` — an owner-scoped
--      SECURITY DEFINER RPC that replaces a quiz's target-section rows. Each
--      requested section_id is verified against the teacher's own
--      `teacher_assignments` for the quiz's subject (via the unit → subject
--      join) so a teacher can only target sections they actually teach that
--      subject in — the same defense-in-depth pattern as
--      `list_quiz_roster_options` (0037).
--   3. `list_teacher_sections_for_subject(subject_id)` — returns the sections
--      the calling teacher teaches a given subject in, for the "assign to
--      multiple sections" checklist shown at quiz-creation time.
--   4. `request_quiz_access` and `start_quiz_attempt` section-gate checks are
--      widened: a student is admitted if their section matches the legacy
--      `quizzes.section_id` OR appears in `quiz_target_sections` for that
--      quiz. When neither exists, the quiz is open to the whole subject
--      (unchanged legacy behavior).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, DROP+CREATE
-- POLICY/TRIGGER.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Junction table
-- ----------------------------------------------------------------------------
create table if not exists public.quiz_target_sections (
    quiz_id    uuid not null references public.quizzes (id) on delete cascade,
    section_id uuid not null references public.sections (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (quiz_id, section_id)
);

alter table public.quiz_target_sections enable row level security;

-- Any teacher may read target-section rows for a quiz they own (mirrors the
-- ownership check every other quiz RPC performs).
drop policy if exists quiz_target_sections_select_owner on public.quiz_target_sections;
create policy quiz_target_sections_select_owner on public.quiz_target_sections
  for select to authenticated using (
    exists (
        select 1 from public.quizzes q
        where q.id = quiz_target_sections.quiz_id
          and q.owner_id = auth.uid()
    )
  );

-- No direct insert/update/delete policy is granted — rows are written only via
-- the SECURITY DEFINER `set_quiz_target_sections` RPC below, which enforces
-- ownership and the teacher's actual subject/section assignment.

create index if not exists idx_quiz_target_sections_section on public.quiz_target_sections (section_id);

-- ----------------------------------------------------------------------------
-- (2) set_quiz_target_sections — owner-scoped, assignment-verified replace
-- ----------------------------------------------------------------------------
create or replace function public.set_quiz_target_sections(
    p_quiz_id    uuid,
    p_section_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
          and s.id = any(p_section_ids);

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
$$;

grant execute on function public.set_quiz_target_sections(uuid, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- (3) list_teacher_sections_for_subject — for the creation-time checklist
-- ----------------------------------------------------------------------------
create or replace function public.list_teacher_sections_for_subject(p_subject_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    ) s;

    return v_rows;
end;
$$;

grant execute on function public.list_teacher_sections_for_subject(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- (4) Widen the section gate in request_quiz_access and start_quiz_attempt.
-- Full function bodies below are the live versions (request_quiz_access from
-- 0039, start_quiz_attempt as currently deployed) with ONLY the section-check
-- branches changed to also consult quiz_target_sections. Every other line is
-- unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.request_quiz_access(
    p_quiz_id text,
    p_provided_enrollment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid       uuid := auth.uid();
    v_email     text := auth.email();
    v_quiz      public.quizzes%rowtype;
    v_roster    public.student_roster%rowtype;
    v_student   public.students%rowtype;
    v_questions jsonb;
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

    -- Roster lookup
    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    -- Not bound
    if not found then
        if p_provided_enrollment is null then
            return jsonb_build_object('status', 'enrollment-required');
        end if;

        -- Pre-check on the FIRST-TIME enrollment path: the provided
        -- enrollment's section must be an allowed section (legacy single
        -- section_id OR one of quiz_target_sections). NULL section_id and no
        -- target-section rows means the quiz is open to the whole subject.
        if (v_quiz.section_id is not null or exists (
                select 1 from public.quiz_target_sections qts where qts.quiz_id = v_quiz.id
            )) and not exists (
            select 1
            from public.students st
            where st.enrollment_number = p_provided_enrollment
              and (
                  st.section_id = v_quiz.section_id
                  or exists (
                      select 1 from public.quiz_target_sections qts
                      where qts.quiz_id = v_quiz.id and qts.section_id = st.section_id
                  )
              )
        ) then
            return jsonb_build_object('status', 'denied', 'reason', 'wrong-section');
        end if;

        select * into v_roster
        from public.student_roster
        where enrollment_number = p_provided_enrollment
        limit 1;

        if not found then
            return jsonb_build_object('status', 'denied', 'reason', 'enrollment-not-found');
        end if;

        -- Atomic bind: only succeeds if the row is still unbound (or already
        -- bound to this same email). The WHERE clause guarantees only one
        -- concurrent request can win; the loser gets NOT FOUND below and is
        -- correctly denied instead of racing with the winner.
        update public.student_roster
           set email = v_email
         where id = v_roster.id
           and (email is null or lower(email) = lower(v_email))
        returning * into v_roster;

        if not found then
            return jsonb_build_object('status', 'denied', 'reason', 'enrollment-already-bound');
        end if;
    end if;

    -- Upsert student
    insert into public.students (name, email, enrollment_number)
    values (coalesce(v_roster.name, v_email), v_email, v_roster.enrollment_number)
    on conflict (enrollment_number) do update
        set email = excluded.email,
            name  = coalesce(public.students.name, excluded.name)
    returning * into v_student;

    -- Final section gate: allowed if the student's section matches the legacy
    -- single section_id, OR is one of the quiz's target sections, OR the quiz
    -- has neither restriction (open to the whole subject).
    if (v_quiz.section_id is not null or exists (
            select 1 from public.quiz_target_sections qts where qts.quiz_id = v_quiz.id
        )) and not (
            (v_student.section_id is not null and v_student.section_id = v_quiz.section_id)
            or exists (
                select 1 from public.quiz_target_sections qts
                where qts.quiz_id = v_quiz.id and qts.section_id = v_student.section_id
            )
        ) then
        return jsonb_build_object('status', 'denied', 'reason', 'wrong-section');
    end if;

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
$$;

grant execute on function public.request_quiz_access(text, text) to authenticated;

create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid     uuid := auth.uid();
    v_email   text := auth.email();
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

    -- Same widened section gate as request_quiz_access: legacy section_id OR
    -- quiz_target_sections OR unrestricted (whole subject).
    if (v_quiz.section_id is not null or exists (
            select 1 from public.quiz_target_sections qts where qts.quiz_id = v_quiz.id
        )) and not (
            (v_student.section_id is not null and v_student.section_id = v_quiz.section_id)
            or exists (
                select 1 from public.quiz_target_sections qts
                where qts.quiz_id = v_quiz.id and qts.section_id = v_student.section_id
            )
        ) then
        return jsonb_build_object('status', 'denied', 'reason', 'wrong-section');
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
$$;

grant execute on function public.start_quiz_attempt(uuid) to authenticated;

notify pgrst, 'reload schema';
