-- ============================================================================
-- Migration: 0044_teacher_extra_powers
-- Delegated Extra Powers: cross_section_visibility, teacher_allowlist_approval.
-- ============================================================================

create table if not exists public.teacher_extra_powers (
    teacher_id  uuid not null references public.teachers (id) on delete cascade,
    power_name  text not null
        constraint teacher_extra_powers_power_name_allowed
        check (power_name in ('cross_section_visibility', 'teacher_allowlist_approval')),
    granted_by  text references public.admins (email) on delete set null,
    created_at  timestamptz not null default now(),
    primary key (teacher_id, power_name)
);

alter table public.teacher_extra_powers enable row level security;

-- A teacher may read their OWN granted powers (to conditionally show UI);
-- an admin may read every row (to manage grants).
drop policy if exists teacher_extra_powers_read_own on public.teacher_extra_powers;
create policy teacher_extra_powers_read_own on public.teacher_extra_powers
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());
-- No insert/update/delete policy: all writes go through
-- grant_teacher_extra_power()/revoke_teacher_extra_power() (SECURITY DEFINER).

-- has_extra_power(power) — helper for other RPCs/RLS to consult.
create or replace function public.has_extra_power(p_power text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.teacher_extra_powers
    where teacher_id = auth.uid() and power_name = p_power
  );
$$;

comment on function public.has_extra_power(text) is
  'True when the caller (by auth.uid()) has been granted the named Extra_Power. Scoped strictly to this one teacher — grants to other teachers never affect this result (Requirement 3.1/3.3).';

create or replace function public.grant_teacher_extra_power(p_teacher_email text, p_power text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_teacher_id uuid;
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;
    if p_power not in ('cross_section_visibility', 'teacher_allowlist_approval') then
        return jsonb_build_object('status', 'denied', 'reason', 'invalid-power');
    end if;

    select id into v_teacher_id from public.teachers where lower(email) = lower(btrim(p_teacher_email));
    if v_teacher_id is null then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-not-found');
    end if;

    insert into public.teacher_extra_powers (teacher_id, power_name, granted_by)
    values (v_teacher_id, p_power, (select email from public.admins where lower(email) = lower(coalesce(auth.email(), ''))))
    on conflict (teacher_id, power_name) do update
        set granted_by = excluded.granted_by, created_at = now();

    return jsonb_build_object('status', 'granted', 'teacherId', v_teacher_id, 'power', p_power);
end;
$$;

grant execute on function public.grant_teacher_extra_power(text, text) to authenticated;

create or replace function public.revoke_teacher_extra_power(p_teacher_email text, p_power text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_teacher_id uuid;
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;

    select id into v_teacher_id from public.teachers where lower(email) = lower(btrim(p_teacher_email));
    if v_teacher_id is null then
        return jsonb_build_object('status', 'denied', 'reason', 'teacher-not-found');
    end if;

    delete from public.teacher_extra_powers where teacher_id = v_teacher_id and power_name = p_power;

    return jsonb_build_object('status', 'revoked', 'teacherId', v_teacher_id, 'power', p_power);
end;
$$;

grant execute on function public.revoke_teacher_extra_power(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- remove_allowed_teacher(email) — gated on is_admin() OR
-- has_extra_power('teacher_allowlist_approval'). add_allowed_teacher() itself
-- is UNCHANGED (still is_teacher()-gated per the existing 0027 migration) —
-- Requirement 2.2 explicitly says the Admin_Console reuses the EXISTING RPC
-- for adds; this migration only adds the missing remove counterpart.
-- ----------------------------------------------------------------------------
create or replace function public.remove_allowed_teacher(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not (public.is_admin() or public.has_extra_power('teacher_allowlist_approval')) then
        return jsonb_build_object('status', 'denied', 'reason', 'not-authorized');
    end if;

    delete from public.allowed_teacher_emails where lower(email) = lower(btrim(p_email));
    if not found then
        return jsonb_build_object('status', 'not-found');
    end if;
    return jsonb_build_object('status', 'removed', 'email', lower(btrim(p_email)));
end;
$$;

grant execute on function public.remove_allowed_teacher(text) to authenticated;

-- cross_section_visibility: extend sections/students/student_roster read
-- policies to also allow a teacher with this power, additive to the existing
-- is_teacher() shared-read policies (0014's shared-tables model is
-- unaffected — this only WIDENS who may read, never narrows).
drop policy if exists teacher_read_sections on public.sections;
create policy teacher_read_sections on public.sections
  for select to authenticated
  using (public.is_teacher() or public.has_extra_power('cross_section_visibility'));

notify pgrst, 'reload schema';
