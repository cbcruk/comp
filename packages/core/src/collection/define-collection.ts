import { getTableName, type Table } from "drizzle-orm";
import { introspectTable } from "../introspection/introspect-table.js";
import { resolveFilters } from "../filters/resolve-filters.js";
import { resolveForm } from "../form/resolve-form.js";
import { resolveLabels } from "../site/labels.js";
import { resolveSearch } from "../search/resolve-search.js";
import { resolveLabelField } from "./label-field.js";
import type {
  Collection,
  CollectionConfig,
  CollectionOperation,
} from "./define-collection.types.js";

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_OPERATIONS: CollectionOperation[] = [
  "list",
  "read",
  "create",
  "update",
  "delete",
];

/**
 * Declare a collection over a Drizzle table. The result is static and
 * serializable: defaults are resolved here, once, and every downstream
 * surface (UI, server routes, CLI) reads from the returned {@link Collection}
 * rather than re-deriving anything per request.
 */
export function defineCollection<TTable extends Table>(
  config: CollectionConfig<TTable>,
): Collection {
  const introspection = introspectTable(config.model);
  const slug = config.slug ?? getTableName(config.model);
  const operations = config.operations ?? DEFAULT_OPERATIONS;
  const labels = resolveLabels(slug, config.label, config.labelPlural);

  return {
    slug,
    ...labels,
    model: config.model,
    fields: introspection.fields,
    primaryKey: introspection.primaryKey,
    relations: introspection.relations,
    labelField:
      config.labelField ??
      resolveLabelField(
        introspection.fields,
        config.listDisplay,
        introspection.primaryKey,
      ),
    listDisplay: config.listDisplay,
    filters: resolveFilters(introspection.fields, config.filters ?? []),
    search: resolveSearch(slug, introspection.fields, config.search ?? []),
    ordering: config.ordering ?? [],
    pageSize: config.pageSize ?? DEFAULT_PAGE_SIZE,
    form: resolveForm(slug, introspection.fields, introspection.primaryKey, config),
    inlines: config.inlines ?? [],
    manifest: {
      collection: slug,
      operations,
    },
  };
}
