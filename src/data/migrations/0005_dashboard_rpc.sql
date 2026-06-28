-- ============================================================================
-- Migration: 0005_dashboard_rpc
-- Single-round-trip dashboard data fetch.
--
-- Replaces ~45 separate client queries (especially the N+1 student-metrics
-- loop) with ONE RPC that returns all dashboard data as a single JSON object.
--
-- Security: SECURITY DEFINER + an is_teacher() guard so only the teacher can
-- read the aggregated data. Returns an empty/zeroed payload for non-teachers
-- rather than leaking rows.
-- ============================================================================

create or replace function public.get_dashboard_data(
    p_from_date date default (current_date - interval '30 days')::date,
    p_to_date   date default current_date
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
    v_first_section     uuid;
    v_timetable         jsonb := '[]'::jsonb;
    v_metrics           jsonb := '[]'::jsonb;
    v_trend             jsonb := '[]'::jsonb;
    v_weights           jsonb := jsonb_build_object('internalMarks', 0, 'quizScores', 0, 'attendance', 0);
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

    -- ---- Summary: total students ----
    select count(*) into v_total_students from public.student_roster;

    -- ---- Summary: average attendance % (present / total * 100) ----
    select coalesce(
        avg(case when present then 100.0 else 0.0 end), 0
    )
    into v_avg_attendance
    from public.attendance;

    -- ---- Summary: average internal marks (latest snapshot per student) ----
    select coalesce(avg(snap), 0)
    into v_avg_internal
    from (
        select distinct on (student_id) internal_marks_snapshot as snap
        from public.mark_values
        where internal_marks_snapshot is not null
        order by student_id, updated_at desc nulls last
    ) latest;

    -- ---- Summary: syllabus progress % (completed topics / total topics) ----
    select coalesce(
        (count(*) filter (where complete)::numeric / nullif(count(*), 0)) * 100, 0
    )
    into v_syllabus_progress
    from public.topics;

    -- ---- Timetable entries for the first section ----
    select id into v_first_section from public.sections order by name limit 1;

    if v_first_section is not null then
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
        where te.section_id = v_first_section;
    end if;

    -- ---- Per-student metrics (one set-based query, no N+1) ----
    select coalesce(jsonb_agg(
        jsonb_build_object(
            'studentId', sr.id,
            'name', sr.name,
            'internalMarks', coalesce(mk.internal_marks, 0),
            'quizScore', coalesce(qz.quiz_avg, 0),
            'attendancePercent', coalesce(att.att_pct, 0)
        )
        order by sr.name
    ), '[]'::jsonb)
    into v_metrics
    from public.student_roster sr
    -- latest internal marks snapshot per student
    left join lateral (
        select internal_marks_snapshot as internal_marks
        from public.mark_values mv
        join public.students st on st.id = mv.student_id
        where lower(st.email) = lower(sr.email)
          and mv.internal_marks_snapshot is not null
        order by mv.updated_at desc nulls last
        limit 1
    ) mk on true
    -- average quiz score per student
    left join lateral (
        select avg(qa.score) as quiz_avg
        from public.quiz_attempts qa
        join public.students st on st.id = qa.student_id
        where lower(st.email) = lower(sr.email)
    ) qz on true
    -- attendance percent per student
    left join lateral (
        select avg(case when a.present then 100.0 else 0.0 end) as att_pct
        from public.attendance a
        join public.students st on st.id = a.student_id
        where lower(st.email) = lower(sr.email)
    ) att on true;

    -- ---- Attendance trend (daily % within the date range) ----
    select coalesce(jsonb_agg(
        jsonb_build_object('date', d.date::text, 'percent', d.pct)
        order by d.date
    ), '[]'::jsonb)
    into v_trend
    from (
        select date,
               (count(*) filter (where present)::numeric / nullif(count(*), 0)) * 100 as pct
        from public.attendance
        where date >= p_from_date and date <= p_to_date
        group by date
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

    -- ---- Assemble the single payload ----
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

-- Allow signed-in users to call it; the internal is_teacher() guard restricts data.
grant execute on function public.get_dashboard_data(date, date) to authenticated;
