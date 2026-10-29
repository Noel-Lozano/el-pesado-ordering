"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import { strings } from "@/lib/strings";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">{strings.errors.menuLoad.title}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{strings.errors.menuLoad.body}</p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-11 rounded-full bg-red-700 px-6 font-semibold text-white active:bg-red-800"
      >
        {strings.errors.menuLoad.retry}
      </button>
    </main>
  );
}
