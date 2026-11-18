export function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className = "", text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function control(id: string): HTMLElement;
export function control<Tag extends keyof HTMLElementTagNameMap>(id: string, tag: Tag): HTMLElementTagNameMap[Tag];
export function control(id: string, tag?: string) {
  const node = document.getElementById(id);
  if (node === null || (tag !== undefined && node.localName !== tag)) throw new Error("Missing Canvas control " + id);
  return node;
}

export function button(text: string, act: () => void, className = "") {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", act);
  return node;
}

export function option(value: string, label = value) { return new Option(label, value); }

export function field(name: string, input: HTMLElement) {
  const label = element("label", "field");
  label.append(element("span", "", name), input);
  return label;
}

export function filename(path: string) { return path.split("/").at(-1)!.replace(/\.media\.json$/u, ""); }

export function titleFor(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/^./u, value => value.toUpperCase());
}
