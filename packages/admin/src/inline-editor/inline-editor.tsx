import { useRef, type ComponentPropsWithoutRef, type JSX } from "react";
import type { FieldControl } from "../collection-form/collection-form.types.js";
import {
  inputTypeFor,
  optionsFor,
} from "../collection-form/collection-form.utils.js";
import { mergeProps } from "../merge-props/merge-props.js";
import type { InlineEditorProps } from "./inline-editor.types.js";
import {
  addInlineRow,
  inlineFields,
  removeInlineRow,
  restoreInlineRow,
  setInlineValue,
} from "./inline-rows.js";

function DefaultCell({ field, value, onChange }: FieldControl): JSX.Element {
  const type = inputTypeFor(field);
  const options = optionsFor(field);

  if (options) {
    return (
      <select
        aria-label={field.name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      aria-label={field.name}
      type={type === "select" ? "text" : type}
      value={type === "checkbox" ? undefined : value}
      checked={type === "checkbox" ? value === "true" : undefined}
      onChange={(e) =>
        onChange(
          type === "checkbox" ? (e.target.checked ? "true" : "") : e.target.value,
        )
      }
    />
  );
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
  addLabel = "Add row",
  ...rest
}: InlineEditorProps): JSX.Element {
  const added = useRef(0);
  const editable = inlineFields(fields, primaryKey, inline.field);
  const visible = rows.filter((row) => !row.deleted);
  const pending = rows.filter((row) => row.deleted);

  return (
    <fieldset {...mergeProps<ComponentPropsWithoutRef<"fieldset">>({}, rest)}>
      <legend>{legend ?? inline.collection}</legend>

      <table>
        <thead>
          <tr>
            {editable.map((field) => (
              <th key={field.name} scope="col">
                {field.name}
              </th>
            ))}
            {inline.canDelete && <th scope="col">{""}</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const index = rows.indexOf(row);
            return (
              <tr key={row.key}>
                {editable.map((field) => {
                  const control: FieldControl = {
                    field,
                    value: row.values[field.name] ?? "",
                    onChange: (value) =>
                      onChange(setInlineValue(rows, row.key, field.name, value)),
                  };
                  const widget = fieldWidgets?.[field.name];
                  const messages = errors?.[`${index}.${field.name}`];
                  return (
                    <td key={field.name}>
                      {widget ? widget(control) : <DefaultCell {...control} />}
                      {messages?.map((message, i) => (
                        <span key={i} role="alert">
                          {message}
                        </span>
                      ))}
                    </td>
                  );
                })}
                {inline.canDelete && (
                  <td>
                    <button
                      type="button"
                      aria-label={`Remove ${inline.collection} row`}
                      onClick={() => onChange(removeInlineRow(rows, row.key))}
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {pending.map((row) => (
        <p key={row.key}>
          <span>Removed on save</span>
          <button type="button" onClick={() => onChange(restoreInlineRow(rows, row.key))}>
            Undo
          </button>
        </p>
      ))}

      <button
        type="button"
        onClick={() => {
          added.current += 1;
          onChange(
            addInlineRow(
              rows,
              `new-${String(added.current)}`,
              fields,
              primaryKey,
              inline.field,
            ),
          );
        }}
      >
        {addLabel}
      </button>
    </fieldset>
  );
}
