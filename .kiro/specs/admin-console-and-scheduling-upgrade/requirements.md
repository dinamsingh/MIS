# Requirements Document

## Introduction

Ye feature MIS application mein ek naya `admin` role add karta hai aur ek Admin Console banata hai, jisse project owner ko roz-roz ke operational kaam (teacher approve karna, naya session/batch/roster banana, batch promote karna) ke liye Supabase SQL Editor mein manually jaana na pade. Saath mein Timetable module ka overhaul bhi hai, jisse timetable college ke real fixed-period schedule jaisa dikhe aur Attendance page ka time-slot selector timetable se hi derive ho (abhi wo ek hardcoded generic list use karta hai jo timetable se disconnected hai).

Kaam 4 phases mein deliver hoga, har phase apne aap mein complete/shippable hai:

- **Phase 1 — Admin role foundation**: naya `admin` role, admin add/remove, teacher-allowlist management UI se, aur delegated "extra powers" jo admin kisi teacher ko de sake.
- **Phase 2 — Admin bulk roster/session import**: admin ek naya session (batch + sections + roster) bana sake, bulk CSV import kare (email required), student remove/delete kare, aur duplicate subject-section assignment safeguard.
- **Phase 3 — Batch promotion & academic history**: single batch ko next semester promote karna, stale assignment handling, aur teacher ke liye read-only "Teaching History" page.
- **Phase 4 — Timetable overhaul**: fixed college-wide periods, multi-period lab spanning, room/tutorial/activity fields, draft/confirmed lock mechanism, unified "My Schedule" view, cross-batch conflict detection, aur Attendance integration.

Admin aur Teacher dono independent roles hain — ek identity dono role hold kar sakti hai, ya sirf ek, ya koi nahi. Admin banne se teacher capability nahi milti aur teacher banne se admin capability nahi milti.

Har naya RPC jo admin ya delegated-power-wala teacher call karega, wo `SECURITY DEFINER` hoga aur caller ka admin-status ya specific delegated permission server-side explicitly verify karega — jaisa existing `add_allowed_teacher()` / `is_teacher()` pattern already karta hai. RLS hi authorization ka authoritative boundary rahega; koi existing teacher/student RLS policy weaken nahi hogi, sirf naye additive checks add honge.

**Explicitly out of scope (in this spec mein include nahi karna):**
- Student login/password system ya student "my quizzes across subjects" dashboard.
- Admin-side timetable bulk-upload with automatic name/email matching (auto-populate `teacher_assignments`) — user ne explicitly "skip for now, baad mein karenge" bola hai.
- Teacher ya student ke existing auth method (email-OTP+password / email-OTP) mein koi change.
- Existing teacher/student RLS boundaries mein koi change (sirf naye admin/extra-power checks add honge).
- Kisi bhi normal admin action se historical academic records ka hard-delete — soft-remove/preserve-history hamesha default rahega.

## Glossary

