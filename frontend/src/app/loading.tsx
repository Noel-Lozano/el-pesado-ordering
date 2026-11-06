import { strings } from "@/lib/strings";

// Shown while a server-rendered page loads (e.g. /orders/[id], or the menu
// on a cold cache), so a slow connection never looks like a blank screen.
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-red-700 motion-reduce:animate-none dark:border-zinc-800 dark:border-t-red-500"
      />
      <p role="status" className="text-zinc-600 dark:text-zinc-400">
        {strings.common.loading}
      </p>
    </main>
  );
}
