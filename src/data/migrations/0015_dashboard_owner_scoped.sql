-- ============================================================================
-- Migration: 0015_dashboard_owner_scoped
-- Make the dashboard RPC owner-aware for the per-teacher isolation model (0014).
--
-- Why
-- ---
-- get_dashboard_data() runs SECURITY DEFINER and therefore bypasses RLS. After
-- 0014, operational data (attendance, marks, timetable, syllabus, quiz results)
-- is private per teacher via owner_id. The RPC must reproduce that boundary
-- itself, otherwise it would mix every teacher's records together.
--
-- What stays shared vs private
-- ----------------------------
--   SHARED : the roster — total students in the section and the student list
--            come from public.students (common to all teachers).
--   PRIVATE: every teaching metric for those students — attendance %, internal
--            marks, quiz averages, timetable, syllabus progress — is filtered to
--            the CALLING teacher's rows via `owner_id = auth.uid()`.
--
-- Net effect: a teacher sees all students of the selected section, but each
-- student's attendance/marks/quiz numbers reflect only that teacher's records.
--
-- Signature unchanged: get_dashboard_data(date, date, text, uuid).
-- ============================================================================

create or replace function public.get_dashboard_data(
    p_from_date  date default (current_date - interval '30 days')::date,
    p_to_date    date default current_date,
    p_semester   text default null,
    p_section_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid               uuid := auth.uid();
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
begin
    -- Only a teacher may read aggregated dashboard data.
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

    -- ---- Summary: total students (SHARED roster) in the selected section ----
    select count(*)
    into v_total_students
    from public.students st
    join public.sections sec on sec.id = st.section_id
    where (p_section_id is not null and st.section_id = p_section_id)
       or (p_section_id is null and (p_semester is null or sec.semester = p_semester));

    -- ---- Summary: average attendance % (PRIVATE: this teacher's records) ----
    select coalesce(avg(case when a.present then 100.0 else 0.0 end), 0)
    into v_avg_attendance
    from public.attendance a
    join public.subjects sub on sub.id = a.subject_id
    where a.owner_id = v_uid
      and ((p_section_id is not null and a.section_id = p_section_id)
        or (p_section_id is null and (p_semester is null or sub.semester = p_semester)));

    -- ---- Summary: average internal marks (PRIVATE: this teacher's records) ----
    select coalesce(avg(snap), 0)
    into v_avg_internal
    from (
        select distinct on (mv.student_id) mv.internal_marks_snapshot as snap
        from public.mark_values mv
        join public.students st on st.id = mv.student_id
        join public.sections sec on sec.id = st.section_id
        where mv.owner_id = v_uid
          and mv.internal_marks_snapshot is not null
          and ((p_section_id is not null and st.section_id = p_section_id)
            or (p_section_id is null and (p_semester is null or sec.semester = p_semester)))
        order by mv.student_id, mv.updated_at desc nulls last
    ) latest;

    -- ---- Summary: syllabus progress % (PRIVATE: this teacher's syllabus) ----
    select coalesce(
        (count(*) filter (where t.complete)::numeric / nullif(count(*), 0)) * 100, 0
    )
    into v_syllabus_progress
    from public.topics t
    join public.units u on u.id = t.unit_id
    join public.subjects sub on sub.id = u.subject_id
    where t.owner_id = v_uid
      and ((p_section_id is not null and sub.id in (
              select distinct te.subject_id
              from public.timetable_entries te
              where te.section_id = p_section_id
                and te.owner_id = v_uid
          ))
       or (p_section_id is null and (p_semester is null or sub.semester = p_semester)));

    -- ---- Timetable entries for the active section (PRIVATE to this teacher) ----
    if p_section_id is not null then
        v_target_section := p_section_id;
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
        where te.section_id = v_target_section
          and te.owner_id = v_uid;
    end if;

    -- ---- Per-student metrics: students SHARED, their numbers PRIVATE ----
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
          and mv.owner_id = v_uid
          and mv.internal_marks_snapshot is not null
        order by mv.updated_at desc nulls last
        limit 1
    ) mk on true
    left join lateral (
        select avg(qa.score) as quiz_avg
        from public.quiz_attempts qa
        where qa.student_id = st.id
          and exists (
              select 1 from public.quizzes q
              where q.id = qa.quiz_id and q.owner_id = v_uid
          )
    ) qz on true
    left join lateral (
        select avg(case when a.present then 100.0 else 0.0 end) as att_pct
        from public.attendance a
        where a.student_id = st.id
          and a.owner_id = v_uid
    ) att on true
    where (p_section_id is not null and st.section_id = p_section_id)
       or (p_section_id is null and (p_semester is null or sec.semester = p_semester));

    -- ---- Attendance trend (PRIVATE: this teacher's records) ----
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
        where a.owner_id = v_uid
          and a.date >= p_from_date and a.date <= p_to_date
          and ((p_section_id is not null and a.section_id = p_section_id)
            or (p_section_id is null and (p_semester is null or sub.semester = p_semester)))
        group by a.date
    ) d;

    -- ---- Leaderboard weights (PRIVATE: this teacher's config) ----
    select jsonb_build_object(
        'internalMarks', coalesce(weight_internal, 0),
        'quizScores', coalesce(weight_quiz, 0),
        'attendance', coalesce(weight_attendance, 0)
    )
    into v_weights
    from public.leaderboard_config
    where owner_id = v_uid
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

grant execute on function public.get_dashboard_data(date, date, text, uuid) to authenticated;
