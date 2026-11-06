import Link from "next/link";
import { strings } from "@/lib/strings";

// Spanish 404 for unknown URLs (Next's default page is in English).
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{strings.notFound.title}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{strings.notFound.body}</p>
      <Link
        href="/"
        className="flex min-h-11 items-center rounded-full bg-red-700 px-6 font-semibold text-white active:bg-red-800"
      >
        {strings.notFound.backToMenu}
      </Link>
    </main>
  );
}
