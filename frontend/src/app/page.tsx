import { MenuScreen } from "@/components/menu/MenuScreen";
import { getMenu } from "@/lib/api";

// The menu changes rarely: serve a prerendered page and refresh it in the
// background at most once a minute (ISR, ADR-002 decision 3).
export const revalidate = 60;

export default async function MenuPage() {
  const menu = await getMenu();
  return <MenuScreen menu={menu} />;
}
