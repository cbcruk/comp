import { isCompError, type CompError } from '@comp/core'
import { Match } from 'effect'

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** A tool's successful payload, as MCP wants it: JSON in a text block. */
export function text(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

function refusal(value: unknown): ToolResult {
  return { ...text(value), isError: true }
}

/**
 * The one place a core failure becomes an MCP tool result.
 *
 * This mirrors `compErrorResponse` in `@comp/server`, and the mirroring is the
 * point: the same failure has to mean the same thing on both wires. It did not
 * before — an inline write asking for an operation the child collection never
 * granted was a 405 with a distinct shape over HTTP, and over MCP it fell
 * through to a catch-all that stringified the message, indistinguishable from
 * any other error. A tool client had nothing to branch on.
 *
 * `code` carries the tag so it now does, and `Match.exhaustive` means a new
 * member of `CompError` cannot be added without this function being taught
 * what it looks like here too.
 */
export function compErrorResult(error: CompError): ToolResult {
  return Match.value(error).pipe(
    Match.tag('ValidationError', (e) =>
      refusal({ error: e.message, code: e._tag, issues: e.issues }),
    ),
    Match.tag('NotFound', (e) => refusal({ error: e.message, code: e._tag })),
    Match.tag('Forbidden', (e) => refusal({ error: e.message, code: e._tag })),
    Match.tag('NotGranted', (e) => refusal({ error: e.message, code: e._tag })),
    Match.tag('CapabilityError', (e) =>
      refusal({ error: e.message, code: e._tag }),
    ),
    Match.exhaustive,
  )
}

/**
 * Map anything a tool call threw. A defect stays a bare message: it is a bug
 * here, not a refusal the caller can do anything about.
 */
export function toolError(error: unknown): ToolResult {
  if (isCompError(error)) return compErrorResult(error)
  return {
    content: [
      {
        type: 'text',
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  }
}
