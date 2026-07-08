-- ============================================================================
-- Migration: 0031_assignment_shares
-- Persist teacher-prepared assignment share messages across browsers/devices.
--
-- The uploaded binary already lives in public.files via Cloudinary. This table
-- stores the teacher-facing metadata used to rebuild the WhatsApp copy text.
-- ============================================================================

create table if not exists public.assignment_shares (
    id           uuid primary key default gen_random_uuid(),
    owner_id     uuid not null default auth.uid(),
    file_id      uuid references public.files (id) on delete set null,
    subject_id   uuid not null references public.syllabus_subjects (id) on delete cascade,
    unit_id      uuid not null references public.syllabus_units (id) on delete cascade,
    section_id   uuid references public.sections (id) on delete set null,
    title        text not null,
    description  text not null default '',
    assignment_date date,
    submission_date date,
    file_name    text not null,
    mime_type    text,
    size_bytes   bigint,
    file_url     text not null,
    created_at   timestamptz not null default now()
);

alter table public.assignment_shares
    add column if not exists assignment_date date;

alter table public.assignment_shares
    add column if not exists submission_date date;

create index if not exists idx_assignment_shares_owner_created
    on public.assignment_shares (owner_id, created_at desc);

create index if not exists idx_assignment_shares_subject_unit
    on public.assignment_shares (subject_id, unit_id);

alter table public.assignment_shares enable row level security;

drop policy if exists owner_all_assignment_shares on public.assignment_shares;
create policy owner_all_assignment_shares on public.assignment_shares
    for all to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

notify pgrst, 'reload schema';
