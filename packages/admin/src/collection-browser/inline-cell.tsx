import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { FieldMeta } from '@comp/core'
import type { JSX } from 'react'
import {
  inputTypeFor,
  optionsFor,
} from '../collection-form/collection-form.utils.js'

export interface InlineInputProps {
  field: FieldMeta
  value: string
  busy: boolean
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

/**
 * The editing control for a single cell. Enter commits, Escape cancels, blur
 * commits; checkbox and select commit on change. Input type mirrors the form.
 */
export function InlineInput({
  field,
  value,
  busy,
  onChange,
  onCommit,
  onCancel,
}: InlineInputProps): JSX.Element {
  const type = inputTypeFor(field)

  function onKeyDown(e: { key: string; preventDefault: () => void }): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  if (type === 'select') {
    const options = optionsFor(field) ?? []
    return (
      <Selector
        label={field.name}
        isLabelHidden
        size="sm"
        isDisabled={busy}
        value={value}
        placeholder="—"
        onChange={(next) => onChange(next)}
        options={[
          { value: '', label: '—' },
          ...options.map((option) => ({ value: option, label: option })),
        ]}
      />
    )
  }

  if (type === 'checkbox') {
    return (
      // No autofocus or key handling here: a checkbox has no text to type
      // into, so it commits on change and on the way out.
      <CheckboxInput
        label={field.name}
        isLabelHidden
        isDisabled={busy}
        value={value === 'true'}
        onChange={(checked) => onChange(checked ? 'true' : '')}
        onBlur={onCommit}
      />
    )
  }

  return (
    <TextInput
      label={field.name}
      isLabelHidden
      hasAutoFocus
      size="sm"
      isDisabled={busy}
      value={value}
      onChange={(next) => onChange(next)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
    />
  )
}
