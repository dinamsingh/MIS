# Teacher Academic MIS — Premium UX Implementation Spec

> This is a build spec for Kiro + Opus. It covers ALL premium UX upgrades:
> the 5 video lessons (upload, charts, tabs, date picker, engagement) plus
> Tier 1-3 polish features. Implement it PHASE BY PHASE, not all at once.

---

## 0. HOW TO USE THIS FILE (read first)

**For me (the user):**
- Do NOT paste this whole file into Kiro at once — it will fill context fast.
- Work ONE feature at a time. Tell Kiro: "Open MIS_Premium_UX_Spec.md, implement only Feature 1.1, then stop."
- After each feature: test it, commit to GitHub, then start a fresh Kiro chat for the next feature (keeps context small + saves credits).

**For Kiro:**
- Keep this file in the repo as the source of truth. Read ONLY the requested feature section each time.
- Implement one feature per session. After finishing, give a 3-line summary and stop. Do not auto-continue to the next feature.
- Reuse existing components/design tokens. Do not rebuild what already exists.

---

## 1. GLOBAL RULES (apply to every feature)

### Communication
- Talk to ME in **Hinglish** (Hindi + English in Roman script). Explain simply, like teaching a beginner.
- The PRODUCT UI — every label, button, menu, heading, message, placeholder — must be **clean professional ENGLISH only**. Never put Hindi/Hinglish text in the interface.

### Tech stack (do not change)
- React + Vite + Tailwind CSS, Supabase (Postgres + Auth + Storage), Cloudinary for public files, deploy on Cloudflare Pages.
- Use Framer Motion for animations. Use a headless component lib (e.g. Radix UI) only where it speeds things up; otherwise keep it lightweight.

### Design system (follow exactly)
- Font: Inter. Background #f4f5f9, surface #ffffff, border #ecedf4.
- Accent #5b54e6 (hover #4a42d4), accent tint #eef0fe.
- Text #1d2030, soft #5a6072, muted #969cad.
- Status: green #12b886, amber #f59e0b, red #f0506e, blue #4c8dff.
- Cards 16px radius + soft shadow; buttons 11px radius. Clean, spacious SaaS dashboard look. Fully responsive.

### Performance (already partly done — keep it)
- Keep code-splitting, lazy routes, skeletons, and the data cache. Persist cache to localStorage. Keep the single get_dashboard_data RPC. Add DB indexes where new queries are introduced.

### DEBUGGING DISCIPLINE (do this before fixing ANY error)
1. Ye code actually kya kar raha hai? (Explain step by step what this code does.)
2. Yahan kya toot sakta hai aur kyun? (List the likely failure points.)
3. Isko chalne ke liye kya cheez chahiye jo maine setup nahi ki? (env vars, keys, tables, configs?)
Then fix the real root cause — no random trial-and-error.

### Definition of done (every feature)
- Works on desktop + mobile, keyboard accessible, has loading + empty + error states, UI text in English, committed to GitHub with a clear message.

---

## PHASE 1 — VIDEO FEATURES (the 5 lessons)

### 1.1 Premium File Upload (Study Material, Assignments, CSV import)
**Goal:** A reusable Uploader component used everywhere files are uploaded.
**Build:**
- Drag-and-drop zone that visibly reacts on drag-over (border + glow). "Drop to upload" state.
- Honest progress: real percentage + bytes + speed + time left (no bare spinner).
- Inline retry: if an upload fails, keep the file in memory and show a one-tap "Retry" / "Resume" — never restart from zero.
- Upload preview: thumbnail (for images) + file type + size, with Replace and Remove actions.
- Independent queue: multiple files upload in parallel, each in its own row; one failure never blocks the others.
- Route uploads: sensitive files -> Supabase private bucket (signed URLs); study material/images/PDF -> Cloudinary CDN.
**Acceptance:** Upload 5 mixed files at once; fail one (e.g. disconnect) and confirm others finish + the failed one retries.
**Watch-outs:** File size/type limits; Cloudinary unsigned preset vs signed; memory for large files.

