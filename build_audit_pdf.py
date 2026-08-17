# -*- coding: utf-8 -*-
"""Generate the Teacher Academic MIS deep-dive audit report as a PDF."""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)

OUT = r"C:/MIS 1/docs/AUDIT_REPORT.pdf"

# ---- Palette ----
INK      = colors.HexColor("#1a1a1a")
MUTED    = colors.HexColor("#5e564b")
ACCENT   = colors.HexColor("#37322b")
CRIT     = colors.HexColor("#c0392b")
HIGH     = colors.HexColor("#e07b1a")
MED      = colors.HexColor("#c29b2f")
LOW      = colors.HexColor("#3d7a5a")
GOOD     = colors.HexColor("#27965f")
CARDBG   = colors.HexColor("#f4f1ea")
LINE     = colors.HexColor("#d8d0c2")
HEADBG   = colors.HexColor("#37322b")

styles = getSampleStyleSheet()
def S(name, **kw):
    styles.add(ParagraphStyle(name, **kw))

S("Cover",  fontName="Helvetica-Bold", fontSize=26, leading=30, textColor=INK)
S("CoverSub", fontName="Helvetica", fontSize=12, leading=17, textColor=MUTED)
S("H1", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=ACCENT, spaceBefore=14, spaceAfter=6)
S("H2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=4)
S("Body", fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK, spaceAfter=4)
S("Small", fontName="Helvetica", fontSize=8.5, leading=12, textColor=MUTED)
S("Cell", fontName="Helvetica", fontSize=8.3, leading=11, textColor=INK)
S("CellB", fontName="Helvetica-Bold", fontSize=8.3, leading=11, textColor=INK)
S("CellW", fontName="Helvetica-Bold", fontSize=8.3, leading=11, textColor=colors.white)
S("Mono", fontName="Courier", fontSize=8, leading=11, textColor=colors.HexColor("#333333"))
S("Badge", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.white, alignment=TA_CENTER)

story = []

def para(t, s="Body"): return Paragraph(t, styles[s])
def hr(): return HRFlowable(width="100%", thickness=0.6, color=LINE, spaceBefore=4, spaceAfter=8)

# ============ COVER ============
story.append(Spacer(1, 40))
story.append(para("Teacher Academic MIS", "Cover"))
story.append(para("Deep-Dive Code Audit & Production-Readiness Report", "CoverSub"))
story.append(Spacer(1, 10))
story.append(hr())
story.append(para("Stack: React 18 + Vite 5 + TypeScript (strict) + Tailwind v3 + Supabase (Postgres/Auth/RLS) + Cloudflare Pages", "Small"))
story.append(para("Scope: 209 source files &bull; 57 SQL migrations &bull; 2 edge functions", "Small"))
story.append(para("Date: 2026-08-17 &nbsp;|&nbsp; Branch: feature/superhuman-quiz-design", "Small"))
story.append(Spacer(1, 18))

# Verdict banner
vb = Table([[Paragraph("VERDICT: NOT PRODUCTION-READY YET", styles["Badge"])]], colWidths=[170*mm])
vb.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,-1),CRIT),
    ("TOPPADDING",(0,0),(-1,-1),10),("BOTTOMPADDING",(0,0),(-1,-1),10),
]))
story.append(vb)
story.append(Spacer(1, 8))
story.append(para(
    "Core quiz, auth, routing aur database security (RLS + edge functions) <b>solid</b> hain. "
    "Lekin 5 blockers hain: AttendanceView pe <b>@ts-nocheck</b> (poora type-safety off), "
    "koi <b>ErrorBoundary</b> nahi (crash = white screen), <b>3 routing tests fail</b>, "
    "RosterView + TeacherManagementView mein <b>fake/simulated buttons</b>, aur "
    "<b>146 hardcoded colors</b> (dark-mode inconsistency). Inhe fix kiye bina deploy risky hai.", "Body"))

# Severity legend
story.append(Spacer(1, 12))
leg = Table([[
    Paragraph("CRITICAL 3", styles["CellW"]),
    Paragraph("HIGH 5", styles["CellW"]),
    Paragraph("MEDIUM 8", styles["CellW"]),
    Paragraph("LOW 5", styles["CellW"]),
]], colWidths=[42*mm]*4)
leg.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(0,0),CRIT),("BACKGROUND",(1,0),(1,0),HIGH),
    ("BACKGROUND",(2,0),(2,0),MED),("BACKGROUND",(3,0),(3,0),LOW),
    ("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),
    ("GRID",(0,0),(-1,-1),2,colors.white),
]))
story.append(leg)

