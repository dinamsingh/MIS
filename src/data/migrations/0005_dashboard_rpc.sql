-- ============================================================================
-- Migration: 0005_dashboard_rpc
-- Single-round-trip dashboard data fetch with semester & section filtering.
-- Total students and metrics aggregate across all sections of the semester.
-- Timetable entries filter by the active selected section.
-- ============================================================================

drop function if exists public.get_dashboard_data(date, date);
drop function if exists public.get_dashboard_data(date, date, text);
drop function if exists public.get_dashboard_data(date, date, text, text);

create or replace function public.get_dashboard_data(
    p_from_date date default (current_date - interval '30 days')::date,
    p_to_date   date default current_date,
    p_semester  text default null,
    p_section   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_is_teacher        boolean := public.is_teacher();
    v_total_students    integer := 0;
    v_avg_attendance    numeric := 0;
    v_avg_internal      numeric := 0;
    v_syllabus_progress numeric := 0;
    v_target_section    uuid;
    v_timetable         jsonb := '[]'::jsonb;
    v_metrics           jsonb := '[]'::jsonb;
    v_trend             jsonb := '[]'::jsonb;
    v_weights           jsonb := jsonb_build_object('internalMarks', 0, 'quizScores', 0, 'attendance', 0);
    v_sem_char          text;
    v_target_sec_name   text;
begin
    -- Only the teacher may read aggregated dashboard data.
    if not v_is_teacher then
        return jsonb_build_object(
            'summary', jsonb_build_object(
                'totalStudents', 0,
                'avgAttendancePercent', 0,
                'avgInternalMarks', 0,
                'syllabusProgressPercent', 0
            ),
            'timetableEntries', '[]'::jsonb,
            'studentMetrics', '[]'::jsonb,
            'attendanceTrend', '[]'::jsonb,
            'weights', v_weights
        );
    end if;

    -- Extract semester number character (e.g. '5' from '5th Semester')
    if p_semester is not null then
        v_sem_char := substring(p_semester from 1 for 1);
        v_target_sec_name := 'CS-' || v_sem_char || coalesce(p_section, 'A');
    end if;

    -- ---- Summary: total students in the selected semester (across all sections) ----
    select count(*) 
    into v_total_students 
    from public.students st
    join public.sections sec on sec.id = st.section_id
    where p_semester is null or sec.name LIKE 'CS-' || v_sem_char || '%';

    -- ---- Summary: average attendance % for the selected semester ----
    select coalesce(
        avg(case when a.present then 100.0 else 0.0 end), 0
    )
    into v_avg_attendance
    from public.attendance a
    join public.subjects sub on sub.id = a.subject_id
    join public.sections sec on sec.id = a.section_id
    where (p_semester is null or sub.semester = p_semester);

    -- ---- Summary: average internal marks for the selected semester ----
    select coalesce(avg(snap), 0)
    into v_avg_internal
    from (
        select distinct on (mv.student_id) mv.internal_marks_snapshot as snap
        from public.mark_values mv
        join public.students st on st.id = mv.student_id
        join public.sections sec on sec.id = st.section_id
        where mv.internal_marks_snapshot is not null
          and (p_semester is null or sec.name LIKE 'CS-' || v_sem_char || '%')
        order by mv.student_id, mv.updated_at desc nulls last
    ) latest;

    -- ---- Summary: syllabus progress % ----
    select coalesce(
        (count(*) filter (where t.complete)::numeric / nullif(count(*), 0)) * 100, 0
    )
    into v_syllabus_progress
    from public.topics t
    join public.units u on u.id = t.unit_id
    join public.subjects sub on sub.id = u.subject_id
    where p_semester is null or sub.semester = p_semester;

    -- ---- Timetable entries for the active section ----
    if p_semester is not null then
        select id into v_target_section 
        from public.sections 
        where name = v_target_sec_name
        limit 1;
    else
        select id into v_target_section 
        from public.sections 
        order by name 
        limit 1;
    end if;

    if v_target_section is not null then
        select coalesce(jsonb_agg(
            jsonb_build_object(
                'id', te.id,
                'sectionId', te.section_id,
                'subjectId', te.subject_id,
                'dayOfWeek', lower(te.day_of_week),
                'timeSlot', te.time_slot
            )
        ), '[]'::jsonb)
        into v_timetable
        from public.timetable_entries te
        where te.section_id = v_target_section;
    end if;

    -- ---- Per-student metrics for all sections of the selected semester ----
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'studentId', st.id,
            'name', st.name,
            'enrollmentNumber', st.enrollment_number,
            'sectionName', sec.name,
            'internalMarks', coalesce(mk.internal_marks, 0),
            'quizScore', coalesce(qz.quiz_avg, 0),
            'attendancePercent', coalesce(att.att_pct, 0)
        )
        order by st.name
    ), '[]'::jsonb)
    into v_metrics
    from public.students st
    join public.sections sec on sec.id = st.section_id
    left join lateral (
        select internal_marks_snapshot as internal_marks
        from public.mark_values mv
        where mv.student_id = st.id
          and mv.internal_marks_snapshot is not null
        order by mv.updated_at desc nulls last
        limit 1
    ) mk on true
    left join lateral (
        select avg(qa.score) as quiz_avg
        from public.quiz_attempts qa
        where qa.student_id = st.id
    ) qz on true
    left join lateral (
        select avg(case when a.present then 100.0 else 0.0 end) as att_pct
        from public.attendance a
        where a.student_id = st.id
    ) att on true
    where p_semester is null or sec.name LIKE 'CS-' || v_sem_char || '%';

    -- ---- Attendance trend for the selected semester ----
    select coalesce(jsonb_agg(
        jsonb_build_object('date', d.date::text, 'percent', d.pct)
        order by d.date
    ), '[]'::jsonb)
    into v_trend
    from (
        select a.date,
               (count(*) filter (where a.present)::numeric / nullif(count(*), 0)) * 100 as pct
        from public.attendance a
        join public.subjects sub on sub.id = a.subject_id
        join public.sections sec on sec.id = a.section_id
        where a.date >= p_from_date and a.date <= p_to_date
          and (p_semester is null or sub.semester = p_semester)
        group by a.date
    ) d;

    -- ---- Leaderboard weights ----
    select jsonb_build_object(
        'internalMarks', coalesce(weight_internal, 0),
        'quizScores', coalesce(weight_quiz, 0),
        'attendance', coalesce(weight_attendance, 0)
    )
    into v_weights
    from public.leaderboard_config
    limit 1;
    v_weights := coalesce(v_weights, jsonb_build_object('internalMarks', 0, 'quizScores', 0, 'attendance', 0));

    return jsonb_build_object(
        'summary', jsonb_build_object(
            'totalStudents', v_total_students,
            'avgAttendancePercent', round(v_avg_attendance, 2),
            'avgInternalMarks', round(v_avg_internal, 2),
            'syllabusProgressPercent', round(v_syllabus_progress, 2)
        ),
        'timetableEntries', v_timetable,
        'studentMetrics', v_metrics,
        'attendanceTrend', v_trend,
        'weights', v_weights
    );
end;
$$;

grant execute on function public.get_dashboard_data(date, date, text, text) to authenticated;
