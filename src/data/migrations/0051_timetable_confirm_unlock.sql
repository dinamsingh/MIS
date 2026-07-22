-- ============================================================================
-- Migration: 0051_timetable_confirm_unlock.sql
-- Confirm/Unlock RPCs with cross-batch conflict detection, and RLS policy
-- update rejecting mutations on confirmed (teacher, section) timetable entries.
--
-- Depends on:
--   0049_periods_catalog.sql (public.periods — id, sort_order, day_type)
--   0050_timetable_overhaul.sql (timetable_entries.period_id, span_periods,
--       section_timetable_status table)
--   0014_per_teacher_isolation.sql (timetable_entries.owner_id, existing
--       owner_all_timetable_entries policy)
--   0012_multi_teacher_identity.sql (is_teacher())
--
-- Requirements validated: 16.4, 16.5, 16.6, 18.1, 18.2, 18.3, 18.4
-- ============================================================================

-- ----------------------------------------------------------------------------
-- find_teacher_schedule_conflicts(p_teacher_id uuid)
--
-- Compares EVERY pair of that teacher's entries across ALL batches/sections on
-- the same day whose [period_id, period_id+span_periods) ranges (by sort_order)
-- overlap (Requirement 18.1, 18.2, 18.4 — multi-period-aware, cross-batch).
--
-- Only considers entries that have period_id set (old free-text entries without
-- period_id are excluded — nothing to conflict on until re-saved through the
-- new editor).
--
-- Returns one row per conflict pair (each pair appears once: a.id < b.id).
-- ----------------------------------------------------------------------------
create or replace function public.find_teacher_schedule_conflicts(p_teacher_id uuid)
returns table (
    entry_a_id uuid,
    entry_b_id uuid,
    day_of_week text,
    a_section_id uuid,
    a_subject_id uuid,
    a_period_label text,
    b_section_id uuid,
    b_subject_id uuid,
    b_period_label text
)
language sql
stable
security definer
set search_path = public
as $$
    with teacher_entries as (
        select
            te.id,
            te.day_of_week,
            te.section_id,
            te.subject_id,
            te.period_id,
            te.span_periods,
            p.sort_order as start_sort,
            p.day_type,
            p.label as period_label
        from public.timetable_entries te
        join public.periods p on p.id = te.period_id
        where te.owner_id = p_teacher_id
          and te.period_id is not null
    )
    select
        a.id as entry_a_id,
        b.id as entry_b_id,
        a.day_of_week,
        a.section_id as a_section_id,
        a.subject_id as a_subject_id,
        a.period_label as a_period_label,
        b.section_id as b_section_id,
        b.subject_id as b_subject_id,
        b.period_label as b_period_label
    from teacher_entries a
    join teacher_entries b
      on a.id < b.id                          -- each pair once
     and a.day_of_week = b.day_of_week
     and a.day_type = b.day_type
     -- overlap test on [start_sort, start_sort + span_periods) ranges
     and a.start_sort < b.start_sort + b.span_periods
     and b.start_sort < a.start_sort + a.span_periods;
$$;

