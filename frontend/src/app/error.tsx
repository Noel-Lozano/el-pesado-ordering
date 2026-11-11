"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
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
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-normal">{strings.errors.menuLoad.title}</h1>
      <p className="font-semibold text-muted">{strings.errors.menuLoad.body}</p>
      <Button onClick={() => retry()} className="w-full">
        {strings.errors.menuLoad.retry}
      </Button>
    </main>
  );
}
