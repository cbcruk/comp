/** How deep the drill-down currently is. */
export type HierarchyLevel = "year" | "month" | "day" | "record";

/**
 * A position in the date drill-down. Every part present narrows the window by
 * one step; nothing present is "all dates".
 */
export interface DatePath {
  year?: number;
  month?: number;
  day?: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Read a trail off the wire: `2026`, `2026-07`, `2026-07-16`.
 *
 * A readable path rather than three query parameters, so the URL of a
 * drilled-in list still says what it is showing. Anything malformed is read as
 * "all dates" instead of failing — a bad date in a URL should show you the
 * unfiltered list, not an error page.
 */
export function parseDatePath(raw: string | undefined): DatePath {
  if (!raw) return {};
  const parts = raw.split("-");
  const [year, month, day] = parts.map((part) => Number.parseInt(part, 10));

  if (parts.length > 3 || !Number.isFinite(year) || year === undefined) return {};
  if (year < 1 || year > 9999) return {};
  if (month === undefined) return { year };
  if (!Number.isFinite(month) || month < 1 || month > 12) return {};
  if (day === undefined) return { year, month };
  if (!Number.isFinite(day) || day < 1 || day > daysInMonth(year, month)) return {};
  return { year, month, day };
}

export function formatDatePath(path: DatePath): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  if (path.year === undefined) return "";
  if (path.month === undefined) return String(path.year);
  if (path.day === undefined) return `${String(path.year)}-${pad(path.month)}`;
  return `${String(path.year)}-${pad(path.month)}-${pad(path.day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Which level a path is *showing* — one step past what it has narrowed to. */
export function levelOf(path: DatePath): HierarchyLevel {
  if (path.year === undefined) return "year";
  if (path.month === undefined) return "month";
  if (path.day === undefined) return "day";
  return "record";
}

/**
 * The half-open window `[from, to)` a path selects, in UTC — the same shape and
 * the same reasoning as the date filter's named windows. A path with nothing in
 * it selects everything, so there is no window at all.
 */
export function datePathRange(path: DatePath): { from: Date; to: Date } | null {
  if (path.year === undefined) return null;

  if (path.month === undefined) {
    return {
      from: new Date(Date.UTC(path.year, 0, 1)),
      to: new Date(Date.UTC(path.year + 1, 0, 1)),
    };
  }
  if (path.day === undefined) {
    return {
      from: new Date(Date.UTC(path.year, path.month - 1, 1)),
      to: new Date(Date.UTC(path.year, path.month, 1)),
    };
  }
  return {
    from: new Date(Date.UTC(path.year, path.month - 1, path.day)),
    to: new Date(Date.UTC(path.year, path.month - 1, path.day + 1)),
  };
}

export interface HierarchyBucket {
  /** The path this bucket drills into. */
  path: DatePath;
  label: string;
  /** The window it covers. */
  from: Date;
  to: Date;
}

/**
 * The buckets one level down from a path.
 *
 * Below a year there are twelve months and below a month its days, whatever
 * the data looks like — so those levels need no reconnaissance. Only the top
 * level depends on the records: which years to offer comes from the span of
 * the column, which is why the caller passes it in.
 */
export function bucketsFor(
  path: DatePath,
  span: { min: Date; max: Date } | null,
): HierarchyBucket[] {
  const level = levelOf(path);

  if (level === "year") {
    if (!span) return [];
    const first = span.min.getUTCFullYear();
    const last = span.max.getUTCFullYear();
    const buckets: HierarchyBucket[] = [];
    for (let year = first; year <= last; year += 1) {
      buckets.push({
        path: { year },
        label: String(year),
        from: new Date(Date.UTC(year, 0, 1)),
        to: new Date(Date.UTC(year + 1, 0, 1)),
      });
    }
    return buckets;
  }

  if (level === "month" && path.year !== undefined) {
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return {
        path: { year: path.year, month },
        label: MONTH_NAMES[index] ?? String(month),
        from: new Date(Date.UTC(path.year!, index, 1)),
        to: new Date(Date.UTC(path.year!, index + 1, 1)),
      };
    });
  }

  if (level === "day" && path.year !== undefined && path.month !== undefined) {
    const { year, month } = path;
    return Array.from({ length: daysInMonth(year, month) }, (_, index) => {
      const day = index + 1;
      return {
        path: { year, month, day },
        label: String(day),
        from: new Date(Date.UTC(year, month - 1, day)),
        to: new Date(Date.UTC(year, month - 1, day + 1)),
      };
    });
  }

  return [];
}

export interface HierarchyCrumb {
  label: string;
  path: DatePath;
}

/** The trail back up, starting from "All dates". */
export function breadcrumbFor(path: DatePath): HierarchyCrumb[] {
  const crumbs: HierarchyCrumb[] = [{ label: "All dates", path: {} }];
  if (path.year === undefined) return crumbs;

  crumbs.push({ label: String(path.year), path: { year: path.year } });
  if (path.month === undefined) return crumbs;

  crumbs.push({
    label: MONTH_NAMES[path.month - 1] ?? String(path.month),
    path: { year: path.year, month: path.month },
  });
  if (path.day === undefined) return crumbs;

  crumbs.push({ label: String(path.day), path });
  return crumbs;
}
