/**
 * A field whose value is a file, while declaring it.
 *
 * A bare name takes the defaults; the object form narrows what the picker
 * offers and how large an upload may be.
 */
export type FileConfig<TField extends string = string> =
  | TField
  | {
      field: TField
      /** What the picker offers, as an `accept` attribute. */
      accept?: string
      /** Largest upload this field takes, in bytes. */
      maxBytes?: number
    }

/** A file field resolved against the schema — serializable, like a filter. */
export interface FileSummary {
  /** Column holding the stored key. */
  field: string
  accept: string | null
  maxBytes: number | null
}

/** What a store did with an upload. */
export interface StoredFile {
  /**
   * What the record's column holds. The store names the file, not the caller
   * and not the record: a key derived from an id could not be chosen until
   * after the row existed, which would make a file on the add form impossible.
   */
  key: string
  /** Where the file can be read. */
  url: string
}

/** One upload, as the transport handed it over. */
export interface FileUpload {
  collection: string
  field: string
  filename: string
  contentType: string
  bytes: Uint8Array
}

/**
 * Where a collection's files live.
 *
 * An adapter, like `HistoryStore` — Comp stores a key in a column and knows
 * nothing else about the bytes. That is what lets the same declaration write
 * to a directory in development and to object storage in production without
 * the collection saying which.
 */
export interface FileStore {
  put(upload: FileUpload): Promise<StoredFile>
  /**
   * Forget a file. Called when a field's key is replaced or cleared; a store
   * that keeps history can make this a no-op.
   */
  remove(key: string): Promise<void>
  /** Where a stored key can be read from. */
  url(key: string): string
}
