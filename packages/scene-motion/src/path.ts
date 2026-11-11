import type {
  SceneBehaviorResolver,
  SceneCameraState,
  SceneObjectState,
  SceneQuaternion,
  SceneVector3,
} from "@hypit/scene";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

const pathSceneMotionModuleRef = { name: "@hypit/scene-motion", version: "1" } as const;

export const cameraPathSymbol = { module: pathSceneMotionModuleRef, name: "camera-path" } as const;
export const objectPathSymbol = { module: pathSceneMotionModuleRef, name: "object-path" } as const;

type Curve = "linear" | "catmull-rom";

type CameraPathPoint = {
  readonly at: number;
  readonly position: SceneVector3;
  readonly aim: SceneVector3;
  readonly fov?: number;
};

type ObjectPathPoint = {
  readonly at: number;
  readonly position: SceneVector3;
  readonly rotation?: SceneQuaternion;
};

type CameraPathParameters = {
  readonly kind: "camera-path";
  readonly curve: Curve;
  readonly points: readonly CameraPathPoint[];
};

type ObjectPathParameters = {
  readonly kind: "object-path";
  readonly curve: Curve;
  readonly points: readonly ObjectPathPoint[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function fields(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[], label: string): void {
  const keys = Object.keys(value);
  for (const key of required) assert(keys.includes(key), `${label}.${key} is required.`);
  const allowed = new Set([...required, ...optional]);
  assert(keys.every((key) => allowed.has(key)), `${label} has invalid fields.`);
}

function finite(value: unknown, label: string): asserts value is number {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be finite.`);
}

function vector(value: unknown, label: string): asserts value is SceneVector3 {
  record(value, label);
  fields(value, ["x", "y", "z"], [], label);
  finite(value.x, `${label}.x`);
  finite(value.y, `${label}.y`);
  finite(value.z, `${label}.z`);
}

function quaternion(value: unknown, label: string): asserts value is SceneQuaternion {
  record(value, label);
  fields(value, ["x", "y", "z", "w"], [], label);
  finite(value.x, `${label}.x`);
  finite(value.y, `${label}.y`);
  finite(value.z, `${label}.z`);
  finite(value.w, `${label}.w`);
  assert(Math.hypot(value.x, value.y, value.z, value.w) > 1e-9, `${label} must not be zero.`);
}

function curve(value: unknown, label: string): asserts value is Curve {
  assert(value === "linear" || value === "catmull-rom", `${label} must be linear or catmull-rom.`);
}

function validatePoints(points: readonly { readonly at: number }[], label: string): void {
  assert(points.length >= 2, `${label} requires at least two points.`);
  assert(points[0]?.at === 0, `${label} must begin at 0.`);
  assert(points.at(-1)?.at === 1, `${label} must end at 1.`);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    finite(point.at, `${label}[${index}].at`);
    assert(point.at >= 0 && point.at <= 1, `${label}[${index}].at must lie from 0 through 1.`);
    if (index > 0) assert(point.at > points[index - 1]!.at, `${label} offsets must increase.`);
  }
}

function cameraParameters(value: unknown): CameraPathParameters {
  record(value, "Camera Path parameters");
  fields(value, ["kind", "curve", "points"], [], "Camera Path parameters");
  assert(value.kind === "camera-path", "Camera Path parameters.kind must be camera-path.");
  curve(value.curve, "Camera Path parameters.curve");
  assert(Array.isArray(value.points), "Camera Path parameters.points must be an array.");
  const points = value.points.map((candidate, index) => {
    const label = `Camera Path parameters.points[${index}]`;
    record(candidate, label);
    fields(candidate, ["at", "position", "aim"], ["fov"], label);
    finite(candidate.at, `${label}.at`);
    vector(candidate.position, `${label}.position`);
    vector(candidate.aim, `${label}.aim`);
    if (candidate.fov !== undefined) {
      finite(candidate.fov, `${label}.fov`);
      assert(candidate.fov > 0 && candidate.fov < 180, `${label}.fov must lie between 0 and 180.`);
    }
    return candidate as CameraPathPoint;
  });
  validatePoints(points, "Camera Path points");
  return { kind: "camera-path", curve: value.curve, points };
}

function objectParameters(value: unknown): ObjectPathParameters {
  record(value, "Object Path parameters");
  fields(value, ["kind", "curve", "points"], [], "Object Path parameters");
  assert(value.kind === "object-path", "Object Path parameters.kind must be object-path.");
  curve(value.curve, "Object Path parameters.curve");
  assert(Array.isArray(value.points), "Object Path parameters.points must be an array.");
  const points = value.points.map((candidate, index) => {
    const label = `Object Path parameters.points[${index}]`;
    record(candidate, label);
    fields(candidate, ["at", "position"], ["rotation"], label);
    finite(candidate.at, `${label}.at`);
    vector(candidate.position, `${label}.position`);
    if (candidate.rotation !== undefined) quaternion(candidate.rotation, `${label}.rotation`);
    return candidate as ObjectPathPoint;
  });
  validatePoints(points, "Object Path points");
  return { kind: "object-path", curve: value.curve, points };
}

function seconds(value: ExactTemporalValue): number {
  return Number(BigInt(value.ticks)) * value.timeBase.numerator / value.timeBase.denominator;
}

function normalized(at: ExactTemporalValue, duration: ExactTemporalValue): number {
  return Math.min(1, Math.max(0, seconds(at) / seconds(duration)));
}

function segment<Point extends { readonly at: number }>(points: readonly Point[], at: number): {
  readonly index: number;
  readonly amount: number;
} {
  const right = points.findIndex((point) => point.at >= at);
  const index = Math.max(0, Math.min(points.length - 2, right <= 0 ? 0 : right - 1));
  const leftPoint = points[index]!;
  const rightPoint = points[index + 1]!;
  return { index, amount: (at - leftPoint.at) / (rightPoint.at - leftPoint.at) };
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function catmull(left2: number, left: number, right: number, right2: number, amount: number): number {
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;
  return .5 * ((2 * left) + (-left2 + right) * amount
    + (2 * left2 - 5 * left + 4 * right - right2) * amount2
    + (-left2 + 3 * left - 3 * right + right2) * amount3);
}

function pathVector<Point>(points: readonly Point[], index: number, amount: number, mode: Curve,
  select: (point: Point) => SceneVector3): SceneVector3 {
  const left = select(points[index]!);
  const right = select(points[index + 1]!);
  if (mode === "linear") return {
    x: lerp(left.x, right.x, amount),
    y: lerp(left.y, right.y, amount),
    z: lerp(left.z, right.z, amount),
  };
  const left2 = select(points[Math.max(0, index - 1)]!);
  const right2 = select(points[Math.min(points.length - 1, index + 2)]!);
  return {
    x: catmull(left2.x, left.x, right.x, right2.x, amount),
    y: catmull(left2.y, left.y, right.y, right2.y, amount),
    z: catmull(left2.z, left.z, right.z, right2.z, amount),
  };
}

function normalizeQuaternion(value: SceneQuaternion): SceneQuaternion {
  const length = Math.hypot(value.x, value.y, value.z, value.w);
  return { x: value.x / length, y: value.y / length, z: value.z / length, w: value.w / length };
}

function slerp(leftInput: SceneQuaternion, rightInput: SceneQuaternion, amount: number): SceneQuaternion {
  const left = normalizeQuaternion(leftInput);
  let right = normalizeQuaternion(rightInput);
  let dot = left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
  if (dot < 0) {
    dot = -dot;
    right = { x: -right.x, y: -right.y, z: -right.z, w: -right.w };
  }
  if (dot > .9995) return normalizeQuaternion({
    x: lerp(left.x, right.x, amount), y: lerp(left.y, right.y, amount),
    z: lerp(left.z, right.z, amount), w: lerp(left.w, right.w, amount),
  });
  const angle = Math.acos(Math.min(1, dot));
  const sine = Math.sin(angle);
  const leftWeight = Math.sin((1 - amount) * angle) / sine;
  const rightWeight = Math.sin(amount * angle) / sine;
  return {
    x: left.x * leftWeight + right.x * rightWeight,
    y: left.y * leftWeight + right.y * rightWeight,
    z: left.z * leftWeight + right.z * rightWeight,
    w: left.w * leftWeight + right.w * rightWeight,
  };
}

function subtract(left: SceneVector3, right: SceneVector3): SceneVector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function cross(left: SceneVector3, right: SceneVector3): SceneVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalize(value: SceneVector3, label: string): SceneVector3 {
  const length = Math.hypot(value.x, value.y, value.z);
  assert(length > 1e-9, `${label} must not be zero.`);
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function lookAt(position: SceneVector3, target: SceneVector3): SceneQuaternion {
  const z = normalize(subtract(position, target), "Camera aim direction");
  let x = cross({ x: 0, y: 1, z: 0 }, z);
  if (Math.hypot(x.x, x.y, x.z) <= 1e-9) x = cross({ x: 0, y: 0, z: 1 }, z);
  x = normalize(x, "Camera right axis");
  const y = cross(z, x);
  const m11 = x.x; const m12 = y.x; const m13 = z.x;
  const m21 = x.y; const m22 = y.y; const m23 = z.y;
  const m31 = x.z; const m32 = y.z; const m33 = z.z;
  const trace = m11 + m22 + m33;
  let result: SceneQuaternion;
  if (trace > 0) {
    const s = .5 / Math.sqrt(trace + 1);
    result = { x: (m32 - m23) * s, y: (m13 - m31) * s, z: (m21 - m12) * s, w: .25 / s };
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    result = { x: .25 * s, y: (m12 + m21) / s, z: (m13 + m31) / s, w: (m32 - m23) / s };
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    result = { x: (m12 + m21) / s, y: .25 * s, z: (m23 + m32) / s, w: (m13 - m31) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    result = { x: (m13 + m31) / s, y: (m23 + m32) / s, z: .25 * s, w: (m21 - m12) / s };
  }
  return normalizeQuaternion(result);
}

export const cameraPathBehavior: SceneBehaviorResolver = {
  behavior: cameraPathSymbol,
  resolve(item, context) {
    assert(context.track.subject.kind === "camera", `Camera Path ${item.id} must target a Camera Track.`);
    const camera = context.project.cameras.find((entry) => entry.id === context.track.subject.ref);
    assert(camera !== undefined, `Camera Path ${item.id} references missing Camera ${context.track.subject.ref}.`);
    const value = cameraParameters(item.parameters);
    return {
      domain: structuredClone(context.domain),
      dependencies: [],
      evaluate(at): SceneCameraState {
        const position = normalized(at, context.domain.duration);
        const active = segment(value.points, position);
        const left = value.points[active.index]!;
        const right = value.points[active.index + 1]!;
        const cameraPosition = pathVector(value.points, active.index, active.amount, value.curve, point => point.position);
        const aim = pathVector(value.points, active.index, active.amount, value.curve, point => point.aim);
        return {
          kind: "camera",
          pose: { position: cameraPosition, rotation: lookAt(cameraPosition, aim) },
          lens: {
            ...structuredClone(camera.lens),
            fov: lerp(left.fov ?? camera.lens.fov, right.fov ?? camera.lens.fov, active.amount),
          },
        };
      },
    };
  },
};

export const objectPathBehavior: SceneBehaviorResolver = {
  behavior: objectPathSymbol,
  resolve(item, context) {
    assert(context.track.subject.kind === "object", `Object Path ${item.id} must target an Object Track.`);
    const object = context.project.objects.find((entry) => entry.id === context.track.subject.ref);
    assert(object !== undefined, `Object Path ${item.id} references missing Object ${context.track.subject.ref}.`);
    const value = objectParameters(item.parameters);
    return {
      domain: structuredClone(context.domain),
      dependencies: [],
      evaluate(at): SceneObjectState {
        const position = normalized(at, context.domain.duration);
        const active = segment(value.points, position);
        const left = value.points[active.index]!;
        const right = value.points[active.index + 1]!;
        return {
          kind: "object",
          transform: {
            position: pathVector(value.points, active.index, active.amount, value.curve, point => point.position),
            rotation: slerp(left.rotation ?? object.transform.rotation,
              right.rotation ?? object.transform.rotation, active.amount),
            scale: structuredClone(object.transform.scale),
          },
        };
      },
    };
  },
};
