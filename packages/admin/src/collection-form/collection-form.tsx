import {
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
  type JSX,
} from "react";
import { mergeProps } from "../merge-props/merge-props.js";
import {
  extractIssues,
  issuesByField,
} from "../validation/issues.js";
import type { CollectionFormProps, FieldControl } from "./collection-form.types.js";
import {
  editableFields,
  initialValues,
  inputTypeFor,
  optionsFor,
  toPayload,
} from "./collection-form.utils.js";

function DefaultField({ field, value, onChange }: FieldControl): JSX.Element {
  const type = inputTypeFor(field);
  const required = field.notNull && !field.hasDefault;

  if (type === "select") {
    const options = optionsFor(field) ?? [];
    return (
      <label>
        {field.name}
        <select
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (type === "checkbox") {
    return (
      <label>
        {field.name}
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
        />
      </label>
    );
  }

  return (
    <label>
      {field.name}
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * Render a create/edit form derived from a collection's field metadata. The
 * fields, their input types, and value coercion all come from the introspected
 * schema — never hand-listed. Field rendering is a render-prop slot.
 */
export function CollectionForm({
  fields,
  primaryKey,
  record,
  onSubmit,
  renderField,
  fieldWidgets,
  submitLabel = "Save",
  busy = false,
  ...rest
}: CollectionFormProps): JSX.Element {
  const editable = editableFields(fields, primaryKey);
  const [values, setValues] = useState(() => initialValues(editable, record));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(name: string, value: string): void {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit(toPayload(editable, values));
    } catch (error) {
      const issues = extractIssues(error);
      if (issues) {
        setFieldErrors(issuesByField(issues));
      } else {
        setFormError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      {...mergeProps<ComponentPropsWithoutRef<"form">>(
        { onSubmit: (e) => void handleSubmit(e as FormEvent) },
        rest,
      )}
    >
      {editable.map((field) => {
        const control: FieldControl = {
          field,
          value: values[field.name] ?? "",
          onChange: (value) => setField(field.name, value),
        };
        const widget = fieldWidgets?.[field.name] ?? renderField;
        const errors = fieldErrors[field.name];
        return (
          <div key={field.name}>
            {widget ? widget(control) : <DefaultField {...control} />}
            {errors?.map((message, i) => (
              <span key={i} role="alert">
                {message}
              </span>
            ))}
          </div>
        );
      })}
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={busy || submitting}>
        {submitLabel}
      </button>
    </form>
  );
}
