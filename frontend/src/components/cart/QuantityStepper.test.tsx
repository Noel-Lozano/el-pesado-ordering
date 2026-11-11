// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { MAX_QUANTITY_PER_LINE } from "@/context/cartReducer";

afterEach(cleanup);

function renderStepper(props: Partial<Parameters<typeof QuantityStepper>[0]> = {}) {
  const onDecrease = vi.fn();
  const onIncrease = vi.fn();
  render(
    <QuantityStepper itemName="Asado" quantity={2} onDecrease={onDecrease} onIncrease={onIncrease} {...props} />,
  );
  return {
    onDecrease,
    onIncrease,
    decrease: screen.getByRole("button", { name: "Quitar uno de Asado" }),
    increase: screen.getByRole("button", { name: "Agregar uno más de Asado" }),
  };
}

describe("QuantityStepper", () => {
  it("shows the quantity and calls back on − and +", async () => {
    const user = userEvent.setup();
    const { decrease, increase, onDecrease, onIncrease } = renderStepper();

    expect(screen.getByText("2")).toBeTruthy();
    await user.click(decrease);
    await user.click(increase);

    expect(onDecrease).toHaveBeenCalledTimes(1);
    expect(onIncrease).toHaveBeenCalledTimes(1);
  });

  it("disables − at the minimum", () => {
    const { decrease } = renderStepper({ quantity: 1, min: 1 });
    expect((decrease as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps − enabled at 1 when the minimum is 0 (cart asks before removing)", () => {
    const { decrease } = renderStepper({ quantity: 1 });
    expect((decrease as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables + at the maximum", () => {
    const { increase } = renderStepper({ quantity: MAX_QUANTITY_PER_LINE });
    expect((increase as HTMLButtonElement).disabled).toBe(true);
  });
});