- **System**: MIS web application (React/Vite frontend + Supabase backend), poore ke poore.
- **Admin**: Ek signed-in identity jiska email `Admins_Table` mein maujood hai; iske paas administrative capabilities hain, independent of us identity ke Teacher/Student role se.
- **Teacher**: Ek signed-in identity jiski `public.teachers` mein row hai, existing onboarding wizard se onboard hui, `Allowed_Teacher_Emails` se gated.
- **Student**: Ek signed-in identity jo shareable quiz links access karti hai, `public.student_roster` / `public.students` ke against authorize hoti hai.
- **Admins_Table**: Naya `public.admins` table, email-keyed, `Allowed_Teacher_Emails` jaisa shape (email, `added_by`, `created_at`) — har admin-capability-wali identity ki list.
- **Allowed_Teacher_Emails**: Existing `public.allowed_teacher_emails` table jo teacher onboarding ko gate karta hai.
- **Get_My_Role**: Existing `get_my_role()` `SECURITY DEFINER` RPC jo abhi `'teacher' | 'pending-teacher' | 'none'` return karta hai — ye feature isme `'admin'` outcome extend karega.
- **Admin_Console**: Naya Admin-only application navigation section aur uske pages.
- **Extra_Power**: Ek specific, individually toggle-able capability jo Admin kisi ek naam-liye Teacher ko de sakta hai (Admin bane bagair). Is feature mein sirf do Extra_Power define hain: `cross_section_visibility` aur `teacher_allowlist_approval`.
- **Teacher_Extra_Powers**: Table/record jo store karta hai kis Teacher ke paas kaunsa Extra_Power flag active hai, `granted_by` aur `created_at` ke saath.
- **Batch**: `public.batches` ki ek row — ek admitted intake, `id` (e.g. `2026-30`), `start_year`, `current_sem` (1-8), `status` (`classes` | `exams` | `graduated`).
- **Session_Creation_Flow**: Naya Admin-only flow jisse ek Batch ke sections banate hain aur unka roster import karte hain, ek semester ke liye.
- **Section**: Existing shared `public.sections` table ki ek row — ek physical group of students (e.g. Section A); kisi ek Teacher ki nahi, sabhi Teachers ke beech shared.
- **Syllabus_Subjects**: Existing master-syllabus table (`public.syllabus_subjects`), `sem` se keyed, har semester ke offered subjects.
- **Student_Roster**: `public.students` aur `public.student_roster` rows ka combination jo batata hai kaun-se students kis Section ke hain aur kaunse email/enrollment pairs authorized hain.
- **Roster_Import**: Bulk CSV ya single-row process jo ek Section ke liye Student_Roster/`students` rows banata hai — existing `rosterImportAccess.ts` / `parseRosterCsv` logic reuse karta hai.
- **Teacher_Assignment**: `public.teacher_assignments` ki ek row (teacher, subject, batch, section, is_lab) — onboarding ya "My Teaching Subjects" se banti hai, ek Teacher ka ek subject ek section ek batch padhaane ka claim.
- **My_Teaching_Subjects**: Existing subject/section picker (`ProfilePage.tsx`) jisse onboarded Teacher live batches ke liye Teacher_Assignment rows banata hai.
- **Stale_Assignment**: Ek Teacher_Assignment jiska `subject_id` us semester ka hai jise us Assignment ka Batch already promote karke aage nikal gaya hai.
- **Teaching_History_View**: Naya read-only page jahan Teacher apne past-semester aur past-(graduated)-batch records (attendance, marks, quiz results) dekh sakta hai.
- **Timetable_Entry**: `public.timetable_entries` ki ek row — ek Teacher ke ek Section/subject ka scheduled session, ek din aur period ke liye.
- **Period**: Ek fixed, college-wide time slot daily schedule mein (Period I se Period VII tak), fixed start/end time ke saath, pure department mein shared.
- **Period_Catalog**: Fixed, ordered list of Periods (lunch break aur alag Saturday block including) jisse Teacher select karega, free-text time type karne ke bajaye.
- **Timetable_Status**: Ek Teacher ke ek Section ke timetable ka `draft` ya `confirmed` state — controls karta hai ki Attendance us Section ke scheduled periods use kar sakta hai ya nahi.
- **My_Schedule_View**: Naya unified weekly grid jo Teacher ke saare Teacher_Assignment (sabhi Batch/Section/subject combinations) ek jagah dikhata hai.
- **Attendance_Module**: Existing `AttendancePage.tsx` / `AttendanceView.tsx` component, jiska time-slot selector ye feature change karta hai taaki wo confirmed Timetable_Entry set se derive ho.
- **RLS**: Row Level Security — PostgreSQL policies jo row access ko role/ownership ke hisaab se restrict karti hain.
- **Security_Definer_RPC**: Ek Postgres function jo apne owner ke privileges se chalta hai (caller ke nahi), taaki Admin/delegated actions wo rows read/write kar sake jo caller ki apni RLS block kar degi — authorization check function body ke andar hi enforce hota hai.

## Requirements

## Phase 1 — Admin Role Foundation

### Requirement 1: Admin Role aur Bootstrap

**User Story:** Project owner ke roop mein, main chahta hoon ek alag Admin role ho jo bina ongoing developer involvement ke grant/manage ho sake, taaki pehla admin ban jaane ke baad admin-related kaam database access pe depend na kare.

#### Acceptance Criteria

