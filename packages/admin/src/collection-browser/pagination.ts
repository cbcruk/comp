/** Total number of pages for a result set, never less than one. */
export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function hasPrevPage(page: number): boolean {
  return page > 1;
}

export function hasNextPage(
  page: number,
  total: number,
  pageSize: number,
): boolean {
  return page < pageCount(total, pageSize);
}

/** Clamp a requested page into the valid range for a result set. */
export function clampPage(
  page: number,
  total: number,
  pageSize: number,
): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}
