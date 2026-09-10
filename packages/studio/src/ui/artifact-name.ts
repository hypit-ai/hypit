/** Two-line label with an expanding editor; the caller owns persistence. */
export function createArtifactName(options: {
  readonly name: string;
  readonly editable: boolean;
  readonly select: () => void;
  readonly save: (name: string) => Promise<string>;
}) {
  const element = document.createElement("div");
  element.className = "artifact-copy";
  const label = document.createElement("button");
  label.type = "button";
  label.className = "artifact-name";
  let name = options.name;
  const text = document.createElement("span");
  text.className = "artifact-name-text";
  text.textContent = name;
  label.append(text);
  label.title = options.editable ? `${name}\nDouble-click or press F2 to rename` : `${name}\nNaming is available when this Build finishes`;
  element.append(label);
  label.addEventListener("click", (event) => { event.stopPropagation(); options.select(); });
  let editing = false;

  function edit(): void {
    if (editing || !options.editable) return;
    options.select();
    editing = true;
    element.classList.add("editing");
    label.hidden = true;
    const field = document.createElement("textarea");
    field.className = "artifact-name-editor";
    field.value = name;
    field.rows = 1;
    field.setAttribute("aria-label", "Display name");
    const error = document.createElement("span");
    error.className = "artifact-name-error";
    error.setAttribute("role", "status");
    element.append(field, error);
    const resize = () => { field.style.height = "0px"; field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`; };
    resize();
    field.focus();
    field.setSelectionRange(name.length, name.length);
    field.addEventListener("input", resize);
    field.addEventListener("click", (event) => event.stopPropagation());
    let saving = false;
    const close = () => {
      editing = false;
      field.remove();
      error.remove();
      label.hidden = false;
      element.classList.remove("editing");
    };
    const save = async () => {
      if (!editing || saving) return;
      const value = field.value.trim();
      if (value === name) { close(); return; }
      if (value.length === 0) { error.textContent = "Enter a name."; return; }
      saving = true;
      field.readOnly = true;
      error.textContent = "Saving…";
      try {
        name = await options.save(value);
        text.textContent = name;
        label.title = `${name}\nDouble-click or press F2 to rename`;
        close();
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : String(cause);
      } finally {
        saving = false;
        field.readOnly = false;
      }
    };
    field.addEventListener("blur", () => { void save(); });
    field.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !saving) { event.preventDefault(); event.stopPropagation(); close(); label.focus(); }
      else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void save(); }
    });
  }
  label.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); edit(); });
  return { element, edit };
}
