/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * FEATURE_AI flag (Requirement 15.4). Controls whether the AI Quiz Generator
   * and Risk Predictor entry points are active or rendered as locked
   * placeholders. Exposed to the static bundle via the Vite `VITE_` prefix.
   * Accepts 'true'/'1' (enabled) or anything else / unset (disabled).
   */
  readonly VITE_FEATURE_AI?: string;

  /**
   * Supabase project URL (Requirement 18.3). Read from the build-time
   * environment rather than hard-coded, and exposed to the static bundle via
   * the Vite `VITE_` prefix.
   */
  readonly VITE_SUPABASE_URL?: string;

  /**
   * Supabase Anon_Key (Requirements 18.1, 18.3). The anonymous public API key
   * that is safe to ship in the frontend bundle. This is the ONLY Supabase key
   * exposed to the client — the privileged Service_Role_Key MUST NEVER appear
   * in frontend code or the static bundle (Requirement 18.2).
   */
  readonly VITE_SUPABASE_ANON_KEY?: string;

  /**
   * Pre-provisioned teacher identity (Requirements 1.1, 1.7). The email of the
   * single administrator account, used for **navigation gating only** — the
   * authoritative authorization boundary is Postgres RLS / `is_teacher()`.
   * Exposed to the static bundle via the Vite `VITE_` prefix.
   */
  readonly VITE_TEACHER_EMAIL?: string;

  /**
   * Cloudinary cloud name (Requirements 16.3, 10.1, 22.3). Identifies the
   * Cloudinary account that public/heavy uploads are sent to and served from
   * via the CDN. Read from the build-time environment and exposed to the
   * static bundle via the Vite `VITE_` prefix.
   */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;

  /**
   * Cloudinary unsigned upload preset (Requirements 16.3, 10.1). Allows the
   * static frontend bundle to upload public/heavy files directly to Cloudinary
   * without exposing a privileged API secret. Exposed via the Vite `VITE_`
   * prefix.
   */
  readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
