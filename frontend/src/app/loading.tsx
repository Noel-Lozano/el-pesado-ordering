import { strings } from "@/lib/strings";

// Shown while a server-rendered page loads (e.g. /orders/[id], or the menu
// on a cold cache), so a slow connection never looks like a blank screen.
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-sm border-4 border-line border-t-navy motion-reduce:animate-none"
      />
      <p role="status" className="font-bold text-muted">
        {strings.common.loading}
      </p>
    </main>
  );
}
