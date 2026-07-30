import { applyPrepopulation } from "@comp/core";
import {
  useMemo,
  useRef,
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
  initialValues,
  inputTypeFor,
  optionsFor,
  toPayload,
} from "./collection-form.utils.js";
import {
  bindLayout,
  flatLayout,
  layoutFields,
  submittableFields,
  type LayoutField,
} from "./form-layout.js";

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

/** An enum as radios rather than a select — Django's `radio_fields`. */
function RadioField({ field, value, onChange }: FieldControl): JSX.Element {
  const options = optionsFor(field) ?? [];
  return (
    <fieldset>
      <legend>{field.name}</legend>
      {options.map((option) => (
        <label key={option}>
          <input
            type="radio"
            name={field.name}
            value={option}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          {option}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * A field shown but never written — Django's `readonly_fields`. Rendered as
 * text, not a disabled input: a disabled input still looks like something you
 * were meant to be able to fill in.
 */
function ReadonlyField({ field, value }: FieldControl): JSX.Element {
  return (
    <div>
      <span>{field.name}</span>
      <output>{value || "—"}</output>
    </div>
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
  form,
  record,
  onSubmit,
  renderField,
  fieldWidgets,
  children,
  submitLabel = "Save",
  busy = false,
  ...rest
}: CollectionFormProps): JSX.Element {
  const groups = useMemo(
    () => (form ? bindLayout(form, fields) : flatLayout(fields, primaryKey)),
    [form, fields, primaryKey],
  );
  const shown = layoutFields(groups);
  const submittable = submittableFields(groups);
  const adding = record === undefined;

  const [values, setValues] = useState(() => initialValues(shown, record));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Targets the user has taken over; prepopulation leaves those alone from
  // then on.
  const touched = useRef<Set<string>>(new Set());

  function setField(name: string, value: string): void {
    if (form?.prepopulated[name]) touched.current.add(name);
    setValues((prev) => {
      const next = { ...prev, [name]: value };
      return form
        ? applyPrepopulation(form, next, name, {
            adding,
            touched: touched.current,
          })
        : next;
    });
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit(toPayload(submittable, values));
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

  function renderEntry(entry: LayoutField): JSX.Element {
    const { field } = entry;
    const control: FieldControl = {
      field,
      value: values[field.name] ?? "",
      onChange: (value) => setField(field.name, value),
    };
    const errors = fieldErrors[field.name];
    const widget = entry.readonly
      ? undefined
      : (fieldWidgets?.[field.name] ?? renderField);

    return (
      <div key={field.name}>
        {entry.readonly ? (
          <ReadonlyField {...control} />
        ) : widget ? (
          widget(control)
        ) : entry.radio ? (
          <RadioField {...control} />
        ) : (
          <DefaultField {...control} />
        )}
        {errors?.map((message, i) => (
          <span key={i} role="alert">
            {message}
          </span>
        ))}
      </div>
    );
  }

  return (
    <form
      {...mergeProps<ComponentPropsWithoutRef<"form">>(
        { onSubmit: (e) => void handleSubmit(e as FormEvent) },
        rest,
      )}
    >
      {groups.map((group, groupIndex) => (
        <fieldset key={group.title ?? `group-${String(groupIndex)}`}>
          {group.title && <legend>{group.title}</legend>}
          {group.description && <p>{group.description}</p>}
          {group.rows.map((row, rowIndex) => (
            <div key={row.fields.map((entry) => entry.field.name).join("-") || rowIndex}>
              {row.fields.map((entry) => renderEntry(entry))}
            </div>
          ))}
        </fieldset>
      ))}
      {children}
      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={busy || submitting}>
        {submitLabel}
      </button>
    </form>
  );
}