1. THE System SHALL `admin` ko `teacher` aur `student` se ek distinct role maane — kisi identity ko Admin capability dene se us identity ko Teacher ya Student capability NAHI milegi, aur Teacher/Student capability dene se Admin capability NAHI milegi.
2. THE System SHALL Admin eligibility ko email-keyed `Admins_Table` mein store kare, `Allowed_Teacher_Emails` jaisi shape (email, `added_by`, `created_at`) ke saath.
3. THE System SHALL pehle Admin row ko sirf ek one-time manual SQL statement se insert karne ki requirement rakhe, aur is bootstrap step ko documentation mein likhe — iske liye in-application UI path NAHI banega (chicken-and-egg problem, unavoidable).
4. WHEN kam se kam ek Admin row already exist karta hai, THE Admin_Console SHALL ek signed-in Admin ko bina further manual SQL ke kisi doosri identity ka email Admin ke roop mein add karne de.
5. WHEN ek signed-in Admin doosre Admin ki row remove karta hai, THE System SHALL us identity ki Admin capability immediately revoke kare.
6. IF ek Admin apni khud ki Admin row remove karne ki koshish karta hai jab wo `Admins_Table` mein akeli remaining row hai, THEN THE System SHALL is removal ko server-side reject kare aur ek message dikhaye jo explain kare ki kam se kam ek Admin hamesha rehna zaroori hai.
7. IF documented bootstrap SQL ke alawa kisi bhi path se last remaining `Admins_Table` row delete karne ki koshish hoti hai, THEN THE System SHALL is request ko database-level check (trigger ya Security_Definer_RPC) se reject kare, sirf client-side validation se nahi. Ye database-level protection normal operation ke dauraan hamesha active rahegi (sirf documented one-time bootstrap SQL step exempt hai).
8. THE Get_My_Role RPC SHALL `'admin'` return kare jab caller ka email `Admins_Table` mein maujood ho, existing `'teacher' | 'pending-teacher' | 'none'` outcomes ke additional.
9. WHEN kisi signed-in identity ka resolved role `'admin'` include karta hai, THE System SHALL application navigation mein ek "Admin" section dikhaye.
10. IF kisi signed-in identity ka resolved role `'admin'` include nahi karta, THEN THE System SHALL Admin navigation section NAHI dikhaye aur koi bhi Admin-only route render NAHI kare.

### Requirement 2: Teacher Approval Management (UI se)

**User Story:** Admin ke roop mein, main teacher-allowlist manage karna chahta hoon aur onboarding status dekhna chahta hoon UI se, taaki naye teacher approve karne ke liye SQL Editor access ki zaroorat na pade.

#### Acceptance Criteria

1. WHEN Admin teacher-approval page kholta hai, THE Admin_Console SHALL `Allowed_Teacher_Emails` ki har entry dikhaye.
2. WHEN Admin ek naya email allow karne ke liye submit karta hai, THE Admin_Console SHALL use existing `add_allowed_teacher()` RPC ke through `Allowed_Teacher_Emails` mein add kare.
3. WHEN Admin allowlist se ek email remove karta hai, THE Admin_Console SHALL corresponding `Allowed_Teacher_Emails` row ko ek naye Security_Definer_RPC ke through delete kare, jo Admin (ya delegated `teacher_allowlist_approval` Extra_Power) authorization require kare.
4. IF Admin status ya `teacher_allowlist_approval` Extra_Power ke bagair koi caller allowlist-add ya allowlist-remove RPC invoke karta hai, THEN THE System SHALL request deny kare. THE Admin_Console SHALL bhi UI level par ye permission check kare aur allowlist-add/remove control ko un users ke liye disable/hide kare jinke paas Admin status ya `teacher_allowlist_approval` Extra_Power nahi hai — sirf server-side deny par hi depend nahi karega.
5. WHEN Admin teacher-approval page kholta hai, THE Admin_Console SHALL `public.teachers` ki har row uske onboarded status, email, aur name ke saath dikhaye, aur onboarded Teachers ko sirf-allowlisted-abhi-not-onboarded emails se distinguish kare.
6. THE teacher-approval page SHALL `public.teachers` ke respect mein read-only rahe — kisi Teacher ka profile row directly edit karne ka control nahi dega.

### Requirement 3: Delegated Extra Powers

**User Story:** Admin ke roop mein, main individual teachers ko specific extra capabilities dena chahta hoon (unhe full admin banaye bagair), taaki trusted teachers narrow operational tasks mein help kar sakein jabki har doosra teacher default, unprivileged access rakhe.

#### Acceptance Criteria

1. THE System SHALL har Extra_Power ko ek independently-toggleable flag ke roop mein model kare, jo ek specific Teacher se scoped ho — ek Teacher ko flag grant karna kisi doosre Teacher ko affect NAHI karega.
2. THE System SHALL kam se kam ye do Extra_Power support kare: `cross_section_visibility` (dusre teachers ke sections bhi dekhne ki visibility) aur `teacher_allowlist_approval` (Requirement 2 ke allowlist add/remove RPCs call karne ki authority).
3. WHERE kisi Teacher ko koi Extra_Power grant nahi hui hai, THE System SHALL by default us Teacher ko koi extra capability na maane.
4. WHEN Admin kisi Teacher ko Extra_Power grant karta hai, THE System SHALL resulting `Teacher_Extra_Powers` row par `granted_by` (granting Admin ki identity) aur `created_at` (grant timestamp) record kare.
5. WHEN Admin kisi Teacher se pehle-grant-ki-hui Extra_Power revoke karta hai, THE System SHALL us Teacher ka flag immediately remove/deactivate kare.
6. IF koi Teacher khud ke liye ya doosre Teacher ke liye koi Extra_Power grant/revoke karne ki koshish karta hai, THEN THE System SHALL request deny kare — sirf Admin hi Extra_Power grant/revoke kar sakta hai.
7. WHEN `cross_section_visibility` Extra_Power wala Teacher doosre teachers ke sections/students data dekhta hai, THE System SHALL is access ko delegated flag ke through authorize kare, Admin status require kiye bagair. Ye access silent rahega — System kisi bhi audit log ya original Teacher ko notification generate NAHI karega jab uska data cross_section_visibility ke through dekha jaaye.

