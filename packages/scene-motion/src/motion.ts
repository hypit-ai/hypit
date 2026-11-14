import {
  sceneControlBehavior,
  type SceneBehaviorResolver,
  type SceneBehaviorParameterAuthoring,
  type SceneCameraState,
  type ScenePackage,
  type SceneQuaternion,
  type SceneVector3,
} from "@hypit/scene";
import { exactTemporalZero, type Rational } from "@hypit/temporal/algebra";

import { cameraPathBehavior, objectPathBehavior } from "./path.js";

export const sceneMotionModuleRef = { name: "@hypit/scene-motion" } as const;
export const cameraMotionSymbol = { module: sceneMotionModuleRef, name: "camera-motion" } as const;

type DollyParameters = {
  readonly kind: "dolly";
  readonly distance: number;
  readonly aim: { readonly kind: "point"; readonly position: SceneVector3 };
  readonly easing: "linear" | "ease-in-out";
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): asserts value is Readonly<Record<string, unknown>> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function exactFields(value: Readonly<Record<string, unknown>>, fields: readonly string[], label: string): void {
  assert(Object.keys(value).sort().join("\u0000") === [...fields].sort().join("\u0000"),
    `${label} has invalid fields.`);
}

function vector(value: unknown, label: string): asserts value is SceneVector3 {
  record(value, label);
  exactFields(value, ["x", "y", "z"], label);
  for (const axis of ["x", "y", "z"] as const) {
    assert(typeof value[axis] === "number" && Number.isFinite(value[axis]), `${label}.${axis} must be finite.`);
  }
}