### 1.2 Honest Charts (Smart Analytics, Attendance trend, Dashboard)
**Goal:** A small chart kit with correct defaults.
**Build:**
- Bar charts ALWAYS start the value axis at zero.
- Right chart for the job: Bar = compare, Line = trend over time, avoid pie beyond 5 slices.
- Color encodes meaning (categorical / sequential / diverging) using the status palette, not random colors.
- Minimal chartjunk: thin gridlines, clear labels, good aspect ratio.
- Use a light library (e.g. Recharts) lazy-loaded only on chart pages.
**Acceptance:** Class average bar, unit-wise quiz line, grade distribution — all readable + honest.
**Watch-outs:** Lazy-load charts to keep bundle small; empty-data state.

### 1.3 Polished Tabs / Navigation (sidebar, subject switcher, in-page tabs)
**Goal:** Smooth, accessible tab + nav behavior.
**Build:**
- Active indicator slides with a spring animation; content cross-fades (~180ms), no hard cut.
- Overflow: many tabs scroll horizontally with edge fades + chevrons on desktop; never wrap to two lines.
- Keyboard: Arrow / Home / End / Tab support; focus state visually distinct from active state.
- Mobile: touch targets >= 44px, thumb-zone friendly.
- Content area height interpolates — no layout shift on switch.
**Acceptance:** Keyboard-only navigation works; many tabs scroll smoothly; no jump on switch.

### 1.4 Fast Date Picker / Range (attendance date, report filters, due dates)
**Goal:** A reusable date + date-range picker.
**Build:**
- Presets cover 90% of cases: Today, Yesterday, Last 7 days, Last 30 days, Last quarter, Custom range.
- Range: hover = preview, click = lock start, drag/second-click = refine end.
- Show two months side by side (three on wide screens).
- Keyboard: type date (dd/mm/yyyy) + arrow navigation + validation.
- Mobile: opens as a full-screen sheet with a Confirm button; touch targets >= 44px.
**Acceptance:** Pick "Last 7 days" in one click; pick a custom cross-month range by dragging.
**Watch-outs:** Timezone (store ISO, display local); invalid typed dates.

### 1.5 Engagement / Open-Loop Psychology (onboarding, syllabus, reminders)
**Goal:** Use the Zeigarnik effect to drive return visits — without being annoying.
**Build:**
- Teacher onboarding checklist with a progress bar ("Setup 80% done") and one open item nudging completion.
- Syllabus progress framed as outcomes ("2 topics left to finish COA"), not chores.
- Dashboard "Needs attention" + pending items (e.g. "1 quiz to grade") as gentle open loops.
**Acceptance:** A new teacher sees a clear, motivating setup progress; finishing items updates the bar live.
**Watch-outs:** Don't nag aggressively; let users dismiss.

---

## PHASE 2 — TIER 1 (highest-impact polish)

### 2.1 Data Tables done right (marks, attendance, students)
**Build:** Column sorting; sticky header; inline cell edit (Excel-like) for marks/attendance; search + filter (section/semester); bulk select + bulk actions ("Mark all present"); pagination or virtualization for 100+ rows.
**Acceptance:** Edit a mark inline and it saves; sort by attendance%; select 10 students and mark present.
**Watch-outs:** Optimistic update + rollback on error; keyboard navigation between cells.

### 2.2 Toasts + Undo
**Build:** A global toast system (success/error/info). Destructive actions (delete) show a toast with **Undo** (soft-delete for ~5s) instead of a blocking confirm dialog where possible.
**Acceptance:** Delete a student -> toast with Undo -> Undo restores it.

### 2.3 Command Palette + Global Search (Ctrl/Cmd + K)
**Build:** A keyboard-triggered palette to jump to any student/subject/page and run quick actions.
**Acceptance:** Press Cmd+K, type a student name, Enter -> navigates to that student.
**Watch-outs:** Debounced Supabase search; index searchable columns.