### Requirement 4: Admin Console Boundaries (Out of Scope Guardrails)

**User Story:** Project owner ke roop mein, main Admin Console par firm boundaries chahta hoon, taaki Admin capability kabhi bhi silently kisi Teacher/Student ke data ko alter ya impersonate na kar sake.

#### Acceptance Criteria

1. THE Admin_Console SHALL kisi bhi Teacher ya Student ke liye generic "edit as this user" capability NAHI degi.
2. THE Admin_Console SHALL kisi Teacher ke attendance records, marks records, ya quiz content ka direct in-place editing NAHI degi.
3. THE Admin_Console SHALL koi bhi control expose NAHI karegi jo arbitrary ya raw SQL statement run kare.
4. THE Admin_Console SHALL koi bhi control expose NAHI karegi jo database migration execute kare.
5. THE Admin_Console SHALL is document mein explicitly define kiye gaye actions ke alawa (jaise Requirement 8 ka roster remove/delete) koi bulk-delete control expose NAHI karegi.

## Phase 2 — Admin Bulk Roster/Session Import

### Requirement 5: New Session Creation Flow

**User Story:** Admin ke roop mein, main ek naya academic session — batch, sections aur roster — ek hi guided flow mein create karna chahta hoon, taaki naya intake bina manual database inserts ke provision ho sake.

#### Acceptance Criteria

1. WHEN Admin Session_Creation_Flow start karta hai, THE Admin_Console SHALL ek Batch code, Odd/Even semester type, aur semester number ke liye prompt kare.
2. WHEN Admin ek semester number select karta hai, THE Session_Creation_Flow SHALL Syllabus_Subjects se us semester ke subjects ki candidate list auto-populate kare, bina Admin ko subject data phir se enter karaye.
3. WHEN Admin Batch ke liye sections ki sankhya define karta hai, THE Session_Creation_Flow SHALL corresponding rows existing shared `public.sections` table mein create kare. IF Admin sections ki sankhya `0` define karta hai, THEN THE Session_Creation_Flow SHALL koi Section row create NAHI kare aur Batch ko bina sections ke create hone de.
4. THE Session_Creation_Flow SHALL sections ko existing shared-sections model ke consistent shared rows ke roop mein create kare, aur kisi Section ka per-Teacher ownership introduce NAHI karega. IF creation ke dauraan koi bhi per-Teacher ownership assignment detect hota hai (chahe existing code path se ya database constraint se), THEN THE Session_Creation_Flow SHALL poori session-creation operation ko fail kare aur koi partial Section row commit NAHI kare.
5. WHEN Admin Session_Creation_Flow ko ek aisa Batch code de kar submit karta hai jo already exist karta hai, THEN THE Admin_Console SHALL duplicate batch code ko reject kare aur ek message dikhaye jo conflict identify kare.

### Requirement 6: Bulk Roster Import Per Section (Admin-Initiated)

**User Story:** Admin ke roop mein, main ek section ka roster bulk-import karna chahta hoon jisme student email hamesha required ho, taaki 200+ students ko immediate, correctly-bound access mile bina baad mein verification step ke.

#### Acceptance Criteria

