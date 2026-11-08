-- Synthetic data only; executed in an isolated network-disabled container.
begin;
create schema pilot_test;
create table pilot_test.checks(name text);
grant usage on schema pilot_test to authenticated,anon;
grant select,insert on pilot_test.checks to authenticated,anon;
create function pilot_test.id(text) returns uuid language sql immutable as $$select md5($1)::uuid$$;
create function pilot_test.check(p_ok boolean,p_name text) returns void language plpgsql as $$
begin
 if p_ok is distinct from true then raise exception 'FAIL: %',p_name; end if;
 insert into pilot_test.checks values(p_name);
end; $$;
create function pilot_test.denied(p_sql text,p_state text,p_name text) returns void language plpgsql as $$
begin
 begin
   execute p_sql;
 exception when others then
   if sqlstate<>p_state then raise exception 'Wrong error for %: % %',p_name,sqlstate,sqlerrm; end if;
   insert into pilot_test.checks values(p_name);
   return;
 end;
 raise exception 'Expected rejection: %',p_name;
end; $$;
create function pilot_test.login(p_user text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',pilot_test.id(p_user),'email',p_user||'@pilot.test','role','authenticated')::text,false)::text::void;
$$;
grant execute on all functions in schema pilot_test to authenticated,anon;

insert into auth.users(id,email,email_confirmed_at)
select pilot_test.id(u),u||'@pilot.test',case when u='unverified' then null else now() end
from unnest(array['teacher','other','shared','student-a','student-b','student-c','stranger','unverified']) u;
insert into public.allowed_teacher_emails(email) values('teacher@pilot.test'),('other@pilot.test'),('shared@pilot.test'),('unverified@pilot.test');
insert into public.teachers(id,name,email,onboarded)
select pilot_test.id(u),'Original '||u,u||'@pilot.test',true from unnest(array['teacher','other','shared']) u;
insert into public.batches(id,start_year,current_sem,status) values('2025-29',2025,5,'classes'),('2024-28',2024,3,'classes') on conflict(id) do update set current_sem=excluded.current_sem,status=excluded.status;
insert into public.sections(id,name,batch,semester,department) values
('7f3a9cea-bdf2-4300-8645-9237f1b4e342','CSE-3A','2025-29','3rd Semester','CSE'),
('6ce610f0-2f0c-459e-b55e-f6a900d94852','CSE-3B','2025-29','3rd Semester','CSE'),
('30311f08-0ed9-4138-a1a2-8f239a5066a6','CSE-3C','2025-29','3rd Semester','CSE'),
(pilot_test.id('other-section'),'CSE-3A','2024-28','3rd Semester','CSE'),
(pilot_test.id('sem4-section'),'CSE-4A','2025-29','4th Semester','CSE'),
(pilot_test.id('sem5-section'),'CSE-5A','2025-29','5th Semester','CSE'),
(pilot_test.id('wrong-department'),'ECE-3A','2025-29','3rd Semester','ECE');
insert into public.syllabus_subjects(id,sem,code,name,kind,lab_name) values
(pilot_test.id('subject3'),3,'TEST-301','Test Theory','theory','Test Lab'),
(pilot_test.id('alternate3'),3,'TEST-302','Other Theory','theory',null),
(pilot_test.id('subject4'),4,'TEST-401','Other Semester','theory',null),
(pilot_test.id('subject5'),5,'TEST-501','Historical Theory','theory',null);
insert into public.syllabus_units(id,subject_id,unit_no,name) values(pilot_test.id('unit'),pilot_test.id('subject3'),1,'Test Unit');
insert into public.teacher_academic_scopes(teacher_id,batch_id,semester,sections,semester_override) values
(pilot_test.id('teacher'),'2025-29',3,array['A','B','C'],true),
(pilot_test.id('shared'),'2025-29',3,array['A','B','C'],true),
(pilot_test.id('other'),'2024-28',3,array['A','B','C'],false);
insert into public.teacher_assignments(teacher_id,subject_id,batch_id,section,is_lab) values
(pilot_test.id('teacher'),pilot_test.id('subject5'),'2025-29','A',false),
(pilot_test.id('shared'),pilot_test.id('alternate3'),'2025-29','A',false);
insert into public.students(id,name,enrollment_number,section_id) values
(pilot_test.id('legacy'),'Unrelated old student','0131CS251999',pilot_test.id('other-section'));

-- Normal pre-existing teacher is grandfathered only for the current assigned class.
-- OWNER_SETUP_TEST
select pilot_test.check((select semester=3 and sections=array['A']::text[] and not semester_override
 from public.teacher_academic_scopes where teacher_id='11111111-1111-4111-8111-111111111111'),'existing current assignment retains approved access');
set session authorization authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"legacy-teacher@pilot.test","role":"authenticated"}',false);
select public.save_teacher_onboarding('Existing teacher','legacy-teacher@pilot.test','[{"subject_id":"33333333-3333-4333-8333-333333333333","batch_id":"2090-94","section":"A","is_lab":false},{"subject_id":"33333333-3333-4333-8333-333333333333","batch_id":"2090-94","section":"A","is_lab":true}]');
select pilot_test.check(public.can_manage_section('22222222-2222-4222-8222-222222222222'),'normal current-semester onboarding remains usable');
reset session authorization;
update public.batches set current_sem=4 where id='2090-94';
set session authorization authenticated;
select pilot_test.check(not public.can_manage_section('22222222-2222-4222-8222-222222222222'),'normal promotion still invalidates stale assignments');
reset session authorization;

