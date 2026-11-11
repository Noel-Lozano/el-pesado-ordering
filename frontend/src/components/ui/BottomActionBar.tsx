import type { ReactNode } from "react";

// The white footer that holds a screen's main action. It's sticky at the end
// of the page's flex column, so it stays in view while scrolling without
// covering the last bit of content, and it clears the iPhone home indicator.
// The page's <main> must be `flex flex-1 flex-col` for mt-auto to work.
export function BottomActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto border-t-2 border-navy bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
      <div className="mx-auto flex max-w-xl flex-col gap-2">{children}</div>
    </div>
  );
}