function parameters(value: unknown): DollyParameters {
  record(value, "Camera Motion parameters");
  exactFields(value, ["aim", "distance", "easing", "kind"], "Camera Motion parameters");
  assert(value.kind === "dolly", "Camera Motion parameters.kind must be dolly.");
  assert(typeof value.distance === "number" && Number.isFinite(value.distance),
    "Camera Motion parameters.distance must be finite.");
  assert(value.easing === "linear" || value.easing === "ease-in-out",
    "Camera Motion parameters.easing is invalid.");
  record(value.aim, "Camera Motion parameters.aim");
  exactFields(value.aim, ["kind", "position"], "Camera Motion parameters.aim");
  assert(value.aim.kind === "point", "Camera Motion parameters.aim.kind must be point.");
  vector(value.aim.position, "Camera Motion parameters.aim.position");
  return value as DollyParameters;
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
  let q: SceneQuaternion;
  if (trace > 0) {
    const s = .5 / Math.sqrt(trace + 1);
    q = { x: (m32 - m23) * s, y: (m13 - m31) * s, z: (m21 - m12) * s, w: .25 / s };
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    q = { x: .25 * s, y: (m12 + m21) / s, z: (m13 + m31) / s, w: (m32 - m23) / s };
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    q = { x: (m12 + m21) / s, y: .25 * s, z: (m23 + m32) / s, w: (m13 - m31) / s };
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    q = { x: (m13 + m31) / s, y: (m23 + m32) / s, z: .25 * s, w: (m21 - m12) / s };
  }
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function slerp(left: SceneQuaternion, rightInput: SceneQuaternion, amount: number): SceneQuaternion {
  let right = rightInput;
  let dot = left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w;
  if (dot < 0) {
    dot = -dot;
    right = { x: -right.x, y: -right.y, z: -right.z, w: -right.w };
  }
  if (dot > .9995) {
    const value = {
      x: left.x + (right.x - left.x) * amount,
      y: left.y + (right.y - left.y) * amount,
      z: left.z + (right.z - left.z) * amount,
      w: left.w + (right.w - left.w) * amount,
    };
    const length = Math.hypot(value.x, value.y, value.z, value.w);
    return { x: value.x / length, y: value.y / length, z: value.z / length, w: value.w / length };
  }
  const angle = Math.acos(Math.min(1, dot));
  const sin = Math.sin(angle);
  const a = Math.sin((1 - amount) * angle) / sin;
  const b = Math.sin(amount * angle) / sin;
  return { x: left.x * a + right.x * b, y: left.y * a + right.y * b,
    z: left.z * a + right.z * b, w: left.w * a + right.w * b };
}

function number(value: Rational): number {
  return Number(value.numerator) / Number(value.denominator);
}

function interpolate(from: SceneCameraState, to: SceneCameraState, progress: Rational,
  policy: { readonly kind: DollyParameters["easing"] }): SceneCameraState {
  const raw = number(progress);
  const amount = policy.kind === "ease-in-out" ? raw * raw * (3 - 2 * raw) : raw;
  const lerp = (left: number, right: number) => left + (right - left) * amount;
  return {
    kind: "camera",
    pose: {
      position: {
        x: lerp(from.pose.position.x, to.pose.position.x),
        y: lerp(from.pose.position.y, to.pose.position.y),
        z: lerp(from.pose.position.z, to.pose.position.z),
      },
      rotation: slerp(from.pose.rotation, to.pose.rotation, amount),
    },
    lens: { ...structuredClone(from.lens), fov: lerp(from.lens.fov, to.lens.fov) },
  };
}

export const cameraMotionBehavior: SceneBehaviorResolver = {
  behavior: cameraMotionSymbol,
  resolve(item, context) {
    assert(context.track.subject.kind === "camera", `Camera Motion ${item.id} must target a Camera Track.`);
    const camera = context.project.cameras.find((entry) => entry.id === context.track.subject.ref);
    assert(camera !== undefined, `Camera Motion ${item.id} references missing Camera ${context.track.subject.ref}.`);
    const value = parameters(item.parameters);
    const direction = normalize(subtract(value.aim.position, camera.pose.position), "Camera dolly direction");
    const endPosition = {
      x: camera.pose.position.x + direction.x * value.distance,
      y: camera.pose.position.y + direction.y * value.distance,
      z: camera.pose.position.z + direction.z * value.distance,
    };
    const from: SceneCameraState = {
      kind: "camera",
      pose: { position: structuredClone(camera.pose.position), rotation: lookAt(camera.pose.position, value.aim.position) },
      lens: structuredClone(camera.lens),
    };
    const to: SceneCameraState = {
      kind: "camera",
      pose: { position: endPosition, rotation: lookAt(endPosition, value.aim.position) },
      lens: structuredClone(camera.lens),
    };
    return sceneControlBehavior({
      domain: context.domain,
      segments: [{
        range: { start: exactTemporalZero(), end: context.domain.duration },
        from,
        to,
        interpolation: { kind: value.easing },
      }],
    }, [], interpolate);
  },
};

export const cameraMotionAuthoring: SceneBehaviorParameterAuthoring = {
  behavior: cameraMotionSymbol,
  inspect: ({ item }) => structuredClone(parameters(item.parameters)),
  edit(operation, { item }) {
    record(operation, "Camera Motion edit");
    const current = parameters(item.parameters);
    assert(operation.kind === "field.set", "Camera Motion edit kind is invalid.");
    assert(operation.field === "distance" || operation.field === "easing" || operation.field === "aim",
      "Camera Motion edit field is invalid.");
    if (operation.field === "distance") {
      assert(typeof operation.value === "number" && Number.isFinite(operation.value),
        "Camera Motion distance edit must be finite.");
      return { ...structuredClone(current), distance: operation.value };
    }
    if (operation.field === "easing") {
      assert(operation.value === "linear" || operation.value === "ease-in-out",
        "Camera Motion easing edit is invalid.");
      return { ...structuredClone(current), easing: operation.value };
    }
    vector(operation.value, "Camera Motion aim edit");
    return { ...structuredClone(current), aim: { kind: "point", position: structuredClone(operation.value) } };
  },
};

export const sceneMotionPackage: ScenePackage = {
  behaviors: [cameraMotionBehavior, cameraPathBehavior, objectPathBehavior],
};
