import { artifactLabel, registerFile } from "../preview/artifacts.js";
import type { CanonicalValue, ValueSchema } from "../svml.js";
import type { FieldHint } from "../registry/index.js";

export const FORM_CSS = `
.form { display: flex; flex-direction: column; gap: 2px; }
.form-row { display: grid; grid-template-columns: 96px 1fr; gap: 8px; align-items: center; padding: 3px 0; }
.form-row > label { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.form-control { display: flex; gap: 6px; align-items: center; min-width: 0; }
.form-control input[type=text], .form-control input[type=number], .form-control select, .form-control textarea {
  flex: 1; min-width: 0; background: #1c1c21; color: var(--text);
  border: 1px solid var(--line); border-radius: 5px; padding: 4px 7px; font: inherit; font-size: 12px;
}
.form-control textarea { resize: vertical; min-height: 46px; font-family: inherit; }
.form-control input[type=range] { flex: 1; min-width: 0; accent-color: var(--accent); }
.form-control input[type=color] { width: 28px; height: 24px; padding: 0; border: 1px solid var(--line); background: none; border-radius: 4px; }
.form-control .narrow { flex: 0 0 68px; }
.form-control .form-file { flex: 0 0 auto; font-size: 11px; color: var(--muted); max-width: 130px; }
.form-control .form-file::file-selector-button {
  border: 1px solid var(--line); border-radius: 5px; background: #1c1c21;
  color: var(--text); font: inherit; font-size: 11px; padding: 2px 7px; margin-right: 6px; cursor: pointer;
}
.form-control .form-file-label { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.form-group { border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; margin: 5px 0; }
.form-group > legend { color: var(--accent); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; padding: 0 5px; }
.form-item { border-top: 1px dashed var(--line); padding-top: 7px; margin-top: 7px; }
.form-item:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
.form-actions { display: flex; gap: 6px; margin-top: 7px; }
.form-actions button {
  border: 1px solid var(--line); border-radius: 5px; background: #1c1c21;
  color: var(--text); cursor: pointer; padding: 3px 9px; font-size: 12px;
}
.form-actions button:hover:not(:disabled) { border-color: #3a3a42; }
.form-actions button:disabled { opacity: .4; cursor: default; }
`;

type Emit = () => void;

function row(label: string, control: HTMLElement): HTMLElement {
  const element = document.createElement("div");
  element.className = "form-row";
  const caption = document.createElement("label");
  caption.textContent = label;
  caption.title = label;
  const holder = document.createElement("div");
  holder.className = "form-control";
  holder.append(control);
  element.append(caption, holder);
  return element;
}

/** `#RRGGBB` or `#RRGGBBAA`; `<input type=color>` can only carry the first six. */
function colorControl(value: string, onChange: (next: string) => void): HTMLElement {
  const holder = document.createElement("div");
  holder.className = "form-control";
  const swatch = document.createElement("input");
  swatch.type = "color";
  swatch.value = /^#[0-9a-f]{6}/iu.test(value) ? value.slice(0, 7) : "#000000";
  const exact = document.createElement("input");
  exact.type = "text";
  exact.value = value;
  // The text box is the source of truth: alpha survives only there.
  swatch.addEventListener("input", () => {
    const alpha = exact.value.length === 9 ? exact.value.slice(7) : "";
    exact.value = swatch.value + alpha;
    onChange(exact.value);
  });
  exact.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}/iu.test(exact.value)) swatch.value = exact.value.slice(0, 7);
    onChange(exact.value);
  });
  holder.append(swatch, exact);
  return holder;
}

function fractionControl(
  value: number,
  schema: { minimum?: number; maximum?: number },
  onChange: (next: number) => void,
): HTMLElement {
  const holder = document.createElement("div");
  holder.className = "form-control";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(schema.minimum ?? 0);
  slider.max = String(schema.maximum ?? 1);
  slider.step = "0.001";
  slider.value = String(value);
  const exact = document.createElement("input");
  exact.type = "number";
  exact.className = "narrow";
  exact.step = "0.001";
  exact.value = String(value);
  slider.addEventListener("input", () => { exact.value = slider.value; onChange(Number(slider.value)); });
  exact.addEventListener("input", () => { slider.value = exact.value; onChange(Number(exact.value)); });
  holder.append(slider, exact);
  return holder;
}

/**
 * Builds controls from a ValueSchema.
 *
 * Nothing here validates. The schema shapes and coerces the input; the packages'
 * own seal and assert functions decide whether a value is legal, because they
 * are what a real Build would run and their messages are already good. A form
 * that pre-judged would only disagree with them.
 */
