import Image from "next/image";
import { cx } from "@/lib/cx";
import { placeholderEmoji } from "@/lib/menuImage";
import { strings } from "@/lib/strings";

export type MenuImageSize = "thumb" | "row" | "hero";

interface MenuImageProps {
  item: { name: string; imageUrl: string | null };
  categoryName: string;
  size: MenuImageSize;
  className?: string;
}

const SIZE_CLASSES: Record<MenuImageSize, string> = {
  // Cart lines.
  thumb: "h-[52px] w-[52px] rounded border-2 border-navy text-[26px]",
  // Menu rows.
  row: "h-24 w-24 rounded border-2 border-navy text-[44px]",
  // Item detail, edge to edge.
  hero: "h-[300px] w-full border-b-[3px] border-navy text-[120px]",
};

// Rendered width, for next/image to pick a source size.
const IMAGE_SIZES: Record<MenuImageSize, string> = {
  thumb: "52px",
  row: "96px",
  hero: "100vw",
};

// The one place food images are drawn. While image_url is null it shows an
// emoji on a yellow box; when photos are uploaded only the data changes.
// A photo's host must be listed in next.config.ts images.remotePatterns.
//
// Thumbnails and rows sit next to the item's name, so they're hidden from
// screen readers; only the hero (the item's own page) is announced.
export function MenuImage({ item, categoryName, size, className }: MenuImageProps) {
  const isHero = size === "hero";
  const boxClasses = cx(
    "relative flex shrink-0 items-center justify-center overflow-hidden bg-yellow leading-none",
    SIZE_CLASSES[size],
    className,
  );

  if (item.imageUrl) {
    return (
      <div className={boxClasses}>
        <Image
          src={item.imageUrl}
          alt={isHero ? item.name : ""}
          fill
          sizes={IMAGE_SIZES[size]}
          priority={isHero}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={boxClasses}
      {...(isHero
        ? { role: "img", "aria-label": strings.menu.photoPending(item.name) }
        : { "aria-hidden": true })}
    >
      {placeholderEmoji(item.name, categoryName)}
    </div>
  );
}