story.append(PageBreak())

# ============ COVERAGE ============
story.append(para("1. Audit Coverage", "H1"))
story.append(para("Ye report un files ke deep reading pe based hai jo directly padhi gayi. Kuch modules "
                  "'sampled' hain (pattern-grep se signal, spot reads) — clearly marked.", "Small"))
story.append(Spacer(1, 6))

cov = [[Paragraph("Module / Area", styles["CellW"]), Paragraph("Depth", styles["CellW"])]]
rows = [
    ("Quiz (attempt / access / creation-data / parsers)", "Full read"),
    ("Auth + Routing (App.tsx, AuthContext, SignInRoute)", "Full read"),
    ("Database RLS (0002, 0014) + is_teacher/owner isolation", "Full read"),
    ("Cloudflare edge functions (generate-quiz, admin-create-teacher)", "Full read"),
    ("Shared UI kit (foundation/forms/feedback/OtpInput/ThemeToggle)", "Full read"),
    ("Data-layer error handling (support.ts)", "Full read"),
    ("TeacherManagementView, RosterView, AttendanceView (header)", "Full read"),
    ("SelectedSectionContext, theme, tailwind config, index.css", "Full read"),
    ("Marks/Analytics/Leaderboard/Heatmap/Dashboard", "Sampled (grep + spot)"),
    ("Material/Assignment/Syllabus/Onboarding internals", "Sampled (grep + spot)"),
    ("Remaining 50 migrations (0001,0003-0056)", "Sampled (index + key ones)"),
]
for a,b in rows:
    cov.append([para(a,"Cell"), para(b,"Cell")])
t = Table(cov, colWidths=[130*mm, 40*mm])
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),HEADBG),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, CARDBG]),
    ("GRID",(0,0),(-1,-1),0.4,LINE),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
    ("LEFTPADDING",(0,0),(-1,-1),7),
]))
story.append(t)
story.append(Spacer(1, 6))
story.append(para("<b>Note:</b> Pehla plan tha 8 parallel audit-agents chalane ka; wo sab token-quota "
                  "exhaust hone se fail ho gaye, isliye audit manually kiya gaya. 'Sampled' areas ki "
                  "confirmed findings neeche hain, par unmein aur bhi ho sakte hain — full pass baaki hai.", "Small"))

story.append(PageBreak())

# ============ FINDINGS ============
def finding_table(title, color, items):
    story.append(para(title, "H1"))
    head = [[Paragraph("ID", styles["CellW"]), Paragraph("File", styles["CellW"]),
             Paragraph("Issue &amp; Impact", styles["CellW"]), Paragraph("Fix", styles["CellW"])]]
    for fid, f, issue, fix in items:
        head.append([para(fid,"CellB"), para(f,"Mono"), para(issue,"Cell"), para(fix,"Cell")])
    t = Table(head, colWidths=[13*mm, 40*mm, 78*mm, 39*mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),color),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, CARDBG]),
        ("GRID",(0,0),(-1,-1),0.4,LINE),
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))

finding_table("2. Critical Findings", CRIT, [
    ("C1", "views/AttendanceView.tsx:1",
     "File pe <b>// @ts-nocheck</b> hai &mdash; poori attendance view mein TypeScript kuch check nahi karta. "
     "Null access / wrong prop / undefined method silently ship. Attendance core feature hai; crash = classes mark nahi hongi. "
     "(fix.cjs ne inject kiya.)",
     "@ts-nocheck hatao; real type errors fix karo (~32 hardcoded colors bhi saath).") ,
    ("C2", "presentation/App.tsx",
     "Poore app mein koi <b>React ErrorBoundary</b> nahi. Kisi bhi component ka render crash = pura app white screen, "
     "koi recovery nahi.",
     "Root pe &lt;ErrorBoundary&gt; with fallback UI wrap karo."),
    ("C3", "App.routing.test.tsx",
     "<b>3 routing tests fail</b>. Test window.location.replace('/') expect karta hai par onSignedIn "
     "jaan-boojh ke navigate nahi karta (redirect SignInRoute re-render se hota hai). Test vs code mismatch &mdash; "
     "sign-in redirect regression ab catch nahi hoga.",
     "Test ko React-Router Navigate ke hisab se update karo (pathname assert)."),
])

