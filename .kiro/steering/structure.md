# Project Structure

## Architecture: Layered with Clean Separation

The app follows a three-layer architecture with strict dependency direction:

```
presentation → domain → (pure, no external deps)
presentation → data   → Supabase client
```

Domain services are pure logic with no I/O — they define interfaces that the data layer implements.

## Directory layout

```
src/
├── main.tsx                    # App entry point
├── index.css                   # Global Tailwind styles
├── vite-env.d.ts
│
├── domain/                     # Business logic (pure, testable)
│   ├── shared/                 # Shared types, result utilities, messages
│   ├── services/               # Domain services (one per concern)
│   └── featureFlags.ts         # Build-time feature flag resolution
│
├── data/                       # External I/O and persistence
│   ├── access/                 # Supabase data-access wrappers (one per table/entity)
│   ├── demo/                   # Local demo mode stubs
│   └── migrations/             # SQL migration scripts (sequential numbering)
│
├── presentation/               # UI layer
│   ├── App.tsx                 # Root router with route definitions
│   ├── auth/                   # Auth provider, guards (RequireTeacher, RequireAdmin)
│   ├── components/             # Shared UI components (AppLayout, PageLoader, etc.)
│   ├── context/                # React context providers
│   ├── hooks/                  # Shared custom hooks
│   ├── pages/                  # One component per route (lazy-loaded)
│   ├── views/                  # Presentational view components
│   ├── loaders/                # Data loading utilities
│   ├── format/                 # Display formatting helpers
│   ├── motion.ts               # Shared animation variants
│   ├── navigation.ts           # Sidebar navigation config
│   └── theme.ts                # Theme preference (dark/light)
│
├── features/                   # Self-contained feature modules
│   ├── onboarding/             # Onboarding wizard (api/, components/, hooks/, steps/)
│   └── profile/                # User profile page
│
└── test/
    └── setup.ts                # Vitest global setup (fast-check config)

functions/                      # Cloudflare Pages Functions (edge API routes)
├── api/
│   ├── admin-create-teacher.ts
│   └── generate-quiz.ts

docs/                           # Design documents, audit reports, migration plans
public/                         # Static assets (_headers, _redirects for Cloudflare)
```

## Conventions

### File naming
- Components/pages: PascalCase (`DashboardPage.tsx`, `AppLayout.tsx`)
- Services/access/utils: camelCase (`attendanceService.ts`, `attendanceAccess.ts`)
- Tests: colocated with source as `*.test.ts` or `*.test.tsx`

### Data access pattern
- Each entity gets a `create<Entity>Access(client?)` factory function in `src/data/access/`
- Factory accepts an optional Supabase client (defaults to singleton) for testability
- Returns an interface defined in the same file
- Uses `expectOk()` and `unwrapList()` helpers from `./support.ts` for error handling

### Domain services
- Pure functions and in-memory implementations (no Supabase imports)
- Define interfaces that data access layer implements
- Each service file is independently testable without network

### Routing
- All page components are lazy-loaded with `React.lazy()`
- Teacher routes are wrapped in `RequireTeacher` + `OnboardingGate`
- Admin routes are wrapped in `RequireAdmin` (separate shell from teacher)
- Public routes: sign-in, student quiz access

### Database
- SQL migrations in `src/data/migrations/` with sequential numbering (`0001_`, `0002_`, etc.)
- Supabase RLS policies enforced — client uses anon key
- Full schema setup available in `FULL_SETUP.sql`
