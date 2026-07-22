# Teacher Academic MIS — Complete Setup Guide (Hinglish)

Ye guide tujhe step-by-step batayegi ki kaise Supabase project banana hai, database setup karna hai, aur login karna hai.

---

## Step 1: Supabase Account Banana

1. Browser me ja: **https://supabase.com**
2. **"Start your project"** ya **"Sign Up"** button click kar
3. GitHub account se sign up kar (ya email se — jo easy lage)
4. Sign up hone ke baad dashboard khul jaayega

---

## Step 2: New Project Create Karna

1. Dashboard me **"New Project"** button click kar
2. Form fill kar:
   - **Name**: `teacher-mis` (ya kuch bhi naam)
   - **Database Password**: Koi strong password daal (ye DB ka password hai, yaad rakh)
   - **Region**: `South Asia (Mumbai)` select kar (closest hoga tere liye)
3. **"Create new project"** click kar
4. 1-2 minute wait kar — project ban raha hoga (spinner dikhega)

---

## Step 3: API Keys Copy Karna

Project ban jaaye toh:

1. Left sidebar me **Settings** (gear icon) click kar
2. Phir **"API"** tab click kar
3. Yahan 2 cheezein dikhegi:
   - **Project URL** — ye aisa dikhega: `https://abcdefgh.supabase.co`
     → Ye copy kar
   - **Project API keys** section me **"anon public"** key dikhega — ek lamba string hoga
     → Ye bhi copy kar

> ⚠️ **"service_role" key KABHI mat use karna frontend me** — wo secret hai, sirf server ke liye hai

---

## Step 4: Teacher User Create Karna (Login Account)

1. Left sidebar me **"Authentication"** click kar
2. **"Users"** tab me ja
3. **"Add user"** → **"Create new user"** click kar
4. Form fill kar:
   - **Email**: Apna email daal (e.g., `teacher@gmail.com`)
   - **Password**: Apna password daal (ye login ke waqt use hoga)
   - **Auto Confirm User**: ✅ tick kar (taaki email verify na karna pade)
5. **"Create user"** click kar

Ab ye tera teacher login account hai.

---

## Step 5: Database Tables Banana (Migrations Run Karna)

1. Left sidebar me **"SQL Editor"** click kar
2. **"New query"** click kar
3. Ab ek ek file ka content paste karke **"Run"** karna hai:

### File 1: Schema (Tables)
- Project folder me ja: `src/data/migrations/0001_init_schema.sql`
- Iska poora content copy kar
- SQL Editor me paste kar → **"Run"** click kar
- "Success" aana chahiye

### File 2: RLS Policies (Security)
- File: `src/data/migrations/0002_rls_policies.sql`
- Copy → Paste → Run

### File 3: Quiz Functions
- File: `src/data/migrations/0003_quiz_functions.sql`
- Copy → Paste → Run

### File 4: Audit Trigger
- File: `src/data/migrations/0004_audit_trigger.sql`
- Copy → Paste → Run

### File 5: Seed Data (12 Students + Marks + Attendance)
- File: `src/data/seeds/seed.sql`
- Copy → Paste → Run

> Har file ke Run hone pe "Success. No rows returned" ya "Success. X rows affected" aana chahiye

---

## Step 6: Teacher Email Setting (Important for RLS)

Teacher ko full access dene ke liye `is_teacher()` function ko apne email se update karna hai:

1. SQL Editor me ek naya query khol
2. Ye paste kar (**apna email daal** `TERA-EMAIL@gmail.com` ki jagah):

```sql
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    coalesce(
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher',
      false
    )
    OR coalesce(
      lower(auth.jwt() ->> 'email') = lower('TERA-EMAIL@gmail.com'),
      false
    );
$$;
```

3. **Run** kar

> ⚠️ Ye wohi email hona chahiye jo tune Step 4 me user banate waqt daala tha
> ⚠️ `ALTER DATABASE` wala approach Supabase free tier pe kaam NAHI karta — ye function approach sahi hai

