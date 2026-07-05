-- ============================================================================
-- Migration: 0018_dedupe_syllabus_subjects
-- Keep one syllabus subject per (semester, code) so onboarding subject lists do
-- not show duplicates after a seed file is run more than once.
-- ============================================================================

with ranked as (
  select
    id,
    row_number() over (
      partition by sem, lower(trim(code))
      order by id
    ) as row_num
  from public.syllabus_subjects
)
delete from public.syllabus_subjects s
using ranked r
where s.id = r.id
  and r.row_num > 1;

create unique index if not exists syllabus_subjects_sem_code_unique
  on public.syllabus_subjects (sem, lower(trim(code)));
