import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { HStack } from '@astryxdesign/core/HStack'
import { Selector } from '@astryxdesign/core/Selector'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useRef, type ComponentPropsWithoutRef, type JSX } from 'react'
import type { FieldControl } from '../collection-form/collection-form.types.js'
import {
  inputTypeFor,
  optionsFor,
} from '../collection-form/collection-form.utils.js'
import { mergeProps } from '../merge-props/merge-props.js'
import type { InlineEditorProps } from './inline-editor.types.js'
import {
  addInlineRow,
  inlineFields,
  removeInlineRow,
  restoreInlineRow,
  setInlineValue,
} from './inline-rows.js'
import type { InlineRow } from './inline-rows.js'

function DefaultCell({ field, value, onChange }: FieldControl): JSX.Element {
  const type = inputTypeFor(field)
  const options = optionsFor(field)

  if (options) {
    return (
      <Selector
        label={field.name}
        isLabelHidden
        size="sm"
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
      <CheckboxInput
        label={field.name}
        isLabelHidden
        value={value === 'true'}
        onChange={(checked) => onChange(checked ? 'true' : '')}
      />
    )
  }

  return (
    <TextInput
      label={field.name}
      isLabelHidden
      size="sm"
      value={value}
      onChange={(next) => onChange(next)}
    />
  )
}

/**
 * Edit a parent's child rows in place — the inline. Which child, over which
 * key, and whether rows may be removed all come from the resolved inline, so
 * this renders whatever the schema says without being configured per app.
 *
 * State is owned by the caller: a parent and its children are saved as one
 * action, so one submit has to be able to carry every inline at once.
 */
export function InlineEditor({
  inline,
  fields,
  primaryKey,
  rows,
  onChange,
  fieldWidgets,
  errors,
  legend,
  addLabel = 'Add row',
  ...rest
}: InlineEditorProps): JSX.Element {
  const added = useRef(0)
  const editable = inlineFields(fields, primaryKey, inline.field)
  const visible = rows.filter((row) => !row.deleted)
  const pending = rows.filter((row) => row.deleted)

  return (
    <VStack
      as="fieldset"
      gap={3}
      {...mergeProps<ComponentPropsWithoutRef<'fieldset'>>({}, rest)}
    >
      <Text as="label" weight="medium">
        {legend ?? inline.collection}
      </Text>

      <Table
        data={visible}
        idKey="key"
        columns={[
          ...editable.map((field) => ({
            key: field.name,
            header: field.name,
            renderCell: (row: InlineRow) => {
              const index = rows.indexOf(row)
              const control: FieldControl = {
                field,
                value: row.values[field.name] ?? '',
                onChange: (value) =>
                  onChange(setInlineValue(rows, row.key, field.name, value)),
              }
              const widget = fieldWidgets?.[field.name]
              const messages = errors?.[`${index}.${field.name}`]
              return (
                <VStack gap={1}>
                  {widget ? widget(control) : <DefaultCell {...control} />}
                  {messages?.map((message, i) => (
                    <Text key={i} size="sm" color="accent" role="alert">
                      {message}
                    </Text>
                  ))}
                </VStack>
              )
            },
          })),
          ...(inline.canDelete
            ? [
                {
                  key: '__remove',
                  header: '',
                  width: { type: 'pixel' as const, value: 96 },
                  renderCell: (row: InlineRow) => (
                    <Button
                      label={`Remove ${inline.collection} row`}
                      variant="ghost"
                      size="sm"
                      onClick={() => onChange(removeInlineRow(rows, row.key))}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      {pending.map((row) => (
        <HStack key={row.key} gap={2} align="center">
          <Text size="sm" color="secondary">
            Removed on save
          </Text>
          <Button
            label="Undo"
            variant="ghost"
            size="sm"
            onClick={() => onChange(restoreInlineRow(rows, row.key))}
          />
        </HStack>
      ))}

      <HStack>
        <Button
          label={addLabel}
          variant="secondary"
          size="sm"
          onClick={() => {
            added.current += 1
            onChange(
              addInlineRow(
                rows,
                `new-${String(added.current)}`,
                fields,
                primaryKey,
                inline.field,
              ),
            )
          }}
        />
      </HStack>
    </VStack>
  )
}