export function buildForm(
  schema: ValueSchema,
  value: CanonicalValue,
  hints: Readonly<Record<string, FieldHint>>,
  emit: Emit,
  path = "",
): HTMLElement {
  const container = document.createElement("div");
  container.className = "form";

  if (schema.kind !== "object") {
    container.textContent = "Unsupported top-level schema.";
    return container;
  }

  const bag = value as Record<string, CanonicalValue>;

  for (const [name, field] of Object.entries(schema.fields)) {
    const here = path ? `${path}.${name}` : name;
    const hint = hints[here] ?? hints[name];
    const current = bag[name];

    if (field.schema.kind === "array") {
      container.append(arrayGroup(name, here, field.schema, bag, hints, emit));
      continue;
    }
    if (field.schema.kind === "object") {
      const group = document.createElement("fieldset");
      group.className = "form-group";
      const legend = document.createElement("legend");
      legend.textContent = name;
      group.append(legend, buildForm(field.schema, current ?? {}, hints, emit, here));
      container.append(group);
      continue;
    }
    container.append(row(name, scalarControl(field.schema, current, hint, (next) => {
      bag[name] = next;
      emit();
    })));
  }
  return container;
}

function scalarControl(
  schema: ValueSchema,
  current: CanonicalValue | undefined,
  hint: FieldHint | undefined,
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
    if (hint === "unit-fraction") {
      return fractionControl(typeof current === "number" ? current : 0, schema, onChange);
    }
    const input = document.createElement("input");
    input.type = "number";
    if (schema.minimum !== undefined) input.min = String(schema.minimum);
    if (schema.maximum !== undefined) input.max = String(schema.maximum);
    input.step = schema.integer === true ? "1" : "any";
    input.value = String(typeof current === "number" ? current : 0);
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
    if (hint === "color") {
      return colorControl(typeof current === "string" ? current : "#ffffff", onChange);
    }
    if (hint === "multiline") {
      const area = document.createElement("textarea");
      area.value = typeof current === "string" ? current : "";
      area.addEventListener("input", () => onChange(area.value));
      return area;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.value = typeof current === "string" ? current : "";
    input.addEventListener("input", () => onChange(input.value));
    return input;
  }

  if (schema.kind === "blob") return blobControl(current, schema.mediaTypes, onChange);

  const unsupported = document.createElement("span");
  unsupported.textContent = `(${schema.kind})`;
  return unsupported;
}

/**
 * Media picker.
 *
 * The form value is the digest, and the bytes stay in the Artifact registry, so
 * a component's parameters remain a plain canonical value that a test can build
 * without a browser.
 */
function blobControl(
  current: CanonicalValue | undefined,
  mediaTypes: readonly string[] | undefined,
  onChange: (next: CanonicalValue) => void,
): HTMLElement {
  const holder = document.createElement("div");
  holder.className = "form-control";
  const picker = document.createElement("input");
  picker.type = "file";
  picker.className = "form-file";
  if (mediaTypes !== undefined) picker.accept = mediaTypes.join(",");
  const label = document.createElement("span");
  label.className = "form-file-label";
  label.textContent = artifactLabel(typeof current === "string" && current !== "" ? current : undefined);
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (file === undefined) return;
    label.textContent = "hashing…";
    void registerFile(file).then((ref) => {
      label.textContent = artifactLabel(ref.digest);
      onChange(ref.digest);
    }).catch((error: unknown) => {
      label.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  holder.append(picker, label);
  return holder;
}

function blank(schema: ValueSchema): CanonicalValue {
  if (schema.kind === "object") {
    return Object.fromEntries(Object.entries(schema.fields)
      .filter(([, field]) => field.optional !== true)
      .map(([name, field]) => [name, blank(field.schema)]));
  }
  if (schema.kind === "array") return [];
  if (schema.kind === "number") return schema.minimum ?? 0;
  if (schema.kind === "string") return schema.enum?.[0] ?? "";
  if (schema.kind === "boolean") return false;
  return null;
}

function arrayGroup(
  name: string,
  path: string,
  schema: ValueSchema & { kind: "array" },
  bag: Record<string, CanonicalValue>,
  hints: Readonly<Record<string, FieldHint>>,
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
    // Adding or removing an entry changes the control tree, so this subtree is
    // rebuilt rather than patched. Scalar edits never come through here.
    const replacement = arrayGroup(name, path, schema, bag, hints, emit);
    group.replaceWith(replacement);
    emit();
  };

  entries.forEach((entry, index) => {
    const item = document.createElement("div");
    item.className = "form-item";
    item.append(buildForm(
      schema.items,
      entry,
      hints,
      emit,
      `${path}[]`,
    ));
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
  add.addEventListener("click", () => { entries.push(blank(schema.items)); rebuild(); });
  actions.append(add);
  group.append(actions);
  return group;
}
