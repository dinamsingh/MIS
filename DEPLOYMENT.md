# Deployment Guide — Teacher Academic MIS

This application is a static Vite bundle designed for Cloudflare Pages hosting.

## Build Command and Output

| Setting          | Value              |
|------------------|--------------------|
| Build command    | `npm run build`    |
| Output directory | `dist`             |

The build command runs TypeScript type-checking (`tsc -b`) followed by the Vite production bundler (`vite build`). The resulting static assets are written to the `dist` directory at the project root.

## Required Environment Variables

All configuration is read from environment variables at build time via Vite's `VITE_`-prefixed `import.meta.env` mechanism. No secrets are hard-coded.

| Variable                         | Purpose                                              | Required |
|----------------------------------|------------------------------------------------------|----------|
| `VITE_SUPABASE_URL`             | Supabase project URL                                 | Yes      |
| `VITE_SUPABASE_ANON_KEY`        | Supabase anonymous (public) API key                  | Yes      |
| `VITE_CLOUDINARY_CLOUD_NAME`    | Cloudinary cloud name for public/heavy file uploads  | Yes      |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary unsigned upload preset name               | Yes      |
| `VITE_TEACHER_EMAIL`            | Pre-provisioned teacher email for identity gating    | Yes      |
| `VITE_FEATURE_AI`               | Feature flag for AI capabilities (`true` or `false`) | No       |

### Security notes

- Only the Supabase **Anon Key** (public, safe for browsers) is included in the bundle.
- The Supabase **Service Role Key** is never referenced in the frontend code and must NOT be added as a build-time variable.
- `VITE_FEATURE_AI` defaults to `false` (AI features locked) when not set.

## Configuring Cloudflare Pages

### Initial setup

1. In the Cloudflare dashboard, go to **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Select the repository and branch to deploy from.
3. Under **Build settings**, configure:
   - **Framework preset**: None (or Vite if available)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

### Setting environment variables

1. In the Cloudflare dashboard, navigate to your Pages project → **Settings** → **Environment variables**.
2. Add each variable listed above under the **Production** environment (and optionally **Preview** for staging branches).
3. Click **Encrypt** for sensitive values like `VITE_SUPABASE_ANON_KEY` to prevent them from being displayed in the dashboard after saving.
4. Save changes. The variables will be injected at the next build.

### Deploying

- Push to the configured branch to trigger an automatic build and deployment.
- Alternatively, use `npx wrangler pages deploy dist` from a local machine after running `npm run build` with the env vars exported in your shell.

### Preview deployments

Cloudflare Pages creates a preview deployment for every pull request. Preview deployments use the **Preview** environment variables. Set the same variables under the Preview environment if you need functional previews.

## Local Development

For local development, create a `.env` file at the project root (git-ignored):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_CLOUDINARY_CLOUD_NAME=your-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=your-upload-preset
VITE_TEACHER_EMAIL=teacher@example.com
VITE_FEATURE_AI=false
```

Then run `npm run dev` to start the Vite dev server.
