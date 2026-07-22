-- ============================================================================
-- Migration: 0048_promote_batch
-- Admin-only batch promotion, formalizing the manual pattern from migration
-- 0011_update_current_batches.sql into a callable RPC.
--
-- promote_batch(batch_id):
--   - is_admin()-gated (reuses public.is_admin() from migration 0043).
--   - current_sem in [1,7]: increments current_sem by exactly 1, status
--     unchanged.
--   - current_sem = 8: sets status = 'graduated' WITHOUT further
--     incrementing current_sem (it stays at 8).
--   - Touches ONLY the one batches row identified by p_batch_id via a
--     single `update ... where id = p_batch_id` (Requirement 10.3) — never
--     writes to sections/students/student_roster (Requirement 10.4).
-- ============================================================================

create or replace function public.promote_batch(p_batch_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_batch public.batches%rowtype;
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;

    select * into v_batch from public.batches where id = p_batch_id;
    if not found then
        return jsonb_build_object('status', 'denied', 'reason', 'batch-not-found');
    end if;

    if v_batch.current_sem >= 8 then
        update public.batches set status = 'graduated' where id = p_batch_id;
        return jsonb_build_object('status', 'graduated', 'batchId', p_batch_id, 'newSem', v_batch.current_sem, 'newStatus', 'graduated');
    end if;

    update public.batches set current_sem = current_sem + 1 where id = p_batch_id;
    return jsonb_build_object('status', 'promoted', 'batchId', p_batch_id, 'newSem', v_batch.current_sem + 1, 'newStatus', v_batch.status);
end;
$$;

comment on function public.promote_batch(text) is
  'Admin-only: advances one batch by one semester (current_sem in [1,7]), or marks it graduated without further incrementing when current_sem = 8. Touches only the identified batches row via a single UPDATE ... WHERE id = p_batch_id — never writes to sections/students/student_roster (Requirements 10.1-10.5).';

grant execute on function public.promote_batch(text) to authenticated;

notify pgrst, 'reload schema';
