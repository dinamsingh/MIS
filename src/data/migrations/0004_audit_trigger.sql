-- ============================================================================
-- Migration: 0004_audit_trigger
-- Teacher Academic MIS — audit logging trigger
--
-- Scope (task 15.4 ONLY): a single plpgsql trigger function plus AFTER
-- row-level triggers on `attendance`, `mark_values`, and `mark_components`.
-- Each insert / update / delete writes exactly ONE `audit_log` row capturing:
--   * actor       -> auth.uid()  (the acting authenticated user)
--   * record_ref  -> the affected row's primary key
--   * change_type -> 'create' (INSERT) | 'update' (UPDATE) | 'delete' (DELETE)
--   * table_name  -> the source table
--   * timestamp   -> now() (column default)
--
-- Requirements: 5.7, 7.7, 19.1, 19.2, 19.3
--
-- NOT in this migration (handled by other tasks):
--   * RLS enablement and policies            -> task 15.2
--   * SECURITY DEFINER access/grade fns       -> task 15.3
--   * integration tests                       -> task 15.7
--
-- Idempotent: the function uses CREATE OR REPLACE and each trigger is dropped
-- before being (re)created so the migration can be re-applied safely.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Trigger function: write one audit_log row per row-level change.
--
-- Declared SECURITY DEFINER so the insert into audit_log succeeds regardless of
-- the writer's own table privileges, and search_path is pinned to avoid
-- function-hijacking via a mutable search path.
-- ----------------------------------------------------------------------------
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_change_type text;
    v_record_id   uuid;
    v_actor       uuid;
begin
    -- Map the SQL operation onto the audit_log change_type domain
    -- ('create' | 'update' | 'delete').
    if (tg_op = 'INSERT') then
        v_change_type := 'create';
        v_record_id   := NEW.id;
    elsif (tg_op = 'UPDATE') then
        v_change_type := 'update';
        v_record_id   := NEW.id;
    elsif (tg_op = 'DELETE') then
        v_change_type := 'delete';
        v_record_id   := OLD.id;
    end if;

    -- Acting user identity. auth.uid() is the authenticated Supabase user; it
    -- resolves to NULL when no user context is present (e.g. server-side jobs).
    begin
        v_actor := auth.uid();
    exception
        when others then
            v_actor := null;
    end;

    insert into public.audit_log (actor_id, record_ref, change_type, table_name)
    values (
        v_actor,
        tg_table_name || ':' || coalesce(v_record_id::text, ''),
        v_change_type,
        tg_table_name
    );

    -- AFTER triggers ignore the return value, but returning the affected row
    -- keeps the function correct if it is ever reused as a BEFORE trigger.
    if (tg_op = 'DELETE') then
        return OLD;
    end if;
    return NEW;
end;
$$;

-- ----------------------------------------------------------------------------
-- attendance — Req 5.7, 19.3
-- ----------------------------------------------------------------------------
drop trigger if exists trg_audit_attendance on public.attendance;
create trigger trg_audit_attendance
    after insert or update or delete on public.attendance
    for each row execute function public.write_audit_log();

-- ----------------------------------------------------------------------------
-- mark_values — Req 7.7, 19.2
-- ----------------------------------------------------------------------------
drop trigger if exists trg_audit_mark_values on public.mark_values;
create trigger trg_audit_mark_values
    after insert or update or delete on public.mark_values
    for each row execute function public.write_audit_log();

-- ----------------------------------------------------------------------------
-- mark_components — Req 7.7, 19.2
-- ----------------------------------------------------------------------------
drop trigger if exists trg_audit_mark_components on public.mark_components;
create trigger trg_audit_mark_components
    after insert or update or delete on public.mark_components
    for each row execute function public.write_audit_log();
