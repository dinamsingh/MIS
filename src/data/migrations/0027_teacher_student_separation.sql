-- ============================================================================
-- Migration: 0027_teacher_student_separation
-- Enforce a hard identity boundary between teacher and student accounts.
--
-- Two gaps existed:
--   1. ANY authenticated Google account could complete the onboarding wizard
--      and become a teacher (is_teacher() only checked "does a teachers row
--      exist", not "is this email actually an approved teacher").
--   2. A student who had already self-registered via a quiz link could still
--      go on to complete onboarding and become a teacher (and vice versa, a
--      teacher's email could self-register as a "new student" on a quiz that
--      is not their own).
--
-- Fix:
--   (A) `allowed_teacher_emails` — an explicit allowlist. Onboarding is only
--       permitted for emails on this list. Bootstrapped with every email
--       already present in `teachers` (grandfathers existing teachers so this
--       migration cannot lock anyone out on the day it is applied).
--   (B) A BEFORE INSERT/UPDATE trigger on `teachers` that rejects the write
--       (at the database level, so it cannot be bypassed by any client code
--       path) unless the email is on the allowlist AND no `students` row with
--       that email already exists.
--   (C) `request_quiz_access` now denies (reason 'teacher-account') if the
--       signed-in email already belongs to a teacher, so a teacher can never
--       be silently registered as a new student on someone else's quiz.
--   (D) `add_allowed_teacher(email)` — lets an existing teacher approve a new
--       teacher's email without needing SQL Editor access every time.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO
-- NOTHING for the bootstrap insert, DROP+CREATE TRIGGER.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (A) Allowlist table
-- ----------------------------------------------------------------------------
create table if not exists public.allowed_teacher_emails (
    email      text primary key,
    added_by   uuid references public.teachers (id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.allowed_teacher_emails enable row level security;

-- Any signed-in teacher may see the allowlist (useful for an admin UI later).
-- No insert/update/delete policy is granted here on purpose — rows are added
-- either by this migration's bootstrap, by an admin running SQL directly, or
-- via the add_allowed_teacher() function below (which enforces is_teacher()).
drop policy if exists allowed_teacher_emails_read on public.allowed_teacher_emails;
create policy allowed_teacher_emails_read on public.allowed_teacher_emails
  for select to authenticated using (public.is_teacher());

-- Grandfather every teacher who already exists, so this migration never locks
-- out a teacher who onboarded before the allowlist existed.
insert into public.allowed_teacher_emails (email)
select distinct lower(email) from public.teachers where email is not null
on conflict (email) do nothing;

-- ----------------------------------------------------------------------------
-- (B) Enforce eligibility on every teachers insert/update
-- ----------------------------------------------------------------------------
create or replace function public.enforce_teacher_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := lower(coalesce(new.email, auth.email(), ''));
begin
    if v_email = '' then
        raise exception 'A verified email is required to become a teacher.';
    end if;

    if not exists (
        select 1 from public.allowed_teacher_emails a where lower(a.email) = v_email
    ) then
        raise exception
            'This email is not on the approved teacher list. Ask an existing teacher or the admin to add it.';
    end if;

    if exists (select 1 from public.students s where lower(s.email) = v_email) then
        raise exception
            'This account already self-registered as a student on a quiz and cannot become a teacher.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_teacher_eligibility on public.teachers;
create trigger trg_enforce_teacher_eligibility
    before insert or update on public.teachers
    for each row execute function public.enforce_teacher_eligibility();

-- ----------------------------------------------------------------------------
-- (D) Convenience: let an existing teacher approve a new teacher's email.
-- ----------------------------------------------------------------------------
create or replace function public.add_allowed_teacher(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_teacher() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-teacher');
    end if;
    if p_email is null or btrim(p_email) = '' then
        return jsonb_build_object('status', 'denied', 'reason', 'invalid-email');
    end if;

    insert into public.allowed_teacher_emails (email, added_by)
    values (lower(btrim(p_email)), auth.uid())
    on conflict (email) do nothing;

    return jsonb_build_object('status', 'added', 'email', lower(btrim(p_email)));
end;
$$;

grant execute on function public.add_allowed_teacher(text) to authenticated;

-- ----------------------------------------------------------------------------
-- (C) request_quiz_access — deny teacher accounts from self-registering as a
-- student on a quiz that isn't their own. Full function body (rest unchanged
-- from 0025) with the new check inserted right after the owner-preview branch.
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
                'shareToken', v_quiz.share_token, 'questions', v_questions
            )
        );
    end if;

    -- NEW: a teacher account (any teacher, not just this quiz's owner) must
    -- never fall through to self-registration as a student.
    if exists (select 1 from public.teachers t where lower(t.email) = lower(v_email)) then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-account');
    end if;

    select * into v_roster
    from public.student_roster
    where lower(email) = lower(v_email)
    limit 1;

    if not found then
        if p_provided_enrollment is null then
            return jsonb_build_object('status', 'enrollment-required');
        end if;

        if v_quiz.section_id is not null and not exists (
            select 1
            from public.students st
            where st.enrollment_number = p_provided_enrollment
              and st.section_id = v_quiz.section_id
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

        if v_roster.email is not null and lower(v_roster.email) <> lower(v_email) then
            return jsonb_build_object('status', 'denied', 'reason', 'enrollment-already-bound');
        end if;

        update public.student_roster
           set email = v_email
         where id = v_roster.id
        returning * into v_roster;
    end if;

    insert into public.students (name, email, enrollment_number)
    values (coalesce(v_roster.name, v_email), v_email, v_roster.enrollment_number)
    on conflict (enrollment_number) do update
        set email = excluded.email,
            name  = coalesce(public.students.name, excluded.name)
    returning * into v_student;

    if v_quiz.section_id is not null and (
        v_student.section_id is null or v_student.section_id <> v_quiz.section_id
    ) then
        return jsonb_build_object('status', 'denied', 'reason', 'wrong-section');
    end if;

    declare
        v_attempt public.quiz_attempts%rowtype;
    begin
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
    end;

    if (v_quiz.active_from is not null and now() < v_quiz.active_from)
       or (v_quiz.active_until is not null and now() > v_quiz.active_until) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-active');
    end if;

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
            'shareToken', v_quiz.share_token, 'questions', v_questions
        )
    );
end;
$$;

grant execute on function public.request_quiz_access(text, text) to authenticated;

notify pgrst, 'reload schema';
