import type { FieldMap } from '../introspection/introspect-table.types.js'
import type { FileConfig, FileSummary } from './file.types.js'

function normalize(config: FileConfig): {
  field: string
  accept?: string
  maxBytes?: number
} {
  return typeof config === 'string' ? { field: config } : config
}

/**
 * Resolve a collection's file fields against its columns.
 *
 * Django puts a `FileField` on the model, so the column and the upload are one
 * declaration. Drizzle has no such column type — a stored file is a string
 * somewhere — so what is declared here is *which* string column holds a key,
 * and the storage adapter decides what a key means.
 *
 * Every failure is at declaration time, for the reason `list_display`'s are: a
 * file field that resolves to nothing renders as an empty picker, and an empty
 * picker looks like a record that simply has no file.
 */
export function resolveFiles(
  slug: string,
  fields: FieldMap,
  readonly: readonly string[],
  configs: readonly FileConfig[],
): FileSummary[] {
  return configs.map((config) => {
    const { field, accept, maxBytes } = normalize(config)
    const meta = fields[field]

    if (!meta) {
      throw new Error(
        `files on "${slug}" names "${field}", which is not a column`,
      )
    }
    if (meta.dataType !== 'string') {
      throw new Error(
        `files on "${slug}" names "${field}", which is a ${meta.dataType} ` +
          `column; a file field holds the key its store returned, which is text`,
      )
    }
    // Readonly is enforced on the write path, so an upload would store a file
    // and then have its key stripped before it reached the row — a file nothing
    // points at, and a form that looked like it saved.
    if (readonly.includes(field)) {
      throw new Error(
        `files on "${slug}" names "${field}", which is readonly; a file field ` +
          `has to be writable for an upload to be kept`,
      )
    }
    if (maxBytes !== undefined && maxBytes <= 0) {
      throw new Error(
        `files on "${slug}" gives "${field}" a maxBytes of ${String(maxBytes)}`,
      )
    }

    return {
      field,
      accept: accept ?? null,
      maxBytes: maxBytes ?? null,
    }
  })
}

/** Refuse an upload the field's own declaration does not accept. */
export function checkUpload(
  summary: FileSummary,
  contentType: string,
  size: number,
): string | null {
  if (summary.maxBytes !== null && size > summary.maxBytes) {
    return `${summary.field} takes at most ${String(summary.maxBytes)} bytes; this is ${String(size)}`
  }
  if (summary.accept && !acceptsType(summary.accept, contentType)) {
    return `${summary.field} accepts ${summary.accept}; this is ${contentType || 'an unnamed type'}`
  }
  return null
}

/**
 * Whether an `accept` list covers a content type. Handles the two forms a
 * picker actually uses — an exact type and a `type/*` wildcard — and ignores
 * extension entries, which name a file rather than its type.
 */
function acceptsType(accept: string, contentType: string): boolean {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!type) return false
  return accept
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry && !entry.startsWith('.'))
    .some((entry) =>
      entry.endsWith('/*')
        ? type.startsWith(entry.slice(0, -1))
        : entry === type,
    )
}