finding_table("3. High Findings", HIGH, [
    ("H1", "views/QuizAttemptView.tsx",
     "<b>Double-submit race</b>: handleSubmit + handleAutoSubmit dono submitAttempt call karte hain. Timer 0 pe "
     "user 'Submit' dabaye to dono fire &mdash; koi submittedRef guard nahi.",
     "Ek submittedRef/isSubmitting guard dono paths pe."),
    ("H2", "views/RosterView.tsx",
     "<b>Fake/simulated buttons</b>: dummyAction() &mdash; 'Add Student', 'Assign Section', 'Delete Students', "
     "'Email Student', 'Suspend Account', 'View Full Record' sab sirf toast dikhate hain, kuch save nahi hota. "
     "Teacher ko real lagega.",
     "Real backend se wire karo, ya 'Coming soon / Demo' clearly label karo."),
    ("H3", "views/TeacherManagementView.tsx",
     "Same as H2 &mdash; dummyAction(), 'Simulated import/assignment', hardcoded fake profile data "
     "(Total Classes, subjects). Admin ko misleading.",
     "Wire ya clearly disable/label karo."),
    ("H4", "data/access/support.ts + domain/*",
     "<b>Error-handling do philosophy</b>: data-access layer THROWS DataAccessError; domain (fileStorage, inputGuard) "
     "returns Result&lt;T,E&gt;; RPC parsers tagged-union {status,reason}. Ek component ko try/catch AND .ok dono handle "
     "karne padte hain.",
     "Ek convention decide karo (recommend: data layer bhi Result&lt;T&gt;)."),
    ("H5", "data/access/support.ts:46",
     "unwrap() success pe null deta hai (0 rows), error pe throw. Caller har successful single-read pe null-check "
     "bhoole to 'not found' crash ban jata hai.",
     "unwrapSingle() add karo jo null pe throw kare."),
])

finding_table("4. Medium Findings", MED, [
    ("M1", "views/*.tsx (11 files)",
     "<b>146 hardcoded colors</b> (hex / emerald- / indigo- / slate-) design tokens ki jagah. "
     "AttendanceView 32, StudentQuizAccessView 72, DashboardView 11, MarksCalculatorView 7. Dark-mode toota / theming inconsistent.",
     "status-*/accent/surface/text tokens use karo."),
    ("M2", "data/supabase/client.ts:57-63",
     "Env missing hone pe placeholder (localhost:54321, placeholder-anon-key) pe fallback + sirf console.warn. "
     "Prod mein galat deploy chup-chaap boot hoga, har backend call fail.",
     "PROD mein descriptive error throw karo, placeholder nahi."),
    ("M3", "QuizCreationView.tsx:101, fileStorage.ts:125, localDemoMode.ts:171",
     "Share/file token = Date.now()+Math.random().toString(36) &mdash; low-entropy, guessable. Quiz link enumeration risk "
     "(enrollment/OTP gate se mitigated).",
     "crypto.randomUUID() / crypto.getRandomValues use karo."),
    ("M4", "views/OtpInput.tsx",
     "Purani purple palette hardcoded (#15157d/#818cf8/#0f172a). TeacherSignIn + StudentQuiz dono mein use, "
     "design system se mismatch, dark-mode inconsistent.",
     "Design tokens (accent/surface/border) pe migrate karo."),
    ("M5", "views/QuizAttemptView.tsx (EOF)",
     "Inline cx() helper banaya jabki ui/utils.ts mein cx() already export hai. Duplication.",
     "Shared cx import karo."),
    ("M6", "views/QuizAttemptView.tsx",
     "Timer pe animate-pulse; prefers-reduced-motion guard nahi (Tailwind default pulse index.css ki reduced-motion "
     "list mein nahi). Motion-sensitivity WCAG issue.",
     "motion-reduce:animate-none add karo."),
    ("M7", "context/SelectedSectionContext.tsx:114",
     "loadSections() catch khaali &mdash; network fail pe sections silently empty, user ko koi error nahi, bas blank dropdowns.",
     "Error state surface karo + retry."),
    ("M8", "data/migrations/",
     "<b>Migration numbering collision</b>: do 0018 (dedupe_syllabus_subjects + syllabus_master) aur do 0021 "
     "(quiz_share_token + sem5_electives). Apply order ambiguous.",
     "Renumber duplicates to unique sequence."),
])