1. WHEN Admin ek Section ke liye roster CSV import karta hai, THE Roster_Import SHALL har row mein enrollment number, name, aur email — teenon — required kare.
2. IF ek uploaded roster row mein email missing hai, THEN THE Roster_Import SHALL us row ko reject kare aur ek validation message dikhaye jo row aur missing field identify kare.
3. WHEN ek roster row ka email accept hota hai, THE Roster_Import SHALL us email ko student ki access se immediately bind kare, taaki student ka pehla quiz-link click bina kisi first-time enrollment-verification step ke access de de (existing "Case 1" binding behavior reuse hoga).
4. THE Roster_Import SHALL Admin-driven entry point se existing CSV-parsing aur validation logic (`rosterImportAccess.ts`, `parseRosterCsv`) reuse kare — naya parser nahi banega.
5. WHEN Admin ek single student manually add karta hai (enrollment number, name, email ke saath), THE Admin_Console SHALL us student ka Student_Roster entry create kare, CSV import ka ek alternative path ke roop mein.
6. IF uploaded roster row ka enrollment number existing enrollment-number format (`^[0-9]{4}[A-Z]{2}[0-9]{6}$`) follow nahi karta, THEN THE Roster_Import SHALL us row ko reject kare aur row aur format-violation identify karne wala message dikhaye.
7. THE Roster_Import SHALL ye behavior NAHI change kare un students ke liye jinka email import ke waqt provide nahi hua tha — wo students existing enrollment/verification flow se hi apni pehli identity-requiring access ke waqt guzarenge.

### Requirement 7: Teacher Pickup of Admin-Provisioned Roster

**User Story:** Teacher ke roop mein, main chahta hoon ki admin-created ek naye section ka roster already wahan ho jab main use My_Teaching_Subjects mein claim karoon, taaki mujhe kabhi student list phir se enter na karni pade.

#### Acceptance Criteria

1. WHEN Teacher My_Teaching_Subjects mein ek batch/section/subject combination select karta hai jo Admin ne Session_Creation_Flow aur Roster_Import se already provision kar diya hai, THE System SHALL us Section ka already-imported Student_Roster Teacher ko immediately dikhaye, bina Teacher se koi student-list data entry require kiye. Ye display Requirement ke boojh se independent hai — agar kisi doosre flow mein Section ke liye roster abhi bhi partially manual entry require karta hai, to bhi already-imported roster (jo import ho chuka hai) dikhana jaari rahega.
2. THE System SHALL naye admin-created section ko koi specific Teacher automatically assign NAHI kare — section/roster shared model (existing migration 0014 pattern) mein hi rahega, jab tak koi Teacher use My_Teaching_Subjects se pick nahi karta.

### Requirement 8: Student Removal — Roster Remove vs Permanent Delete

**User Story:** Admin ke roop mein, main student ko section ke active roster se remove karna chahta hoon while historical records preserve karte hue, taaki roz-marra roster cleanup kabhi bhi silently attendance/marks/quiz history destroy na kare.

#### Acceptance Criteria

1. WHEN Admin ek student par "remove from roster" perform karta hai, THE System SHALL us student ki future visibility aur access Section ke liye remove kare, bina student ke historical attendance, marks, ya quiz-attempt records delete kiye.
2. THE "remove from roster" action SHALL roster entry ke liye offered default removal action ho.
3. THE "permanently delete" action SHALL "remove from roster" se clearly separate dikhaya jaaye aur execute hone se pehle ek explicit additional confirmation step require kare.
4. WHEN Admin "permanently delete" ke liye confirm karta hai, THE System SHALL delete execute hone se pehle ek warning dikhaye ki action destructive hai aur student ke records ke historical foreign-key references toot sakte hain.
5. IF Admin additional confirmation step ko dismiss ya cancel karta hai, THEN THE System SHALL student record delete NAHI kare.

### Requirement 9: Duplicate Subject-Section Assignment Safeguard

**User Story:** Admin ya Teacher ke roop mein, main chahta hoon system do alag teachers ko same subject+section claim karne se roke, taaki ek class ka ownership hamesha unambiguous rahe.

#### Acceptance Criteria

1. IF ek Teacher ek (subject, section, batch) combination ke liye Teacher_Assignment create karne ki koshish karta hai jo already ek doosre Teacher ne claim kar li hai, THEN THE System SHALL save block kare aur ek message dikhaye jo bataye ki ye combination already assigned hai.
2. THE duplicate-assignment block SHALL My_Teaching_Subjects se aur kisi bhi Admin-driven assignment path se, dono jagah equally apply ho.
3. Duplicate-assignment block wala message SHALL doosre Teacher ki identity reveal karna required NAHI ho.
4. WHEN do alag Teachers same Section aur Batch ke liye do alag subjects par Teacher_Assignment banate hain, THE System SHALL dono assignments ko save hone de.
5. THE System SHALL duplicate-assignment safeguard ko database level par enforce kare (uniqueness/exclusion constraint ya equivalent server-side check) — sirf client-side validation se nahi.

## Phase 3 — Batch Promotion & Academic History

### Requirement 10: Individual Batch Promotion

**User Story:** Admin ke roop mein, main ek time mein ek batch ko next semester promote karna chahta hoon, taaki jo batches alag-alag real-world time par apna promotion point reach karti hain unhe independently advance kiya ja sake.

