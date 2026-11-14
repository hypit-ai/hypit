import type { CanonicalValue } from "@hypit/protocol";
import type { SceneEnvironmentParameterAuthoring } from "@hypit/scene";

export const sceneEnvironmentModuleRef = { name: "@hypit/scene-environment" } as const;
export const worldEnvironmentSymbol = { module: sceneEnvironmentModuleRef, name: "world-environment" } as const;

type World = {
  sky: { top: string; horizon: string };
  ground: { visible: boolean; color: string; opacity: number };
  atmosphere: { fogColor: string; fogDensity: number };
  lighting: {
    ambient: { sky: string; ground: string; intensity: number };
    key: { color: string; intensity: number; azimuth: number; elevation: number; shadows: boolean };
    fill: { color: string; intensity: number };
    rim: { color: string; intensity: number };
  };
  exposure: number;
};

type WorldParameters = {
  preset?: { path: string };
  world: World;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function fields(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  assert(Object.keys(value).every((key) => expected.includes(key)) && expected.every((key) => key in value),
    `${label} fields are invalid.`);
}

function color(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value), `${label} must be a hex color.`);
}

function finite(value: unknown, label: string): asserts value is number {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be finite.`);
}

function world(value: unknown): World {
  record(value, "World Environment world");
  fields(value, ["sky", "ground", "atmosphere", "lighting", "exposure"], "World Environment world");
  record(value.sky, "World Environment sky");
  fields(value.sky, ["top", "horizon"], "World Environment sky");
  color(value.sky.top, "World Environment sky.top"); color(value.sky.horizon, "World Environment sky.horizon");
  record(value.ground, "World Environment ground");
  fields(value.ground, ["visible", "color", "opacity"], "World Environment ground");
  assert(typeof value.ground.visible === "boolean", "World Environment ground.visible must be boolean.");
  color(value.ground.color, "World Environment ground.color");
  finite(value.ground.opacity, "World Environment ground.opacity");
  assert(value.ground.opacity >= 0 && value.ground.opacity <= 1, "World Environment ground.opacity is out of range.");
  record(value.atmosphere, "World Environment atmosphere");
  fields(value.atmosphere, ["fogColor", "fogDensity"], "World Environment atmosphere");
  color(value.atmosphere.fogColor, "World Environment atmosphere.fogColor");
  finite(value.atmosphere.fogDensity, "World Environment atmosphere.fogDensity");
  assert(value.atmosphere.fogDensity >= 0, "World Environment atmosphere.fogDensity must not be negative.");
  record(value.lighting, "World Environment lighting");
  fields(value.lighting, ["ambient", "key", "fill", "rim"], "World Environment lighting");
  record(value.lighting.ambient, "World Environment ambient light");
  fields(value.lighting.ambient, ["sky", "ground", "intensity"], "World Environment ambient light");
  color(value.lighting.ambient.sky, "World Environment ambient.sky");
  color(value.lighting.ambient.ground, "World Environment ambient.ground");
  finite(value.lighting.ambient.intensity, "World Environment ambient.intensity");
  record(value.lighting.key, "World Environment key light");
  fields(value.lighting.key, ["color", "intensity", "azimuth", "elevation", "shadows"], "World Environment key light");
  color(value.lighting.key.color, "World Environment key.color");
  finite(value.lighting.key.intensity, "World Environment key.intensity");
  finite(value.lighting.key.azimuth, "World Environment key.azimuth");
  finite(value.lighting.key.elevation, "World Environment key.elevation");
  assert(typeof value.lighting.key.shadows === "boolean", "World Environment key.shadows must be boolean.");
  for (const role of ["fill", "rim"] as const) {
    const light = value.lighting[role];
    record(light, `World Environment ${role} light`);
    fields(light, ["color", "intensity"], `World Environment ${role} light`);
    color(light.color, `World Environment ${role}.color`);
    finite(light.intensity, `World Environment ${role}.intensity`);
  }
  finite(value.exposure, "World Environment exposure");
  assert(value.exposure > 0, "World Environment exposure must be positive.");
  return value as unknown as World;
}

function parameters(value: CanonicalValue): WorldParameters {
  record(value, "World Environment parameters");
  assert(Object.keys(value).every((key) => key === "preset" || key === "world") && "world" in value,
    "World Environment parameters fields are invalid.");
  if (value.preset !== undefined) {
    record(value.preset, "World Environment preset");
    fields(value.preset, ["path"], "World Environment preset");
    assert(typeof value.preset.path === "string" && value.preset.path.length > 0,
      "World Environment preset.path is invalid.");
  }
  world(value.world);
  return value as unknown as WorldParameters;
}

const editablePaths = new Map<string, "color" | "number" | "boolean">([
  ["sky.top", "color"], ["sky.horizon", "color"],
  ["ground.visible", "boolean"], ["ground.color", "color"], ["ground.opacity", "number"],
  ["atmosphere.fogColor", "color"], ["atmosphere.fogDensity", "number"],
  ["lighting.ambient.sky", "color"], ["lighting.ambient.ground", "color"], ["lighting.ambient.intensity", "number"],
  ["lighting.key.color", "color"], ["lighting.key.intensity", "number"],
  ["lighting.key.azimuth", "number"], ["lighting.key.elevation", "number"], ["lighting.key.shadows", "boolean"],
  ["lighting.fill.color", "color"], ["lighting.fill.intensity", "number"],
  ["lighting.rim.color", "color"], ["lighting.rim.intensity", "number"],
  ["exposure", "number"],
]);

function setPath(target: Record<string, unknown>, path: string, value: string | number | boolean): void {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    record(next, `World Environment ${path}`);
    cursor = next;
  }
  cursor[parts.at(-1)!] = value;
}

export const worldEnvironmentAuthoring: SceneEnvironmentParameterAuthoring = {
  environment: worldEnvironmentSymbol,
  inspect: ({ environment }) => structuredClone(parameters(environment.parameters)),
  edit(operation, { environment }) {
    record(operation, "World Environment edit");
    assert(operation.kind === "world.set", "World Environment edit kind is invalid.");
    assert(typeof operation.path === "string", "World Environment edit path is invalid.");
    const valueType = editablePaths.get(operation.path);
    assert(valueType !== undefined, `World Environment field ${operation.path} is not editable.`);
    if (valueType === "color") color(operation.value, `World Environment ${operation.path}`);
    else if (valueType === "number") finite(operation.value, `World Environment ${operation.path}`);
    else assert(typeof operation.value === "boolean", `World Environment ${operation.path} must be boolean.`);
    const next = structuredClone(parameters(environment.parameters)) as unknown as Record<string, unknown>;
    setPath(next.world as Record<string, unknown>, operation.path, operation.value as string | number | boolean);
    return parameters(next as CanonicalValue) as unknown as CanonicalValue;
  },
};
