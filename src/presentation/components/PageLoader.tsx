import { ProgressIndicator } from './ui';

/**
 * Full-page loading state shown while lazy-loaded route chunks are fetched.
 * Used as the Suspense fallback in the application router.
 */
export default function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm rounded-dialog border border-border bg-surface p-5 shadow-soft motion-page-enter">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-button bg-accent text-sm font-semibold text-surface">
            MIS
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Preparing workspace</p>
            <p className="text-xs leading-5 text-muted">Loading your academic tools.</p>
          </div>
        </div>
        <ProgressIndicator />
      </div>
    </div>
  );
}
