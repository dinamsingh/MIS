-- ============================================================================
-- Migration: 0046_session_creation_and_duplicate_guard
-- Session_Creation_Flow RPC (`create_session`) — Admin-only, transaction-safe
-- creation of a new Batch plus its shared Sections.
--
-- Note: this migration is filed as 0046 (not 0045 as originally referenced in
-- some planning docs) because migration number 0045 was already consumed on
-- disk by an unrelated ad-hoc feature (`0045_admin_create_teacher_account.sql`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- create_session(batch_id, start_year, current_sem, section_count) — admin-
-- only (reuses public.is_admin() from migration 0043), transaction-safe:
-- creates the batch row, then exactly section_count shared public.sections
-- rows (no owner column populated — sections stay shared per the existing
-- migration 0014 model, Requirement 5.4). All-or-nothing: any error anywhere
-- in the function body rolls back the whole operation (Postgres wraps a
-- single function call in an implicit transaction), so a failure partway
-- through section creation never leaves a partial batch/section commit.
-- ----------------------------------------------------------------------------
create or replace function public.create_session(
    p_batch_id      text,
    p_start_year    integer,
    p_current_sem   integer,
    p_section_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_section_ids uuid[] := '{}';
    v_letter      text;
    v_new_id      uuid;
    i             integer;
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;

    if p_section_count < 0 then
        return jsonb_build_object('status', 'denied', 'reason', 'invalid-section-count');
    end if;

    if exists (select 1 from public.batches where id = p_batch_id) then
        return jsonb_build_object('status', 'denied', 'reason', 'duplicate-batch-code');
    end if;

    insert into public.batches (id, start_year, current_sem, status)
    values (p_batch_id, p_start_year, p_current_sem, 'classes');

    for i in 1..p_section_count loop
        v_letter := chr(64 + i); -- 1 -> 'A', 2 -> 'B', 3 -> 'C', ...
        -- Name/batch MUST match the exact (name, batch) tuple
        -- getOrCreateRealSection() in onboarding.ts matches on —
        -- 'CSE-{sem}{letter}' — so a teacher who later claims this section
        -- via My_Teaching_Subjects resolves to THIS row instead of
        -- get-or-creating a duplicate (Requirement 7.1's "already-imported
        -- roster shows up immediately" depends on this naming convention
        -- being identical). No owner_id/owner column is populated: sections
        -- remain shared across all teachers, per the existing migration
        -- 0014 model (Requirement 5.4).
        insert into public.sections (name, batch, semester, department)
        values ('CSE-' || p_current_sem::text || v_letter, p_batch_id, p_current_sem::text, 'CSE')
        returning id into v_new_id;
        v_section_ids := array_append(v_section_ids, v_new_id);
    end loop;

    return jsonb_build_object('status', 'created', 'batchId', p_batch_id, 'sectionIds', v_section_ids);
end;
$$;

comment on function public.create_session(text, integer, integer, integer) is
  'Admin-only (is_admin()-gated) Session_Creation_Flow RPC: creates a new public.batches row and exactly section_count shared public.sections rows named CSE-{sem}{Letter}. Rejects a negative section_count and a duplicate batch_id. Runs inside the function''s implicit transaction, so any failure anywhere in the body rolls back the whole operation (Requirements 5.1, 5.3, 5.4, 5.5).';

grant execute on function public.create_session(text, integer, integer, integer) to authenticated;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- teacher_assignments_subject_section_batch_unique — database-level
-- duplicate subject-section-assignment safeguard (Requirement 9.5).
-- Deliberately excludes is_lab from the key: a theory claim and a lab claim
-- of the same subject+section+batch by two DIFFERENT teachers are both
-- blocked (Requirement 9.1/9.2/9.3), while two different teachers claiming
-- two different subjects on the same section/batch both still succeed
-- (Requirement 9.4). Applies uniformly to every insert path — the existing
-- teacher onboarding delete-then-insert flow (onboarding.ts) today, and any
-- future admin-driven assignment path — since it is enforced at the table
-- level, not client-side.
-- ----------------------------------------------------------------------------
-- Partial unique index: only theory rows (is_lab = false) participate, so a
-- teacher's paired lab row (is_lab = true) for the same subject+section+batch
-- does not conflict with their own theory row. Two DIFFERENT teachers claiming
-- the SAME subject+section+batch (both as theory, or one theory one lab) are
-- still blocked because both would try to insert is_lab=false rows.
create unique index if not exists teacher_assignments_subject_section_batch_unique
    on public.teacher_assignments (subject_id, batch_id, section)
    where (is_lab = false);
