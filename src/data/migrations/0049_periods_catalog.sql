-- ============================================================================
-- Migration: 0049_periods_catalog.sql
-- Fixed, college-wide Period catalog (Requirement 13).
-- ============================================================================

create table if not exists public.periods (
    id         text primary key,   -- 'P1'..'P7', 'LUNCH', 'SAT_BLOCK'
    label      text not null,      -- 'Period I', ..., 'Lunch Break', 'NCC/NSS/CLUB ACTIVITIES/SPORTS/NPTEL/T&P'
    start_time time not null,
    end_time   time not null,
    day_type   text not null default 'weekday'
        constraint periods_day_type_allowed check (day_type in ('weekday', 'saturday')),
    sort_order integer not null
);

alter table public.periods enable row level security;
drop policy if exists periods_read on public.periods;
create policy periods_read on public.periods for select to authenticated using (true);

-- Seed data matching the reference weekday schedule + the distinct Saturday
-- block (Requirement 13.1-13.3). Idempotent upsert.
insert into public.periods (id, label, start_time, end_time, day_type, sort_order) values
    ('P1',        'Period I',    '09:30', '10:20', 'weekday',  1),
    ('P2',        'Period II',   '10:20', '11:10', 'weekday',  2),
    ('P3',        'Period III',  '11:10', '12:00', 'weekday',  3),
    ('LUNCH',     'Lunch Break', '12:00', '12:40', 'weekday',  4),
    ('P4',        'Period IV',   '12:40', '13:30', 'weekday',  5),
    ('P5',        'Period V',    '13:30', '14:20', 'weekday',  6),
    ('P6',        'Period VI',   '14:20', '15:10', 'weekday',  7),
    ('P7',        'Period VII',  '15:10', '16:00', 'weekday',  8),
    ('SAT_BLOCK', 'NCC/NSS/CLUB ACTIVITIES/SPORTS/NPTEL/T&P', '09:30', '13:00', 'saturday', 1)
on conflict (id) do update set
    label = excluded.label, start_time = excluded.start_time, end_time = excluded.end_time,
    day_type = excluded.day_type, sort_order = excluded.sort_order;

notify pgrst, 'reload schema';