-- SET SESSION AUTHORIZATION mirrors an API caller, including trigger identity checks.
set session authorization authenticated;
select pilot_test.login('teacher');
select public.save_teacher_onboarding('Original teacher','teacher@pilot.test',jsonb_build_array(
 jsonb_build_object('subject_id',pilot_test.id('subject3'),'batch_id','2025-29','section','A','is_lab',false),
 jsonb_build_object('subject_id',pilot_test.id('subject3'),'batch_id','2025-29','section','A','is_lab',true),
 jsonb_build_object('subject_id',pilot_test.id('subject3'),'batch_id','2025-29','section','B','is_lab',false),
 jsonb_build_object('subject_id',pilot_test.id('subject3'),'batch_id','2025-29','section','C','is_lab',false)));
select pilot_test.check((select onboarded from public.teachers where id=pilot_test.id('teacher')),'existing onboarding with theory/lab works');
select pilot_test.check((select current_sem=5 from public.batches where id='2025-29'),'global semester was not changed');
select pilot_test.check((select current_sem=3 from public.get_my_academic_batches() where id='2025-29'),'only approved teaching semester is exposed');
select pilot_test.check((select count(*)=3 from public.get_my_teaching_sections()),'no other semester/batch/department sections leak');
select pilot_test.check((select id='7f3a9cea-bdf2-4300-8645-9237f1b4e342' from public.get_my_teaching_sections() where name='CSE-3A'),'A maps to real UUID');
select pilot_test.check((select id='6ce610f0-2f0c-459e-b55e-f6a900d94852' from public.get_my_teaching_sections() where name='CSE-3B'),'B maps to real UUID');
select pilot_test.check((select id='30311f08-0ed9-4138-a1a2-8f239a5066a6' from public.get_my_teaching_sections() where name='CSE-3C'),'C maps to real UUID');
select pilot_test.check((select count(*)=1 from public.teacher_assignments where teacher_id=pilot_test.id('teacher') and subject_id=pilot_test.id('subject5')),'historical assignment survives onboarding');
select pilot_test.denied($q$select public.save_teacher_onboarding('Corrupted','teacher@pilot.test',jsonb_build_array(jsonb_build_object('subject_id',pilot_test.id('alternate3'),'batch_id','2025-29','section','A','is_lab',false)))$q$,'23505','duplicate subject claim aborts the save');
select pilot_test.check((select count(*)=4 from public.teacher_assignments where teacher_id=pilot_test.id('teacher') and subject_id=pilot_test.id('subject3')),'failed onboarding preserves previous assignments');
select pilot_test.check((select name='Original teacher' and onboarded from public.teachers where id=pilot_test.id('teacher')),'failed onboarding preserves profile/status');
select pilot_test.denied($q$select public.save_teacher_onboarding('Spoof','other@pilot.test','[]')$q$,'42501','onboarding cannot impersonate another email');
select pilot_test.denied($q$insert into public.teachers(id,email,name) values(pilot_test.id('stranger'),'other@pilot.test','Spoof')$q$,'P0001','cannot create another teachers profile');
select pilot_test.denied($q$update public.teacher_academic_scopes set semester=5 where teacher_id=auth.uid()$q$,'42501','teacher cannot grant own scope');
select pilot_test.denied($q$insert into public.teacher_assignments(teacher_id,subject_id,batch_id,section) values(auth.uid(),pilot_test.id('subject3'),'2024-28','A')$q$,'42501','cannot bypass atomic assignment RPC');
select pilot_test.denied($q$select public.save_teacher_onboarding('Spoof','teacher@pilot.test',jsonb_build_array(jsonb_build_object('subject_id',pilot_test.id('subject4'),'batch_id','2025-29','section','A','is_lab',false)))$q$,'42501','unapproved semester assignment is rejected');
select pilot_test.denied($q$select public.import_section_roster(pilot_test.id('other-section'),'[{"enrollment_number":"0131CS251001","name":"Test A"}]')$q$,'42501','cannot import another batch');
select pilot_test.check(public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251001","name":"Test A"}]')->>'inserted'='1','empty A accepts first original CSV');
select public.import_section_roster('6ce610f0-2f0c-459e-b55e-f6a900d94852','[{"enrollment_number":"0131CS251002","name":"Test B"}]');
select public.import_section_roster('30311f08-0ed9-4138-a1a2-8f239a5066a6','[{"enrollment_number":"0131CS251003","name":"Test C"}]');
select pilot_test.check(public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251001","name":"Test A"}]')->>'unchanged'='1','same roster is idempotent');
select pilot_test.denied($q$select public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251010","name":"Would insert"},{"enrollment_number":"0131CS251999","name":"Wrong class"}]')$q$,'23505','mid-import conflict aborts entire transaction');
select pilot_test.check((select count(*)=1 from public.students where section_id='7f3a9cea-bdf2-4300-8645-9237f1b4e342'),'failed import leaves roster unchanged');
select pilot_test.check((select count(*)=0 from public.student_roster where enrollment_number='0131CS251010'),'failed import rolls back allowlist insert');
select pilot_test.denied($q$select public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251010","name":"One"},{"enrollment_number":"0131CS251010","name":"Two"}]')$q$,'P0001','duplicate enrollments rejected server-side');
select pilot_test.denied($q$select public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"INVALID","name":"Bad"}]')$q$,'P0001','invalid enrollment rejected server-side');
select pilot_test.denied($q$select public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[]')$q$,'P0001','empty payload cannot clear a section');
with changed as (update public.students set section_id=pilot_test.id('other-section') where enrollment_number='0131CS251001' returning id) select pilot_test.check((select count(*)=0 from changed),'raw student update is blocked');

insert into public.attendance(student_id,section_id,subject_id,date,time_slot,present,owner_id)
select id,section_id,pilot_test.id('subject3'),current_date,'P1',true,auth.uid() from public.students where enrollment_number='0131CS251001';
select pilot_test.check((select count(*)=1 from public.attendance where section_id='7f3a9cea-bdf2-4300-8645-9237f1b4e342'),'attendance A saves');
select pilot_test.denied($q$insert into public.attendance(student_id,section_id,subject_id,date,time_slot,present,owner_id) select id,'6ce610f0-2f0c-459e-b55e-f6a900d94852',pilot_test.id('subject3'),current_date,'P1',true,auth.uid() from public.students where enrollment_number='0131CS251001'$q$,'42501','A student cannot be marked under B');
insert into public.attendance(student_id,section_id,subject_id,date,time_slot,present,owner_id)
select id,section_id,pilot_test.id('subject3'),current_date,'P1',false,auth.uid() from public.students where enrollment_number='0131CS251002';
select pilot_test.check((select count(*)=1 from public.attendance where section_id='6ce610f0-2f0c-459e-b55e-f6a900d94852'),'attendance B stays separate');
select public.create_quiz_with_questions(jsonb_build_object('unitId',pilot_test.id('unit'),'title','Pilot test quiz','sectionId','7f3a9cea-bdf2-4300-8645-9237f1b4e342','shareToken','pilot-test-token','timeLimitMinutes',15), '[{"text":"Correct option?","options":["wrong","right"],"correctIndex":1,"marks":2}]');
select pilot_test.check((public.set_quiz_target_sections((select id from public.quizzes where share_token='pilot-test-token'),array['7f3a9cea-bdf2-4300-8645-9237f1b4e342','6ce610f0-2f0c-459e-b55e-f6a900d94852','30311f08-0ed9-4138-a1a2-8f239a5066a6']::uuid[])->>'status')='saved','quiz targets assigned A/B/C');
select pilot_test.check(jsonb_array_length(public.list_teacher_sections_for_subject(pilot_test.id('subject3')))=3,'subject section list excludes other semesters');
select pilot_test.check((public.set_quiz_target_sections((select id from public.quizzes where share_token='pilot-test-token'),array[pilot_test.id('sem4-section')])->>'status')='denied','quiz cannot target wrong semester');
select pilot_test.check((select count(*)=3 from public.quiz_target_sections),'denied targeting preserves old quiz targets');
select pilot_test.denied($q$select public.create_quiz_with_questions(jsonb_build_object('unitId',pilot_test.id('unit'),'title','Wrong quiz','sectionId',pilot_test.id('other-section'),'shareToken','wrong-token'),'[{"text":"?","options":["a","b"],"correctIndex":0}]')$q$,'42501','quiz creation rejects other batch');
reset session authorization;

-- Capture student identity before binding and verify history after updates.
create table pilot_test.identities as select id,enrollment_number from public.students;
grant select on pilot_test.identities to authenticated;
set session authorization authenticated;
select pilot_test.login('student-a');
select pilot_test.check(public.request_quiz_access('pilot-test-token','0131CS251001')->>'status'='granted','verified student A accesses quiz');
select pilot_test.check(public.request_quiz_access('pilot-test-token',null)->>'status'='granted','returning registration is idempotent');
select pilot_test.check(public.request_quiz_access('pilot-test-token','0131CS251002')->>'status'='denied','bound student cannot claim another enrollment');
select pilot_test.check(public.start_quiz_attempt((public.request_quiz_access('pilot-test-token',null)->'quiz'->>'id')::uuid)->>'status'='started','server issues attempt session');
-- Students cannot read answer keys; test question IDs are read from the safe access payload.
select pilot_test.check(public.submit_attempt((public.request_quiz_access('pilot-test-token',null)->'quiz'->>'id')::uuid,
 jsonb_build_object((public.request_quiz_access('pilot-test-token',null)->'quiz'->'questions'->0->>'id'),1))->'result'->>'score'='2','grading stays server-side and correct');
select pilot_test.check(public.request_quiz_access('pilot-test-token',null)->>'status'='already-attempted','repeat access returns saved result');
select pilot_test.denied($q$insert into public.quiz_attempts(quiz_id,student_id,answers,score) values(pilot_test.id('fake'),auth.uid(),'{}',100)$q$,'42501','student cannot insert a fabricated score');
select pilot_test.login('student-b');
select pilot_test.check(public.request_quiz_access('pilot-test-token','0131CS251002')->>'status'='granted','student B uses B membership');
select pilot_test.login('student-c');
select pilot_test.check(public.request_quiz_access('pilot-test-token','0131CS251003')->>'status'='granted','student C uses C membership');
select pilot_test.login('unverified');
select pilot_test.check(public.request_quiz_access('pilot-test-token','0131CS251003')->>'reason'='not-authenticated','unverified email cannot register');
select pilot_test.denied($q$select public.save_teacher_onboarding('Unverified','unverified@pilot.test','[]')$q$,'42501','unverified teacher cannot onboard');
select pilot_test.login('stranger');
select pilot_test.check(public.request_quiz_access('pilot-test-token','0131CS251001')->>'status'='denied','another verified email cannot steal a binding');
select pilot_test.denied($q$select public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251020","name":"Fake"}]')$q$,'42501','student cannot impersonate teacher import');
select pilot_test.login('shared');
select pilot_test.check((select count(*)=1 from public.students where enrollment_number='0131CS251001'),'teachers sharing class retain roster reads');
select pilot_test.login('other');
select pilot_test.check((select count(*)=0 from public.students where enrollment_number='0131CS251001'),'unrelated teacher cannot read pilot roster');
select pilot_test.check(public.reset_student_binding('0131CS251001')->>'status'='denied','teacher cannot wipe another teachers registrations/attempts');
select pilot_test.login('teacher');
select pilot_test.denied($q$select public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251001","name":"Rebind","email":"stranger@pilot.test"}]')$q$,'23505','CSV cannot overwrite verified identity binding');
select pilot_test.check(public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251001","name":"Verified name correction"}]')->>'updated'='1','additive roster name correction succeeds');
select pilot_test.check((select st.id=i.id from public.students st join pilot_test.identities i using(enrollment_number) where st.enrollment_number='0131CS251001'),'student ID survives updates');
select pilot_test.check((select count(*)=1 from public.attendance where student_id=(select id from pilot_test.identities where enrollment_number='0131CS251001')),'attendance survives roster updates');
select pilot_test.check((select count(*)=1 from public.quiz_attempts),'quiz attempts survive roster updates');
select pilot_test.check((select email='student-a@pilot.test' from public.student_roster where enrollment_number='0131CS251001'),'CSV without email preserves verified binding');
select pilot_test.check((select count(*)=1 from public.students where enrollment_number='0131CS251002'),'students absent from A CSV remain present');
reset session authorization;

-- An allowlist entry without verified membership must never inherit a quiz target.
insert into public.student_roster(enrollment_number,name) values('0131CS251004','Unmapped legacy entry');
set session authorization authenticated;
select pilot_test.login('stranger');
select pilot_test.check(public.request_quiz_access('pilot-test-token','0131CS251004')->>'reason'='wrong-section','unmapped enrollment cannot inherit the quiz target');
reset session authorization;
select pilot_test.check((select email is null from public.student_roster where enrollment_number='0131CS251004'),'denied quiz membership does not bind an email');
select pilot_test.check((select count(*)=0 from public.students where enrollment_number='0131CS251004'),'denied quiz membership creates no student');

-- Confirm missing student section is recovered ONLY from an owner-imported roster mapping.
update public.students set section_id=null where enrollment_number='0131CS251003';
set session authorization authenticated;
select pilot_test.login('student-c');
select pilot_test.check(public.request_quiz_access('pilot-test-token',null)->>'status'='granted','authoritative roster recovers missing student section');
reset session authorization;
select pilot_test.check((select section_id='30311f08-0ed9-4138-a1a2-8f239a5066a6' from public.students where enrollment_number='0131CS251003'),'section repair uses actual C UUID');
select pilot_test.check((select name='Unrelated old student' from public.students where id=pilot_test.id('legacy')),'unrelated legacy students remain unchanged');
select pilot_test.check(not has_function_privilege('anon','public.import_section_roster(uuid,jsonb)','execute'),'anon cannot execute importer');
select pilot_test.check(not has_function_privilege('anon','public.save_teacher_onboarding(text,text,jsonb)','execute'),'anon cannot execute onboarding');
select pilot_test.check(not has_function_privilege('anon','public.permanently_delete_student(uuid,boolean)','execute'),'November delete RPC hardening retained');
select pilot_test.check(not has_function_privilege('anon','public.create_quiz_with_questions(jsonb,jsonb)','execute'),'November quiz RPC hardening retained');
select pilot_test.check(exists(select 1 from pg_proc where oid='public.normalize_subject_code(text)'::regprocedure and proconfig @> array['search_path=pg_catalog']),'November normalize search_path retained');
-- OWNER_ROLLBACK_TEST
set session authorization authenticated;
select pilot_test.login('teacher');
select pilot_test.check((select count(*)=0 from public.get_my_teaching_sections()),'owner rollback hides pilot current scope');
select pilot_test.denied($q$select public.import_section_roster('7f3a9cea-bdf2-4300-8645-9237f1b4e342','[{"enrollment_number":"0131CS251020","name":"Must not save"}]')$q$,'42501','owner rollback blocks pilot writes');
reset session authorization;
select pilot_test.check((select count(*)=1 from public.quiz_attempts),'rollback preserves existing quiz history');
select format('%s database checks passed',count(*)) from pilot_test.checks;
rollback;