#### Acceptance Criteria

1. WHEN Admin ek Batch promote karta hai jiska `current_sem` 8 se kam hai, THE System SHALL us Batch ka `current_sem` exactly 1 se increment kare.
2. IF Admin ek Batch promote karta hai jiska `current_sem` 8 hai, THEN THE System SHALL `current_sem` ko aur increment karne ke bajaye us Batch ka `status` `'graduated'` set kare.
3. THE batch-promotion action SHALL sirf ek Admin-selected Batch par apply ho aur kisi doosre Batch ka `current_sem` ya `status` alter NAHI kare.
4. WHEN ek Batch promote hoti hai, THE System SHALL us Batch ke `sections`, `students`, aur `student_roster` rows unchanged rakhe.
5. IF Admin status ke bagair koi caller batch-promotion RPC invoke karta hai, THEN THE System SHALL request deny kare.

### Requirement 11: Stale-Assignment Handling After Promotion

**User Story:** Teacher ke roop mein, main notify hona chahta hoon jab mera assignment ek promoted batch ke liye ab current nahi hai, taaki mujhe pata chale ki naye semester ke liye subjects re-select karne hain.

#### Acceptance Criteria

1. WHEN ek Batch promote hoti hai, THE System SHALL har us Teacher_Assignment ko Stale_Assignment maane jo us Batch se tied hai aur jiska `subject_id` Batch ke prior semester ke Syllabus_Subjects set mein aata hai.
2. THE System SHALL Stale_Assignment ko dashboard, Attendance, aur Timetable ke "active assignment" calculations se exclude kare.
3. Ek Batch ka promotion SHALL kisi doosre Batch ke Teacher_Assignment ko stale mark NAHI kare.
4. WHEN ek Teacher jiska Teacher_Assignment Stale_Assignment ban gaya hai next baar application access karta hai, THE System SHALL ek notification dikhaye jo affected Batch identify kare aur Teacher ko My_Teaching_Subjects mein naye semester ke subjects re-select karne ke liye direct kare.
5. THE System SHALL stale-assignment re-selection sirf Teacher self-service My_Teaching_Subjects flow se provide kare — admin-uploaded timetable se automatic re-assignment is Requirement ke scope se bahar hai (Introduction dekhein).
6. Batch promotion ya graduation par THE System SHALL OLD subject/semester se tied historical attendance/marks/quiz data ko kabhi delete NAHI kare.

### Requirement 12: Read-Only Teaching History View

**User Story:** Teacher ke roop mein, main apne past semesters ke attendance, marks, aur quiz records browse karna chahta hoon jab batch aage badh gayi ho, taaki reference access rahe bina historical data alter kar sakne ki ability ke.

#### Acceptance Criteria

1. WHEN Teacher Teaching_History_View kholta hai, THE System SHALL us Teacher ke apne historical attendance, marks, aur quiz records dikhaye — un Batches ke liye jo diye gaye semester se promote ho gayi hain ya jinka `status = 'graduated'` hai — Batch, phir semester, phir subject ke hisaab se organized.
2. THE Teaching_History_View SHALL koi bhi control NAHI degi jisse attendance mark ho sake, marks edit ho sakein, ya quiz content edit ho sake — is Requirement ko poora karne ke liye Teaching_History_View har edit control (disable karne ke bajaye) interface se hi remove karega.
3. THE Teaching_History_View SHALL existing owner-scoped historical data query kare aur historical records store karne ke liye koi naya table ya column require NAHI kare.
4. THE Teaching_History_View SHALL Teacher ke results ko us Teacher ke apne historical records tak restrict kare, existing owner-scoped RLS model ke consistent.

## Phase 4 — Timetable Overhaul (College-Accurate Scheduling)

### Requirement 13: Fixed, College-Wide Period System

**User Story:** Teacher ke roop mein, main free-text time type karne ke bajaye college ke actual fixed periods se choose karna chahta hoon, taaki mera timetable real daily schedule se match kare.

#### Acceptance Criteria

1. THE System SHALL ek Period_Catalog define kare — fixed, department-wide Periods (Period I se Period VII), har ek fixed start time aur end time ke saath, saare Teachers/Batches mein shared.
2. THE Period_Catalog SHALL ek designated lunch break Periods ke beech include kare, reference schedule ke midday break placement se match karte hue.
3. THE Period_Catalog SHALL Saturday ko ek distinct block ke roop mein represent kare (e.g. ek single "NCC/NSS/CLUB ACTIVITIES/SPORTS/NPTEL/T&P" entry), Monday-se-Friday ki Period I-VII structure ke bajaye.
4. WHEN Teacher ek Timetable_Entry create ya edit karta hai, THE System SHALL Teacher ko Period_Catalog se Period select karne ke liye require kare (dropdown ke through), free-text time enter karne ke bajaye.
5. THE System SHALL timetable editor ka existing free-text `time_slot` text input ko har naye create ya edit hone wale entry ke liye Period_Catalog-driven selector se replace kare.