---

## Step 6.1: First Admin Bootstrap Karna (Admin Console ke liye)

`0043_admin_role.sql` migration run karne ke baad, `public.admins` table khaali hoti hai — aur har admin-only RPC (`add_admin`, `remove_admin`, etc.) `is_admin()` check karta hai, jo khaali table pe hamesha `false` return karega. Isliye pehla admin row ek baar SQL Editor se manually insert karna hai:

1. SQL Editor me ek naya query khol
2. Ye paste kar (**apna email daal** `TERA-EMAIL@gmail.com` ki jagah — same email jo Step 4 me use kiya tha):

```sql
insert into public.admins (email) values ('TERA-EMAIL@gmail.com');
```

3. **Run** kar

> ⚠️ Ye one-time bootstrap hai — is insert ke baad, saare aage ke admin add/remove Admin Console ke `add_admin()`/`remove_admin()` RPCs se hi karne hain, direct SQL se nahi
> ⚠️ Kam se kam ek admin row hamesha rehna chahiye — last admin ko delete/remove karne ki koshish trigger level pe block ho jaayegi

---

## Step 7: `.env` File Update Karna

Project root me `.env` file khol (already bani hui hai) aur apni values daal:

```
VITE_SUPABASE_URL=https://TERA-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=tera-anon-key-yahan-paste-kar
VITE_TEACHER_EMAIL=tera-email@gmail.com
VITE_CLOUDINARY_CLOUD_NAME=demo
VITE_CLOUDINARY_UPLOAD_PRESET=ml_default
VITE_FEATURE_AI=false
```

Replace kar:
- `VITE_SUPABASE_URL` → Step 3 me copy kiya tha
- `VITE_SUPABASE_ANON_KEY` → Step 3 me anon key copy ki thi
- `VITE_TEACHER_EMAIL` → Step 4 ka email

---

## Step 8: Dev Server Restart Karna

Terminal me:
1. Purana server band kar (Ctrl + C)
2. Phir se start kar:
```
npm run dev
```
3. Browser me ja: **http://localhost:5173**

---

## Step 9: Login Karna! 🎉

1. Sign-in page dikhegi
2. **Email** field me apna email daal (Step 4 wala)
3. **Password** field me password daal (Step 4 wala)
4. **Sign in** click kar
5. Dashboard khul jaayega with:
   - 12 students ka data
   - Attendance records
   - Marks
   - Timetable
   - Syllabus progress
   - Quiz attempts
   - Analytics charts
   - Heatmap
   - Leaderboard

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| White screen | Console check kar (F12) — koi error toh nahi? |
| "Invalid credentials" | Supabase me user ka email/password sahi daala? Auto-confirm ON tha? |
| Data nahi dikh raha | Seed SQL run kiya? SQL Editor me `SELECT * FROM students;` run karke check kar |
| "VITE_SUPABASE_URL is not set" | `.env` file sahi jagah hai? Server restart kiya? |
| RLS error (permission denied) | Step 6 ka `ALTER DATABASE` command apne email se run kiya? |

---

## Optional: Google Login Enable Karna

Agar Google Sign-In bhi chahiye (students ke liye):

1. Supabase → Authentication → Providers → **Google** enable kar
2. Google Cloud Console se OAuth Client ID + Secret bana: https://console.cloud.google.com
3. Supabase me Client ID + Secret paste kar
4. Authorized redirect URL me Supabase ka callback URL daal

Ye optional hai — email/password se kaam chal jaayega teacher ke liye.

---

## Optional: Cloudinary Setup (File Uploads ke liye)

Agar study material upload karna hai:

1. https://cloudinary.com pe free account bana
2. Dashboard se **Cloud Name** copy kar
3. Settings → Upload → **Upload Presets** me ek "Unsigned" preset bana
4. `.env` me update kar:
```
VITE_CLOUDINARY_CLOUD_NAME=tera-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=tera-preset-name
```

Bina ye kiye bhi app chalega — sirf file upload feature kaam nahi karega.
