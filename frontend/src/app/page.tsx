import { CategorySection } from "@/components/menu/CategorySection";
import { getMenu } from "@/lib/api";
import { strings } from "@/lib/strings";

// The menu changes rarely: serve a prerendered page and refresh it in the
// background at most once a minute (ISR, ADR-002 decision 3).
export const revalidate = 60;

function categoryAnchorId(index: number): string {
  return `categoria-${index + 1}`;
}

export default async function MenuPage() {
  const menu = await getMenu();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="px-4 pb-2 pt-6">
        <h1 className="text-3xl font-extrabold tracking-tight">{strings.app.name}</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{strings.app.tagline}</p>
      </header>

      {menu.categories.length === 0 ? (
        <p className="px-4 py-12 text-center text-lg">{strings.menu.empty}</p>
      ) : (
        <>
          <nav
            aria-label={strings.menu.categoriesNavLabel}
            className="sticky top-0 z-10 border-b border-zinc-200 bg-background dark:border-zinc-800"
          >
            <ul className="flex gap-2 overflow-x-auto px-4 py-2">
              {menu.categories.map((category, index) => (
                <li key={category.name} className="shrink-0">
                  <a
                    href={`#${categoryAnchorId(index)}`}
                    className="flex min-h-11 items-center rounded-full border border-zinc-300 px-4 text-sm font-medium dark:border-zinc-700"
                  >
                    {category.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <main className="flex flex-col gap-8 px-4 py-6">
            {menu.categories.map((category, index) => (
              <CategorySection key={category.name} category={category} anchorId={categoryAnchorId(index)} />
            ))}
          </main>
        </>
      )}
    </div>
  );
}
