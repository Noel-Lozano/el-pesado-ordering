import { CheckIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { FOOD_PLACEHOLDER } from "@/lib/menuImage";
import { strings } from "@/lib/strings";
import type { OrderStatus } from "@/types/order";

// Which of the three steps (Recibido → Preparando → Listo para recoger) a
// status has reached. picked_up means all three are done. no_show and
// cancelled have no progress to show; the caller renders a notice instead.
const CURRENT_STEP_BY_STATUS: Partial<Record<OrderStatus, number>> = {
  created: 0,
  confirmed: 0,
  preparing: 1,
  ready: 2,
  picked_up: 3,
};

export function hasTrackerProgress(status: OrderStatus): boolean {
  return CURRENT_STEP_BY_STATUS[status] !== undefined;
}

// The vertical tracker from mockup 06: done steps are navy with a yellow
// check, the current one is orange with a burrito and a short line of
// detail, upcoming ones are an empty grey box.
export function StatusTracker({ status }: { status: OrderStatus }) {
  const currentStep = CURRENT_STEP_BY_STATUS[status];
  if (currentStep === undefined) return null;

  // "Listo para recoger" is shown done (checked) once the order is ready.
  const isReadyOrLater = status === "ready" || status === "picked_up";
  // The step screen readers announce as current; none once picked up.
  const activeStep = status === "picked_up" ? null : currentStep;

  return (
    <ol
      aria-label={strings.order.stepsLabel}
      className="flex flex-col rounded border-2 border-navy bg-white p-3.5 shadow-hard"
    >
      {strings.order.steps.map((label, index) => {
        const isDone = index < currentStep || isReadyOrLater;
        const isCurrent = index === currentStep && !isDone;
        const isLast = index === strings.order.steps.length - 1;
        return (
          <li key={label} aria-current={index === activeStep ? "step" : undefined} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-sm text-sm",
                  isDone && "bg-navy text-yellow",
                  isCurrent && "border-2 border-navy bg-orange",
                  !isDone && !isCurrent && "border-2 border-disabled bg-white",
                )}
              >
                {isDone && <CheckIcon />}
                {isCurrent && FOOD_PLACEHOLDER}
              </span>
              {!isLast && <span aria-hidden className={cx("h-[22px] w-[3px]", isDone ? "bg-navy" : "bg-line")} />}
            </div>
            <div className="flex flex-col gap-0.5 pt-[3px]">
              <p className={cx("text-base", isDone || isCurrent ? "font-black" : "font-extrabold text-muted")}>{label}</p>
              {isCurrent && <p className="text-[13px] font-bold text-muted">{strings.order.status[status].body}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
