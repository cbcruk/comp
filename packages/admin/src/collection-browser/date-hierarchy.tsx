import type { DateHierarchy } from "@comp/core";
import type { JSX } from "react";

export interface DateHierarchyStripProps {
  hierarchy: DateHierarchy;
  /** The path currently selected, as it appears in the query string. */
  value: string;
  onNavigate: (path: string) => void;
}

/**
 * The date drill-down: a trail back up, and the periods one step down that
 * actually contain records.
 *
 * Only non-empty periods are offered — the server counted them within whatever
 * the list is already showing, so a month the current filters emptied is not a
 * link to nowhere.
 */
export function DateHierarchyStrip({
  hierarchy,
  value,
  onNavigate,
}: DateHierarchyStripProps): JSX.Element | null {
  if (hierarchy.choices.length === 0 && hierarchy.breadcrumb.length <= 1) {
    return null;
  }

  return (
    <nav aria-label={`Browse by ${hierarchy.field}`}>
      <ol>
        {hierarchy.breadcrumb.map((crumb) => (
          <li key={crumb.path || "all"}>
            {crumb.path === value ? (
              <span aria-current="page">{crumb.label}</span>
            ) : (
              <button type="button" onClick={() => onNavigate(crumb.path)}>
                {crumb.label}
              </button>
            )}
          </li>
        ))}
      </ol>

      {hierarchy.choices.length > 0 && (
        <ul>
          {hierarchy.choices.map((choice) => (
            <li key={choice.path}>
              <button type="button" onClick={() => onNavigate(choice.path)}>
                {choice.label} ({choice.count})
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
