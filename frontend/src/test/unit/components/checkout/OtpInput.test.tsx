// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OtpInput } from "@/components/checkout/OtpInput";

afterEach(cleanup);

// OtpInput is controlled; this wrapper holds the value like VerifyForm does.
function Harness({ onChange }: { onChange: (digits: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <OtpInput
      value={code}
      onChange={(digits) => {
        setCode(digits);
        onChange(digits);
      }}
    />
  );
}

function setup() {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Harness onChange={onChange} />);
  const boxes = Array.from({ length: 6 }, (_, index) =>
    screen.getByRole("textbox", { name: `Dígito ${index + 1}` }),
  ) as HTMLInputElement[];
  return { user, boxes, onChange };
}

const valueOf = (boxes: HTMLInputElement[]) => boxes.map((box) => box.value).join("");

describe("OtpInput", () => {
  it("renders six labelled boxes in a labelled group, first with one-time-code", () => {
    const { boxes } = setup();
    expect(screen.getByRole("group", { name: "Código de 6 dígitos" })).toBeTruthy();
    expect(boxes[0].getAttribute("autocomplete")).toBe("one-time-code");
    expect(boxes.every((box) => box.inputMode === "numeric")).toBe(true);
  });

  it("advances focus as digits are typed", async () => {
    const { user, boxes, onChange } = setup();
    await user.click(boxes[0]);
    await user.keyboard("123");
    expect(valueOf(boxes)).toBe("123");
    expect(document.activeElement).toBe(boxes[3]);
    expect(onChange).toHaveBeenLastCalledWith("123");
  });

  it("ignores non-digits", async () => {
    const { user, boxes } = setup();
    await user.click(boxes[0]);
    await user.keyboard("a1-b2");
    expect(valueOf(boxes)).toBe("12");
  });

  it("fills every box from a pasted code, keeping only digits", async () => {
    const { user, boxes, onChange } = setup();
    await user.click(boxes[0]);
    await user.paste("Tu código: 483 921");
    expect(valueOf(boxes)).toBe("483921");
    expect(onChange).toHaveBeenLastCalledWith("483921");
    expect(document.activeElement).toBe(boxes[5]);
  });

  it("fills every box when autofill drops the whole code into the first box", () => {
    const { boxes } = setup();
    // Autofill sets the whole value at once rather than typing key by key.
    fireEvent.change(boxes[0], { target: { value: "654321" } });
    expect(valueOf(boxes)).toBe("654321");
    expect(document.activeElement).toBe(boxes[5]);
  });

  it("moves back and deletes with Backspace on an empty box", async () => {
    const { user, boxes } = setup();
    await user.click(boxes[0]);
    await user.keyboard("12");
    expect(document.activeElement).toBe(boxes[2]);
    await user.keyboard("{Backspace}");
    expect(valueOf(boxes)).toBe("1");
    expect(document.activeElement).toBe(boxes[1]);
  });

  it("jumps to the next empty box when a later box is tapped", async () => {
    const { user, boxes } = setup();
    await user.click(boxes[4]);
    expect(document.activeElement).toBe(boxes[0]);
  });
});
