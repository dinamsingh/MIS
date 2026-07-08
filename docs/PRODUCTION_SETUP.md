# Production Supabase Setup Checklist

> **Why this file exists.** Local dev and the deployed (Cloudflare Pages) build
> currently point at the SAME Supabase project (`sdhpgvshexqsidkivjnq`). That
> means any SQL you run locally to test something runs against the live
> database immediately — there is no dev/prod separation. This doc is the
> one-time setup checklist to split them: the CURRENT project becomes
> **testing/dev**, and a NEW project becomes **production** (used by real
> teachers/students once onboarding starts).
>
> As of this writing, only the developer is using the current project (no real
> teacher/student data exists yet), so this is a clean cutover — no data
> migration needed. If that ever changes before you do this, re-check with
> whoever owns the real data first.

## Result after this setup

```
Local dev (.env)                  → Supabase Project "testing" (current: sdhpgvshexqsidkivjnq)
Production (Cloudflare, .env.production) → Supabase Project "production" (NEW)
```

You freely break/reset the testing project. The production project only ever
receives migrations you've already verified on testing.

---

## Step 1 — Create the new Supabase project

1. Go to https://supabase.com/dashboard → **New Project**.
2. Name it something clear, e.g. `mis-production`.
3. Pick a region close to your users (India-based teachers/students → nearest
   available region, e.g. Singapore/Mumbai if offered).
4. Set a strong database password — save it somewhere safe (e.g. a password
   manager). You won't need it for the app itself (the app only uses the anon
   key), but you'll want it for direct DB access if ever needed.
5. Wait for provisioning to finish (a couple of minutes).

## Step 2 — Note the new credentials

Project → Settings → API:
- **Project URL** (`https://<ref>.supabase.co`)
- **anon public key** (the long JWT starting `eyJ...`)

Do NOT use the **service_role** key anywhere in this app — it's not needed;
only the anon key is used client-side, with RLS enforcing access.

## Step 3 — Run every migration, in order, in the new project's SQL Editor

Copy each file's full contents into the SQL Editor and run it, one at a time,
in this exact order (this is the current full list — if new migration files
get added later, run those too, in numeric order, after these):

```
0001_init_schema.sql
0002_rls_policies.sql
0003_quiz_functions.sql
0004_audit_trigger.sql
0005_dashboard_rpc.sql
0006_add_file_name_column.sql
0007_real_roster_support.sql
0008_dashboard_rpc_by_id.sql
0009_dashboard_section_scoped.sql
0010_onboarding_schema.sql
0011_update_current_batches.sql
0012_multi_teacher_identity.sql
0013_dedupe_sections.sql
0014_per_teacher_isolation.sql
0015_dashboard_owner_scoped.sql
0016_align_roster_batch.sql
0017_merge_legacy_section_a.sql
0018_dedupe_syllabus_subjects.sql
0018_syllabus_master_and_progress.sql
0019_unify_subjects_units.sql
0020_quiz_active_window.sql
0021_quiz_share_token_access.sql
0021_sem5_electives_and_subjects.sql
0022_quiz_access_self_register.sql
0023_reset_quiz_attempt.sql
0024_quiz_section_roster_options.sql
0025_quiz_specific_access_errors.sql
0026_syllabus_progress_per_section.sql
```

