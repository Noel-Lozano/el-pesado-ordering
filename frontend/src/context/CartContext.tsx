"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useReducer } from "react";
import {
  type CartItemInput,
  type CartLine,
  cartReducer,
  getCartTotals,
  initialCartState,
} from "@/context/cartReducer";
import { loadCart, saveCart } from "@/context/cartStorage";

interface CartContextValue {
  lines: CartLine[];
  hasLoaded: boolean;
  itemCount: number;
  subtotalCents: number;
  addItem: (item: CartItemInput) => void;
  setQuantity: (menuItemId: number, quantity: number) => void;
  setNote: (menuItemId: number, note: string) => void;
  removeItem: (menuItemId: number) => void;
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
      addItem: (item) => dispatch({ type: "add", item }),
      setQuantity: (menuItemId, quantity) => dispatch({ type: "setQuantity", menuItemId, quantity }),
      setNote: (menuItemId, note) => dispatch({ type: "setNote", menuItemId, note }),
      removeItem: (menuItemId) => dispatch({ type: "remove", menuItemId }),
      clearCart: () => dispatch({ type: "clear" }),
    };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
}
