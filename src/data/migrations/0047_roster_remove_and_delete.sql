-- ============================================================================
-- Migration: 0047_roster_remove_and_delete
-- Soft "remove from roster" vs. hard "permanently delete", both admin-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- remove_student_from_roster: nulls section_id (soft) — history (attendance,
-- marks, quiz_attempts) is FK'd to students.id, never to section_id directly
-- for those historical tables, so nulling section_id here does not cascade
-- or orphan any historical row (Requirement 8.1).
-- ----------------------------------------------------------------------------
create or replace function public.remove_student_from_roster(p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;
    update public.students set section_id = null where id = p_student_id;
    if not found then
        return jsonb_build_object('status', 'not-found');
    end if;
    return jsonb_build_object('status', 'removed');
end;
$$;

grant execute on function public.remove_student_from_roster(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- permanently_delete_student: hard delete. Requires p_confirmed = true as
-- defense-in-depth (Requirement 8.5) — the UI's two-step confirmation is a
-- convenience; the database still refuses the destructive path outright
-- without an explicit, non-defaultable flag.
-- ----------------------------------------------------------------------------
create or replace function public.permanently_delete_student(p_student_id uuid, p_confirmed boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;
    if p_confirmed is not true then
        return jsonb_build_object('status', 'denied', 'reason', 'not-confirmed');
    end if;

    delete from public.students where id = p_student_id;
    if not found then
        return jsonb_build_object('status', 'not-found');
    end if;
    return jsonb_build_object('status', 'deleted');
end;
$$;

grant execute on function public.permanently_delete_student(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
