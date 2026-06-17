import { useState, type FormEvent, type JSX } from "react";
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
}: CollectionFormProps): JSX.Element {
  const editable = editableFields(fields, primaryKey);
  const [values, setValues] = useState(() => initialValues(editable, record));

  function setField(name: string, value: string): void {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void onSubmit(toPayload(editable, values));
  }

  return (
    <form onSubmit={handleSubmit}>
      {editable.map((field) => {
        const control: FieldControl = {
          field,
          value: values[field.name] ?? "",
          onChange: (value) => setField(field.name, value),
        };
        const widget = fieldWidgets?.[field.name] ?? renderField;
        return (
          <div key={field.name}>
            {widget ? widget(control) : <DefaultField {...control} />}
          </div>
        );
      })}
      <button type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  );
}