### 2.4 Keyboard Shortcuts (fast attendance)
**Build:** In attendance marking: P = present, A = absent, Arrow/Enter = next student; show a shortcuts help overlay (?).
**Acceptance:** Mark a full class using only the keyboard quickly.

### 2.5 PWA + Offline support
**Build:** Installable PWA (manifest + service worker). Cache the app shell. Offline attendance: queue marks locally (IndexedDB) and sync to Supabase when back online; show online/offline + sync status.
**Acceptance:** Turn off network, mark attendance, turn network on -> it syncs automatically.
**Watch-outs:** Conflict handling on sync; clear "pending sync" indicator.

---

## PHASE 3 — TIER 2 (premium finish)

### 3.1 Empty States
**Build:** Every list/table empty view has an icon/illustration + one-line message + primary CTA ("No students yet. Add your first one").

### 3.2 Micro-interactions (Framer Motion)
**Build:** Button press feedback, card hover lift, page/route transitions, number count-up on dashboard stats. Keep subtle (150-250ms).
**Watch-outs:** Respect prefers-reduced-motion.

### 3.3 Error Handling (boundaries + 404)
**Build:** React error boundary with a friendly "Something went wrong" + Retry; a styled 404 page; graceful query-error states with retry.

### 3.4 Status Badges + Avatars
**Build:** Consistent color-coded chips (Present/Absent/At-risk) reused everywhere; student avatars (photo or colored initials).

### 3.5 Print / Export PDF
**Build:** Export marks sheet + attendance report to clean PDF; a print-friendly stylesheet for these views.
**Acceptance:** Export a class marks sheet to a tidy, paginated PDF.

---

## PHASE 4 — TIER 3 (pro-level)

### 4.1 Accessibility (a11y)
**Build:** Visible focus rings, full keyboard nav, sufficient color contrast, ARIA labels, alt text. Test with keyboard + a screen reader.

### 4.2 Dark Mode
**Build:** Light/dark toggle using CSS variables/tokens; persist choice; respect system preference by default.

### 4.3 Onboarding Tour + Tooltips
**Build:** First-login guided tour highlighting key actions; tooltips on icons/abbreviations. Skippable + replayable.

### 4.4 Consistent Formatting
**Build:** Central helpers for dates (dd/mm/yyyy), percentages, decimals, numbers — used everywhere for consistency.

### 4.5 Density Toggle + Saved Views
**Build:** Comfortable/Compact table density; let the teacher save filter+sort combos as named views ("4th Sem Sec-B").

---

## SUGGESTED BUILD ORDER (by impact)
1. 2.1 Data Tables  2. 1.4 Date Picker  3. 1.1 Upload  4. 2.4 Keyboard shortcuts  5. 2.5 PWA/Offline
6. 1.2 Charts  7. 2.2 Toasts+Undo  8. 2.3 Command palette  9. 1.3 Tabs  10. 1.5 Engagement
11. 3.1 Empty states  12. 3.2 Micro-interactions  13. 3.3 Error handling  14. 3.4 Badges/avatars  15. 3.5 Print/PDF
16. 4.1 a11y  17. 4.2 Dark mode  18. 4.3 Tour  19. 4.4 Formatting  20. 4.5 Density/saved views

## PROGRESS CHECKLIST
- [ ] 1.1 Upload  - [ ] 1.2 Charts  - [ ] 1.3 Tabs  - [ ] 1.4 Date picker  - [ ] 1.5 Engagement
- [ ] 2.1 Tables  - [ ] 2.2 Toasts+Undo  - [ ] 2.3 Command palette  - [ ] 2.4 Shortcuts  - [ ] 2.5 PWA/Offline
- [ ] 3.1 Empty  - [ ] 3.2 Micro-interactions  - [ ] 3.3 Errors  - [ ] 3.4 Badges/avatars  - [ ] 3.5 Print/PDF
- [ ] 4.1 a11y  - [ ] 4.2 Dark mode  - [ ] 4.3 Tour  - [ ] 4.4 Formatting  - [ ] 4.5 Density/views
