import Image from "next/image";
import { SearchIcon } from "@/components/ui/icons";
import { strings } from "@/lib/strings";

interface MenuHeaderProps {
  query: string;
  onQueryChange: (query: string) => void;
}

// Navy header from mockup 01: logo, "BURRITOS EL PESADO" in yellow with a red
// outline, the pickup line and the search box.
export function MenuHeader({ query, onQueryChange }: MenuHeaderProps) {
  return (
    <header className="bg-navy px-4 pb-[18px] pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt={strings.menu.logoAlt}
            width={56}
            height={56}
            priority
            className="h-14 w-14 rounded border-[3px] border-yellow bg-cream object-cover"
          />
          <div className="flex flex-col gap-1">
            <h1 className="title-outline font-display text-[25px] font-normal uppercase leading-none">
              {strings.app.name}
            </h1>
            <p className="text-[13px] font-bold text-white">{strings.menu.pickupLine}</p>
          </div>
        </div>

        {/* The ring sits on the label because the input itself is borderless;
            yellow, since a navy ring would vanish against the header. */}
        <label className="flex h-[46px] items-center gap-2.5 rounded bg-white px-3.5 text-muted focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-yellow lg:w-96">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            aria-label={strings.menu.searchLabel}
            placeholder={strings.menu.searchLabel}
            enterKeyHint="search"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-semibold text-navy placeholder:text-muted focus-visible:outline-none"
          />
        </label>
      </div>
    </header>
  );
}
