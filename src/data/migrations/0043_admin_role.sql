-- ============================================================================
-- Migration: 0043_admin_role
-- Admin role foundation: public.admins table, last-admin protection,
-- get_my_role() extended to a role-tag array, is_admin() helper.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- public.admins — email-keyed, mirrors allowed_teacher_emails shape exactly.
-- ----------------------------------------------------------------------------
create table if not exists public.admins (
    email      text primary key,
    added_by   uuid,
    created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- ----------------------------------------------------------------------------
-- is_admin() — SECURITY DEFINER so RLS/RPCs can consult admins regardless of
-- the caller's own RLS (mirrors is_teacher()'s membership-check shape).
--
-- Defined BEFORE the admins_read policy below, which references it: Postgres
-- resolves a policy's USING expression at CREATE POLICY time, so the function
-- must already exist in this same migration run (fixes a "function
-- public.is_admin() does not exist" error on a from-scratch database where
-- this migration is the one defining it).
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.email(), ''))
  );
$$;

comment on function public.is_admin() is
  'Returns true when the caller''s email is present in public.admins. SECURITY DEFINER so RLS policies and other RPCs can consult it without recursion. Independent of is_teacher() — an identity may be admin, teacher, both, or neither (Requirement 1.1).';

-- Only a signed-in admin may read the admins table (mirrors
-- allowed_teacher_emails_read's is_teacher()-gated shape).
drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins
  for select to authenticated using (public.is_admin());
-- No insert/update/delete policy: all writes go through add_admin()/remove_admin()
-- (SECURITY DEFINER), exactly like allowed_teacher_emails.

-- ----------------------------------------------------------------------------
-- Last-admin protection — database-level, applies to ANY delete path
-- (direct SQL, remove_admin() RPC, future code), always active except the
-- documented one-time bootstrap (which INSERTs, never deletes).
-- ----------------------------------------------------------------------------
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (select count(*) from public.admins) <= 1 then
        raise exception
            'At least one admin must always remain. This is the last remaining admin and cannot be removed.';
    end if;
    return old;
end;
$$;

drop trigger if exists trg_protect_last_admin on public.admins;
create trigger trg_protect_last_admin
    before delete on public.admins
    for each row execute function public.protect_last_admin();

-- ----------------------------------------------------------------------------
-- add_admin(email) / remove_admin(email) — Admin-only, SECURITY DEFINER.
-- ----------------------------------------------------------------------------
create or replace function public.add_admin(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;
    if p_email is null or btrim(p_email) = '' then
        return jsonb_build_object('status', 'denied', 'reason', 'invalid-email');
    end if;

    insert into public.admins (email, added_by)
    values (lower(btrim(p_email)), auth.uid())
    on conflict (email) do nothing;

    return jsonb_build_object('status', 'added', 'email', lower(btrim(p_email)));
end;
$$;

grant execute on function public.add_admin(text) to authenticated;

create or replace function public.remove_admin(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        return jsonb_build_object('status', 'denied', 'reason', 'not-admin');
    end if;

    -- protect_last_admin() trigger raises an exception if this is the sole
    -- remaining row; catch it here so the RPC returns a structured denial
    -- instead of a raw Postgres error reaching the client.
    begin
        delete from public.admins where lower(email) = lower(btrim(p_email));
    exception when others then
        return jsonb_build_object('status', 'denied', 'reason', 'last-admin');
    end;

    if not found then
        return jsonb_build_object('status', 'not-found');
    end if;
    return jsonb_build_object('status', 'removed', 'email', lower(btrim(p_email)));
end;
$$;

grant execute on function public.remove_admin(text) to authenticated;

-- ----------------------------------------------------------------------------
-- get_my_role() — now returns text[] of independent role tags instead of a
-- single text value. BREAKING CHANGE to the return type, contained to the
-- four client call sites this spec updates together (RequireTeacher,
-- RootRedirect, SignInRoute, OnboardingRoute via useUserRole()).
--
-- Postgres refuses `create or replace function` when the return type
-- changes ("cannot change return type of existing function"). The prior
-- definition (migration 0042) returned `text`; drop it first so the new
-- `text[]`-returning definition below can be created. Safe to re-run: DROP
-- FUNCTION IF EXISTS is idempotent, and no other object depends on this
-- function's signature (its four call sites are client-side TypeScript, not
-- database objects).
-- ----------------------------------------------------------------------------
drop function if exists public.get_my_role();

create or replace function public.get_my_role()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_uid   uuid := auth.uid();
    v_email text := lower(coalesce(auth.email(), ''));
    v_roles text[] := '{}';
begin
    if v_uid is null or v_email = '' then
        return v_roles;
    end if;

    if exists (select 1 from public.admins a where lower(a.email) = v_email) then
        v_roles := array_append(v_roles, 'admin');
    end if;

    if exists (select 1 from public.teachers t where t.id = v_uid) then
        v_roles := array_append(v_roles, 'teacher');
    elsif exists (select 1 from public.allowed_teacher_emails a where lower(a.email) = v_email) then
        v_roles := array_append(v_roles, 'pending-teacher');
    end if;

    return v_roles;
end;
$$;

comment on function public.get_my_role() is
  'Authoritative role check for client-side routing only. Returns a text[] of independent role tags present for the caller: any subset of {admin, teacher, pending-teacher} (teacher and pending-teacher remain mutually exclusive with each other; admin is fully independent of both). Empty array = no role (every student). Fails closed to {} on missing uid/email. Does not affect RLS; RLS + each RPC''s own is_admin()/is_teacher() check remain the authorization boundary.';

grant execute on function public.get_my_role() to authenticated;

notify pgrst, 'reload schema';