### Requirement 14: Lab Entries Spanning Multiple Periods

**User Story:** Teacher ke roop mein, main ek lab entry banana chahta hoon jo multiple consecutive periods span kare, taaki ek lab session ek single entry ke roop mein represent ho, alag-alag disconnected entries ke bajaye.

#### Acceptance Criteria

1. WHEN Teacher ek lab Timetable_Entry create karta hai, THE System SHALL us entry ko do ya zyada consecutive Periods span karne de, ek single entry ke roop mein.
2. WHEN My_Schedule_View ya Timetable grid ek lab Timetable_Entry render karta hai jo multiple Periods span karta hai, THE System SHALL use spanned Periods ke across ek merged cell ke roop mein render kare.
3. IF Teacher ek lab Timetable_Entry banane ki koshish karta hai jo non-consecutive Periods span kare, THEN THE System SHALL entry reject kare aur ek message dikhaye jo explain kare ki spanned Periods consecutive hone chahiye. Ye explanatory message sirf tab dikhega jab entry actually reject ho — accept hone wale (consecutive) entries par koi message nahi dikhega.

### Requirement 15: Additional Entry Metadata (Room, Tutorial, Special Activities)

**User Story:** Teacher ke roop mein, main ek timetable entry par room, tutorial marker, ya non-subject activity record karna chahta hoon, taaki grid college ke real timetable jaisa hi detail capture kare.

#### Acceptance Criteria

1. WHERE Teacher ek Timetable_Entry ke liye room ya location value provide karta hai, THE System SHALL use us entry ke saath store aur display kare.
2. WHERE Teacher ek Timetable_Entry ko tutorial mark karta hai, THE System SHALL ek tutorial marker (reference format ke "-T" suffix jaisa) us entry ke saath store aur display kare.
3. THE System SHALL Teacher ko ek special non-subject activity (Library, Mentor, Club Activities, Sports, ya NCC/NSS) select karne de, subject ki jagah, jab Timetable_Entry create kar rahe ho. Sirf select karna hi entry ko us activity se automatically link nahi karega — activity Timetable_Entry par tabhi apply hoga jab entry explicitly save/confirm ho (existing selection-vs-apply behavior).
4. WHEN ek Timetable_Entry special non-subject activity use karta hai, THE System SHALL us entry ko `syllabus_subjects` row ya Teacher ki apni `subjects` row reference karne ki requirement se exempt kare. Ye exemption sirf un entries par apply hota hai jo actually special non-subject activity use karte hain — ek tutorial-marked entry (Requirement 15.2) jo koi special activity use nahi karta, uske liye ye exemption apply NAHI hoga aur use subject reference dena hi hoga.

### Requirement 16: Confirm Timetable Lock Mechanism (Whole-Section Unlock)

**User Story:** Teacher ke roop mein, main apna timetable lock karna chahta hoon jab wo final ho jaaye, taaki Attendance us par safely rely kar sake aur accidental edits silently us schedule ko na todein jis par Attendance depend karta hai.

#### Acceptance Criteria

1. THE System SHALL har Teacher-Section combination ke liye ek Timetable_Status track kare — `draft` ya `confirmed`.
2. THE Timetable_Status naye Section ke timetable ke liye by default `draft` hoga.
3. WHILE ek Teacher ke Section ka timetable `draft` hai, THE System SHALL Teacher ko us Section ke Timetable_Entry rows freely add, edit, ya delete karne de.
4. WHEN Teacher ek `draft` timetable par "Confirm Timetable" perform karta hai, THE System SHALL us Section ke saare current Timetable_Entry rows ko validate kare (Requirement 18 conflict-check included) aur Timetable_Status ko `confirmed` mein transition kare.
5. IF Teacher ek `confirmed` Section ke kisi Timetable_Entry ko add, edit, ya delete karne ki koshish karta hai, THEN THE System SHALL is change ko reject kare jab tak Teacher pehle explicit "Unlock Timetable" action perform na kare. Ye rejection sirf `confirmed` status wale Section par apply hoga — jab Section `draft` mein hai to Acceptance Criterion 3 ke mutabik add/edit/delete freely allowed rahega.
6. WHEN Teacher ek `confirmed` Section par "Unlock Timetable" perform karta hai, THE System SHALL us poore Section ke Timetable_Status ko `draft` mein transition kare — saari entries dobara editable ho jaayengi (whole-section unlock, per-entry nahi).
7. WHILE ek Section ka Timetable_Status `draft` hai (unlock ke baad bhi), THE Attendance_Module SHALL us Section ke Timetable_Entry rows ko confirmed schedule ke roop mein treat NAHI kare period-derivation ke liye (Requirement 20 dekhein), jab tak wo dobara confirm na ho jaaye.

