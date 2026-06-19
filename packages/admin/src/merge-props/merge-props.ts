type Props = Record<string, unknown>;

function isEventHandler(key: string, a: unknown, b: unknown): boolean {
  return /^on[A-Z]/.test(key) && typeof a === "function" && typeof b === "function";
}

/**
 * Merge prop objects left-to-right following the Base UI convention:
 * `className` concatenated, `style` shallow-merged, `on*` handlers chained
 * (earlier then later), and every other prop overridden by the later value
 * (an `undefined` later value does not clobber an earlier one).
 */
export function mergeProps<T extends Props>(
  ...sources: Array<Partial<T> | undefined>
): T {
  const result: Props = {};

  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      const existing = result[key];

      if (key === "className") {
        const merged = [existing, value].filter(Boolean).join(" ");
        result[key] = merged === "" ? undefined : merged;
      } else if (key === "style") {
        result[key] = {
          ...(existing as object | undefined),
          ...(value as object | undefined),
        };
      } else if (isEventHandler(key, existing, value)) {
        const first = existing as (...args: unknown[]) => void;
        const second = value as (...args: unknown[]) => void;
        result[key] = (...args: unknown[]) => {
          first(...args);
          second(...args);
        };
      } else if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result as T;
}
