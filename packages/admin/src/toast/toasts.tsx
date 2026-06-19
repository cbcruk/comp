import type { ComponentPropsWithoutRef, JSX } from "react";
import { mergeProps } from "../merge-props/merge-props.js";
import type { Toast } from "./toast-store.js";

export interface ToastsProps extends ComponentPropsWithoutRef<"div"> {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

/** Render the active toasts with a dismiss control. Presentational. */
export function Toasts({ toasts, onDismiss, ...rest }: ToastsProps): JSX.Element {
  return (
    <div
      {...mergeProps<ComponentPropsWithoutRef<"div">>(
        { role: "region", "aria-label": "Notifications" },
        rest,
      )}
    >
      {toasts.map((toast) => (
        <div key={toast.id} role="status" data-kind={toast.kind}>
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
