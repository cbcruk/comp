export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export type ToastAction =
  | { type: "add"; toast: Toast }
  | { type: "dismiss"; id: number };

/** Pure reducer for the toast list — id assignment lives in the hook. */
export function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case "add":
      return [...state, action.toast];
    case "dismiss":
      return state.filter((toast) => toast.id !== action.id);
  }
}
