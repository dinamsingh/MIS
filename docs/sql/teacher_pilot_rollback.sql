-- SAFE operational rollback: stop pilot writes without deleting history or
-- restoring the old destructive importer/broad policies. Save previous scopes
-- before setup if the owner later needs to restore a reviewed prior approval.
begin;
do $$
declare v_email text:='REPLACE_WITH_VERIFIED_TEACHER_EMAIL'; v_teacher uuid;
begin
  if v_email='REPLACE_WITH_VERIFIED_TEACHER_EMAIL' then raise exception 'Set the actual teacher email first.'; end if;
  select id into strict v_teacher from auth.users where lower(email)=lower(btrim(v_email));
  update public.teacher_academic_scopes set enabled=false
  where teacher_id=v_teacher and batch_id='2025-29';
end;
$$;
commit;