Notes:
- `0016` and `0017` are guarded cleanup migrations for specific hardcoded ids
  from an old demo seed. On a fresh project they will simply no-op (the ids
  won't exist) — safe to run anyway, in order.
- Every migration here is idempotent (`if not exists` / `create or replace` /
  existence checks), so if you're ever unsure whether one ran, re-running it
  is safe.

## Step 4 — Run the real curriculum seeds (skip test-only seeds)

Run these, in order:

```
src/data/seeds/onboarding_seed.sql        (RGPV subjects sem 1–8 + live batches)
src/data/seeds/sem4_syllabus_seed.sql
src/data/seeds/sem4_java_lab_seed.sql     (optional — CS-406 Java lab programs)
src/data/seeds/sem5_syllabus_seed.sql
```

Do **NOT** run these in production — they are demo/test-only data:
```
src/data/seeds/seed.sql                   (12 demo students)
src/data/seeds/seed_real_roster.sql       (only if this was test data on your
                                            testing project — confirm before
                                            treating it as "real")
```
Real student rosters should be imported later via the app's own **Roster CSV
import** feature (`/roster` page) with your college's actual class lists, not
via a seed file.

## Step 5 — Configure Auth in the new project

1. **Authentication → Providers → Google**: enable it, with your OAuth
   Client ID/Secret (create one in Google Cloud Console if you don't already
   have one, or reuse an existing one and add the new project's callback URL
   to its authorized redirect URIs).
2. **Authentication → URL Configuration**: add your production domain (the
   Cloudflare Pages URL, e.g. `https://mis-app.pages.dev` or your custom
   domain) to the allowed redirect URLs.
3. Email OTP sign-in (used for teacher login) works out of the box, but check
   the email template under **Authentication → Email Templates** looks
   reasonable for real recipients.

## Step 6 — Create the Storage bucket

**Storage → New bucket**:
- Name: `sensitive-files` (must match `SUPABASE_PRIVATE_BUCKET` in
  `src/data/storage/config.ts`)
- Public: **OFF** (the app always accesses it via time-limited signed URLs)

## Step 7 — Pre-provision teacher account(s)

The app deliberately has no self-registration for teachers
(`shouldCreateUser: false` on the OTP flow) — only an already-existing
Supabase Auth user can log in via email OTP. For each real teacher, either:
- Manually add them under **Authentication → Users → Add user**, or
- Have them sign in with **Google** the first time (Google OAuth creates the
  user automatically; OTP does not).

Also set `VITE_TEACHER_EMAIL` in `.env.production` to a real teacher email —
this is a legacy single-teacher fallback used only for gating; the real
authorization is membership-based (`is_teacher()` checks the `teachers`
table), so it doesn't need to be perfectly accurate, but shouldn't be left
empty or pointing at a test address.

## Step 8 — Update `.env.production` (do this LAST, only once steps 1–7 are done)

```
VITE_SUPABASE_URL=<new production project URL>
VITE_SUPABASE_ANON_KEY=<new production project anon key>
VITE_TEACHER_EMAIL=<a real teacher's email>
VITE_CLOUDINARY_CLOUD_NAME=<same or a separate Cloudinary account — your choice>
VITE_CLOUDINARY_UPLOAD_PRESET=<same or separate>
VITE_FEATURE_AI=true
```

`.env` (local dev) stays pointed at the current/testing project — no change
needed there.

**Order matters**: update `.env.production` only after the new project is
fully migrated/seeded/configured. If you flip the URL before the schema
exists, the live production build will be broken (no tables to query) until
you finish setup.

## Step 9 — Set a separate Gemini API key for production

`.dev.vars` already notes: *"Use a SEPARATE key in production."* Get a
dedicated Gemini API key for production and set it as a Cloudflare Pages
**secret** named `GEMINI_API_KEY` (Pages project → Settings → Environment
variables, or `npx wrangler pages secret put GEMINI_API_KEY`). Do not reuse
the key currently in `.dev.vars` — that one should eventually be rotated too,
since it was shared in chat during development.

## Step 10 — End-to-end verify before giving out the link

Once deployed with the new `.env.production`:
1. Sign in as the pre-provisioned teacher.
2. Complete onboarding (pick sem/subjects/sections).
3. Confirm the dashboard, attendance, syllabus tracker, and quiz creation all
   work against the NEW project (check the Network tab or Supabase logs to
   confirm requests are hitting the new project, not the old one).
4. Only then share sign-in access with real teachers/students.

---

## Going forward: the two-environment workflow

Once this split exists, every future schema change follows this loop:

1. Write the migration file under `src/data/migrations/`.
2. Run it on the **testing** project (current `sdhpgvshexqsidkivjnq`) first.
3. Test the feature locally (`npm run dev`, using `.env` → testing project).
4. When verified, run the SAME migration file on the **production** project's
   SQL Editor.
5. Push the code — Cloudflare builds with `.env.production` → production
   Supabase project, now with matching schema.

Never run an unverified migration directly on the production project.
