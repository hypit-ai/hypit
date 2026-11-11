function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function activeAuthoringVariant(editor, node) {
  if (!editor.variant) return undefined;
  const input = node.inputs[editor.variant.input];
  const value = input && "value" in input && typeof input.value === "string"
    ? input.value : editor.variant.default;
  return editor.variant.variants.find(candidate => candidate.value === value);
}

export function activeAuthoringPorts(editor, node) {
  if (!editor) return [];
  if (!editor.variant) return editor.ports;
  const variant = activeAuthoringVariant(editor, node);
  if (!variant) return [];
  const active = new Set(variant.active);
  return editor.ports.filter(port => active.has(port.id));
}

/**
 * Applies one package-declared variant without silently discarding authored work.
 * Inactive controls are removed only while they still equal their declared defaults;
 * populated ports and non-default values remain for package validation to reject.
 */
export function authoringVariantInputs(editor, node, value) {
  if (!editor?.variant) return { ...node.inputs };
  const selected = editor.variant.variants.find(variant => variant.value === value);
  if (!selected) return { ...node.inputs, [editor.variant.input]: { value } };
  const inputs = { ...node.inputs, [editor.variant.input]: { value } };
  const active = new Set(selected.active);
  for (const control of editor.controls) {
    const binding = inputs[control.input];
    if (active.has(control.id) || binding === undefined || !("value" in binding)
      || control.default === undefined
      || JSON.stringify(binding.value) !== JSON.stringify(control.default)) continue;
    delete inputs[control.input];
  }
  return inputs;
}

export function authoringPortBindingCount(port, node) {
  if (port.kind === "slot") return node.inputs[port.input] === undefined ? 0 : 1;
  const prefixes = new Set(port.entries.map(entry => entry.prefix));
  return Object.keys(node.inputs).filter(name => [...prefixes].some(prefix =>
    new RegExp(`^${escapeRegExp(prefix)}\\.[1-9][0-9]*$`, "u").test(name))).length;
}

export function authoringPortCanAccept(port, node) {
  if (port.kind === "slot") return authoringPortBindingCount(port, node) === 0;
  return port.maxItems === undefined || authoringPortBindingCount(port, node) < port.maxItems;
}

function authoringListBoundRoles(port, node) {
  const roles = new Set();
  for (const entry of port.entries) {
    const expression = new RegExp(`^${escapeRegExp(entry.prefix)}\\.[1-9][0-9]*$`, "u");
    for (const name of Object.keys(node.inputs)) {
      if (!expression.test(name)) continue;
      const shared = port.entries.filter(candidate => candidate.prefix === entry.prefix).length > 1;
      const role = shared ? node.inputs[`${name}.role`] : undefined;
      if (!shared || role && "value" in role && role.value === entry.role) roles.add(entry.role);
    }
  }
  return roles;
}

export function compatibleAuthoringConnections(node, ports, sourceRoles) {
  return ports.filter(port => authoringPortCanAccept(port, node)).flatMap(port =>
    port.kind === "slot"
      ? port.accepts.filter(role => sourceRoles.includes(role)).map(role => ({ port, role }))
      : port.entries.filter(entry => sourceRoles.includes(entry.role)
        && (entry.requiresAnyRole === undefined
          || entry.requiresAnyRole.some(role => authoringListBoundRoles(port, node).has(role))))
        .map(entry => ({ port, role: entry.role, entry })));
}

/** Explicit replacement is a Canvas gesture, never an automatic assignment policy. */
export function replaceableAuthoringConnections(node, ports, sourceRoles) {
  return ports.flatMap(port => port.kind === "slot" && node.inputs[port.input] !== undefined
    ? port.accepts.filter(role => sourceRoles.includes(role)).map(role => ({ port, role, replacement: true }))
    : []);
}

/** All Graph inputs owned by one media binding, including package-declared item metadata. */
export function authoringBindingInputKeys(editor, node, input) {
  if (!editor) return [input];
  for (const port of editor.ports) {
    if (port.kind === "slot") {
      const owned = [port.input, ...(port.itemFields ?? []).map(field =>
        field.input.kind === "sibling" ? field.input.name : `${port.input}.${field.name}`)];
      if (owned.includes(input)) return owned;
      continue;
    }
    for (const binding of Object.keys(node.inputs)) {
      const matches = port.entries.filter(entry =>
        new RegExp(`^${escapeRegExp(entry.prefix)}\\.[1-9][0-9]*$`, "u").test(binding));
      if (matches.length === 0) continue;
      const roleInput = node.inputs[`${binding}.role`];
      const role = roleInput && "value" in roleInput ? roleInput.value : undefined;
      const entry = matches.find(candidate => candidate.role === role) ?? matches[0];
      const remaining = authoringPortBindingCount(port, node) - 1;
      const owned = [binding, `${binding}.role`, ...(entry.itemFields ?? []).flatMap(field => {
        if (field.input.kind === "suffix") return [`${binding}.${field.name}`];
        return remaining === 0 ? [field.input.name] : [];
      })];
      if (owned.includes(input)) return owned;
    }
  }
  return [input];
}

/** Canvas policy only: prefer required empty slots, then optional slots, then appendable lists. */
export function automaticAuthoringConnection(editor, node, sourceRoles) {
  if (!editor || sourceRoles.length === 0) return undefined;
  const rank = option => option.port.kind === "slot" ? (option.port.required ? 0 : 1) : 2;
  const choose = (ports, variant) => compatibleAuthoringConnections(node, ports, sourceRoles)
    .map((option, index) => ({ option, index }))
    .sort((left, right) => rank(left.option) - rank(right.option) || left.index - right.index)
    .map(({ option }) => ({
      ...option,
      ...(variant === undefined ? {} : { variant: { input: editor.variant.input, value: variant.value } }),
    }))[0];
  const current = choose(activeAuthoringPorts(editor, node));
  if (current !== undefined || editor.variant === undefined) return current;
  const populated = new Set(editor.ports
    .filter(port => authoringPortBindingCount(port, node) > 0).map(port => port.id));
  const authoredControls = editor.controls.filter(control => node.inputs[control.input] !== undefined);
  const active = activeAuthoringVariant(editor, node);
  for (const variant of editor.variant.variants) {
    if (variant === active || [...populated].some(id => !variant.active.includes(id))) continue;
    if (authoredControls.some(control => !variant.active.includes(control.id)
      && (control.default === undefined
        || !("value" in node.inputs[control.input])
        || JSON.stringify(node.inputs[control.input].value) !== JSON.stringify(control.default)))) continue;
    const activeIds = new Set(variant.active);
    const option = choose(editor.ports.filter(port => activeIds.has(port.id)), variant);
    if (option !== undefined) return option;
  }
  return undefined;
}
