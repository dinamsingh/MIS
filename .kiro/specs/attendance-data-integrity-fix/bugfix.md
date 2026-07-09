# Bugfix Requirements Document

## Introduction

Attendance module mein 4 critical data-integrity bugs hain jo `docs/ATTENDANCE_FIX_PLAN.md` ke
"PHASE 1 — Data integrity (CRITICAL, do first)" section mein already identify kiye gaye hain
(Fix 1 se Fix 4 tak). Ye sab bugs milke attendance records ko unreliable bana dete hain — same
teacher ko different devices par different data dikh sakta hai, ek accidental click se fake
100% attendance permanently record ho sakta hai, aur unsaved edits kabhi kabhi silently gum ho
jaate hain.

Root cause: `AttendanceStatus` domain type 4 values support karta hai
(`present | absent | leave | not-applicable`), lekin `attendance` table mein sirf `present
boolean` column hai. Leave/N-A status sirf browser `localStorage`
(`mis_attendance_status_v1`, `src/data/access/attendanceAccess.ts`) mein rehta hai, aur save ke
time par un students ke DB rows delete ho jaate hain. Ye 3-step non-atomic save (localStorage
write → upsert → delete) aur do missing UI safety-nets (accidental full-roster save, unsaved
navigation warning) ke saath combine hoke ek data-integrity risk bana deta hai.

Is bugfix ka scope sirf Phase 1 ke Fix 1–4 tak hai:
1. Leave/Not-Applicable status DB mein persist nahi hota (localStorage hack).
2. `saveStatusPeriod` atomic nahi hai (partial-failure risk).
3. Untouched period par Save click karne se accidentally sab students Present save ho jaate hain.
4. Unsaved changes hote hue selector (date/section/subject/timeSlot) change karne par edits
   silently discard ho jaate hain, bina kisi warning ke.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a teacher marks a student as Leave or Not-Applicable and clicks Save THEN the system
    persists that status only in browser localStorage (`mis_attendance_status_v1`) and DELETES
    that student's row from the `attendance` table (`saveStatusPeriod`'s excluded-student delete
    step), so the database no longer has any record of that student's status for that period.

1.2 WHEN the same period is opened on a different device/browser, or after the browser's
    localStorage is cleared, THEN the system shows that student as unmarked (defaulting to
    Present in the UI) instead of showing the previously recorded Leave/Not-Applicable status,
    because the database and the UI disagree on the source of truth.

1.3 WHEN `saveStatusPeriod` runs THEN the system performs three uncoordinated steps — a
    localStorage write, a Supabase upsert of present/absent marks, and a Supabase delete of
    leave/N-A marks — with no transactional guarantee between them, so a network failure between
    any two steps leaves the database and localStorage in mutually inconsistent states.

1.4 WHEN a teacher clicks "Save Attendance" on a period that has no previously saved attendance
    (`hasSavedAttendance === false`) and has not made any changes (`dirty === false`) THEN the
    system saves every roster student as Present with no confirmation, because the roster
    defaults every student's in-memory status to `'present'` regardless of whether the teacher
    touched anything.

1.5 WHEN a teacher changes the date, section, subject, or time-slot selector while there are
    unsaved edits (`dirty === true`) THEN the system silently reloads the newly selected period
    and discards the unsaved edits, with no warning or confirmation shown to the teacher.

### Expected Behavior (Correct)

2.1 WHEN a teacher marks a student as Leave or Not-Applicable and clicks Save THEN the system
    SHALL persist that status directly in the `attendance` table (a `status` column, not
    localStorage), so the row is retrievable from any device/browser and survives a localStorage
    clear.

2.2 WHEN the same period is opened on a different device/browser, or after the browser's
    localStorage is cleared, THEN the system SHALL show each student's Present/Absent/Leave/
    Not-Applicable status exactly as it was last saved to the database.

2.3 WHEN `saveStatusPeriod` runs THEN the system SHALL persist all four status values
    (present/absent/leave/not-applicable) for the period via a single atomic database write
    (one upsert statement / one transaction), such that a network failure during the save leaves
    the database in its prior, unchanged state (no partial writes across some-but-not-all rows).

2.4 WHEN a teacher clicks "Save Attendance" on a period that has no previously saved attendance
    and has not made any changes THEN the system SHALL show a confirmation dialog stating that
    this will record all N students as Present for that date/slot, and SHALL only save after the
    teacher explicitly confirms.

2.5 WHEN a teacher changes the date, section, subject, or time-slot selector while there are
    unsaved edits THEN the system SHALL show a confirmation dialog ("Discard unsaved changes for
    {date} {slot}?" with Discard / Keep editing) and SHALL only reload/discard the period after
    the teacher explicitly chooses to discard; choosing "Keep editing" SHALL leave the selector
    and the in-progress edits unchanged.

2.6 WHEN overall percentage or date-range report tallies are computed after Leave/Not-Applicable
    rows exist as real rows in the `attendance` table THEN the system SHALL count only rows whose
    status is `present` or `absent` toward the total (denominator), excluding leave and
    not-applicable rows, so percentages are not diluted by non-countable periods.

2.7 WHEN the application loads after this fix is deployed and Leave/Not-Applicable marks exist
    only in the legacy `mis_attendance_status_v1` localStorage key THEN the system SHALL perform
    a one-time import of those marks into the database and then remove the legacy key, so
    previously recorded Leave/Not-Applicable marks are not lost during the transition.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a teacher marks a student as Present or Absent (mouse click, quick-mark, or bulk action)
    and saves THEN the system SHALL CONTINUE TO persist and retrieve that status correctly, and
    the `present` boolean column SHALL CONTINUE TO stay in sync (`present = true` iff
    `status = 'present'`) for downstream readers (dashboard RPCs, heatmap, leaderboard).

3.2 WHEN a teacher clicks "Save Attendance" on a period where `dirty === true` (an explicit mark,
    quick-mark, or bulk action was made) THEN the system SHALL CONTINUE TO save directly without
    any extra confirmation dialog — the accidental-save guard (2.4) applies only to the untouched,
    `dirty === false` case.

3.3 WHEN a teacher changes the date, section, subject, or time-slot selector while there are NO
    unsaved edits (`dirty === false`) THEN the system SHALL CONTINUE TO switch periods immediately
    without any confirmation prompt.

3.4 WHEN dashboard RPCs, heatmap, and leaderboard features read `attendance.present` for
    Present/Absent rows THEN the system SHALL CONTINUE TO receive the same present/absent values
    as before this fix, for all periods that contain no Leave/Not-Applicable marks.

3.5 WHEN quick-mark (present-list paste) and bulk-action (P/A keyboard shortcuts) features are
    used THEN the system SHALL CONTINUE TO behave exactly as before — matching, ambiguous-token
    handling, and visual feedback SHALL remain unaffected by this fix.

3.6 WHEN a teacher loads a period that has previously saved Present/Absent-only attendance (no
    Leave/N-A involved) THEN the system SHALL CONTINUE TO show `hasSavedAttendance === true` and
    the same saved statuses as before.
