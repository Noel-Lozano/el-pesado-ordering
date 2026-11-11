import { ButtonLink } from "@/components/ui/Button";
import { strings } from "@/lib/strings";

// Spanish 404 for unknown URLs (Next's default page is in English).
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-normal">{strings.notFound.title}</h1>
      <p className="font-semibold text-muted">{strings.notFound.body}</p>
      <ButtonLink href="/" className="w-full">
        {strings.notFound.backToMenu}
      </ButtonLink>
    </main>
  );
}
