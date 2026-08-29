import type { FileSummary } from '@comp/core'
import { useState, type ComponentPropsWithoutRef, type JSX } from 'react'
import type { CompClient } from '../client/create-client.types.js'
import { mergeProps } from '../merge-props/merge-props.js'

export interface FileFieldProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'onChange'
> {
  client: CompClient
  /** Collection the upload is stored against. */
  slug: string
  /** The field, as the declaration resolved it. */
  file: FileSummary
  /** The stored key the record currently holds. */
  value: string
  onChange: (key: string) => void
  /** Where the current key can be read, when the record read said so. */
  url?: string
}

function isImage(file: FileSummary, url: string | undefined): boolean {
  if (file.accept?.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(url ?? '')
}

/**
 * The control for a file field: what is stored now, and a picker to replace it.
 *
 * Choosing a file uploads it straight away and puts the returned key into the
 * form, rather than holding bytes until submit. That is what lets the write
 * path stay JSON — by the time the record is saved, the file is already stored
 * and the field is the text column it always was.
 *
 * Clearing only drops the key from the record. The bytes are left where they
 * are, because a form that has not been saved yet has not decided anything: a
 * remove here would destroy the file of a record the user then abandons.
 */
export function FileField({
  client,
  slug,
  file,
  value,
  onChange,
  url,
  ...rest
}: FileFieldProps): JSX.Element {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The URL the server reported belongs to the *stored* key; once a new file is
  // picked, the preview has to come from the file the browser already holds.
  const [preview, setPreview] = useState<string | null>(null)
  const shown = preview ?? (value ? url : undefined)

  async function choose(chosen: File): Promise<void> {
    setUploading(true)
    setError(null)
    try {
      const stored = await client.uploadFile(slug, file.field, chosen)
      onChange(stored.key)
      setPreview(stored.url)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div {...mergeProps<ComponentPropsWithoutRef<'div'>>({}, rest)}>
      <label>
        {file.field}
        <input
          type="file"
          {...(file.accept ? { accept: file.accept } : {})}
          disabled={uploading}
          onChange={(event) => {
            const chosen = event.target.files?.[0]
            if (chosen) void choose(chosen)
          }}
        />
      </label>

      {uploading && <p>Uploading…</p>}
      {error && <span role="alert">{error}</span>}

      {shown &&
        (isImage(file, shown) ? (
          <img src={shown} alt={`${file.field} preview`} />
        ) : (
          <a href={shown}>{value}</a>
        ))}

      {value && !uploading && (
        <button type="button" onClick={() => { onChange(''); setPreview(null) }}>
          Clear {file.field}
        </button>
      )}
    </div>
  )
}