grant execute on function public.find_teacher_schedule_conflicts(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- confirm_timetable(p_section_id uuid)
--
-- Teacher-gated (NOT admin). Runs the conflict scan for the calling teacher's
-- ENTIRE schedule (all sections/batches). If any conflict is found, returns
-- the conflict details for the UI. Otherwise transitions section_timetable_status
-- to 'confirmed'. Also validates the caller owns entries for (auth.uid(),
-- p_section_id) via owner_id.
--
-- Requirement 16.4, 18.1-18.4.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_timetable(p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_conflict record;
    v_has_entries boolean;
begin
    -- Gate: must be a teacher
    if not public.is_teacher() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-teacher');
    end if;

    -- Validate the caller actually owns entries for this section
    select exists (
        select 1 from public.timetable_entries
        where owner_id = auth.uid() and section_id = p_section_id
    ) into v_has_entries;

    if not v_has_entries then
        return jsonb_build_object('status', 'denied', 'reason', 'no-entries-for-section');
    end if;

    -- Run the cross-batch conflict scan for the entire teacher schedule
    select * into v_conflict
    from public.find_teacher_schedule_conflicts(auth.uid())
    limit 1;

    if found then
        return jsonb_build_object(
            'status', 'denied',
            'reason', 'conflict',
            'conflictingDay', v_conflict.day_of_week,
            'entryA', jsonb_build_object(
                'id', v_conflict.entry_a_id,
                'sectionId', v_conflict.a_section_id,
                'subjectId', v_conflict.a_subject_id,
                'period', v_conflict.a_period_label
            ),
            'entryB', jsonb_build_object(
                'id', v_conflict.entry_b_id,
                'sectionId', v_conflict.b_section_id,
                'subjectId', v_conflict.b_subject_id,
                'period', v_conflict.b_period_label
            )
        );
    end if;

    -- No conflicts — transition to confirmed (upsert handles first-time case)
    insert into public.section_timetable_status (teacher_id, section_id, status, updated_at)
    values (auth.uid(), p_section_id, 'confirmed', now())
    on conflict (teacher_id, section_id) do update set status = 'confirmed', updated_at = now();

    return jsonb_build_object('status', 'confirmed', 'sectionId', p_section_id);
end;
$$;

grant execute on function public.confirm_timetable(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- unlock_timetable(p_section_id uuid)
--
-- Teacher-gated. Whole-section transition back to 'draft' for the caller's
-- (auth.uid(), section_id) pair. Does not affect other teachers' timetables
-- for the same section (Requirement 16.6).
-- ----------------------------------------------------------------------------
create or replace function public.unlock_timetable(p_section_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Gate: must be a teacher
    if not public.is_teacher() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-teacher');
    end if;

    update public.section_timetable_status
    set status = 'draft', updated_at = now()
    where teacher_id = auth.uid() and section_id = p_section_id;

    if not found then
        -- No row yet means it was already (implicitly) draft.
        return jsonb_build_object('status', 'already-draft', 'sectionId', p_section_id);
    end if;

    return jsonb_build_object('status', 'unlocked', 'sectionId', p_section_id);
end;
$$;

grant execute on function public.unlock_timetable(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS policy update on timetable_entries
--
-- EXTENDS (not replaces) the owner-scoped isolation from 0014: the teacher can
-- always READ their own rows regardless of confirmed state. But INSERT, UPDATE,
-- and DELETE are rejected when the caller's (auth.uid(), section_id) pair has
-- status = 'confirmed' in section_timetable_status — the teacher must unlock
-- first (Requirement 16.5).
--
-- Split into operation-specific policies because:
--  - SELECT must always succeed for own rows (teacher reads confirmed entries)
--  - INSERT uses with_check only (no existing row)
--  - UPDATE uses using (existing row) + with_check (new row)
--  - DELETE uses using only (no new row) — must include confirmed check there
-- ----------------------------------------------------------------------------
drop policy if exists owner_all_timetable_entries on public.timetable_entries;
drop policy if exists owner_select_timetable_entries on public.timetable_entries;
drop policy if exists owner_insert_timetable_entries on public.timetable_entries;
drop policy if exists owner_update_timetable_entries on public.timetable_entries;
drop policy if exists owner_delete_timetable_entries on public.timetable_entries;

-- SELECT: teacher always reads own rows (confirmed or draft)
create policy owner_select_timetable_entries on public.timetable_entries
  for select to authenticated
  using (owner_id = auth.uid());

-- INSERT: blocked when the target section is confirmed for this teacher
create policy owner_insert_timetable_entries on public.timetable_entries
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and not exists (
      select 1 from public.section_timetable_status sts
      where sts.teacher_id = auth.uid()
        and sts.section_id = timetable_entries.section_id
        and sts.status = 'confirmed'
    )
  );

-- UPDATE: can see own rows, but write blocked when confirmed
create policy owner_update_timetable_entries on public.timetable_entries
  for update to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and not exists (
      select 1 from public.section_timetable_status sts
      where sts.teacher_id = auth.uid()
        and sts.section_id = timetable_entries.section_id
        and sts.status = 'confirmed'
    )
  );

-- DELETE: blocked when the section is confirmed (check is in USING since
-- DELETE has no WITH CHECK — Postgres uses USING for row visibility on DELETE)
create policy owner_delete_timetable_entries on public.timetable_entries
  for delete to authenticated
  using (
    owner_id = auth.uid()
    and not exists (
      select 1 from public.section_timetable_status sts
      where sts.teacher_id = auth.uid()
        and sts.section_id = timetable_entries.section_id
        and sts.status = 'confirmed'
    )
  );

notify pgrst, 'reload schema';