finding_table("5. Low Findings", LOW, [
    ("L1", "views/QuizAttemptView.tsx",
     "Question palette chips h-6 w-6 (24px) &mdash; touch target chhota (min 44dp recommended).",
     "Chip size badhao ya hit-area padding do."),
    ("L2", "auth/AuthContext.tsx",
     "get_my_role() har auth-state-change pe call, koi caching nahi &mdash; multi-tab pe redundant RPC.",
     "Role result short-cache karo."),
    ("L3", "repo root",
     "Untracked fix.cjs + update-ui.cjs &mdash; throwaway codemods; fix.cjs hi @ts-nocheck inject karta hai (C1 ki jad).",
     "Delete karo ya scripts/ mein move + gitignore."),
    ("L4", "views/AttendanceView.tsx:1589",
     "confirmButtonRef 'as any' cast (@ts-nocheck ke upar) &mdash; ref typing bypass.",
     "Proper ref type do."),
    ("L5", "views/AttendanceView.tsx",
     "Hardcoded emerald-500 focus/bg colors design tokens ki jagah (C1/M1 ka hissa).",
     "accent/status-green tokens."),
])

story.append(PageBreak())

# ============ SECURITY (POSITIVE) ============
story.append(para("6. Security Assessment &mdash; Strong", "H1"))
story.append(para("Security posture is the project's strongest area. Jo cheezein sahi hain:", "Body"))
sec = [[Paragraph("Area", styles["CellW"]), Paragraph("Finding", styles["CellW"])]]
for a,b in [
 ("RLS coverage","0002 har table pe RLS enable + default-DENY; teacher & student-own-row policies (OR-combined)."),
 ("Per-teacher isolation","0014 owner_id = auth.uid() based RLS operational tables pe; ek teacher doosre ka data nahi dekh sakta."),
 ("Answer-key safety","questions.correct_index teacher-only RLS; grading server-side SECURITY DEFINER RPC se; client ko keys nahi milte."),
 ("Edge fn: generate-quiz","GEMINI_API_KEY server-only; caller ka JWT-scoped client + is_teacher() RPC verify hota hai privileged call se pehle."),
 ("Edge fn: admin-create-teacher","SERVICE_ROLE_KEY server-only; is_admin() RPC verify ke BAAD hi service-role client banta hai; client claim trust nahi."),
 ("Teacher/student separation","0027 DB trigger student ko teacher-escalate hone se rokta hai (client bypass-proof)."),
 ("Parameterized access","Sara data access Supabase query-builder / .rpc() se; koi ad-hoc string SQL nahi &mdash; SQL-injection surface minimal."),
]:
    sec.append([para(a,"CellB"), para(b,"Cell")])
t = Table(sec, colWidths=[45*mm, 125*mm])
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),GOOD),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, colors.HexColor("#eef6f1")]),
    ("GRID",(0,0),(-1,-1),0.4,LINE),("VALIGN",(0,0),(-1,-1),"TOP"),
    ("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5),("LEFTPADDING",(0,0),(-1,-1),7),
]))
story.append(t)
story.append(Spacer(1, 6))
story.append(para("<b>Minor security gaps:</b> generate-quiz CORS 'access-control-allow-origin: *' (auth-gated, low risk); "
                  "OTP endpoints pe sirf 60s client cooldown (server rate-limit Supabase pe rely); localStorage mein "
                  "email plaintext (rememberMe).", "Small"))

# ============ KNOWN BUG ============
story.append(para("7. Known Functional Bug (from PROJECT_HANDOFF)", "H1"))
story.append(para(
    "<b>Quiz wrong-section:</b> request_quiz_access (migration 0040) student upsert mein section_id set nahi karta. "
    "Quiz-link se self-register hone wale students ka section_id = NULL reh jata hai, jisse har section-restricted quiz "
    "unhe 'wrong section' deny karta hai. Abhi manual SQL se fix hota hai; proper migration pending.", "Body"))

