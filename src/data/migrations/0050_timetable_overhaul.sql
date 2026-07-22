-- ============================================================================
-- Migration: 0050_timetable_overhaul.sql
-- Period-based scheduling, multi-period lab spans, room/tutorial/special-
-- activity metadata, per-(teacher, section) confirm/lock status.
--
-- NOTE ON NUMBERING: design.md refers to this migration as
-- "0049_timetable_overhaul.sql", but 0049 was already consumed by
-- 0049_periods_catalog.sql (task 20.1, Phase 4's periods catalog). This
-- migration depends on that one (period_id FKs into public.periods.id), so
-- it is numbered 0050 to run strictly after it. Content otherwise matches
-- design.md's Phase 4 "timetable_entries schema changes" section exactly.
-- ============================================================================

-- Migration strategy for existing rows: the OLD free-text time_slot column is
-- KEPT (not dropped) so existing rows remain valid/readable; it simply stops
-- being written to by the editor for any NEW or EDITED entry (Requirement
-- 13.5). New columns are nullable so old rows do not need a backfill — a
-- teacher who has not touched the editor since this migration simply has
-- period_id = null entries that are excluded from the new period-based grid
-- and from the Requirement 18 conflict check (nothing to conflict on) until
-- they re-save through the new editor, at which point period_id is populated.
alter table public.timetable_entries add column if not exists period_id       text references public.periods (id);
alter table public.timetable_entries add column if not exists span_periods    integer not null default 1;
alter table public.timetable_entries add column if not exists room           text;
alter table public.timetable_entries add column if not exists is_tutorial    boolean not null default false;
alter table public.timetable_entries add column if not exists special_activity text
    constraint timetable_entries_special_activity_allowed
    check (special_activity is null or special_activity in ('library', 'mentor', 'club_activities', 'sports', 'ncc_nss'));

-- subject_id is currently NOT NULL (migration 0001). Relax it so a special-
-- activity entry can omit a subject (Requirement 15.4), then enforce the
-- precise invariant with a CHECK: exactly one of {subject_id, special_activity}
-- is non-null, UNLESS is_tutorial = true, in which case subject_id is
-- required regardless of special_activity (Requirement 15.4's tutorial
-- exemption carve-out).
alter table public.timetable_entries alter column subject_id drop not null;

alter table public.timetable_entries drop constraint if exists timetable_entries_subject_or_activity_check;
alter table public.timetable_entries add constraint timetable_entries_subject_or_activity_check
    check (
        (is_tutorial and subject_id is not null)
        or (not is_tutorial and (
            (subject_id is not null and special_activity is null)
            or (subject_id is null and special_activity is not null)
        ))
    );

create index if not exists idx_timetable_entries_period on public.timetable_entries (period_id);

-- ----------------------------------------------------------------------------
-- section_timetable_status — per (teacher_id, section_id), NOT per section
-- alone (Requirement 16.1's exact wording: "Teacher-Section combination").
-- ----------------------------------------------------------------------------
create table if not exists public.section_timetable_status (
    teacher_id uuid not null references public.teachers (id) on delete cascade,
    section_id uuid not null references public.sections (id) on delete cascade,
    status     text not null default 'draft'
        constraint section_timetable_status_allowed check (status in ('draft', 'confirmed')),
    updated_at timestamptz not null default now(),
    primary key (teacher_id, section_id)
);

alter table public.section_timetable_status enable row level security;
drop policy if exists section_timetable_status_owner on public.section_timetable_status;
create policy section_timetable_status_owner on public.section_timetable_status
  for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

notify pgrst, 'reload schema';
