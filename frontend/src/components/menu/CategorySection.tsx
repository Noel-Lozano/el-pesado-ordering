import { MenuItemCard } from "@/components/menu/MenuItemCard";
import type { MenuCategory } from "@/types/menu";

interface CategorySectionProps {
  category: MenuCategory;
  anchorId: string;
}

export function CategorySection({ category, anchorId }: CategorySectionProps) {
  const headingId = `${anchorId}-titulo`;

  return (
    // scroll-mt keeps the heading clear of the sticky category nav when
    // jumping to it from a nav link.
    <section id={anchorId} aria-labelledby={headingId} className="scroll-mt-20">
      <h2 id={headingId} className="text-2xl font-bold">
        {category.name}
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {category.items.map((item) => (
          <li key={item.id}>
            <MenuItemCard item={item} categoryName={category.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}
