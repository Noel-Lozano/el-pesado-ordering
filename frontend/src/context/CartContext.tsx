"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { reconcileCart } from "@/context/cartReconcile";
import {
  type CartItemInput,
  type CartLine,
  cartReducer,
  getCartTotals,
  initialCartState,
} from "@/context/cartReducer";
import { loadCart, saveCart } from "@/context/cartStorage";
import type { MenuCategory } from "@/types/menu";

interface CartContextValue {
  lines: CartLine[];
  hasLoaded: boolean;
  itemCount: number;
  subtotalCents: number;
  addItem: (item: CartItemInput, options?: { quantity?: number; note?: string }) => void;
  setQuantity: (menuItemId: number, quantity: number) => void;
  setNote: (menuItemId: number, note: string) => void;
  removeItem: (menuItemId: number) => void;
  replaceLines: (lines: CartLine[]) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);

  // Read the saved cart after mount, not during render: the server has no
  // localStorage, so reading it during render would make the first client
  // render differ from the server HTML (a hydration mismatch).
  useEffect(() => {
    dispatch({ type: "load", lines: loadCart() });
  }, []);

  useEffect(() => {
    if (state.hasLoaded) {
      saveCart(state.lines);
    }
  }, [state.hasLoaded, state.lines]);

  const value = useMemo<CartContextValue>(() => {
    const { itemCount, subtotalCents } = getCartTotals(state.lines);
    return {
      lines: state.lines,
      hasLoaded: state.hasLoaded,
      itemCount,
      subtotalCents,
      addItem: (item, options) => dispatch({ type: "add", item, quantity: options?.quantity, note: options?.note }),
      setQuantity: (menuItemId, quantity) => dispatch({ type: "setQuantity", menuItemId, quantity }),
      setNote: (menuItemId, note) => dispatch({ type: "setNote", menuItemId, note }),
      removeItem: (menuItemId) => dispatch({ type: "remove", menuItemId }),
      replaceLines: (lines) => dispatch({ type: "replaceLines", lines }),
      clearCart: () => dispatch({ type: "clear" }),
    };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// Re-validates the saved cart against the menu once it has loaded (ADR-004
// §2) and returns the names of dropped items, for a one-time notice.
export function useCartReconcile(categories: MenuCategory[] | null): string[] {
  const { lines, hasLoaded, replaceLines } = useCart();
  const [droppedNames, setDroppedNames] = useState<string[]>([]);
  const reconciledFor = useRef<MenuCategory[] | null>(null);

  useEffect(() => {
    // Once per menu snapshot: later cart edits don't need re-checking.
    if (!hasLoaded || !categories || reconciledFor.current === categories) return;
    reconciledFor.current = categories;

    const result = reconcileCart(lines, categories);
    if (result.hasChanged) {
      replaceLines(result.lines);
    }
    if (result.droppedNames.length > 0) {
      // Reporting an outcome of syncing with external data (the menu), which
      // is what effects are for; it runs once per menu snapshot.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDroppedNames(result.droppedNames);
    }
  }, [hasLoaded, categories, lines, replaceLines]);

  return droppedNames;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
}
