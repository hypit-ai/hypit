import type { CanonicalValue, ValueSchema } from "../svml.js";

export const FORM_CSS = `
.form { display: flex; flex-direction: column; gap: 2px; }
.form-row { display: grid; grid-template-columns: 108px 1fr; gap: 8px; align-items: center; padding: 3px 0; }
.form-row > label { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.form-control { display: flex; gap: 6px; align-items: center; min-width: 0; }
.form-control input[type=text], .form-control input[type=number], .form-control select {
  flex: 1; min-width: 0; background: #1c1c21; color: var(--text);
  border: 1px solid var(--line); border-radius: 5px; padding: 4px 7px; font: inherit; font-size: 12px;
}
.form-group { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin: 5px 0; }
.form-group > legend { color: var(--accent); font-size: 11px; padding: 0 5px; }
.form-item { border-top: 1px dashed var(--line); padding-top: 7px; margin-top: 7px; }
.form-item:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
.form-actions { display: flex; gap: 6px; margin-top: 7px; }
.form-actions button {
  border: 1px solid var(--line); border-radius: 5px; background: #1c1c21;
  color: var(--text); cursor: pointer; padding: 3px 9px; font-size: 12px;
}
.form-actions button:hover:not(:disabled) { border-color: #3a3a42; }
.form-actions button:disabled { opacity: .4; cursor: default; }
.form-fixed { color: var(--muted); font-size: 12px; font-family: ui-monospace, monospace; }
`;

type Emit = () => void;

function row(name: string, control: HTMLElement): HTMLElement {
  const element = document.createElement("div");
  element.className = "form-row";
  const caption = document.createElement("label");
  caption.textContent = name;
  caption.title = name;
  const holder = document.createElement("div");
  holder.className = "form-control";
  holder.append(control);
  element.append(caption, holder);
  return element;
}

/**
 * Builds controls from a ValueSchema.
 *
 * Only structural contract facts are consumed: `enum` becomes a list and
 * numeric bounds become input limits. Presentation conveniences belong to the
 * Playground and must never be added to a production schema to steer this UI.
 *
 * Nothing here validates. `validateStoredValue` and the packages' own assert
 * functions are the judge — they are what a real Build runs.
 */
export function buildForm(
  schema: ValueSchema,
  value: CanonicalValue,
  emit: Emit,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "form";
  if (schema.kind !== "object") {
    container.append(row("value", scalarControl(schema, value, (next) => {
      // A non-object input is replaced wholesale by its caller.
      (emit as Emit & { replace?: (v: CanonicalValue) => void }).replace?.(next);
      emit();
    })));
    return container;
  }

  const bag = value as Record<string, CanonicalValue>;
  for (const [name, field] of Object.entries(schema.fields)) {
    const current = bag[name];

    if (field.schema.kind === "literal") {
      // A literal is the contract tag: shown so the shape is legible, never
      // offered, because changing it would only ever be wrong.
      const fixed = document.createElement("span");
      fixed.className = "form-fixed";
      fixed.textContent = String(field.schema.value);
      container.append(row(name, fixed));
      continue;
    }
    if (field.schema.kind === "array") {
      container.append(arrayGroup(name, field.schema, bag, emit));
      continue;
    }
    if (field.schema.kind === "object") {
      const group = document.createElement("fieldset");
      group.className = "form-group";
      const legend = document.createElement("legend");
      legend.textContent = name;
      if (bag[name] === undefined) bag[name] = {};
      group.append(legend, buildForm(field.schema, bag[name], emit));
      container.append(group);
      continue;
    }
    container.append(row(name, scalarControl(field.schema, current, (next) => {
      bag[name] = next;
      emit();
    })));
  }
  return container;
}

function scalarControl(
  schema: ValueSchema,
  current: CanonicalValue | undefined,
  onChange: (next: CanonicalValue) => void,
): HTMLElement {
  if (schema.kind === "boolean") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = current === true;
    box.addEventListener("input", () => onChange(box.checked));
    return box;
  }

  if (schema.kind === "number") {
    const input = document.createElement("input");
    input.type = "number";
    if (schema.minimum !== undefined) input.min = String(schema.minimum);
    if (schema.maximum !== undefined) input.max = String(schema.maximum);
    input.step = schema.integer === true ? "1" : "any";
    input.value = String(typeof current === "number" ? current : schema.minimum ?? 0);
    input.addEventListener("input", () => {
      if (input.value !== "") onChange(Number(input.value));
    });
    return input;
  }

  if (schema.kind === "string") {
    if (schema.enum !== undefined) {
      const select = document.createElement("select");
      for (const option of schema.enum) {
        const item = document.createElement("option");
        item.value = option;
        item.textContent = option;
        select.append(item);
      }
      select.value = typeof current === "string" ? current : (schema.enum[0] ?? "");
      select.addEventListener("input", () => onChange(select.value));
      return select;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.value = typeof current === "string" ? current : "";
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  const unsupported = document.createElement("span");
  unsupported.className = "form-fixed";
  unsupported.textContent = `(${schema.kind})`;
  return unsupported;
}

export function blankValue(schema: ValueSchema): CanonicalValue {
  if (schema.kind === "object") {
    return Object.fromEntries(Object.entries(schema.fields)
      .filter(([, field]) => field.optional !== true)
      .map(([name, field]) => [name, blankValue(field.schema)]));
  }
  if (schema.kind === "literal") return schema.value;
  if (schema.kind === "array") return [];
  if (schema.kind === "number") return schema.minimum ?? 0;
  if (schema.kind === "string") return schema.enum?.[0] ?? "";
  if (schema.kind === "boolean") return false;
  if (schema.kind === "oneOf") return blankValue(schema.variants[0] ?? { kind: "null" });
  return null;
}

function arrayGroup(
  name: string,
  schema: ValueSchema & { kind: "array" },
  bag: Record<string, CanonicalValue>,
  emit: Emit,
): HTMLElement {
  const group = document.createElement("fieldset");
  group.className = "form-group";
  const legend = document.createElement("legend");
  legend.textContent = name;
  group.append(legend);

  const entries = Array.isArray(bag[name]) ? [...(bag[name] as CanonicalValue[])] : [];
  bag[name] = entries;
  const minItems = schema.minItems ?? 0;

  const rebuild = (): void => {
    // Adding or removing changes the control tree, so this subtree is rebuilt.
    // Scalar edits never come through here.
    group.replaceWith(arrayGroup(name, schema, bag, emit));
    emit();
  };

  entries.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "form-item";
    item.append(buildForm(schema.items, entry, emit));
    const actions = document.createElement("div");
    actions.className = "form-actions";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.disabled = entries.length <= minItems;
    remove.addEventListener("click", () => { entries.splice(index, 1); rebuild(); });
    actions.append(remove);
    item.append(actions);
    group.append(item);
  });

  const actions = document.createElement("div");
  actions.className = "form-actions";
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Add";
  add.addEventListener("click", () => { entries.push(blankValue(schema.items)); rebuild(); });
  actions.append(add);
  group.append(actions);
  return group;
}
