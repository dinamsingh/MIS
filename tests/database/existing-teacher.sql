-- Existing, correctly configured normal teacher BEFORE the new migrations.
insert into auth.users(id,email,email_confirmed_at)
values('11111111-1111-4111-8111-111111111111','legacy-teacher@pilot.test',now());
insert into public.allowed_teacher_emails(email) values('legacy-teacher@pilot.test');
insert into public.teachers(id,email,name,onboarded)
values('11111111-1111-4111-8111-111111111111','legacy-teacher@pilot.test','Existing teacher',true);
insert into public.batches(id,start_year,current_sem,status) values('2090-94',2090,3,'classes');
insert into public.sections(id,name,batch,semester,department)
values('22222222-2222-4222-8222-222222222222','CSE-3A','2090-94','3rd Semester','CSE');
insert into public.syllabus_subjects(id,sem,code,name,kind,lab_name)
values('33333333-3333-4333-8333-333333333333',3,'TEST-LEGACY','Existing subject','theory','Existing lab');
insert into public.teacher_assignments(teacher_id,subject_id,batch_id,section)
values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','2090-94','A');
