-- Reconcile the security hardening verified live on 2026-11-08.
-- No production data changes. Safe to apply where the hardening already exists.
begin;

CREATE OR REPLACE FUNCTION public.enforce_teacher_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_email text;
  v_uid uuid := auth.uid();
BEGIN
  -- Trusted maintenance callers can provision teachers; ordinary users cannot bypass identity checks.
  IF session_user = 'postgres' OR auth.role() = 'service_role' THEN
    v_email := lower(btrim(coalesce(NEW.email, '')));
  ELSE
    IF v_uid IS NULL OR NEW.id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Authenticated teacher account identity is required.';
    END IF;
    SELECT lower(btrim(u.email))
      INTO v_email
      FROM auth.users AS u
     WHERE u.id = v_uid
       AND u.email_confirmed_at IS NOT NULL;
    IF v_email IS NULL OR v_email = '' THEN
      RAISE EXCEPTION 'A confirmed account email is required to become a teacher.';
    END IF;
    IF NEW.email IS NULL OR lower(btrim(NEW.email)) <> v_email THEN
      RAISE EXCEPTION 'Teacher profile email must match your verified login email.';
    END IF;
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'A valid teacher email is required.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.allowed_teacher_emails AS a
    WHERE lower(btrim(a.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'This email is not on the approved teacher list.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.students AS s
    WHERE lower(btrim(s.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'Student accounts cannot be onboarded as teachers.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_subject_code(p_code text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
    select upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$function$;

drop policy if exists teachers_insert_own on public.teachers;
create policy teachers_insert_own on public.teachers for insert to authenticated
with check (id = (select auth.uid()) and lower(btrim(email)) = lower(btrim((select auth.email()))));
drop policy if exists teachers_update_own on public.teachers;
create policy teachers_update_own on public.teachers for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and lower(btrim(email)) = lower(btrim((select auth.email()))));

revoke execute on function public.add_admin(text) from public, anon;
grant execute on function public.add_admin(text) to authenticated;

revoke execute on function public.permanently_delete_student(uuid,boolean) from public, anon;
grant execute on function public.permanently_delete_student(uuid,boolean) to authenticated;

revoke execute on function public.reset_student_binding(text) from public, anon;
grant execute on function public.reset_student_binding(text) to authenticated;

revoke execute on function public.remove_admin(text) from public, anon;
grant execute on function public.remove_admin(text) to authenticated;

revoke execute on function public.add_allowed_teacher(text) from public, anon;
grant execute on function public.add_allowed_teacher(text) to authenticated;

revoke execute on function public.remove_allowed_teacher(text) from public, anon;
grant execute on function public.remove_allowed_teacher(text) to authenticated;

revoke execute on function public.grant_teacher_extra_power(text,text) from public, anon;
grant execute on function public.grant_teacher_extra_power(text,text) to authenticated;

revoke execute on function public.revoke_teacher_extra_power(text,text) from public, anon;
grant execute on function public.revoke_teacher_extra_power(text,text) to authenticated;

revoke execute on function public.create_quiz_with_questions(jsonb,jsonb) from public, anon;
grant execute on function public.create_quiz_with_questions(jsonb,jsonb) to authenticated;

revoke execute on function public.save_syllabus_structure(integer,jsonb) from public, anon;
grant execute on function public.save_syllabus_structure(integer,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
