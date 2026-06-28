/**
 * Full-page loading spinner shown while lazy-loaded route chunks are fetched.
 * Used as the Suspense fallback in the application router.
 */
export default function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
    </div>
  );
}
