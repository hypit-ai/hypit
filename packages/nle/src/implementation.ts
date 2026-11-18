/** npm selects the implementation version; the symbol is assigned by that package. */
export type PackageSymbol = {
  readonly package: string;
  readonly symbol: string;
};

type ImplementationBinding = {
  readonly implementation: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function assertPackageSymbol(value: PackageSymbol, label = "Package symbol"): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(typeof value.package === "string"
    && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(value.package),
  `${label}.package must be an unversioned npm package name.`);
  assertIdentity(value.symbol, `${label}.symbol`);
}

function assertClosedValue(value: unknown, label: string, ancestors: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    assert(Number.isFinite(value), `${label} must be finite.`);
    return;
  }
  assert(typeof value === "object" && value !== null, `${label} is not JSON-compatible.`);
  assert(!ancestors.has(value), `${label} contains a cycle.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const [index, member] of value.entries()) assertClosedValue(member, `${label}.${index}`, ancestors);
  } else {
    const prototype = Object.getPrototypeOf(value) as unknown;
    assert(prototype === Object.prototype || prototype === null, `${label} must be a plain object.`);
    for (const [name, member] of Object.entries(value)) {
      assert(member !== undefined, `${label}.${name} is undefined.`);
      assertClosedValue(member, `${label}.${name}`, ancestors);
    }
  }
  ancestors.delete(value);
}

export function assertImplementationBinding(value: ImplementationBinding, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assertPackageSymbol(value.implementation, `${label}.implementation`);
  assert(value.parameters !== null && typeof value.parameters === "object" && !Array.isArray(value.parameters),
    `${label}.parameters must be an object.`);
  assertClosedValue(value.parameters, `${label}.parameters`, new Set());
}
