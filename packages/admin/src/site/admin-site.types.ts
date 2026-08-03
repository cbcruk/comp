import type { AdminRoute } from "@comp/core";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type {
  CollectionSummary,
  CompClient,
  Row,
} from "../client/create-client.types.js";
import type { FieldControl } from "../collection-form/collection-form.types.js";

export interface AdminScreenContext {
  client: CompClient;
  collection: CollectionSummary;
  route: AdminRoute;
  navigate: (route: AdminRoute) => void;
}

export interface AdminSiteProps extends ComponentPropsWithoutRef<"div"> {
  client: CompClient;
  /** Collections as the server listed them for this caller. */
  collections: CollectionSummary[];
  /** Current screen. `useHashRoute` supplies one, or bring your own router. */
  route: AdminRoute;
  onNavigate: (route: AdminRoute) => void;
  /** Notified on every success and failure the site produces. */
  onNotify?: (kind: "success" | "error", message: string) => void;
  /** Per-collection, per-field widget overrides for the record form. */
  fieldWidgets?: Record<
    string,
    Record<string, (control: FieldControl) => ReactNode>
  >;
  /** Replace a screen entirely; return undefined to keep the built-in one. */
  renderScreen?: (context: AdminScreenContext) => ReactNode | undefined;
  /** Rendered above every screen — a place for a title bar or toasts. */
  header?: ReactNode;
  title?: string;
}

export interface AdminIndexProps extends ComponentPropsWithoutRef<"nav"> {
  collections: CollectionSummary[];
  navigate: (route: AdminRoute) => void;
}

export interface RecordScreenProps {
  client: CompClient;
  collection: CollectionSummary;
  /** Every collection, so an inline can read its child's fields. */
  collections: CollectionSummary[];
  /** Record id when editing; null when adding. */
  id: string | null;
  navigate: (route: AdminRoute) => void;
  onNotify?: (kind: "success" | "error", message: string) => void;
  fieldWidgets?: Record<string, (control: FieldControl) => ReactNode>;
}

export interface HistoryScreenProps {
  client: CompClient;
  collection: CollectionSummary;
  id: string;
  navigate: (route: AdminRoute) => void;
}

export interface DeleteScreenProps {
  client: CompClient;
  collection: CollectionSummary;
  id: string;
  navigate: (route: AdminRoute) => void;
  onNotify?: (kind: "success" | "error", message: string) => void;
}

export type { Row };
