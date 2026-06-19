import type { JSX } from "react";
import type { Toast } from "./toast-store.js";

export interface ToastsProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

/** Render the active toasts with a dismiss control. Presentational. */
export function Toasts({ toasts, onDismiss }: ToastsProps): JSX.Element {
  return (
    <div role="region" aria-label="Notifications">
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
