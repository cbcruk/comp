import { applyPrepopulation } from '@comp/core'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { DateTimeInput } from '@astryxdesign/core/DateTimeInput'
import type { ISODateTimeString } from '@astryxdesign/core/DateTimeInput'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { RadioList } from '@astryxdesign/core/RadioList'
import { RadioListItem } from '@astryxdesign/core/RadioList'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import {
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type JSX,
} from 'react'
import { mergeProps } from '../merge-props/merge-props.js'
import { extractIssues, issuesByField } from '../validation/issues.js'
import type {
  CollectionFormProps,
  FieldControl,
} from './collection-form.types.js'
import {
  initialValues,
  inputTypeFor,
  optionsFor,
  toPayload,
} from './collection-form.utils.js'
import {
  bindLayout,
  flatLayout,
  layoutFields,
  submittableFields,
  type LayoutField,
} from './form-layout.js'

function DefaultField({
  field,
  value,
  onChange,
  status,
}: FieldControl & { status?: { type: 'error'; message: string } }): JSX.Element {
  const type = inputTypeFor(field)
  const isRequired = field.notNull && !field.hasDefault

  if (type === 'select') {
    const options = optionsFor(field) ?? []
    return (
      <Selector
        label={field.name}
        value={value}
        isRequired={isRequired}
        placeholder="—"
        onChange={(next) => onChange(next)}
        {...(status ? { status } : {})}
        options={options.map((option) => ({ value: option, label: option }))}
      />
    )
  }

  if (type === 'checkbox') {
    return (
      <CheckboxInput
        label={field.name}
        value={value === 'true'}
        onChange={(checked) => onChange(checked ? 'true' : '')}
        {...(status ? { status } : {})}
      />
    )
  }

  if (type === 'number') {
    return (
      <NumberInput
        label={field.name}
        // The form's values are strings end to end, because that is what an
        // input reports and what the write path coerces; the control is the
        // only place that needs a number.
        hasClear
        value={value === '' ? null : Number(value)}
        isRequired={isRequired}
        onChange={(next) => onChange(next === null ? '' : String(next))}
        {...(status ? { status } : {})}
      />
    )
  }

  if (type === 'datetime-local') {
    return (
      <DateTimeInput
        label={field.name}
        // The brand exists to stop arbitrary strings reaching the control; the
        // value here came from a date column through `toInputValue`, which is
        // the guarantee the brand is asking for.
        {...(value ? { value: value as ISODateTimeString } : {})}
        isRequired={isRequired}
        onChange={(next) => onChange(next ?? '')}
        {...(status ? { status } : {})}
      />
    )
  }

  return (
    <TextInput
      label={field.name}
      value={value}
      isRequired={isRequired}
      onChange={(next) => onChange(next)}
      {...(status ? { status } : {})}
    />
  )
}

/** An enum as radios rather than a select — Django's `radio_fields`. */
function RadioField({ field, value, onChange }: FieldControl): JSX.Element {
  const options = optionsFor(field) ?? []
  return (
    <RadioList
      label={field.name}
      value={value}
      onChange={(next) => onChange(next)}
    >
      {options.map((option) => (
        <RadioListItem key={option} value={option} label={option} />
      ))}
    </RadioList>
  )
}

/**
 * A field shown but never written — Django's `readonly_fields`. Rendered as
 * text, not a disabled input: a disabled input still looks like something you
 * were meant to be able to fill in.
 */
function ReadonlyField({ field, value }: FieldControl): JSX.Element {
  return (
    <VStack gap={1}>
      <Text size="sm" color="secondary">
        {field.name}
      </Text>
      <Text as="span">{value || '—'}</Text>
    </VStack>
  )
}

/**
 * Render a create/edit form derived from a collection's field metadata. The
 * fields, their input types, and value coercion all come from the introspected
 * schema — never hand-listed. Field rendering is a render-prop slot.
 */
export function CollectionForm({
  fields,
  primaryKey,
  form,
  record,
  onSubmit,
  renderField,
  fieldWidgets,
  children,
  submitLabel = 'Save',
  busy = false,
  ...rest
}: CollectionFormProps): JSX.Element {
  const groups = useMemo(
    () => (form ? bindLayout(form, fields) : flatLayout(fields, primaryKey)),
    [form, fields, primaryKey],
  )
  const shown = layoutFields(groups)
  const submittable = submittableFields(groups)
  const adding = record === undefined

  const [values, setValues] = useState(() => initialValues(shown, record))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Targets the user has taken over; prepopulation leaves those alone from
  // then on.
  const touched = useRef<Set<string>>(new Set())

  function setField(name: string, value: string): void {
    if (form?.prepopulated[name]) touched.current.add(name)
    setValues((prev) => {
      const next = { ...prev, [name]: value }
      return form
        ? applyPrepopulation(form, next, name, {
            adding,
            touched: touched.current,
          })
        : next
    })
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setFieldErrors({})
    setFormError(null)
    try {
      await onSubmit(toPayload(submittable, values))
    } catch (error) {
      const issues = extractIssues(error)
      if (issues) {
        setFieldErrors(issuesByField(issues))
      } else {
        setFormError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function renderEntry(entry: LayoutField): JSX.Element {
    const { field } = entry
    const control: FieldControl = {
      field,
      value: values[field.name] ?? '',
      onChange: (value) => setField(field.name, value),
    }
    const errors = fieldErrors[field.name]
    const widget = entry.readonly
      ? undefined
      : (fieldWidgets?.[field.name] ?? renderField)

    // The first message goes to the control, which is where a field's own
    // status belongs; anything further is listed under it rather than lost.
    const [first, ...rest] = errors ?? []

    return (
      <VStack key={field.name} gap={1} width="100%">
        {entry.readonly ? (
          <ReadonlyField {...control} />
        ) : widget ? (
          widget(control)
        ) : entry.radio ? (
          <RadioField {...control} />
        ) : (
          <DefaultField
            {...control}
            {...(first ? { status: { type: 'error' as const, message: first } } : {})}
          />
        )}
        {rest.map((message, i) => (
          <Text key={i} size="sm" color="accent" role="alert">
            {message}
          </Text>
        ))}
        {first && (entry.readonly || widget || entry.radio) && (
          <Text size="sm" color="accent" role="alert">
            {first}
          </Text>
        )}
      </VStack>
    )
  }

  return (
    <form
      {...mergeProps<ComponentPropsWithoutRef<'form'>>(
        { onSubmit: (e) => void handleSubmit(e as FormEvent) },
        rest,
      )}
    >
      <VStack gap={6}>
        {groups.map((group, groupIndex) => (
          <VStack
            as="fieldset"
            gap={3}
            key={group.title ?? `group-${String(groupIndex)}`}
          >
            {group.title && (
              <Heading level={3}>
                {group.title}
              </Heading>
            )}
            {group.description && (
              <Text size="sm" color="secondary">
                {group.description}
              </Text>
            )}
            {group.rows.map((row, rowIndex) => (
              <HStack
                gap={3}
                align="start"
                key={
                  row.fields.map((entry) => entry.field.name).join('-') ||
                  rowIndex
                }
              >
                {row.fields.map((entry) => renderEntry(entry))}
              </HStack>
            ))}
          </VStack>
        ))}
        {children}
        {formError && <Banner status="error" title={formError} role="alert" />}
        <HStack>
          <Button
            type="submit"
            label={submitLabel}
            variant="primary"
            isDisabled={busy || submitting}
            isLoading={submitting}
          />
        </HStack>
      </VStack>
    </form>
  )
}
