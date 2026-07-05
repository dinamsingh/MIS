-- ============================================================================
-- Seed (OPTIONAL, one-click): sem4_java_lab_seed
-- Adds the CS-406 Java LAB PROGRAM list as an extra trackable unit.
--
-- Run this ONLY if you also want to track the Java practical programs (not just
-- the theory syllabus). It appends one unit "Lab Programs (Java)" to CS-406 with
-- each program as a topic. Safe & idempotent: skips if that unit already exists.
--
-- Requires: 0018 schema + sem4_syllabus_seed (CS-406 theory units) already run.
-- ============================================================================

do $$
declare
    v_subject uuid;
    v_unit    uuid;
begin
    select id into v_subject from public.syllabus_subjects where code = 'CS-406' limit 1;
    if v_subject is not null
       and not exists (
           select 1 from public.syllabus_units
           where subject_id = v_subject and name = 'Lab Programs (Java)'
       ) then

        insert into public.syllabus_units (subject_id, unit_no, name, sort_order)
        values (v_subject, 6, 'Lab Programs (Java)', 6) returning id into v_unit;

        insert into public.syllabus_topics (unit_id, name, sort_order) values
            (v_unit, 'Installation of J2SDK', 1),
            (v_unit, 'Program to show scope of variables', 2),
            (v_unit, 'Program to show concept of CLASS in Java', 3),
            (v_unit, 'Program to show type casting in Java', 4),
            (v_unit, 'Program to show exception handling in Java', 5),
            (v_unit, 'Program to show inheritance', 6),
            (v_unit, 'Program to show polymorphism', 7),
            (v_unit, 'Program to show access specifiers (public, private, protected)', 8),
            (v_unit, 'Program to show use and advantages of constructor', 9),
            (v_unit, 'Program to show interfacing between two classes', 10),
            (v_unit, 'Program to add a class to a package', 11),
            (v_unit, 'Program to show life cycle of a thread', 12),
            (v_unit, 'Program to demonstrate AWT', 13),
            (v_unit, 'Program to hide a class', 14),
            (v_unit, 'Program to show database connectivity using Java', 15),
            (v_unit, 'Program to show "HELLO JAVA" in explorer using applet', 16),
            (v_unit, 'Program to show connectivity using JDBC', 17),
            (v_unit, 'Program to demonstrate multithreading using Java', 18),
            (v_unit, 'Program to demonstrate applet life cycle', 19),
            (v_unit, 'Program to demonstrate concept of servlet', 20);
    end if;
end $$;
