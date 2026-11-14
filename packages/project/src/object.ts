/** Portable identity of one persistent object inside an explicitly selected Project Boundary. */
export type ProjectObjectRef = {
  /** POSIX-style path relative to the Project root. */
  readonly path: string;
  /** Exact document format whose owner can open this object. */
  readonly format: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertProjectRelativePath(value: string): void {
  assert(value.length > 0 && value.trim() === value, "Project Object path is empty or padded.");
  assert(!value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/u.test(value),
    "Project Object path must be a portable project-relative path.");
  const parts = value.split("/");
  assert(parts.every((part) => part.length > 0 && part !== "." && part !== ".."),
    "Project Object path contains an empty, current or parent segment.");
}

export function assertProjectObjectRef(value: ProjectObjectRef): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Project Object reference must be an object.");
  assert(Object.keys(value).sort().join("\u0000") === ["format", "path"].join("\u0000"),
    "Project Object reference fields are invalid.");
  assert(typeof value.path === "string", "Project Object path must be a string.");
  assertProjectRelativePath(value.path);
  assert(typeof value.format === "string" && value.format.trim() === value.format
    && /@[1-9][0-9]*$/u.test(value.format),
  "Project Object format must name one exact format major.");
}

export function projectObjectRef(path: string, format: string): ProjectObjectRef {
  const value = { path, format };
  assertProjectObjectRef(value);
  return Object.freeze(value);
}

/** Request-local lookup key; never serialized as a second object identity. */
export function projectObjectRefKey(value: ProjectObjectRef): string {
  assertProjectObjectRef(value);
  return `${value.format}\u0000${value.path}`;
}
