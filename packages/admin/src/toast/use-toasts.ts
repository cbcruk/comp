import { useCallback, useReducer, useRef } from "react";
import { toastReducer, type Toast, type ToastKind } from "./toast-store.js";

export interface UseToastsResult {
  toasts: Toast[];
  notify: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
}

/**
 * Hold a list of toasts. `notify` assigns a monotonic id and (unless disabled)
 * auto-dismisses after `autoDismissMs`. The reducer stays pure; ids and timers
 * are the hook's job.
 */
export function useToasts(autoDismissMs = 4000): UseToastsResult {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(0);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current;
      nextId.current += 1;
      dispatch({ type: "add", toast: { id, kind, message } });
      if (autoDismissMs > 0) {
        setTimeout(() => dispatch({ type: "dismiss", id }), autoDismissMs);
      }
    },
    [autoDismissMs],
  );

  const dismiss = useCallback((id: number) => {
    dispatch({ type: "dismiss", id });
  }, []);

  return { toasts, notify, dismiss };
}
