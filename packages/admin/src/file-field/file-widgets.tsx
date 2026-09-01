import type { FileSummary } from '@comp/core'
import type { ReactNode } from 'react'
import type { CompClient } from '../client/create-client.types.js'
import type { FieldControl } from '../collection-form/collection-form.types.js'
import { FileField } from './file-field.js'

/**
 * Build a `fieldWidgets` map that renders a {@link FileField} for every file
 * field the collection declares — the counterpart of `referenceWidgets`.
 *
 * The declaration says which columns hold a key, so a form gets a picker
 * without the app naming one; spread your own entries after this to override
 * any single field.
 */
export function fileWidgets(
  client: CompClient,
  slug: string,
  files: readonly FileSummary[],
  urls: Record<string, string> = {},
): Record<string, (control: FieldControl) => ReactNode> {
  const widgets: Record<string, (control: FieldControl) => ReactNode> = {}
  for (const file of files) {
    widgets[file.field] = (control) => (
      <FileField
        client={client}
        slug={slug}
        file={file}
        value={String(control.value ?? '')}
        onChange={control.onChange}
        {...(urls[file.field] ? { url: urls[file.field] } : {})}
      />
    )
  }
  return widgets
}