# ============ PRODUCTION READINESS ============
story.append(para("8. Production-Readiness Checklist", "H1"))
pr = [[Paragraph("Item", styles["CellW"]), Paragraph("Status", styles["CellW"])]]
checks = [
 ("Database RLS + authorization", "READY"),
 ("Edge function security (secrets, auth-gating)", "READY"),
 ("Core quiz flow (access -> attempt -> submit -> review)", "READY"),
 ("Domain logic unit tests (312 pass)", "READY"),
 ("TypeScript type-safety across all files", "BLOCKED (C1: @ts-nocheck)"),
 ("Crash resilience (ErrorBoundary)", "BLOCKED (C2: none)"),
 ("Routing regression tests green", "BLOCKED (C3: 3 fail)"),
 ("No fake/placeholder UI shown as real", "BLOCKED (H2/H3)"),
 ("Consistent dark-mode / design tokens", "GAP (M1: 146 colors)"),
 ("Error monitoring (Sentry/logging)", "MISSING"),
 ("E2E tests (sign-in, quiz)", "MISSING"),
 ("Security headers (CSP/X-Frame)", "MISSING"),
 ("CI/CD pipeline", "MISSING"),
]
def st_color(s):
    if s.startswith("READY"): return GOOD
    if s.startswith("BLOCKED"): return CRIT
    if s.startswith("GAP"): return MED
    return MUTED
pr_rows=[]
for a,b in checks:
    pr.append([para(a,"Cell"), Paragraph(b, ParagraphStyle("st",parent=styles["CellB"],textColor=st_color(b)))])
t = Table(pr, colWidths=[120*mm, 50*mm])
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0),HEADBG),
    ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, CARDBG]),
    ("GRID",(0,0),(-1,-1),0.4,LINE),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4),("LEFTPADDING",(0,0),(-1,-1),7),
]))
story.append(t)

# ============ ACTION PLAN ============
story.append(para("9. Recommended Action Plan", "H1"))
story.append(para("<b>Aaj / deploy se pehle (blockers):</b>", "H2"))
for x in [
 "C1 &mdash; AttendanceView se @ts-nocheck hatao, type errors fix karo.",
 "C2 &mdash; Root ErrorBoundary add karo.",
 "C3 &mdash; 3 routing tests fix karo (Navigate-based assert).",
 "H1 &mdash; Quiz double-submit guard.",
 "H2/H3 &mdash; RosterView + TeacherManagementView ke fake buttons wire ya clearly label karo.",
]:
    story.append(para("&bull; "+x, "Body"))
story.append(para("<b>Is hafte (high):</b>", "H2"))
for x in [
 "H4/H5 &mdash; Unified Result&lt;T&gt; error model; unwrapSingle().",
 "M2 &mdash; Prod env-missing pe fail-fast.",
 "M3 &mdash; crypto-based token generation.",
 "M8 &mdash; Duplicate migration numbers renumber.",
 "Sampled modules (Marks/Analytics/Roster/Material/Onboarding) ka full pass.",
]:
    story.append(para("&bull; "+x, "Body"))
story.append(para("<b>Agla sprint (hardening):</b>", "H2"))
for x in [
 "M1/M4 &mdash; 146 hardcoded colors -> tokens; OtpInput palette.",
 "Error monitoring (Sentry) + structured logging.",
 "E2E tests (Playwright): sign-in, quiz attempt+submit.",
 "Security headers (CSP) + CI/CD pipeline.",
 "Quiz wrong-section proper migration fix (section_id on upsert).",
]:
    story.append(para("&bull; "+x, "Body"))

story.append(Spacer(1, 14))
story.append(hr())
story.append(para("Report generated from direct source reading. 'Sampled' modules ki findings confirmed hain par "
                  "exhaustive nahi &mdash; un areas ka full deep pass abhi baaki hai.", "Small"))

# ---- page numbers ----
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(20*mm, 12*mm, "Teacher Academic MIS \u2014 Deep-Dive Audit")
    canvas.drawRightString(190*mm, 12*mm, "Page %d" % doc.page)
    canvas.setStrokeColor(LINE)
    canvas.line(20*mm, 15*mm, 190*mm, 15*mm)
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=20*mm, rightMargin=20*mm,
                        topMargin=18*mm, bottomMargin=20*mm,
                        title="Teacher Academic MIS - Deep-Dive Audit Report")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("PDF written:", OUT)