### Requirement 17: Unified "My Schedule" View

**User Story:** Ek Teacher jo multiple batches/sections padhata hai, main chahta hoon ek combined weekly grid mile jisme sab kuch ek jagah ho, taaki mujhe apna poora week dekhne ke liye section dropdown switch na karna pade.

#### Acceptance Criteria

1. WHEN Teacher My_Schedule_View kholta hai, THE System SHALL ek single weekly grid dikhaye jisme us Teacher ke saare Teacher_Assignment rows se derive hoke Section, Batch, aur semester shamil hain.
2. THE My_Schedule_View cell label SHALL exact format `"SEM {n}({section}) {subject name}"` follow kare (jaise, `"SEM 5(A) Distributed Systems"`).
3. WHERE subject name My_Schedule_View cell mein poora display hone ke liye bahut lamba hai, THE System SHALL ek defined, consistent rule (truncate ya wrap) use kare, na ki unpredictable overflow/clipping.
4. My_Schedule_View ka introduction SHALL existing per-section Selected_Section_Context usage ko Attendance, Marks, ya kisi doosre single-section-scoped page par remove ya alter NAHI kare.

### Requirement 18: Cross-Batch Conflict Detection

**User Story:** Ek Teacher jo kai batches padhata hai, main chahta hoon system saari classes ke across scheduling conflicts pakde, taaki main kabhi bhi same period mein double-booked na hoon.

#### Acceptance Criteria

1. WHEN Teacher ek Timetable_Entry save ya confirm karne ki koshish karta hai, THE System SHALL check kare us Teacher ke har doosre Timetable_Entry ke against, us Teacher ke saare Batches, Sections, aur semesters mein.
2. IF Teacher ke paas already same din aur same (ya overlapping, multi-Period lab entries account karte hue Requirement 14 se) Period par doosra Timetable_Entry hai, THEN THE System SHALL save ya confirm action block kare.
3. WHEN save ya confirm action conflict ki wajah se block hota hai, THE System SHALL conflicting entry ka din, Period, Batch, section, aur subject dikhaye taaki Teacher cause identify kar sake.
4. THE conflict check SHALL Teacher ke poore schedule ko saare Teacher_Assignment rows ke across evaluate kare, ek single Batch ya Section tak scoped NAHI hoga.

### Requirement 19: Attendance Integration with Confirmed Timetable

**User Story:** Teacher ke roop mein, main chahta hoon Attendance sirf wahi periods dikhaye jo ek section aur subject ke liye actually scheduled hain, taaki mujhe irrelevant generic time list na dikhe.

#### Acceptance Criteria

1. WHEN ek Teacher ke Section ka timetable Timetable_Status `confirmed` hai, THE Attendance_Module SHALL us Section, subject, aur din combination ke time/period selector ko populate kare sirf un Periods se jo us exact Section, subject, aur din ke confirmed Timetable_Entry rows mein actually scheduled hain.
2. THE Attendance_Module SHALL kisi `confirmed` Section ke schedule ka time/period selector generic hardcoded `DEFAULT_TIME_SLOTS` list se populate NAHI kare.
3. IF kisi Section ke liye `confirmed` status mein koi Timetable_Entry exist nahi karta (Teacher ne abhi setup nahi kiya, ya wo `draft` mein hi hai), THEN THE Attendance_Module SHALL fallback ke roop mein existing generic `DEFAULT_TIME_SLOTS` list dikhaye — taaki jo teachers abhi naye timetable system mein migrate nahi hue unke liye kuch bhi break na ho.
4. THE fallback behavior (Acceptance Criterion 3) SHALL har un Section ke liye consistently apply ho jinka confirmed timetable nahi hai — ad hoc per-Section decide nahi hoga.
5. IF ek Section ka timetable `confirmed` hai lekin us specific din/subject combination ke liye us confirmed timetable mein koi Period scheduled nahi hai, THEN THE Attendance_Module SHALL ek empty time/period selector dikhaye (generic `DEFAULT_TIME_SLOTS` fallback par NAHI girega) — Teacher ko pehle apne confirmed timetable mein us din/subject ke liye Period add karna hoga.

