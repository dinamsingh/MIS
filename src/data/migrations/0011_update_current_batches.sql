-- ============================================================================
-- Migration 0011: Correct live CSE batch -> current semester mapping.
--
-- Active academic load:
--   2026-30 -> I Sem
--   2025-29 -> III Sem
--   2024-28 -> V Sem
--   2023-27 -> VII Sem
--
-- Older batches are marked graduated so onboarding excludes them.
-- ============================================================================

INSERT INTO public.batches (id, start_year, current_sem, status) VALUES
    ('2026-30', 2026, 1, 'classes'),
    ('2025-29', 2025, 3, 'classes'),
    ('2024-28', 2024, 5, 'classes'),
    ('2023-27', 2023, 7, 'classes'),
    ('2022-26', 2022, 8, 'graduated'),
    ('2021-25', 2021, 8, 'graduated')
ON CONFLICT (id) DO UPDATE
SET start_year = EXCLUDED.start_year,
    current_sem = EXCLUDED.current_sem,
    status = EXCLUDED.status;
