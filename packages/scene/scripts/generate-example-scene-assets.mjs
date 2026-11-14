import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const assetRoot = fileURLToPath(new URL("../examples/scenes/assets/", import.meta.url));
const humanBaseRoot = fileURLToPath(new URL("../source-assets/human-bases/", import.meta.url));

const palette = {
  skin: [0.73, 0.55, 0.44, 1],
  skinLight: [0.84, 0.67, 0.55, 1],
  graphite: [0.075, 0.082, 0.098, 1],
  charcoal: [0.14, 0.15, 0.17, 1],
  ash: [0.38, 0.40, 0.44, 1],
  stone: [0.55, 0.56, 0.58, 1],
  ivory: [0.78, 0.77, 0.72, 1],
  rose: [0.78, 0.18, 0.35, 1],
  cobalt: [0.12, 0.27, 0.62, 1],
  amber: [0.95, 0.47, 0.11, 1],
  teal: [0.08, 0.55, 0.50, 1],
  white: [0.88, 0.89, 0.91, 1],
};

function box() {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    [[1, 0, 0], [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]]],
    [[-1, 0, 0], [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]]],
    [[0, 1, 0], [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]]],
    [[0, -1, 0], [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]]],
    [[0, 0, 1], [[.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5], [-.5, -.5, .5]]],
    [[0, 0, -1], [[-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5], [.5, -.5, -.5]]],
  ];
  for (const [normal, corners] of faces) {
    const base = positions.length / 3;
    for (const corner of corners) { positions.push(...corner); normals.push(...normal); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

function cylinder(segments = 20) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const x = Math.cos(angle) * .5;
    const z = Math.sin(angle) * .5;
    positions.push(x, -.5, z, x, .5, z);
    normals.push(Math.cos(angle), 0, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
  }
  for (let index = 0; index < segments; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  for (const [y, normal] of [[.5, 1], [-.5, -1]]) {
    const center = positions.length / 3;
    positions.push(0, y, 0); normals.push(0, normal, 0);
    const ring = positions.length / 3;
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * .5, y, Math.sin(angle) * .5);
      normals.push(0, normal, 0);
    }
    for (let index = 0; index < segments; index += 1) {
      if (normal > 0) indices.push(center, ring + index + 1, ring + index);
      else indices.push(center, ring + index, ring + index + 1);
    }
  }
  return { positions, normals, indices };
}

function sphere(longitude = 20, latitude = 12) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let y = 0; y <= latitude; y += 1) {
    const vertical = y / latitude * Math.PI;
    for (let x = 0; x <= longitude; x += 1) {
      const horizontal = x / longitude * Math.PI * 2;
      const normal = [Math.sin(vertical) * Math.cos(horizontal), Math.cos(vertical), Math.sin(vertical) * Math.sin(horizontal)];
      normals.push(...normal); positions.push(normal[0] * .5, normal[1] * .5, normal[2] * .5);
    }
  }
  for (let y = 0; y < latitude; y += 1) {
    for (let x = 0; x < longitude; x += 1) {
      const a = y * (longitude + 1) + x;
      const b = a + longitude + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function icosphere(subdivisions = 1) {
  const golden = (1 + Math.sqrt(5)) / 2;
  const rawVertices = [
    [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
    [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
    [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1],
  ];
  const vertices = rawVertices.map(vertex => {
    const length = Math.hypot(...vertex);
    return vertex.map(value => value / length * .5);
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let step = 0; step < subdivisions; step += 1) {
    const midpointByEdge = new Map();
    const midpoint = (left, right) => {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      if (midpointByEdge.has(key)) return midpointByEdge.get(key);
      const average = vertices[left].map((value, axis) => (value + vertices[right][axis]) / 2);
      const length = Math.hypot(...average);
      const index = vertices.length;
      vertices.push(average.map(value => value / length * .5));
      midpointByEdge.set(key, index);
      return index;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  const positions = vertices.flat();
  const indices = faces.flat();
  return { positions, normals: recalculateNormals(positions, indices), indices };
}

function pyramid() {
  const positions = [];
  const normals = [];
  const indices = [];
  const addFace = (...vertices) => {
    const [a, b, c] = vertices;
    const ab = b.map((value, index) => value - a[index]);
    const ac = c.map((value, index) => value - a[index]);
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...normal);
    const base = positions.length / 3;
    for (const vertex of vertices) {
      positions.push(...vertex);
      normals.push(...normal.map((value) => value / length));
    }
    indices.push(base, base + 1, base + 2);
    if (vertices.length === 4) indices.push(base, base + 2, base + 3);
  };
  const lowerLeft = [-.5, -.5, -.5];
  const lowerRight = [.5, -.5, -.5];
  const upperRight = [.5, .5, -.5];
  const upperLeft = [-.5, .5, -.5];
  const tip = [0, 0, .5];
  addFace(lowerLeft, upperLeft, upperRight, lowerRight);
  addFace(lowerLeft, lowerRight, tip);
  addFace(lowerRight, upperRight, tip);
  addFace(upperRight, upperLeft, tip);
  addFace(upperLeft, lowerLeft, tip);
  return { positions, normals, indices };
}

function frustum(topRadius, bottomRadius, segments = 16) {
  const positions = [];
  const normals = [];
  const indices = [];
  const slope = bottomRadius - topRadius;
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    const length = Math.hypot(x, slope, z);
    positions.push(x * bottomRadius, -.5, z * bottomRadius, x * topRadius, .5, z * topRadius);
    normals.push(x / length, slope / length, z / length, x / length, slope / length, z / length);
  }
  for (let index = 0; index < segments; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
  }
  for (const [y, radius, normal] of [[.5, topRadius, 1], [-.5, bottomRadius, -1]]) {
    const center = positions.length / 3;
    positions.push(0, y, 0); normals.push(0, normal, 0);
    const ring = positions.length / 3;
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      normals.push(0, normal, 0);
    }
    for (let index = 0; index < segments; index += 1) {
      if (normal > 0) indices.push(center, ring + index + 1, ring + index);
      else indices.push(center, ring + index, ring + index + 1);
    }
  }
  return { positions, normals, indices };
}

function squarePyramid() {
  const positions = [];
  const indices = [];
  const base = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]];
  const tip = [0, .5, 0];
  positions.push(...base[0], ...base[3], ...base[2], ...base[1]);
  indices.push(0, 1, 2, 0, 2, 3);
  for (let index = 0; index < 4; index += 1) {
    const offset = positions.length / 3;
    positions.push(...base[index], ...base[(index + 1) % 4], ...tip);
    indices.push(offset, offset + 1, offset + 2);
  }
  return { positions, normals: recalculateNormals(positions, indices), indices };
}

function plane() {
  return {
    positions: [-.5, 0, -.5, -.5, 0, .5, .5, 0, .5, .5, 0, -.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

function torus(majorRadius = .36, minorRadius = .14, majorSegments = 20, minorSegments = 10) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let major = 0; major <= majorSegments; major += 1) {
    const u = major / majorSegments * Math.PI * 2;
    for (let minor = 0; minor <= minorSegments; minor += 1) {
      const v = minor / minorSegments * Math.PI * 2;
      const radial = majorRadius + minorRadius * Math.cos(v);
      positions.push(radial * Math.cos(u), minorRadius * Math.sin(v), radial * Math.sin(u));
      normals.push(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));
    }
  }
  const stride = minorSegments + 1;
  for (let major = 0; major < majorSegments; major += 1) {
    for (let minor = 0; minor < minorSegments; minor += 1) {
      const a = major * stride + minor;
      const b = a + stride;
      indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function halfArc(majorRadius = .38, minorRadius = .10, arcSegments = 16, tubeSegments = 8) {
  const positions = [];
  const indices = [];
  for (let arc = 0; arc <= arcSegments; arc += 1) {
    const u = arc / arcSegments * Math.PI;
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const v = tube / tubeSegments * Math.PI * 2;
      const radial = majorRadius + minorRadius * Math.cos(v);
      positions.push(radial * Math.cos(u), radial * Math.sin(u), minorRadius * Math.sin(v));
    }
  }
  for (let arc = 0; arc < arcSegments; arc += 1) {
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const next = (tube + 1) % tubeSegments;
      const lower = arc * tubeSegments + tube;
      const upper = (arc + 1) * tubeSegments + tube;
      indices.push(lower, upper, (arc + 1) * tubeSegments + next, lower, (arc + 1) * tubeSegments + next, arc * tubeSegments + next);
    }
  }
  for (const [arc, reverse] of [[0, true], [arcSegments, false]]) {
    const center = positions.length / 3;
    const u = arc / arcSegments * Math.PI;
    positions.push(majorRadius * Math.cos(u), majorRadius * Math.sin(u), 0);
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const next = (tube + 1) % tubeSegments;
      const current = arc * tubeSegments + tube;
      const nextVertex = arc * tubeSegments + next;
      if (reverse) indices.push(center, nextVertex, current);
      else indices.push(center, current, nextVertex);
    }
  }
  return { positions, normals: recalculateNormals(positions, indices), indices };
}

function capsule(radius = .25, halfBody = .25, segments = 14, capSegments = 5) {
  const rings = [];
  for (let index = 0; index <= capSegments; index += 1) {
    const angle = -Math.PI / 2 + index / capSegments * Math.PI / 2;
    rings.push({ y: -halfBody + Math.sin(angle) * radius, left: Math.cos(angle) * radius, right: Math.cos(angle) * radius, front: Math.cos(angle) * radius, back: Math.cos(angle) * radius });
  }
  rings.push({ y: halfBody, left: radius, right: radius, front: radius, back: radius });
  for (let index = 1; index <= capSegments; index += 1) {
    const angle = index / capSegments * Math.PI / 2;
    rings.push({ y: halfBody + Math.sin(angle) * radius, left: Math.cos(angle) * radius, right: Math.cos(angle) * radius, front: Math.cos(angle) * radius, back: Math.cos(angle) * radius });
  }
  return profileSurface(rings, segments);
}

function halfCylinder(segments = 16) {
  const positions = [];
  const indices = [];
  for (let side = 0; side < 2; side += 1) {
    const z = side === 0 ? -.5 : .5;
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * Math.PI;
      positions.push(Math.cos(angle) * .5, Math.sin(angle) * .5, z);
    }
  }
  const stride = segments + 1;
  for (let index = 0; index < segments; index += 1) {
    indices.push(index, stride + index + 1, stride + index, index, index + 1, stride + index + 1);
  }
  const flatStart = positions.length / 3;
  positions.push(-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5);
  indices.push(flatStart, flatStart + 1, flatStart + 2, flatStart, flatStart + 2, flatStart + 3);
  for (const side of [0, 1]) {
    const center = positions.length / 3;
    const z = side === 0 ? -.5 : .5;
    positions.push(0, 0, z);
    const offset = side * stride;
    for (let index = 0; index < segments; index += 1) {
      if (side === 0) indices.push(center, offset + index + 1, offset + index);
      else indices.push(center, offset + index, offset + index + 1);
    }
  }
  return { positions, normals: recalculateNormals(positions, indices), indices };
}

const geometries = {
  box: box(),
  // Scene blocking geometry uses one visibly faceted language. Smooth product
  // surfaces imply detail that the Seedance proxy is not meant to preserve.
  cylinder: flatShadeGeometry(cylinder(8)),
  sphere: flatShadeGeometry(icosphere(1)),
  pyramid: pyramid(),
  cone: flatShadeGeometry(frustum(0, .5, 8)),
  squarePyramid: flatShadeGeometry(squarePyramid()),
  plane: plane(),
  torus: flatShadeGeometry(torus(.36, .14, 12, 6)),
  halfArc: flatShadeGeometry(halfArc(.38, .10, 10, 6)),
  capsule: flatShadeGeometry(capsule(.25, .25, 8, 3)),
  halfCylinder: flatShadeGeometry(halfCylinder(8)),
  chest: flatShadeGeometry(frustum(.5, .32, 8)),
  pelvis: flatShadeGeometry(frustum(.36, .5, 8)),
  limb: flatShadeGeometry(frustum(.36, .5, 8)),
};

function recalculateNormals(positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let index = 0; index < indices.length; index += 3) {
    const ia = indices[index] * 3;
    const ib = indices[index + 1] * 3;
    const ic = indices[index + 2] * 3;
    const ab = [positions[ib] - positions[ia], positions[ib + 1] - positions[ia + 1], positions[ib + 2] - positions[ia + 2]];
    const ac = [positions[ic] - positions[ia], positions[ic + 1] - positions[ia + 1], positions[ic + 2] - positions[ia + 2]];
    const normal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    for (const vertex of [ia, ib, ic]) {
      normals[vertex] += normal[0];
      normals[vertex + 1] += normal[1];
      normals[vertex + 2] += normal[2];
    }
  }
  for (let index = 0; index < normals.length; index += 3) {
    const length = Math.hypot(normals[index], normals[index + 1], normals[index + 2]) || 1;
    normals[index] /= length;
    normals[index + 1] /= length;
    normals[index + 2] /= length;
  }
  return normals;
}

function flatShadeGeometry(geometry) {
  const positions = [];
  const normals = [];
  const indices = [];
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const triangle = geometry.indices.slice(index, index + 3);
    const vertices = triangle.map(vertex => geometry.positions.slice(vertex * 3, vertex * 3 + 3));
    const [a, b, c] = vertices;
    const ab = b.map((value, axis) => value - a[axis]);
    const ac = c.map((value, axis) => value - a[axis]);
    const faceNormal = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const length = Math.hypot(...faceNormal) || 1;
    const normal = faceNormal.map(value => value / length);
    const base = positions.length / 3;
    for (const vertex of vertices) {
      positions.push(...vertex);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2);
  }
  return { positions, normals, indices };
}

function profileSurface(rings, segments = 12) {
  const positions = [];
  const indices = [];
  for (const ring of rings) {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const radiusX = cosine < 0 ? ring.left : ring.right;
      const radiusZ = sine < 0 ? ring.back : ring.front;
      positions.push((ring.centerX ?? 0) + cosine * radiusX, ring.y, (ring.centerZ ?? 0) + sine * radiusZ);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const lower = ring * segments + index;
      const lowerNext = ring * segments + next;
      const upper = (ring + 1) * segments + index;
      const upperNext = (ring + 1) * segments + next;
      indices.push(lower, upper, upperNext, lower, upperNext, lowerNext);
    }
  }
  for (const [ringIndex, normal] of [[0, -1], [rings.length - 1, 1]]) {
    const ring = rings[ringIndex];
    const center = positions.length / 3;
    positions.push(ring.centerX ?? 0, ring.y, ring.centerZ ?? 0);
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const currentVertex = ringIndex * segments + index;
      const nextVertex = ringIndex * segments + next;
      if (normal > 0) indices.push(center, nextVertex, currentVertex);
      else indices.push(center, currentVertex, nextVertex);
    }
  }
  return { positions, normals: recalculateNormals(positions, indices), indices };
}

function profileTangents(points, key) {
  const slopes = points.slice(0, -1).map((point, index) => (
    (points[index + 1][key] - point[key]) / (points[index + 1].y - point.y)
  ));
  return points.map((point, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes.at(-1);
    const previous = slopes[index - 1];
    const next = slopes[index];
    if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) return 0;
    const before = point.y - points[index - 1].y;
    const after = points[index + 1].y - point.y;
    const weightPrevious = 2 * after + before;
    const weightNext = after + 2 * before;
    return (weightPrevious + weightNext) / (weightPrevious / previous + weightNext / next);
  });
}

function sampleProfile(points, subdivisions = 2) {
  const keys = [...new Set(points.flatMap((point) => Object.keys(point)))].filter((key) => key !== "y");
  const normalizedPoints = points.map((point) => Object.fromEntries([
    ["y", point.y],
    ...keys.map((key) => [key, point[key] ?? 0]),
  ]));
  const tangents = Object.fromEntries(keys.map((key) => [key, profileTangents(normalizedPoints, key)]));
  const samples = [];
  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const start = normalizedPoints[index];
    const end = normalizedPoints[index + 1];
    const span = end.y - start.y;
    for (let step = 0; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const sample = { y: start.y + span * t };
      for (const key of keys) {
        sample[key] = (2 * t3 - 3 * t2 + 1) * start[key]
          + (t3 - 2 * t2 + t) * span * tangents[key][index]
          + (-2 * t3 + 3 * t2) * end[key]
          + (t3 - t2) * span * tangents[key][index + 1];
      }
      samples.push(sample);
    }
  }
  samples.push({ ...normalizedPoints.at(-1) });
  return samples;
}

function quaternion([x = 0, y = 0, z = 0]) {
  const c1 = Math.cos(x / 2); const c2 = Math.cos(y / 2); const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2); const s2 = Math.sin(y / 2); const s3 = Math.sin(z / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
}

function buildGltf(definition) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteLength = 0;
  const append = (typed, target) => {
    const padding = (4 - byteLength % 4) % 4;
    if (padding > 0) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
    const data = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, target });
    chunks.push(data); byteLength += data.length;
    return view;
  };
  const meshes = [];
  const meshByKey = new Map();
  const materials = definition.materials.map((material) => ({
    name: material.name,
    pbrMetallicRoughness: {
      baseColorFactor: material.color,
      metallicFactor: material.metallic ?? 0,
      roughnessFactor: material.roughness ?? .72,
    },
  }));
  const meshFor = (shape, material) => {
    const key = `${shape}:${material}`;
    if (meshByKey.has(key)) return meshByKey.get(key);
    const geometry = definition.geometries?.[shape] ?? geometries[shape];
    const positionView = append(new Float32Array(geometry.positions), 34962);
    const normalView = append(new Float32Array(geometry.normals), 34962);
    const indexView = append(new Uint16Array(geometry.indices), 34963);
    const positionAccessor = accessors.length;
    const xs = geometry.positions.filter((_, index) => index % 3 === 0);
    const ys = geometry.positions.filter((_, index) => index % 3 === 1);
    const zs = geometry.positions.filter((_, index) => index % 3 === 2);
    accessors.push({ bufferView: positionView, componentType: 5126, count: geometry.positions.length / 3, type: "VEC3", min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)], max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)] });
    const normalAccessor = accessors.length;
    accessors.push({ bufferView: normalView, componentType: 5126, count: geometry.normals.length / 3, type: "VEC3" });
    const indexAccessor = accessors.length;
    accessors.push({ bufferView: indexView, componentType: 5123, count: geometry.indices.length, type: "SCALAR" });
    const index = meshes.length;
    meshes.push({ name: `${shape}-${definition.materials[material].name}`, primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material }] });
    meshByKey.set(key, index);
    return index;
  };
  const rigJoints = definition.rig?.joints ?? [];
  const jointByName = new Map(rigJoints.map((joint) => [joint.name, joint]));
  const nodes = definition.parts.map((part) => {
    const translation = part.translation ?? [0, 0, 0];
    const joint = part.joint === undefined ? undefined : jointByName.get(part.joint);
    const localTranslation = joint === undefined ? translation : translation.map((value, index) => value - joint.position[index]);
    return {
      name: part.name,
      mesh: meshFor(part.shape, part.material ?? 0),
      ...(localTranslation.every((value) => value === 0) ? {} : { translation: localTranslation }),
      ...(part.rotation === undefined ? {} : { rotation: quaternion(part.rotation) }),
      ...(part.scale === undefined ? {} : { scale: part.scale }),
    };
  });
  const partNodeCount = nodes.length;
  const jointNodeIndex = new Map(rigJoints.map((joint, index) => [joint.name, partNodeCount + index]));
  for (const joint of rigJoints) {
    const parent = joint.parent === undefined ? undefined : jointByName.get(joint.parent);
    const translation = parent === undefined
      ? joint.position
      : joint.position.map((value, index) => value - parent.position[index]);
    const children = [
      ...definition.parts.map((part, index) => part.joint === joint.name ? index : undefined).filter((index) => index !== undefined),
      ...rigJoints.filter((candidate) => candidate.parent === joint.name).map((candidate) => jointNodeIndex.get(candidate.name)),
    ];
    nodes.push({
      name: joint.name,
      ...(translation.every((value) => value === 0) ? {} : { translation }),
      ...(children.length === 0 ? {} : { children }),
      extras: { hypitRigRole: joint.role },
    });
  }
  const sceneNodes = [
    ...definition.parts.map((part, index) => part.joint === undefined ? index : undefined).filter((index) => index !== undefined),
    ...rigJoints.filter((joint) => joint.parent === undefined).map((joint) => jointNodeIndex.get(joint.name)),
  ];
  const buffer = Buffer.concat(chunks);
  return {
    asset: { version: "2.0", generator: "Hypit example Scene Asset generator" },
    scene: 0,
    scenes: [{ name: definition.name, nodes: sceneNodes }],
    nodes,
    meshes,
    materials,
    buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${buffer.toString("base64")}` }],
    bufferViews,
    accessors,
  };
}

const material = (name, color, roughness = .72, metallic = 0) => ({ name, color, roughness, metallic });
const part = (name, shape, materialIndex, translation, scale, rotation, joint) => ({ name, shape, material: materialIndex, translation, scale, rotation, joint });
const segment = (name, materialIndex, from, to, diameter, shape = "cylinder", depth = diameter, joint) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  return part(name, shape, materialIndex,
    [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    [diameter, length, depth], [0, 0, -Math.atan2(dx, dy)], joint);
};

/*
 * Neutral low-poly mannequin aligned to production basemesh landmarks rather
 * than an invented primitive silhouette. The adult joint layout follows the
 * Blender Studio CC0 Human Base Meshes / MakeHuman proxy family: shoulder near
 * 80.5%, neck near 84.4%, hip near 52%, knee near 26.9%, and ankle near 4.3%
 * of stature. Body-type parameters alter volume, not the underlying anatomy.
 */
const humanoid = ({
  name, sex = "neutral", height, heads, legRatio, shoulderRatio, hipRatio,
  waistRatio, upperArmRatio = .185, forearmRatio = .15, build = 1,
  armBuild = build, legBuild = build, depthBuild = build,
  chestVolume = sex === "female" ? .35 : .08,
  abdomenVolume = 0, gluteVolume = sex === "female" ? .4 : .12, belly = 0,
  pose = "reference",
}) => {
  const headHeight = height / heads;
  const headWidth = headHeight * .73;
  const neckHeight = height * .05;
  // shoulderY is the upper torso reference; the actual shoulder joint sits
  // .012 h below it at ~.805 h, matching the basemesh landmark.
  const shoulderY = height * .817;
  const hipY = height * legRatio;
  const shoulderWidth = height * shoulderRatio;
  const hipWidth = height * hipRatio;
  const waistWidth = height * waistRatio;
  const chestBottom = hipY + height * .145;
  const abdomenBottom = hipY + height * .035;
  const chestHeight = shoulderY - chestBottom;
  const abdomenHeight = chestBottom - abdomenBottom;
  const pelvisHeight = height * .13;
  const shoulderX = shoulderWidth * .47;
  const upperArm = height * upperArmRatio;
  const forearm = height * forearmRatio;
  const armDiameter = height * .052 * armBuild;
  const handLength = height * .095;
  const kneeY = height * .2685;
  const ankleY = height * .043;
  const legX = hipWidth * .26;
  const thighDiameter = height * .075 * legBuild;
  const calfDiameter = height * .061 * legBuild;
  const chestDepth = height * .14 * depthBuild;
  const waistDepth = height * .12 * depthBuild;
  const pelvisDepth = height * .14 * depthBuild;
  const waistY = abdomenBottom + abdomenHeight * .28;
  const lowerRibY = chestBottom + chestHeight * .10;
  const chestY = chestBottom + chestHeight * .58;
  const torso = flatShadeGeometry(profileSurface(sampleProfile([
    { y: hipY - pelvisHeight * .56, left: hipWidth * .34, right: hipWidth * .34, front: pelvisDepth * .32, back: pelvisDepth * (.36 + gluteVolume * .035), centerZ: -height * .003 },
    { y: hipY - pelvisHeight * .38, left: hipWidth * .44, right: hipWidth * .44, front: pelvisDepth * .37, back: pelvisDepth * (.46 + gluteVolume * .060), centerZ: -height * .004 },
    { y: hipY - pelvisHeight * .16, left: hipWidth * .50, right: hipWidth * .50, front: pelvisDepth * .40, back: pelvisDepth * (.51 + gluteVolume * .075), centerZ: -height * .004 },
    { y: hipY + pelvisHeight * .03, left: hipWidth * .54, right: hipWidth * .54, front: pelvisDepth * (.44 + abdomenVolume * .018), back: pelvisDepth * (.50 + gluteVolume * .060), centerZ: -height * .002 },
    { y: abdomenBottom, left: hipWidth * .47, right: hipWidth * .47, front: pelvisDepth * (.43 + abdomenVolume * .045), back: pelvisDepth * (.42 + gluteVolume * .025), centerZ: height * .001 },
    { y: waistY, left: waistWidth * .50, right: waistWidth * .50, front: waistDepth * (.43 + abdomenVolume * .090), back: waistDepth * .39, centerZ: height * .004 },
    { y: waistY + abdomenHeight * .24, left: Math.max(waistWidth * .52, shoulderWidth * .27), right: Math.max(waistWidth * .52, shoulderWidth * .27), front: waistDepth * (.45 + abdomenVolume * .060), back: waistDepth * .40, centerZ: height * .003 },
    { y: lowerRibY, left: Math.max(waistWidth * .56, shoulderWidth * .33), right: Math.max(waistWidth * .56, shoulderWidth * .33), front: chestDepth * (.40 + chestVolume * .025), back: chestDepth * .39, centerZ: height * .002 },
    { y: chestY - chestHeight * .16, left: shoulderWidth * (.39 + chestVolume * .018), right: shoulderWidth * (.39 + chestVolume * .018), front: chestDepth * (.43 + chestVolume * .075), back: chestDepth * .42, centerZ: height * .003 },
    { y: chestY, left: shoulderWidth * (.43 + chestVolume * .024), right: shoulderWidth * (.43 + chestVolume * .024), front: chestDepth * (.44 + chestVolume * .092), back: chestDepth * .43, centerZ: height * .004 },
    { y: shoulderY - height * .055, left: shoulderWidth * .49, right: shoulderWidth * .49, front: chestDepth * .46, back: chestDepth * .44, centerZ: height * .002 },
    { y: shoulderY - height * .018, left: shoulderWidth * .51, right: shoulderWidth * .51, front: chestDepth * .44, back: chestDepth * .43 },
    { y: shoulderY + height * .002, left: shoulderWidth * .43, right: shoulderWidth * .43, front: chestDepth * .40, back: chestDepth * .39 },
    { y: shoulderY + height * .018, left: shoulderWidth * .30, right: shoulderWidth * .30, front: chestDepth * .34, back: chestDepth * .33 },
    // Continue the shoulder surface into the neck instead of terminating it on
    // a broad horizontal cap. The final cap is deliberately buried inside the
    // neck geometry, so a top-down view reads as a closed shoulder/neck volume.
    { y: shoulderY + height * .028, left: shoulderWidth * .19, right: shoulderWidth * .19, front: chestDepth * .22, back: chestDepth * .22 },
    { y: shoulderY + height * .034, left: headWidth * .19, right: headWidth * .19, front: headWidth * .17, back: headWidth * .17 },
  ], 1), 8));
  const upperArmGeometry = flatShadeGeometry(profileSurface(sampleProfile([
    { y: -.5, left: .34, right: .34, front: .30, back: .30 },
    { y: -.34, left: .39, right: .39, front: .34, back: .34 },
    { y: -.02, left: .45, right: .45, front: .39, back: .39 },
    { y: .30, left: .52, right: .52, front: .44, back: .44 },
    { y: .5, left: .50, right: .50, front: .43, back: .43 },
  ], 1), 8));
  const forearmGeometry = flatShadeGeometry(profileSurface(sampleProfile([
    { y: -.5, left: .28, right: .28, front: .25, back: .25 },
    { y: -.30, left: .34, right: .34, front: .30, back: .30 },
    { y: .02, left: .43, right: .43, front: .36, back: .36 },
    { y: .32, left: .51, right: .51, front: .42, back: .42 },
    { y: .5, left: .43, right: .43, front: .37, back: .37 },
  ], 1), 8));
  const calfGeometry = flatShadeGeometry(profileSurface(sampleProfile([
    { y: -.5, left: .28, right: .28, front: .26, back: .26 },
    { y: -.30, left: .38, right: .38, front: .34, back: .34 },
    { y: -.04, left: .51, right: .51, front: .45, back: .48 },
    { y: .23, left: .56, right: .56, front: .48, back: .54 },
    { y: .5, left: .43, right: .43, front: .39, back: .40 },
  ], 1), 8));
  const thighGeometry = {};
  const thighSpan = hipY - kneeY;
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    const sections = sampleProfile([
      { y: kneeY + height * .014, centerX: side * legX * .96, centerZ: 0, outer: thighDiameter * .36, inner: thighDiameter * .34, front: thighDiameter * .35, back: thighDiameter * .33 },
      { y: kneeY + thighSpan * .24, centerX: side * legX * .97, centerZ: 0, outer: thighDiameter * .44, inner: thighDiameter * .39, front: thighDiameter * .42, back: thighDiameter * .40 },
      { y: kneeY + thighSpan * .56, centerX: side * legX * .98, centerZ: -height * .001 * gluteVolume, outer: thighDiameter * .57, inner: thighDiameter * .51, front: thighDiameter * .53, back: thighDiameter * .52 },
      { y: kneeY + thighSpan * .78, centerX: side * legX, centerZ: -height * .003 * gluteVolume, outer: thighDiameter * .68, inner: thighDiameter * .60, front: thighDiameter * .59, back: thighDiameter * .58 },
      { y: kneeY + thighSpan * .90, centerX: side * legX, centerZ: -height * .005 * gluteVolume, outer: thighDiameter * .74, inner: thighDiameter * .65, front: thighDiameter * .62, back: thighDiameter * .64 },
      { y: hipY - height * .012, centerX: side * legX, centerZ: -height * .008 * gluteVolume, outer: thighDiameter * .76, inner: thighDiameter * .63, front: thighDiameter * .61, back: thighDiameter * .69 },
    ], 1).map(({ outer, inner, ...section }) => ({
      ...section,
      left: side < 0 ? outer : inner,
      right: side < 0 ? inner : outer,
    }));
    thighGeometry[`thigh${suffix}`] = flatShadeGeometry(profileSurface(sections, 8));
  }
  const parts = [
    part("Head", "head", 0, [0, height - headHeight / 2, 0], [headWidth, headHeight, headHeight * .82], undefined, "Rig.Head"),
    // Positive Z is the character's front. The nose keeps facing legible even
    // when a flat-shaded proxy is seen from far away or against a dark stage.
    part("Nose", "pyramid", 0, [0, height - headHeight * .49, headHeight * .44], [headWidth * .17, headHeight * .16, headHeight * .28], undefined, "Rig.Head"),
    part("Neck", "cylinder", 0, [0, height * .846, 0], [headWidth * .34, neckHeight, headWidth * .34], undefined, "Rig.Neck"),
    part("Torso", "torso", 0, undefined, undefined, undefined, "Rig.Spine"),
  ];
  if (belly > 0) parts.push(part("Belly", "sphere", 0,
    [0, abdomenBottom + abdomenHeight * .48, height * (.055 + belly * .025)],
    [waistWidth * 1.06, abdomenHeight * 1.15, height * (.12 + belly * .08)], undefined, "Rig.Spine"));
  const rigJoints = [
    { name: "Rig.Root", role: "root", position: [0, 0, 0] },
    { name: "Rig.Hips", role: "hips", parent: "Rig.Root", position: [0, hipY, 0] },
    { name: "Rig.Spine", role: "spine", parent: "Rig.Hips", position: [0, waistY, 0] },
    { name: "Rig.Chest", role: "chest", parent: "Rig.Spine", position: [0, chestY, 0] },
    { name: "Rig.Neck", role: "neck", parent: "Rig.Chest", position: [0, height * .844, 0] },
    { name: "Rig.Head", role: "head", parent: "Rig.Neck", position: [0, height - headHeight / 2, 0] },
  ];
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "L" : "R";
    const shoulder = [side * shoulderX, shoulderY - height * .012, 0];
    const standing = pose === "standing";
    const elbow = standing
      ? [shoulder[0] + side * upperArm * .34, shoulder[1] - upperArm * .94, height * .01]
      : [shoulder[0] + side * upperArm, shoulder[1], 0];
    const wrist = standing
      ? [elbow[0] + side * forearm * .24, elbow[1] - forearm * .97, height * .025]
      : [elbow[0] + side * forearm, elbow[1], 0];
    const knee = [side * legX * .96, kneeY, 0];
    const ankle = [side * legX * .92, ankleY, 0];
    const shoulderJoint = `Rig.Shoulder.${suffix}`;
    const elbowJoint = `Rig.Elbow.${suffix}`;
    const wristJoint = `Rig.Wrist.${suffix}`;
    const hipJoint = `Rig.Hip.${suffix}`;
    const kneeJoint = `Rig.Knee.${suffix}`;
    const ankleJoint = `Rig.Ankle.${suffix}`;
    rigJoints.push(
      { name: shoulderJoint, role: `shoulder.${suffix.toLowerCase()}`, parent: "Rig.Chest", position: shoulder },
      { name: elbowJoint, role: `elbow.${suffix.toLowerCase()}`, parent: shoulderJoint, position: elbow },
      { name: wristJoint, role: `wrist.${suffix.toLowerCase()}`, parent: elbowJoint, position: wrist },
      { name: hipJoint, role: `hip.${suffix.toLowerCase()}`, parent: "Rig.Hips", position: [side * legX, hipY, 0] },
      { name: kneeJoint, role: `knee.${suffix.toLowerCase()}`, parent: hipJoint, position: knee },
      { name: ankleJoint, role: `ankle.${suffix.toLowerCase()}`, parent: kneeJoint, position: ankle },
    );
    parts.push(
      part(`Shoulder.${suffix}`, "sphere", 0, shoulder, [armDiameter * .95, armDiameter * .95, armDiameter * .95], undefined, shoulderJoint),
      segment(`UpperArm.${suffix}`, 0, shoulder, elbow, armDiameter, "upperArm", armDiameter * .92, shoulderJoint),
      part(`Elbow.${suffix}`, "sphere", 0, elbow, [armDiameter * .72, armDiameter * .72, armDiameter * .72], undefined, elbowJoint),
      segment(`Forearm.${suffix}`, 0, elbow, wrist, armDiameter * .84, "forearm", armDiameter * .76, elbowJoint),
      part(`Wrist.${suffix}`, "sphere", 0, wrist, [armDiameter * .54, armDiameter * .54, armDiameter * .54], undefined, wristJoint),
      part(`Hand.${suffix}`, "sphere", 0,
        standing ? [wrist[0], wrist[1] - handLength * .45, height * .032] : [wrist[0] + side * handLength * .45, wrist[1], height * .008],
        standing ? [height * .052, handLength, height * .032] : [handLength, height * .052, height * .032], undefined, wristJoint),
      part(`Thigh.${suffix}`, `thigh${suffix}`, 0, undefined, undefined, undefined, hipJoint),
      part(`Knee.${suffix}`, "sphere", 0, knee, [calfDiameter * .86, calfDiameter * .86, calfDiameter * .86], undefined, kneeJoint),
      segment(`Calf.${suffix}`, 0, knee, ankle, calfDiameter, "calf", calfDiameter * .92, kneeJoint),
      part(`Ankle.${suffix}`, "sphere", 0, ankle, [calfDiameter * .60, calfDiameter * .60, calfDiameter * .60], undefined, ankleJoint),
      part(`Foot.${suffix}`, "sphere", 0, [ankle[0], height * .024, height * .055], [height * .067, height * .048, height * .16], undefined, ankleJoint),
    );
  }
  return {
    name,
    rig: { profile: "hypit-humanoid", joints: rigJoints },
    geometries: {
      // Humanoid primitives deliberately override the smoother shared prop
      // primitives. Large planar faces make pose and facing readable in a
      // blocking viewport without turning every project geometry into low-poly.
      head: flatShadeGeometry(icosphere(1)),
      // Limbs and joints are pose carriers, not anatomical sculpture. The
      // 20-face icosahedron keeps their volume readable without extra detail.
      sphere: flatShadeGeometry(icosphere(0)),
      cylinder: flatShadeGeometry(cylinder(8)),
      torso,
      upperArm: upperArmGeometry,
      forearm: forearmGeometry,
      calf: calfGeometry,
      ...thighGeometry,
    },
    materials: [
      material("Mannequin", [0.60, 0.62, 0.66, 1], .84),
      // Joints remain visible through silhouette and shading, not dark beads
      // that visually sever an otherwise continuous body volume.
      material("Joint", [0.59, 0.61, 0.65, 1], .88),
    ],
    parts,
  };
};

const humanoidRigDeclaration = {
  format: "hypit.humanoid-rig@1",
  root: "Rig.Root",
  joints: {
    hips: "Rig.Hips", spine: "Rig.Spine", chest: "Rig.Chest", neck: "Rig.Neck", head: "Rig.Head",
    leftShoulder: "Rig.Shoulder.L", leftElbow: "Rig.Elbow.L", leftWrist: "Rig.Wrist.L",
    rightShoulder: "Rig.Shoulder.R", rightElbow: "Rig.Elbow.R", rightWrist: "Rig.Wrist.R",
    leftHip: "Rig.Hip.L", leftKnee: "Rig.Knee.L", leftAnkle: "Rig.Ankle.L",
    rightHip: "Rig.Hip.R", rightKnee: "Rig.Knee.R", rightAnkle: "Rig.Ankle.R",
  },
};

function smoothProfile(value, position) {
  if (typeof value === "number") return value;
  const points = value ?? [1, 1, 1];
  const scaled = Math.max(0, Math.min(1, position)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const eased = local * local * (3 - 2 * local);
  return points[index] + (points[index + 1] - points[index]) * eased;
}

function glbDocument(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error("Human base source must be a GLB 2.0 document.");
  }
  let offset = 12;
  let document;
  let binary;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) document = JSON.parse(chunk.toString("utf8").trimEnd());
    else if (type === 0x004e4942) binary = Buffer.from(chunk);
    offset += 8 + length;
  }
  if (document === undefined || binary === undefined) throw new Error("Human base GLB needs JSON and BIN chunks.");
  return { document, binary };
}

function encodeGlb(document, binary) {
  const source = Buffer.from(JSON.stringify(document), "utf8");
  const jsonLength = Math.ceil(source.length / 4) * 4;
  const json = Buffer.alloc(jsonLength, 0x20);
  source.copy(json);
  const binaryLength = Math.ceil(binary.length / 4) * 4;
  const paddedBinary = Buffer.alloc(binaryLength);
  binary.copy(paddedBinary);
  const result = Buffer.alloc(12 + 8 + json.length + 8 + paddedBinary.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  json.copy(result, 20);
  const binaryHeader = 20 + json.length;
  result.writeUInt32LE(paddedBinary.length, binaryHeader);
  result.writeUInt32LE(0x004e4942, binaryHeader + 4);
  paddedBinary.copy(result, binaryHeader + 8);
  return result;
}

function meshEnvelope(name, profile, position) {
  const lower = name.toLowerCase();
  const axes = [1, 1, 1];
  const radial = (x, z = x) => { axes[0] = smoothProfile(x, position); axes[2] = smoothProfile(z, position); };
  if (lower.includes("chest")) radial(profile.chestWidth, profile.chestDepth);
  else if (lower.includes("belly")) radial(profile.bellyWidth, profile.bellyDepth);
  else if (lower.includes("pelvis")) radial(profile.pelvisWidth, profile.pelvisDepth);
  else if (lower.includes("breast")) {
    axes[0] = profile.breastWidth ?? 1;
    axes[1] = profile.breastHeight ?? 1;
    axes[2] = profile.breastDepth ?? 1;
  } else if (lower.includes("shoulder")) {
    axes[0] = profile.shoulderMass ?? 1;
    axes[1] = profile.armBuild ?? 1;
    axes[2] = profile.armBuild ?? 1;
  } else if (lower.includes("arm_upper")) {
    axes[0] = profile.armLength ?? 1;
    axes[1] = smoothProfile(profile.upperArmBuild ?? profile.armBuild, position);
    axes[2] = axes[1];
  } else if (lower.includes("arm_lower")) {
    axes[0] = profile.armLength ?? 1;
    axes[1] = smoothProfile(profile.forearmBuild ?? profile.armBuild, position);
    axes[2] = axes[1];
  } else if (lower.includes("hand")) {
    axes[1] = 1 + ((profile.armBuild ?? 1) - 1) * .35;
    axes[2] = axes[1];
  } else if (lower.includes("leg_upper")) {
    radial(profile.thighBuild, profile.thighDepth ?? profile.thighBuild);
    axes[1] = profile.legLength ?? 1;
  } else if (lower.includes("leg_lower")) {
    radial(profile.calfBuild, profile.calfDepth ?? profile.calfBuild);
    axes[1] = profile.legLength ?? 1;
  }
  else if (lower.includes("foot")) {
    axes[0] = 1 + ((profile.calfBuild ?? 1) - 1) * .25;
    axes[1] = 1 + ((profile.calfBuild ?? 1) - 1) * .12;
  } else if (lower.includes("neck")) radial(profile.neckBuild ?? 1);
  else if (lower.includes("head") || lower.includes("nose")) {
    radial(profile.headWidth ?? 1, profile.headDepth ?? 1);
    axes[1] = profile.headHeight ?? 1;
  }
  return axes;
}

const RELAXED_PREVIEW_ARM_ANGLE = Math.PI * .38;

function deformHumanBase(source, profile, standing = false) {
  const { document, binary } = glbDocument(source);
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      const positionIndex = primitive.attributes.POSITION;
      const normalIndex = primitive.attributes.NORMAL;
      const accessor = document.accessors[positionIndex];
      const original = Array.from({ length: accessor.count }, (_, index) => [0, 1, 2].map((axis) => {
        const view = document.bufferViews[accessor.bufferView];
        const stride = view.byteStride ?? 12;
        const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + index * stride + axis * 4;
        return binary.readFloatLE(offset);
      }));
      const lower = mesh.name.toLowerCase();
      const longAxis = lower.includes("arm_") || lower.includes("hand") || lower.includes("shoulder") ? 0 : 1;
      const values = original.map((point) => point[longAxis]);
      const minimum = Math.min(...values);
      const span = Math.max(...values) - minimum || 1;
      const xs = []; const nextYs = []; const zs = [];
      original.forEach((point, index) => {
        const envelope = meshEnvelope(mesh.name, profile, (point[longAxis] - minimum) / span);
        const transformed = point.map((value, axis) => value * envelope[axis]);
        xs.push(transformed[0]); nextYs.push(transformed[1]); zs.push(transformed[2]);
        const positionAccessor = document.accessors[positionIndex];
        const positionView = document.bufferViews[positionAccessor.bufferView];
        const positionStride = positionView.byteStride ?? 12;
        const positionOffset = (positionView.byteOffset ?? 0) + (positionAccessor.byteOffset ?? 0) + index * positionStride;
        transformed.forEach((value, axis) => binary.writeFloatLE(value, positionOffset + axis * 4));
        if (normalIndex !== undefined) {
          const normalAccessor = document.accessors[normalIndex];
          const normalView = document.bufferViews[normalAccessor.bufferView];
          const normalStride = normalView.byteStride ?? 12;
          const normalOffset = (normalView.byteOffset ?? 0) + (normalAccessor.byteOffset ?? 0) + index * normalStride;
          const normal = [0, 1, 2].map((axis) => binary.readFloatLE(normalOffset + axis * 4) / envelope[axis]);
          const length = Math.hypot(...normal) || 1;
          normal.forEach((value, axis) => binary.writeFloatLE(value / length, normalOffset + axis * 4));
        }
      });
      accessor.min = [Math.min(...xs), Math.min(...nextYs), Math.min(...zs)];
      accessor.max = [Math.max(...xs), Math.max(...nextYs), Math.max(...zs)];
    }
  }
  for (const node of document.nodes) {
    const lower = node.name.toLowerCase();
    if (lower.includes("rig.root")) {
      const scale = profile.stature / profile.baseStature;
      node.scale = [scale, scale, scale];
    }
    if (node.translation !== undefined && lower.includes("shoulder")) {
      node.translation[0] *= profile.shoulderOffset ?? 1;
    }
    if (node.translation !== undefined && lower.includes("leg_upper")) {
      node.translation[0] *= profile.hipOffset ?? 1;
    }
    if (node.translation !== undefined && (lower.includes("arm_upper") || lower.includes("arm_lower") || lower.includes("hand"))) {
      node.translation[0] *= profile.armLength ?? 1;
    }
    if (node.translation !== undefined && (lower.includes("leg_lower") || lower.includes("foot"))) {
      node.translation[1] *= profile.legLength ?? 1;
    }
    if (standing && lower.includes("shoulder") && /\.[lr]$/u.test(lower)) {
      // Asset cards use a relaxed low A-pose: enough negative space to read
      // the torso and arms without looking like a rigging T-pose.
      const angle = RELAXED_PREVIEW_ARM_ANGLE * (lower.endsWith(".l") ? -1 : 1);
      node.rotation = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
    }
  }
  return encodeGlb(document, binary);
}

const characterAsset = ({ id, label, ageBand, sex, sourceModel, sourcePreviewModel, derivedBase, ...profile }) => {
  const shape = {
    bodyType: "standard",
    armBuild: profile.build ?? 1,
    legBuild: profile.build ?? 1,
    depthBuild: profile.build ?? 1,
    chestVolume: sex === "female" ? .35 : .08,
    abdomenVolume: 0,
    gluteVolume: sex === "female" ? .4 : .12,
    ...profile,
  };
  return {
    id,
    label,
    description: `基础人物 · 高 ${shape.height.toFixed(2)} m`,
    directory: "characters",
    collections: ["characters", "people"],
    tags: [label, ageBand, sex, "人物", "person"],
    using: "humanoid-character",
    parameters: {
      rigProfile: "hypit-humanoid",
      rig: humanoidRigDeclaration,
      anthropometry: {
        basis: "observed figure landmarks for low-poly blocking",
        ageBand,
        sex,
        statureM: shape.height,
        headCount: shape.heads,
        upperArmRatio: shape.upperArmRatio ?? .185,
        legRatio: shape.legRatio,
        shoulderRatio: shape.shoulderRatio,
        hipRatio: shape.hipRatio,
        waistRatio: shape.waistRatio,
      },
      bodyShape: {
        type: shape.bodyType,
        armBuild: shape.armBuild,
        legBuild: shape.legBuild,
        depthBuild: shape.depthBuild,
        chestVolume: shape.chestVolume,
        abdomenVolume: shape.abdomenVolume,
        gluteVolume: shape.gluteVolume,
      },
    },
    ...(derivedBase !== undefined
      ? { derivedModel: { ...derivedBase, stature: shape.height }, derivedPreviewModel: { ...derivedBase, stature: shape.height } }
      : sourceModel === undefined
      ? { model: humanoid({ name: label, sex, ...shape }) }
      : { sourceModel }),
    ...(derivedBase !== undefined
      ? {}
      : sourcePreviewModel === undefined
      ? { previewModel: humanoid({ name: `${label} Preview`, sex, ...shape, pose: "standing" }) }
      : { sourcePreviewModel }),
  };
};

const geometryAsset = ({ id, label, description, kind, dimensions, parts, model }) => ({
  id,
  label,
  description,
  directory: "geometry",
  collections: ["objects", "geometry"],
  tags: [label, "几何体", "geometry", kind],
  using: "prop",
  parameters: { primitive: { kind, dimensionsM: dimensions } },
  model: model ?? {
    name: label,
    materials: [material("Geometry", [0.72, 0.73, 0.76, 1], .78)],
    parts,
  },
});

const geometryAssets = [
  geometryAsset({
    id: "scale-human",
    label: "简化人体",
    description: "尺度参照 · 高 1.75 m",
    kind: "human-scale-reference",
    dimensions: { width: .48, height: 1.75, depth: .28 },
    model: humanoid({ name: "简化人体", sex: "neutral", height: 1.75, heads: 7.3, legRatio: .515, shoulderRatio: .245, hipRatio: .205, waistRatio: .17, pose: "standing" }),
  }),
  geometryAsset({ id: "cube", label: "立方体", description: "几何体 · 1 × 1 × 1 m", kind: "cube", dimensions: { width: 1, height: 1, depth: 1 }, parts: [part("Cube", "box", 0, [0, .5, 0], [1, 1, 1])] }),
  geometryAsset({ id: "sphere", label: "球体", description: "几何体 · 直径 1 m", kind: "sphere", dimensions: { diameter: 1 }, parts: [part("Sphere", "sphere", 0, [0, .5, 0], [1, 1, 1])] }),
  geometryAsset({ id: "cuboid", label: "长方体", description: "几何体 · 1.4 × 0.8 × 0.8 m", kind: "cuboid", dimensions: { width: 1.4, height: .8, depth: .8 }, parts: [part("Cuboid", "box", 0, [0, .4, 0], [1.4, .8, .8])] }),
  geometryAsset({ id: "cylinder", label: "圆柱体", description: "几何体 · 高 1 m", kind: "cylinder", dimensions: { diameter: 1, height: 1 }, parts: [part("Cylinder", "cylinder", 0, [0, .5, 0], [1, 1, 1])] }),
  geometryAsset({ id: "cone", label: "圆锥体", description: "几何体 · 高 1 m", kind: "cone", dimensions: { diameter: 1, height: 1 }, parts: [part("Cone", "cone", 0, [0, .5, 0], [1, 1, 1])] }),
  geometryAsset({ id: "square-pyramid", label: "四棱锥", description: "几何体 · 高 1 m", kind: "square-pyramid", dimensions: { width: 1, height: 1, depth: 1 }, parts: [part("Square Pyramid", "squarePyramid", 0, [0, .5, 0], [1, 1, 1])] }),
  geometryAsset({ id: "torus", label: "圆环体", description: "几何体 · 外径 1 m", kind: "torus", dimensions: { outerDiameter: 1, tubeDiameter: .28 }, parts: [part("Torus", "torus", 0, [0, .14, 0], [1, 1, 1])] }),
  geometryAsset({ id: "plane", label: "基础平面", description: "几何体 · 1 × 1 m", kind: "plane", dimensions: { width: 1, depth: 1 }, parts: [part("Plane", "plane", 0, [0, .01, 0], [1, 1, 1])] }),
  geometryAsset({ id: "capsule", label: "胶囊体", description: "几何体 · 高 1 m", kind: "capsule", dimensions: { diameter: .5, height: 1 }, parts: [part("Capsule", "capsule", 0, [0, .5, 0], [1, 1, 1])] }),
  geometryAsset({ id: "disk", label: "圆盘", description: "几何体 · 直径 1 m", kind: "disk", dimensions: { diameter: 1, height: .06 }, parts: [part("Disk", "cylinder", 0, [0, .03, 0], [1, .06, 1])] }),
  geometryAsset({ id: "half-arc", label: "半圆弧", description: "几何体 · 宽 0.96 m", kind: "half-arc", dimensions: { width: .96, height: .58, depth: .20 }, parts: [part("Half Arc", "halfArc", 0, [0, .10, 0], [1, 1, 1])] }),
  geometryAsset({ id: "half-cylinder", label: "半圆柱", description: "几何体 · 1 × 0.5 × 1 m", kind: "half-cylinder", dimensions: { width: 1, height: .5, depth: 1 }, parts: [part("Half Cylinder", "halfCylinder", 0, [0, 0, 0], [1, 1, 1])] }),
];

const objectMaterials = [
  material("Body", [0.56, 0.58, 0.62, 1], .78),
  material("Dark", [0.12, 0.13, 0.16, 1], .58),
  material("Light", [0.82, 0.81, 0.77, 1], .86),
  material("Wood", [0.42, 0.27, 0.15, 1], .72),
  material("Metal", [0.34, 0.37, 0.42, 1], .36, .45),
  material("Glass", [0.36, 0.58, 0.68, 1], .24, .12),
  material("Foliage", [0.24, 0.42, 0.25, 1], .92),
  material("Accent", [0.78, 0.30, 0.16, 1], .72),
];

const categoryLabel = {
  furniture: "家具",
  architecture: "建筑",
  nature: "自然",
  street: "街道",
  office: "办公",
  kitchen: "厨房",
  bathroom: "卫浴",
  daily: "日用",
};

const lowPolyAsset = ({ id, label, category, height, dimensions, parts, directory = `objects/${category}`, tags = [] }) => ({
  id,
  label,
  description: `${categoryLabel[category]} · 高 ${height} m`,
  directory,
  collections: ["objects", category],
  tags: [label, categoryLabel[category], ...tags],
  using: "prop",
  parameters: { boundsM: { ...dimensions, height } },
  model: { name: label, materials: objectMaterials, parts },
});

const fourLegs = (width, depth, height, inset = .10, materialIndex = 3, radius = .07) => [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
].map(([x, z], index) => part(`Leg.${index + 1}`, "cylinder", materialIndex, [x * (width / 2 - inset), height / 2, z * (depth / 2 - inset)], [radius, height, radius]));

const furnitureAssets = [
  lowPolyAsset({ id: "round-stool", label: "圆凳", category: "furniture", height: .48, dimensions: { width: .42, depth: .42 }, parts: [part("Seat", "cylinder", 3, [0, .43, 0], [.42, .10, .42]), ...fourLegs(.34, .34, .40, .06, 3, .045)] }),
  lowPolyAsset({ id: "armchair", label: "扶手椅", category: "furniture", height: .88, dimensions: { width: .82, depth: .82 }, parts: [part("Seat", "box", 0, [0, .38, 0], [.62, .18, .62]), part("Back", "box", 0, [0, .65, -.27], [.62, .52, .16], [-.10, 0, 0]), part("Arm.L", "box", 0, [-.36, .52, 0], [.14, .30, .68]), part("Arm.R", "box", 0, [.36, .52, 0], [.14, .30, .68]), ...fourLegs(.62, .58, .29, .08, 3, .055)] }),
  lowPolyAsset({ id: "sofa", label: "沙发", category: "furniture", height: .88, dimensions: { width: 1.9, depth: .86 }, parts: [part("Base", "box", 0, [0, .32, 0], [1.62, .24, .68]), part("Cushion.L", "box", 2, [-.40, .50, .04], [.76, .16, .58]), part("Cushion.R", "box", 2, [.40, .50, .04], [.76, .16, .58]), part("Back", "box", 0, [0, .69, -.31], [1.62, .42, .18], [-.08, 0, 0]), part("Arm.L", "box", 0, [-.88, .50, 0], [.18, .40, .76]), part("Arm.R", "box", 0, [.88, .50, 0], [.18, .40, .76])] }),
  lowPolyAsset({ id: "square-table", label: "方桌", category: "furniture", height: .75, dimensions: { width: .85, depth: .85 }, parts: [part("Top", "box", 3, [0, .70, 0], [.85, .10, .85]), ...fourLegs(.74, .74, .65, .05, 3, .06)] }),
  lowPolyAsset({ id: "long-table", label: "长桌", category: "furniture", height: .75, dimensions: { width: 1.8, depth: .80 }, parts: [part("Top", "box", 3, [0, .70, 0], [1.8, .10, .80]), ...fourLegs(1.65, .68, .65, .04, 3, .065)] }),
  lowPolyAsset({ id: "bed", label: "床", category: "furniture", height: .55, dimensions: { width: 1.65, depth: 2.10 }, parts: [part("Frame", "box", 3, [0, .22, 0], [1.72, .24, 2.12]), part("Mattress", "box", 2, [0, .43, .02], [1.62, .22, 2.0]), part("Headboard", "box", 3, [0, .70, -.99], [1.72, .78, .12]), part("Pillow.L", "box", 0, [-.40, .59, -.68], [.62, .13, .34]), part("Pillow.R", "box", 0, [.40, .59, -.68], [.62, .13, .34])] }),
  lowPolyAsset({ id: "bookshelf", label: "书架", category: "furniture", height: 1.8, dimensions: { width: 1.0, depth: .32 }, parts: [part("Side.L", "box", 3, [-.47, .90, 0], [.08, 1.8, .32]), part("Side.R", "box", 3, [.47, .90, 0], [.08, 1.8, .32]), ...[.05, .48, .91, 1.34, 1.75].map((y, index) => part(`Shelf.${index + 1}`, "box", 3, [0, y, 0], [.94, .07, .32])), ...[[-.29,.26,.14,7],[-.08,.27,.12,0],[.20,.27,.16,5],[-.24,.70,.18,2],[.03,.70,.13,7],[.27,1.13,.16,0],[-.16,1.56,.14,5]].map(([x,y,w,m], index) => part(`Book.${index + 1}`, "box", m, [x, y, .02], [w, .32, .22]))] }),
  lowPolyAsset({ id: "low-cabinet", label: "矮柜", category: "furniture", height: .72, dimensions: { width: 1.2, depth: .42 }, parts: [part("Body", "box", 3, [0, .38, 0], [1.2, .64, .42]), part("Door.L", "box", 2, [-.30, .39, .22], [.56, .54, .035]), part("Door.R", "box", 2, [.30, .39, .22], [.56, .54, .035]), part("Handle.L", "sphere", 1, [-.06, .40, .25], [.045,.045,.045]), part("Handle.R", "sphere", 1, [.06, .40, .25], [.045,.045,.045]), ...fourLegs(1.02,.30,.10,.04,1,.035)] }),
  lowPolyAsset({ id: "wardrobe", label: "衣柜", category: "furniture", height: 2.0, dimensions: { width: 1.25, depth: .58 }, parts: [part("Body", "box", 3, [0, 1.0, 0], [1.25, 2.0, .58]), part("Door.L", "box", 2, [-.31, 1.03, .305], [.59, 1.86, .035]), part("Door.R", "box", 2, [.31, 1.03, .305], [.59, 1.86, .035]), part("Handle.L", "cylinder", 4, [-.07, 1.02, .34], [.025,.26,.025]), part("Handle.R", "cylinder", 4, [.07, 1.02, .34], [.025,.26,.025])] }),
  lowPolyAsset({ id: "tv-console", label: "电视", category: "furniture", height: .68, dimensions: { width: 1.25, depth: .28 }, parts: [part("Screen", "box", 1, [0, .43, 0], [1.25, .68, .08]), part("Panel", "box", 5, [0, .43, .046], [1.14, .57, .018]), part("Stem", "box", 4, [0, .08, 0], [.12,.16,.08]), part("Base", "box", 4, [0, .025, 0], [.54,.05,.24])] }),
  lowPolyAsset({ id: "wall-tv", label: "壁挂电视", category: "furniture", height: .70, dimensions: { width: 1.28, depth: .08 }, parts: [part("Screen", "box", 1, [0, .35, 0], [1.28, .70, .08]), part("Panel", "box", 5, [0, .35, .046], [1.16, .60, .018])] }),
  lowPolyAsset({ id: "floor-lamp", label: "落地灯", category: "furniture", height: 1.65, dimensions: { width: .46, depth: .46 }, parts: [part("Base", "cylinder", 4, [0, .04, 0], [.40,.08,.40]), part("Stem", "cylinder", 4, [0, .78, 0], [.045,1.48,.045]), part("Shade", "cone", 2, [0, 1.48, 0], [.46,.34,.46], [Math.PI,0,0])] }),
  lowPolyAsset({ id: "table-lamp", label: "台灯", category: "furniture", height: .50, dimensions: { width: .32, depth: .32 }, parts: [part("Base", "cylinder", 4, [0, .035, 0], [.28,.07,.28]), part("Stem", "cylinder", 4, [0, .23, 0], [.035,.38,.035]), part("Shade", "cone", 2, [0, .42, 0], [.32,.20,.32], [Math.PI,0,0])] }),
  lowPolyAsset({ id: "rug", label: "地毯", category: "furniture", height: .02, dimensions: { width: 1.8, depth: 1.2 }, parts: [part("Rug", "box", 0, [0, .01, 0], [1.8,.02,1.2])] }),
  lowPolyAsset({ id: "coffee-table", label: "茶几", category: "furniture", height: .42, dimensions: { width: 1.1, depth: .62 }, parts: [part("Top", "box", 3, [0, .38, 0], [1.1,.08,.62]), ...fourLegs(.96,.50,.34,.04,3,.05)] }),
  lowPolyAsset({ id: "side-table", label: "边桌", category: "furniture", height: .55, dimensions: { width: .48, depth: .48 }, parts: [part("Top", "cylinder", 3, [0,.51,0], [.48,.08,.48]), part("Stem", "cylinder", 4, [0,.27,0], [.055,.46,.055]), part("Base", "cylinder", 4, [0,.035,0], [.34,.07,.34])] }),
];

const architectureAssets = [
  lowPolyAsset({ id: "wall", label: "墙体", category: "architecture", height: 2.6, dimensions: { width: 3.0, depth: .18 }, parts: [part("Wall", "box", 2, [0,1.3,0], [3.0,2.6,.18])] }),
  lowPolyAsset({ id: "column", label: "立柱", category: "architecture", height: 2.8, dimensions: { width: .48, depth: .48 }, parts: [part("Shaft", "cylinder", 2, [0,1.4,0], [.42,2.6,.42]), part("Base", "cylinder", 2, [0,.08,0], [.56,.16,.56]), part("Capital", "cylinder", 2, [0,2.72,0], [.56,.16,.56])] }),
  lowPolyAsset({ id: "ramp", label: "坡道", category: "architecture", height: .8, dimensions: { width: 1.6, depth: 2.4 }, parts: [part("Ramp", "box", 0, [0,.40,0], [1.6,.22,2.52], [-Math.atan2(.8,2.4),0,0])] }),
  lowPolyAsset({ id: "platform", label: "平台", category: "architecture", height: .30, dimensions: { width: 2.0, depth: 2.0 }, parts: [part("Platform", "box", 0, [0,.15,0], [2,.30,2])] }),
  lowPolyAsset({ id: "arch", label: "拱门", category: "architecture", height: 2.6, dimensions: { width: 2.2, depth: .42 }, parts: [part("Pier.L", "box", 2, [-.89,1.0,0], [.42,2.0,.42]), part("Pier.R", "box", 2, [.89,1.0,0], [.42,2.0,.42]), part("Arch", "halfArc", 2, [0,1.92,0], [2.20,1.42,2.1])] }),
  lowPolyAsset({ id: "door", label: "门", category: "architecture", height: 2.1, dimensions: { width: .95, depth: .14 }, parts: [part("Slab", "box", 3, [0,1.02,0], [.88,2.04,.10]), part("Frame.L", "box", 2, [-.49,1.05,0], [.09,2.10,.14]), part("Frame.R", "box", 2, [.49,1.05,0], [.09,2.10,.14]), part("Frame.Top", "box", 2, [0,2.055,0], [1.06,.09,.14]), part("Handle", "sphere", 4, [.31,1.03,.08], [.07,.07,.07])] }),
  lowPolyAsset({ id: "fence", label: "围栏", category: "architecture", height: 1.1, dimensions: { width: 2.4, depth: .12 }, parts: [part("Post.L", "box", 3, [-1.15,.55,0], [.12,1.1,.12]), part("Post.R", "box", 3, [1.15,.55,0], [.12,1.1,.12]), part("Rail.Top", "box", 3, [0,.92,0], [2.25,.10,.10]), part("Rail.Bottom", "box", 3, [0,.28,0], [2.25,.10,.10]), ...[-.75,-.38,0,.38,.75].map((x,index)=>part(`Picket.${index+1}`, "box", 3, [x,.58,0], [.08,.78,.08]))] }),
  lowPolyAsset({ id: "ladder", label: "梯子", category: "architecture", height: 2.4, dimensions: { width: .62, depth: .12 }, parts: [part("Rail.L", "cylinder", 4, [-.27,1.2,0], [.07,2.4,.07]), part("Rail.R", "cylinder", 4, [.27,1.2,0], [.07,2.4,.07]), ...Array.from({length:8},(_,index)=>part(`Rung.${index+1}`, "cylinder", 4, [0,.22+index*.28,0], [.055,.54,.055],[0,0,Math.PI/2]))] }),
  lowPolyAsset({ id: "abstract-sculpture", label: "抽象雕像", category: "architecture", height: 2.0, dimensions: { width: 1.1, depth: .8 }, parts: [part("Plinth", "box", 2, [0,.12,0], [.9,.24,.72]), part("Mass.A", "box", 0, [-.16,.72,0], [.42,1.0,.42],[0,.22,.18]), part("Mass.B", "box", 0, [.18,1.27,0], [.42,.92,.42],[0,-.35,-.22]), part("Ring", "torus", 4, [0,1.68,0], [.82,.82,.82],[Math.PI/2,0,0])] }),
  lowPolyAsset({ id: "window", label: "窗户", category: "architecture", height: 1.2, dimensions: { width: 1.4, depth: .12 }, parts: [part("Glass", "box", 5, [0,.60,0], [1.28,1.08,.035]), part("Frame.L", "box", 2, [-.67,.60,0], [.10,1.20,.12]), part("Frame.R", "box", 2, [.67,.60,0], [.10,1.20,.12]), part("Frame.Top", "box", 2, [0,1.15,0], [1.34,.10,.12]), part("Frame.Bottom", "box", 2, [0,.05,0], [1.34,.10,.12]), part("Mullion", "box", 2, [0,.60,.03], [.07,1.08,.08])] }),
  lowPolyAsset({ id: "railing", label: "栏杆", category: "architecture", height: 1.05, dimensions: { width: 2.4, depth: .14 }, parts: [part("Top Rail", "cylinder", 4, [0,1.0,0], [.08,2.4,.08],[0,0,Math.PI/2]), ...[-1.1,-.55,0,.55,1.1].map((x,index)=>part(`Post.${index+1}`, "cylinder", 4, [x,.50,0], [.055,1.0,.055])), part("Bottom Rail", "cylinder", 4, [0,.18,0], [.055,2.3,.055],[0,0,Math.PI/2])] }),
];

const treeParts = (height, crownScale = 1) => [
  part("Trunk", "cylinder", 3, [0,height*.28,0], [height*.10,height*.56,height*.10]),
  part("Crown.Low", "sphere", 6, [0,height*.62,0], [height*.42*crownScale,height*.40*crownScale,height*.42*crownScale]),
  part("Crown.High", "sphere", 6, [0,height*.82,0], [height*.34*crownScale,height*.34*crownScale,height*.34*crownScale]),
];

const natureAssets = [
  lowPolyAsset({ id: "small-tree", label: "小树", category: "nature", height: 3.5, dimensions: { width: 2.2, depth: 2.2 }, parts: treeParts(3.5,.78) }),
  lowPolyAsset({ id: "large-tree", label: "大树", category: "nature", height: 7.0, dimensions: { width: 4.8, depth: 4.8 }, parts: treeParts(7.0,.92) }),
  lowPolyAsset({ id: "rock", label: "石头", category: "nature", height: .8, dimensions: { width: 1.1, depth: .85 }, parts: [part("Rock", "sphere", 0, [0,.38,0], [1.1,.76,.85],[0,.22,.08]), part("Facet", "sphere", 0, [.22,.55,-.08], [.62,.48,.56],[0,-.35,.20])] }),
  lowPolyAsset({ id: "bush", label: "灌木", category: "nature", height: 1.0, dimensions: { width: 1.35, depth: 1.0 }, parts: [[-.36,.44,0,.72],[.05,.50,.04,.86],[.42,.40,-.03,.68],[0,.72,-.12,.58]].map(([x,y,z,s],index)=>part(`Foliage.${index+1}`, "sphere", 6, [x,y,z], [s,s*.9,s])) }),
  lowPolyAsset({ id: "potted-plant", label: "盆栽", category: "nature", height: 1.2, dimensions: { width: .72, depth: .72 }, parts: [part("Pot", "cone", 7, [0,.22,0], [.52,.44,.52],[Math.PI,0,0]), part("Stem", "cylinder", 3, [0,.64,0], [.055,.60,.055]), part("Leaf.A", "sphere", 6, [-.17,.83,0], [.34,.52,.18],[0,0,.48]), part("Leaf.B", "sphere", 6, [.18,.98,.02], [.32,.48,.18],[0,0,-.52]), part("Leaf.C", "sphere", 6, [0,1.06,-.03], [.30,.42,.16])] }),
  lowPolyAsset({ id: "stump", label: "树桩", category: "nature", height: .6, dimensions: { width: .58, depth: .58 }, parts: [part("Stump", "cylinder", 3, [0,.30,0], [.58,.60,.58]), part("Top", "cylinder", 2, [0,.605,0], [.50,.018,.50])] }),
  lowPolyAsset({ id: "flower-bed", label: "花坛", category: "nature", height: .5, dimensions: { width: 1.6, depth: .82 }, parts: [part("Bed", "box", 3, [0,.19,0], [1.6,.38,.82]), part("Soil", "box", 1, [0,.40,0], [1.42,.06,.66]), ...[-.48,-.16,.16,.48].flatMap((x,index)=>[part(`Stem.${index+1}`, "cylinder", 6, [x,.55,0], [.025,.30,.025]), part(`Bloom.${index+1}`, "sphere", index%2?7:2, [x,.70,0], [.15,.15,.15])])] }),
];

const carWheels = (width, front, back, radius = .55) => [
  [-1,front], [1,front], [-1,back], [1,back],
].map(([side,z],index)=>part(`Wheel.${index+1}`, "cylinder", 1, [side*width/2,.34,z], [radius,.20,radius],[0,0,Math.PI/2]));

const streetAssets = [
  lowPolyAsset({ id: "car", label: "轿车", category: "street", height: 1.5, dimensions: { width: 1.82, depth: 4.2 }, parts: [part("Body", "box", 0, [0,.68,0], [1.82,.62,3.55]), part("Hood", "box", 0, [0,.94,.98], [1.72,.24,1.35],[-.05,0,0]), part("Cabin", "box", 5, [0,1.18,-.35], [1.58,.64,1.72]), part("Roof", "box", 0, [0,1.50,-.35], [1.42,.08,1.52]), part("Bumper.F", "box", 1, [0,.55,1.84], [1.76,.16,.16]), part("Bumper.B", "box", 1, [0,.55,-1.84], [1.76,.16,.16]), ...carWheels(1.82,1.12,-1.12,.56)] }),
  lowPolyAsset({ id: "truck", label: "卡车", category: "street", height: 2.6, dimensions: { width: 2.35, depth: 6.0 }, parts: [part("Chassis", "box", 1, [0,.72,0], [2.18,.34,5.5]), part("Cargo", "box", 2, [0,1.65,-1.0], [2.25,1.9,3.6]), part("Cab", "box", 7, [0,1.46,1.55], [2.20,1.65,1.55]), part("Windshield", "box", 5, [0,1.78,2.345], [1.78,.62,.035]), part("Bumper", "box", 4, [0,.65,2.42], [2.25,.18,.18]), ...carWheels(2.25,1.62,-1.65,.78)] }),
  lowPolyAsset({ id: "bicycle", label: "自行车", category: "street", height: 1.15, dimensions: { width: 1.65, depth: .32 }, parts: [part("Wheel.F", "torus", 1, [.68,.52,0], [1.02,1.02,1.02],[Math.PI/2,0,0]), part("Wheel.B", "torus", 1, [-.68,.52,0], [1.02,1.02,1.02],[Math.PI/2,0,0]), segment("Frame.Low",7,[-.52,.56,0],[.18,.56,0],.055), segment("Frame.Front",7,[.18,.56,0],[.58,.93,0],.055), segment("Frame.Diagonal",7,[-.35,.98,0],[.18,.56,0],.055), segment("Frame.Seat",7,[-.52,.56,0],[-.35,.98,0],.055), segment("Fork",4,[.58,.93,0],[.68,.52,0],.045), part("Seat", "box", 1, [-.38,1.02,0], [.28,.06,.16]), segment("Handle",4,[.58,.93,0],[.52,1.12,0],.035)] }),
  lowPolyAsset({ id: "motorcycle", label: "摩托车", category: "street", height: 1.2, dimensions: { width: 2.0, depth: .58 }, parts: [part("Wheel.F", "torus", 1, [.78,.43,0], [.86,.86,.86],[Math.PI/2,0,0]), part("Wheel.B", "torus", 1, [-.78,.43,0], [.86,.86,.86],[Math.PI/2,0,0]), part("Engine", "box", 4, [-.05,.58,0], [.60,.42,.48]), part("Tank", "sphere", 7, [.20,.86,0], [.62,.36,.50]), part("Seat", "box", 1, [-.48,.89,0], [.62,.12,.40], [0,0,-.08]), segment("Fork",4,[.62,.97,0],[.78,.43,0],.07), segment("Handle",4,[.62,.97,0],[.53,1.16,0],.045), segment("Frame",7,[-.65,.55,0],[.20,.78,0],.065)] }),
  lowPolyAsset({ id: "streetlight", label: "路灯", category: "street", height: 3.8, dimensions: { width: .9, depth: .42 }, parts: [part("Base", "cylinder", 4, [0,.08,0], [.42,.16,.42]), part("Pole", "cylinder", 4, [0,1.82,0], [.095,3.48,.095]), segment("Arm",4,[0,3.48,0],[.62,3.65,0],.075), part("Lamp", "box", 1, [.74,3.62,0], [.36,.18,.30],[0,0,-.18]), part("Lens", "box", 2, [.75,3.52,0], [.28,.035,.22],[0,0,-.18])] }),
  lowPolyAsset({ id: "street-bench", label: "长椅", category: "street", height: .85, dimensions: { width: 1.8, depth: .62 }, parts: [part("Seat", "box", 3, [0,.45,0], [1.8,.12,.48]), part("Back", "box", 3, [0,.69,-.22], [1.8,.42,.10],[-.12,0,0]), ...fourLegs(1.55,.34,.39,.04,4,.065)] }),
  lowPolyAsset({ id: "trash-bin", label: "垃圾桶", category: "street", height: 1.0, dimensions: { width: .62, depth: .62 }, parts: [part("Body", "cylinder", 0, [0,.48,0], [.58,.90,.58]), part("Rim", "torus", 1, [0,.92,0], [.62,.62,.62]), part("Lid", "cylinder", 1, [0,.97,0], [.62,.08,.62])] }),
  lowPolyAsset({ id: "traffic-cone", label: "路锥", category: "street", height: .7, dimensions: { width: .46, depth: .46 }, parts: [part("Base", "box", 1, [0,.04,0], [.46,.08,.46]), part("Cone", "cone", 7, [0,.38,0], [.34,.62,.34]), part("Band", "cylinder", 2, [0,.42,0], [.24,.10,.24])] }),
  lowPolyAsset({ id: "road-barrier", label: "水马", category: "street", height: 1.0, dimensions: { width: 1.8, depth: .45 }, parts: [part("Body", "box", 7, [0,.58,0], [1.65,.64,.36]), part("Top", "box", 2, [0,.94,0], [1.78,.14,.42]), part("Foot.L", "box", 7, [-.66,.14,0], [.42,.28,.45]), part("Foot.R", "box", 7, [.66,.14,0], [.42,.28,.45])] }),
  lowPolyAsset({ id: "road-sign", label: "路牌", category: "street", height: 2.4, dimensions: { width: .86, depth: .18 }, parts: [part("Pole", "cylinder", 4, [0,1.0,0], [.075,2.0,.075]), part("Sign", "box", 5, [0,2.0,0], [.86,.68,.08]), part("Border", "box", 2, [0,2.0,-.05], [.74,.56,.025]), part("Base", "cylinder", 4, [0,.06,0], [.42,.12,.42])] }),
  lowPolyAsset({ id: "fire-hydrant", label: "消防栓", category: "street", height: .85, dimensions: { width: .48, depth: .48 }, parts: [part("Body", "cylinder", 7, [0,.39,0], [.34,.66,.34]), part("Top", "sphere", 7, [0,.75,0], [.38,.22,.38]), part("Cap.L", "cylinder", 4, [-.22,.48,0], [.18,.18,.18],[0,0,Math.PI/2]), part("Cap.R", "cylinder", 4, [.22,.48,0], [.18,.18,.18],[0,0,Math.PI/2]), part("Base", "cylinder", 7, [0,.07,0], [.48,.14,.48])] }),
  lowPolyAsset({ id: "oil-drum", label: "油桶", category: "street", height: .9, dimensions: { width: .58, depth: .58 }, parts: [part("Drum", "cylinder", 0, [0,.45,0], [.58,.90,.58]), ...[.08,.45,.82].map((y,index)=>part(`Band.${index+1}`, "torus", 1, [0,y,0], [.60,.60,.60]))] }),
  lowPolyAsset({ id: "wood-crate", label: "木箱", category: "street", height: .65, dimensions: { width: .78, depth: .72 }, parts: [part("Box", "box", 3, [0,.325,0], [.78,.65,.72]), part("Slat.Top", "box", 2, [0,.58,.37], [.72,.08,.05]), part("Slat.Bottom", "box", 2, [0,.08,.37], [.72,.08,.05]), part("Slat.L", "box", 2, [-.32,.33,.37], [.08,.56,.05]), part("Slat.R", "box", 2, [.32,.33,.37], [.08,.56,.05]), part("Brace.A", "box", 2, [0,.33,.40], [.08,.72,.05],[0,0,.88]), part("Brace.B", "box", 2, [0,.33,.405], [.08,.72,.05],[0,0,-.88])] }),
];

const officeAssets = [
  lowPolyAsset({ id: "office-desk", label: "书桌", category: "office", height: .75, dimensions: { width: 1.35, depth: .68 }, parts: [part("Top", "box", 3, [0,.70,0], [1.35,.10,.68]), ...fourLegs(1.22,.56,.65,.04,4,.055), part("Drawer", "box", 0, [.38,.57,0], [.42,.18,.54])] }),
  lowPolyAsset({ id: "monitor", label: "显示器", category: "office", height: .48, dimensions: { width: .68, depth: .20 }, parts: [part("Screen", "box", 1, [0,.30,0], [.68,.40,.055]), part("Panel", "box", 5, [0,.30,.032], [.61,.33,.012]), part("Stem", "box", 4, [0,.10,0], [.07,.18,.05]), part("Base", "box", 4, [0,.025,0], [.34,.05,.20])] }),
  lowPolyAsset({ id: "laptop", label: "笔记本电脑", category: "office", height: .22, dimensions: { width: .38, depth: .28 }, parts: [part("Keyboard", "box", 1, [0,.025,.02], [.38,.05,.28]), part("Screen", "box", 1, [0,.15,-.115], [.38,.26,.035],[-.18,0,0]), part("Display", "box", 5, [0,.15,-.093], [.33,.21,.012],[-.18,0,0])] }),
];

const kitchenAssets = [
  lowPolyAsset({ id: "fridge", label: "冰箱", category: "kitchen", height: 1.85, dimensions: { width: .76, depth: .72 }, parts: [part("Body", "box", 2, [0,.925,0], [.76,1.85,.72]), part("Door.Top", "box", 0, [0,1.28,.37], [.70,1.05,.035]), part("Door.Bottom", "box", 0, [0,.43,.37], [.70,.58,.035]), part("Handle.Top", "cylinder", 4, [.27,1.28,.41], [.025,.52,.025]), part("Handle.Bottom", "cylinder", 4, [.27,.43,.41], [.025,.28,.025])] }),
  lowPolyAsset({ id: "stove", label: "灶台", category: "kitchen", height: .9, dimensions: { width: .72, depth: .66 }, parts: [part("Body", "box", 2, [0,.42,0], [.72,.84,.66]), part("Cooktop", "box", 1, [0,.86,0], [.72,.06,.66]), ...[[-.20,.18], [.20,.18],[-.20,-.18],[.20,-.18]].map(([x,z],index)=>part(`Burner.${index+1}`, "torus", 4, [x,.90,z], [.34,.34,.34])), part("Oven", "box", 1, [0,.43,.34], [.56,.44,.035]), part("Window", "box", 5, [0,.43,.37], [.46,.32,.015])] }),
  lowPolyAsset({ id: "kitchen-sink", label: "厨房水槽", category: "kitchen", height: 1.2, dimensions: { width: .84, depth: .62 }, parts: [part("Cabinet", "box", 2, [0,.42,0], [.84,.84,.62]), part("Counter", "box", 0, [0,.87,0], [.90,.08,.66]), part("Basin", "box", 5, [0,.88,.03], [.58,.035,.38]), part("Tap.Stem", "cylinder", 4, [0,1.08,-.18], [.035,.36,.035]), part("Tap.Arc", "halfArc", 4, [0,1.05,-.12], [.34,.34,.34],[0,Math.PI/2,0])] }),
  lowPolyAsset({ id: "kitchen-counter", label: "厨房台面", category: "kitchen", height: .9, dimensions: { width: 1.4, depth: .62 }, parts: [part("Cabinet", "box", 2, [0,.42,0], [1.4,.84,.62]), part("Counter", "box", 0, [0,.87,0], [1.46,.08,.66]), ...[-.34,.34].map((x,index)=>part(`Door.${index+1}`, "box", 0, [x,.43,.325], [.62,.68,.025])), ...[-.07,.61].map((x,index)=>part(`Handle.${index+1}`, "cylinder", 4, [x,.48,.36], [.022,.18,.022]))] }),
  lowPolyAsset({ id: "kitchen-island", label: "厨房岛台", category: "kitchen", height: .92, dimensions: { width: 1.6, depth: .86 }, parts: [part("Base", "box", 2, [0,.43,0], [1.35,.86,.72]), part("Counter", "box", 0, [0,.89,0], [1.6,.06,.86]), part("Inset", "box", 1, [0,.46,.37], [.88,.52,.025])] }),
  lowPolyAsset({ id: "microwave", label: "微波炉", category: "kitchen", height: .3, dimensions: { width: .52, depth: .40 }, parts: [part("Body", "box", 1, [0,.15,0], [.52,.30,.40]), part("Door", "box", 5, [-.07,.15,.205], [.32,.22,.015]), part("Panel", "box", 0, [.19,.15,.205], [.08,.22,.015]), ...[.20,.14,.08].map((y,index)=>part(`Button.${index+1}`, "sphere", 2, [.19,y,.225], [.025,.025,.025]))] }),
  lowPolyAsset({ id: "wall-cabinet", label: "吊柜", category: "kitchen", height: .7, dimensions: { width: 1.0, depth: .36 }, parts: [part("Body", "box", 2, [0,.35,0], [1.0,.70,.36]), part("Door.L", "box", 0, [-.25,.35,.195], [.47,.62,.025]), part("Door.R", "box", 0, [.25,.35,.195], [.47,.62,.025]), part("Handle.L", "cylinder", 4, [-.05,.34,.225], [.022,.16,.022]), part("Handle.R", "cylinder", 4, [.05,.34,.225], [.022,.16,.022])] }),
];

const bathroomAssets = [
  lowPolyAsset({ id: "toilet", label: "马桶", category: "bathroom", height: .8, dimensions: { width: .48, depth: .72 }, parts: [part("Base", "halfCylinder", 2, [0,0,.06], [.48,.72,.56]), part("Bowl", "torus", 2, [0,.48,.12], [.54,.54,.68]), part("Tank", "box", 2, [0,.58,-.24], [.48,.44,.28]), part("Lid", "box", 2, [0,.81,-.24], [.50,.05,.30])] }),
  lowPolyAsset({ id: "washbasin", label: "洗手盆", category: "bathroom", height: .85, dimensions: { width: .68, depth: .50 }, parts: [part("Pedestal", "cylinder", 2, [0,.36,0], [.24,.72,.24]), part("Basin", "halfCylinder", 2, [0,.70,.02], [.68,.30,.50],[0,0,Math.PI]), part("Tap", "halfArc", 4, [0,.76,-.13], [.26,.30,.26],[0,Math.PI/2,0])] }),
  lowPolyAsset({ id: "bathtub", label: "浴缸", category: "bathroom", height: .6, dimensions: { width: .82, depth: 1.7 }, parts: [part("Bottom", "box", 2, [0,.12,0], [.64,.24,1.46]), part("Side.L", "box", 2, [-.36,.30,0], [.12,.60,1.70]), part("Side.R", "box", 2, [.36,.30,0], [.12,.60,1.70]), part("End.Front", "box", 2, [0,.30,.79], [.60,.60,.12]), part("End.Back", "box", 2, [0,.30,-.79], [.60,.60,.12]), part("Inner", "box", 5, [0,.255,0], [.58,.025,1.40])] }),
  lowPolyAsset({ id: "shower", label: "淋浴间", category: "bathroom", height: 2.1, dimensions: { width: .92, depth: .92 }, parts: [part("Tray", "box", 2, [0,.05,0], [.92,.10,.92]), part("Glass.Back", "box", 5, [0,1.08,-.45], [.92,2.04,.035]), part("Glass.Side", "box", 5, [-.45,1.08,0], [.035,2.04,.92]), part("Frame.Top", "box", 4, [0,2.06,0], [.92,.05,.92]), part("Pipe", "cylinder", 4, [.30,1.48,-.40], [.035,1.0,.035]), part("Head", "cylinder", 4, [.30,1.98,-.30], [.18,.08,.18],[Math.PI/2,0,0])] }),
  lowPolyAsset({ id: "washing-machine", label: "洗衣机", category: "bathroom", height: .9, dimensions: { width: .62, depth: .62 }, parts: [part("Body", "box", 2, [0,.45,0], [.62,.90,.62]), part("Door", "torus", 1, [0,.45,.325], [.56,.56,.56],[Math.PI/2,0,0]), part("Window", "cylinder", 5, [0,.45,.35], [.42,.035,.42],[Math.PI/2,0,0]), part("Panel", "box", 0, [0,.77,.325], [.50,.13,.025]), part("Dial", "cylinder", 4, [.18,.78,.35], [.07,.05,.07],[Math.PI/2,0,0])] }),
];

const dailyAssets = [
  lowPolyAsset({ id: "cardboard-box", label: "纸箱", category: "daily", height: .5, dimensions: { width: .62, depth: .52 }, parts: [part("Box", "box", 3, [0,.25,0], [.62,.50,.52]), part("Tape", "box", 2, [0,.505,0], [.09,.012,.52])] }),
  lowPolyAsset({ id: "suitcase", label: "行李箱", category: "daily", height: .75, dimensions: { width: .48, depth: .26 }, parts: [part("Case", "box", 0, [0,.38,0], [.48,.66,.26]), part("Handle.L", "cylinder", 4, [-.10,.69,0], [.025,.22,.025]), part("Handle.R", "cylinder", 4, [.10,.69,0], [.025,.22,.025]), part("Grip", "cylinder", 4, [0,.80,0], [.025,.20,.025],[0,0,Math.PI/2]), part("Wheel.L", "cylinder", 1, [-.16,.04,0], [.07,.06,.07],[Math.PI/2,0,0]), part("Wheel.R", "cylinder", 1, [.16,.04,0], [.07,.06,.07],[Math.PI/2,0,0])] }),
  lowPolyAsset({ id: "mug", label: "马克杯", category: "daily", height: .1, dimensions: { width: .13, depth: .10 }, parts: [part("Cup", "cylinder", 2, [0,.05,0], [.09,.10,.09]), part("Handle", "torus", 2, [.055,.055,0], [.17,.17,.17],[Math.PI/2,0,0])] }),
  lowPolyAsset({ id: "mirror", label: "镜子", category: "daily", height: .9, dimensions: { width: .62, depth: .06 }, parts: [part("Frame", "box", 3, [0,.45,0], [.62,.90,.06]), part("Mirror", "box", 5, [0,.45,.035], [.52,.80,.015])] }),
  lowPolyAsset({ id: "pendant-light", label: "吊灯", category: "daily", height: .9, dimensions: { width: .54, depth: .54 }, parts: [part("Cord", "cylinder", 1, [0,.72,0], [.025,.36,.025]), part("Shade", "cone", 2, [0,.40,0], [.54,.40,.54],[Math.PI,0,0]), part("Bulb", "sphere", 2, [0,.25,0], [.16,.20,.16])] }),
  lowPolyAsset({ id: "ceiling-fan", label: "吊扇", category: "daily", height: .25, dimensions: { width: 1.25, depth: 1.25 }, parts: [part("Hub", "cylinder", 4, [0,.13,0], [.18,.25,.18]), ...[0,Math.PI/2,Math.PI,Math.PI*1.5].map((angle,index)=>part(`Blade.${index+1}`, "box", 3, [Math.cos(angle)*.34,.07,Math.sin(angle)*.34], [.62,.045,.14],[0,-angle,0]))] }),
];

const objectAssets = [
  ...furnitureAssets,
  ...architectureAssets,
  ...natureAssets,
  ...streetAssets,
  ...officeAssets,
  ...kitchenAssets,
  ...bathroomAssets,
  ...dailyAssets,
];

const worldEnvironmentAsset = ({ id, label, description, world, tags = [] }) => ({
  id,
  label,
  description,
  directory: "environments",
  collections: ["environments", "world"],
  tags: [label, "世界环境", "environment", ...tags],
  using: "world-environment",
  parameters: { world },
});

const environmentAssets = [
  worldEnvironmentAsset({ id: "world-neutral", label: "中性", description: "世界环境 · 清晰体块与接触阴影", tags: ["灰色", "neutral", "预演"], world: { sky: { top: "#151820", horizon: "#303640" }, ground: { visible: true, color: "#25282e", opacity: 1 }, atmosphere: { fogColor: "#252a33", fogDensity: .006 }, lighting: { ambient: { sky: "#dce5f2", ground: "#20232a", intensity: .65 }, key: { color: "#ffe6d0", intensity: 3.6, azimuth: -35, elevation: 48, shadows: true, softness: 2.5 }, fill: { color: "#95adcf", intensity: .35 }, rim: { color: "#a9c8ff", intensity: .9 } }, exposure: .98 } }),
  worldEnvironmentAsset({ id: "world-clear-day", label: "晴日", description: "世界环境 · 清晰日光", tags: ["日光", "daylight"], world: { sky: { top: "#6295c4", horizon: "#d8e6ed" }, ground: { visible: true, color: "#879083", opacity: 1 }, atmosphere: { fogColor: "#c8d7df", fogDensity: .0035 }, lighting: { ambient: { sky: "#d9ecff", ground: "#8d9385", intensity: 2.1 }, key: { color: "#fff1d4", intensity: 5.1, azimuth: -42, elevation: 52, shadows: true }, fill: { color: "#a9c9e8", intensity: 1.5 }, rim: { color: "#e8f3ff", intensity: .65 } }, exposure: 1.08 } }),
  worldEnvironmentAsset({ id: "world-overcast", label: "阴天", description: "世界环境 · 柔和漫射", tags: ["柔光", "overcast"], world: { sky: { top: "#737d88", horizon: "#bfc6ca" }, ground: { visible: true, color: "#777d77", opacity: 1 }, atmosphere: { fogColor: "#aeb6bb", fogDensity: .006 }, lighting: { ambient: { sky: "#edf2f5", ground: "#777d77", intensity: 2.5 }, key: { color: "#eef2f4", intensity: 1.7, azimuth: -25, elevation: 64, shadows: true }, fill: { color: "#cbd5dc", intensity: 1.4 }, rim: { color: "#ffffff", intensity: .4 } }, exposure: 1.02 } }),
  worldEnvironmentAsset({ id: "world-golden-hour", label: "黄金时刻", description: "世界环境 · 低角度暖光", tags: ["黄昏", "sunset"], world: { sky: { top: "#405374", horizon: "#e99b64" }, ground: { visible: true, color: "#625448", opacity: 1 }, atmosphere: { fogColor: "#b87755", fogDensity: .007 }, lighting: { ambient: { sky: "#7187b2", ground: "#5c4d43", intensity: 1.25 }, key: { color: "#ffbd75", intensity: 5.0, azimuth: -68, elevation: 13, shadows: true }, fill: { color: "#7188bd", intensity: .8 }, rim: { color: "#ffd0a3", intensity: 2.1 } }, exposure: 1.04 } }),
  worldEnvironmentAsset({ id: "world-blue-hour", label: "蓝调时刻", description: "世界环境 · 冷暖交界", tags: ["傍晚", "blue hour"], world: { sky: { top: "#182a48", horizon: "#687b9a" }, ground: { visible: true, color: "#293340", opacity: 1 }, atmosphere: { fogColor: "#4e6078", fogDensity: .0065 }, lighting: { ambient: { sky: "#7393c5", ground: "#202936", intensity: .55 }, key: { color: "#ffc593", intensity: 3.0, azimuth: -78, elevation: 10, shadows: true, softness: 1.5 }, fill: { color: "#789bd1", intensity: .18 }, rim: { color: "#a7c9ff", intensity: 1.1 } }, exposure: .95 } }),
  worldEnvironmentAsset({ id: "world-night", label: "夜间", description: "世界环境 · 冷色月光", tags: ["月光", "night"], world: { sky: { top: "#050b16", horizon: "#14233a" }, ground: { visible: true, color: "#0c1420", opacity: 1 }, atmosphere: { fogColor: "#111d2e", fogDensity: .006 }, lighting: { ambient: { sky: "#26466f", ground: "#090e16", intensity: .55 }, key: { color: "#9fc2ff", intensity: 1.85, azimuth: 35, elevation: 38, shadows: true }, fill: { color: "#284773", intensity: .22 }, rim: { color: "#77a9ff", intensity: 2.2 } }, exposure: .82 } }),
  worldEnvironmentAsset({ id: "world-desert", label: "沙地", description: "世界环境 · 高亮暖色地面", tags: ["沙漠", "desert"], world: { sky: { top: "#70a1c4", horizon: "#ead7b6" }, ground: { visible: true, color: "#b89a6c", opacity: 1 }, atmosphere: { fogColor: "#d4b98f", fogDensity: .0045 }, lighting: { ambient: { sky: "#dcecff", ground: "#b89a6c", intensity: 1.85 }, key: { color: "#ffe2ad", intensity: 5.4, azimuth: -30, elevation: 58, shadows: true }, fill: { color: "#a8c8dc", intensity: 1.1 }, rim: { color: "#fff0cf", intensity: .75 } }, exposure: 1.10 } }),
  worldEnvironmentAsset({ id: "world-black-void", label: "黑场", description: "世界环境 · 纯黑空间", tags: ["轮廓", "black void"], world: { sky: { top: "#010203", horizon: "#030405" }, ground: { visible: false, color: "#050607", opacity: 0 }, atmosphere: { fogColor: "#020304", fogDensity: 0 }, lighting: { ambient: { sky: "#11151d", ground: "#020304", intensity: .30 }, key: { color: "#f2f4f8", intensity: 2.8, azimuth: -35, elevation: 52, shadows: true }, fill: { color: "#4b5870", intensity: .12 }, rim: { color: "#9ec1ff", intensity: 3.0 } }, exposure: .92 } }),
];

const cameraPresetAsset = ({ id, label, description, tags = [], ...cameraPreset }) => ({
  id,
  label,
  description,
  directory: "cameras",
  collections: ["cameras"],
  tags: [...new Set([label, "机位", "camera", ...tags])],
  using: "camera-preset",
  parameters: { cameraPreset },
});

/* Camera assets are framing recipes, not camera-shaped meshes. The Workbench
   resolves their subject-relative pose when an author applies one. */
const cameraAssets = [
  cameraPresetAsset({ id: "current-view", label: "当前视角", description: "保存当前导演视角", targetMode: "current-view", fov: 40, tags: ["当前", "视角"] }),
  cameraPresetAsset({ id: "front-medium", label: "正面中景", description: "选择对象 · 腰部以上", targetMode: "subject", yawDeg: 0, elevationDeg: 1, rollDeg: 0, framing: "medium", distanceScale: 1.28, focusY: .75, fov: 40, tags: ["正面", "中景"] }),
  cameraPresetAsset({ id: "front-close", label: "正面特写", description: "选择对象 · 面部与上身", targetMode: "subject", yawDeg: 0, elevationDeg: 2, rollDeg: 0, framing: "close", distanceScale: .74, focusY: .76, fov: 34, tags: ["正面", "特写"] }),
  cameraPresetAsset({ id: "front-wide", label: "正面全景", description: "选择对象 · 完整人物与环境", targetMode: "subject", yawDeg: 0, elevationDeg: 3, rollDeg: 0, framing: "wide", distanceScale: 2.05, focusY: .48, fov: 48, tags: ["正面", "全景"] }),
  cameraPresetAsset({ id: "side-follow", label: "侧面跟拍", description: "选择对象 · 运动方向留白", targetMode: "subject", yawDeg: 90, elevationDeg: 2, rollDeg: 0, framing: "medium", distanceScale: 1.45, focusY: .70, fov: 42, leadRoom: .32, tags: ["侧面", "跟拍"] }),
  cameraPresetAsset({ id: "side-close", label: "侧面近景", description: "选择对象 · 侧脸与肩部", targetMode: "subject", yawDeg: 90, elevationDeg: 2, rollDeg: 0, framing: "close", distanceScale: .82, focusY: .74, fov: 36, tags: ["侧面", "近景"] }),
  cameraPresetAsset({ id: "rear-medium", label: "背面中景", description: "选择对象 · 背部跟随视角", targetMode: "subject", yawDeg: 180, elevationDeg: 1, rollDeg: 0, framing: "medium", distanceScale: 1.32, focusY: .72, fov: 40, tags: ["背面", "跟随"] }),
  cameraPresetAsset({ id: "high-wide", label: "俯拍全景", description: "选择对象 · 高位交代空间", targetMode: "subject", yawDeg: 25, elevationDeg: 32, rollDeg: 0, framing: "wide", distanceScale: 2.15, focusY: .40, fov: 50, tags: ["俯拍", "全景"] }),
  cameraPresetAsset({ id: "three-quarter-high", label: "45° 俯拍", description: "选择对象 · 三分之四角度", targetMode: "subject", yawDeg: 45, elevationDeg: 24, rollDeg: 0, framing: "medium", distanceScale: 1.48, focusY: .70, fov: 42, tags: ["45度", "俯拍"] }),
  cameraPresetAsset({ id: "low-angle", label: "低角度仰拍", description: "选择对象 · 强化主体气势", targetMode: "subject", yawDeg: -12, elevationDeg: -13, rollDeg: 0, framing: "medium", distanceScale: 1.38, focusY: .72, fov: 38, tags: ["低角度", "仰拍"] }),
  cameraPresetAsset({ id: "low-wide", label: "低角度广角", description: "选择对象 · 近大远小", targetMode: "subject", yawDeg: -20, elevationDeg: -11, rollDeg: 0, framing: "wide", distanceScale: 1.35, focusY: .48, fov: 66, tags: ["低角度", "广角"] }),
  cameraPresetAsset({ id: "over-shoulder", label: "过肩镜头", description: "选择前景角色与注视对象", targetMode: "over-shoulder", rollDeg: 0, framing: "close", distanceScale: .72, focusY: .62, fov: 38, tags: ["过肩", "对话"] }),
  cameraPresetAsset({ id: "bird-eye", label: "鸟瞰", description: "选择对象 · 垂直空间关系", targetMode: "subject", yawDeg: 18, elevationDeg: 76, rollDeg: 0, framing: "wide", distanceScale: 2.18, focusY: .30, fov: 52, tags: ["鸟瞰", "顶视"] }),
  cameraPresetAsset({ id: "dutch-angle", label: "荷兰角", description: "选择对象 · 倾斜制造张力", targetMode: "subject", yawDeg: -24, elevationDeg: 5, rollDeg: -16, framing: "medium", distanceScale: 1.34, focusY: .72, fov: 42, tags: ["荷兰角", "倾斜"] }),
];

const assets = [
  characterAsset({ id: "standard-male", label: "男性 · 标准", ageBand: "adult", sex: "male", height: 1.76, heads: 7.5, legRatio: .52, shoulderRatio: .255, hipRatio: .195, waistRatio: .185, chestVolume: .12, abdomenVolume: .05, gluteVolume: .16, derivedBase: { source: "standard-male.glb", baseStature: 1.76 } }),
  characterAsset({ id: "standard-female", label: "女性 · 标准", ageBand: "adult", sex: "female", height: 1.63, heads: 7.4, legRatio: .515, shoulderRatio: .235, hipRatio: .225, waistRatio: .17, chestVolume: .42, gluteVolume: .50, derivedBase: { source: "standard-female.glb", baseStature: 1.63 } }),
  characterAsset({ id: "slim-male", label: "男性 · 纤瘦", ageBand: "adult", sex: "male", height: 1.80, heads: 7.3, legRatio: .52, shoulderRatio: .24, hipRatio: .185, waistRatio: .17, bodyType: "slim", armBuild: .82, legBuild: .86, depthBuild: .90, chestVolume: .04, gluteVolume: .08, derivedBase: {
    source: "standard-male.glb", baseStature: 1.76,
    chestWidth: [.90, .90, .92], chestDepth: [.88, .90, .91],
    bellyWidth: [.90, .84, .88], bellyDepth: [.90, .84, .88],
    pelvisWidth: .90, pelvisDepth: .90, shoulderOffset: .94, hipOffset: .94, shoulderMass: .92,
    armBuild: .82, upperArmBuild: [.78, .84, .80], forearmBuild: [.78, .84, .80],
    thighBuild: [.82, .86, .90], calfBuild: [.80, .86, .82], neckBuild: .93, headWidth: .99, headDepth: .99,
  } }),
  characterAsset({ id: "slim-female", label: "女性 · 纤瘦", ageBand: "adult", sex: "female", height: 1.68, heads: 7.4, legRatio: .515, shoulderRatio: .22, hipRatio: .205, waistRatio: .155, bodyType: "slim", armBuild: .80, legBuild: .86, depthBuild: .90, chestVolume: .24, gluteVolume: .30, derivedBase: {
    source: "standard-female.glb", baseStature: 1.63,
    chestWidth: [.90, .91, .92], chestDepth: [.90, .90, .92], breastWidth: .82, breastHeight: .88, breastDepth: .82,
    bellyWidth: [.91, .84, .89], bellyDepth: [.90, .85, .89], pelvisWidth: .91, pelvisDepth: .91,
    shoulderOffset: .95, hipOffset: .95, shoulderMass: .93, armBuild: .80,
    upperArmBuild: [.78, .82, .78], forearmBuild: [.77, .82, .78],
    thighBuild: [.82, .87, .92], calfBuild: [.80, .86, .82], neckBuild: .93, headWidth: .99, headDepth: .99,
  } }),
  characterAsset({ id: "athletic-male", label: "男性 · 健壮", ageBand: "adult", sex: "male", height: 1.80, heads: 7.25, legRatio: .52, shoulderRatio: .285, hipRatio: .205, waistRatio: .18, bodyType: "athletic", armBuild: 1.20, legBuild: 1.16, depthBuild: 1.10, chestVolume: .48, abdomenVolume: .04, gluteVolume: .24, derivedBase: {
    source: "standard-male.glb", baseStature: 1.76,
    chestWidth: [1.03, 1.14, 1.17], chestDepth: [1.04, 1.11, 1.12],
    bellyWidth: [1.04, .99, 1.05], bellyDepth: [1.04, 1.02, 1.06],
    pelvisWidth: 1.04, pelvisDepth: 1.06, shoulderOffset: 1.09, hipOffset: 1.03, shoulderMass: 1.10,
    armBuild: 1.18, upperArmBuild: [1.04, 1.24, 1.10], forearmBuild: [1.04, 1.18, 1.07],
    thighBuild: [1.02, 1.18, 1.15], calfBuild: [1.02, 1.16, 1.06], neckBuild: 1.08, headWidth: 1.01, headDepth: 1.01,
  } }),
  characterAsset({ id: "athletic-female", label: "女性 · 健壮", ageBand: "adult", sex: "female", height: 1.67, heads: 7.35, legRatio: .515, shoulderRatio: .255, hipRatio: .235, waistRatio: .17, bodyType: "athletic", armBuild: 1.12, legBuild: 1.14, depthBuild: 1.08, chestVolume: .48, gluteVolume: .56, derivedBase: {
    source: "standard-female.glb", baseStature: 1.63,
    chestWidth: [1.02, 1.08, 1.11], chestDepth: [1.02, 1.07, 1.08], breastWidth: 1.02, breastHeight: 1.02, breastDepth: 1.02,
    bellyWidth: [1.03, .98, 1.03], bellyDepth: [1.03, 1.00, 1.04], pelvisWidth: 1.05, pelvisDepth: 1.06,
    shoulderOffset: 1.07, hipOffset: 1.03, shoulderMass: 1.07, armBuild: 1.10,
    upperArmBuild: [1.03, 1.14, 1.07], forearmBuild: [1.02, 1.12, 1.05],
    thighBuild: [1.02, 1.14, 1.16], calfBuild: [1.02, 1.12, 1.05], neckBuild: 1.04,
  } }),
  characterAsset({ id: "full-male", label: "男性 · 丰腴", ageBand: "adult", sex: "male", height: 1.75, heads: 7.2, legRatio: .51, shoulderRatio: .27, hipRatio: .23, waistRatio: .205, bodyType: "full", armBuild: 1.10, legBuild: 1.14, depthBuild: 1.14, chestVolume: .40, abdomenVolume: .48, gluteVolume: .38, derivedBase: {
    source: "standard-male.glb", baseStature: 1.76,
    chestWidth: [1.06, 1.10, 1.10], chestDepth: [1.08, 1.13, 1.13],
    bellyWidth: [1.14, 1.12, 1.10], bellyDepth: [1.18, 1.24, 1.17],
    pelvisWidth: 1.11, pelvisDepth: 1.16, shoulderOffset: 1.04, hipOffset: 1.07, shoulderMass: 1.06,
    armBuild: 1.10, upperArmBuild: [1.07, 1.13, 1.09], forearmBuild: [1.05, 1.11, 1.07],
    thighBuild: [1.04, 1.14, 1.18], calfBuild: [1.03, 1.11, 1.06], neckBuild: 1.08,
  } }),
  characterAsset({ id: "full-female", label: "女性 · 丰腴", ageBand: "adult", sex: "female", height: 1.62, heads: 7.3, legRatio: .505, shoulderRatio: .245, hipRatio: .265, waistRatio: .175, bodyType: "full", armBuild: 1.08, legBuild: 1.16, depthBuild: 1.14, chestVolume: .72, abdomenVolume: .18, gluteVolume: .82, derivedBase: {
    source: "standard-female.glb", baseStature: 1.63,
    chestWidth: [1.04, 1.10, 1.09], chestDepth: [1.05, 1.10, 1.10], breastWidth: 1.08, breastHeight: 1.06, breastDepth: 1.10,
    bellyWidth: [1.13, 1.03, 1.08], bellyDepth: [1.15, 1.08, 1.13],
    pelvisWidth: 1.13, pelvisDepth: 1.17, shoulderOffset: 1.02, hipOffset: 1.08, shoulderMass: 1.04,
    armBuild: 1.08, upperArmBuild: [1.05, 1.11, 1.07], forearmBuild: [1.04, 1.09, 1.06],
    thighBuild: [1.03, 1.16, 1.21], thighDepth: [1.04, 1.17, 1.22],
    calfBuild: [1.02, 1.10, 1.05], neckBuild: 1.04,
  } }),
  characterAsset({ id: "teen-male", label: "男性 · 少年", ageBand: "adolescent", sex: "male", height: 1.72, heads: 7.1, legRatio: .51, shoulderRatio: .235, hipRatio: .185, waistRatio: .16, bodyType: "adolescent", armBuild: .88, legBuild: .90, depthBuild: .92, chestVolume: .04, gluteVolume: .08, derivedBase: {
    source: "standard-male.glb", baseStature: 1.76,
    chestWidth: [.91, .92, .94], chestDepth: [.91, .92, .94],
    bellyWidth: [.92, .88, .91], bellyDepth: [.92, .89, .92], pelvisWidth: .92, pelvisDepth: .93,
    shoulderOffset: .94, hipOffset: .96, shoulderMass: .92, armBuild: .88,
    upperArmBuild: [.86, .90, .87], forearmBuild: [.85, .89, .86],
    thighBuild: [.87, .91, .94], calfBuild: [.86, .91, .88], neckBuild: .92,
    headWidth: 1.035, headHeight: 1.035, headDepth: 1.035,
  } }),
  characterAsset({ id: "teen-female", label: "女性 · 少年", ageBand: "adolescent", sex: "female", height: 1.59, heads: 6.95, legRatio: .50, shoulderRatio: .225, hipRatio: .21, waistRatio: .16, bodyType: "adolescent", armBuild: .86, legBuild: .90, depthBuild: .92, chestVolume: .22, gluteVolume: .26, derivedBase: {
    source: "standard-female.glb", baseStature: 1.63,
    chestWidth: [.92, .93, .95], chestDepth: [.92, .93, .95], breastWidth: .78, breastHeight: .84, breastDepth: .78,
    bellyWidth: [.93, .88, .92], bellyDepth: [.92, .89, .92], pelvisWidth: .93, pelvisDepth: .94,
    shoulderOffset: .96, hipOffset: .97, shoulderMass: .94, armBuild: .86,
    upperArmBuild: [.84, .88, .85], forearmBuild: [.84, .88, .85],
    thighBuild: [.87, .91, .95], calfBuild: [.85, .90, .87], neckBuild: .92,
    headWidth: 1.04, headHeight: 1.04, headDepth: 1.04,
  } }),
  characterAsset({ id: "child-male", label: "男性 · 儿童", ageBand: "child-8-9", sex: "male", height: 1.34, heads: 6.0, legRatio: .47, shoulderRatio: .215, hipRatio: .19, waistRatio: .175, build: .82 }),
  characterAsset({ id: "child-female", label: "女性 · 儿童", ageBand: "child-8-9", sex: "female", height: 1.34, heads: 6.0, legRatio: .47, shoulderRatio: .21, hipRatio: .20, waistRatio: .175, build: .82 }),
  characterAsset({ id: "elder-male", label: "男性 · 老年", ageBand: "elder", sex: "male", height: 1.70, heads: 7.1, legRatio: .505, shoulderRatio: .245, hipRatio: .205, waistRatio: .19, bodyType: "elder", armBuild: .94, legBuild: .94, depthBuild: .98, chestVolume: .12, abdomenVolume: .16, gluteVolume: .10, derivedBase: {
    source: "standard-male.glb", baseStature: 1.76,
    chestWidth: [.98, .97, .96], chestDepth: [1.00, .99, .98],
    bellyWidth: [1.03, 1.06, 1.02], bellyDepth: [1.04, 1.08, 1.03], pelvisWidth: 1.01, pelvisDepth: 1.02,
    shoulderOffset: .98, hipOffset: 1.01, shoulderMass: .96, armBuild: .94,
    upperArmBuild: [.92, .96, .93], forearmBuild: [.91, .95, .92],
    thighBuild: [.92, .96, .98], calfBuild: [.91, .95, .92], neckBuild: .97,
    headWidth: 1.025, headHeight: 1.02, headDepth: 1.02,
  } }),
  characterAsset({ id: "elder-female", label: "女性 · 老年", ageBand: "elder", sex: "female", height: 1.57, heads: 7.0, legRatio: .50, shoulderRatio: .23, hipRatio: .23, waistRatio: .19, bodyType: "elder", armBuild: .92, legBuild: .94, depthBuild: .98, chestVolume: .34, abdomenVolume: .14, gluteVolume: .34, derivedBase: {
    source: "standard-female.glb", baseStature: 1.63,
    chestWidth: [.97, .97, .96], chestDepth: [.99, .98, .98], breastWidth: .94, breastHeight: .94, breastDepth: .94,
    bellyWidth: [1.02, 1.05, 1.02], bellyDepth: [1.04, 1.07, 1.03], pelvisWidth: 1.02, pelvisDepth: 1.03,
    shoulderOffset: .98, hipOffset: 1.01, shoulderMass: .96, armBuild: .92,
    upperArmBuild: [.90, .94, .91], forearmBuild: [.89, .93, .90],
    thighBuild: [.91, .95, .98], calfBuild: [.90, .94, .91], neckBuild: .96,
    headWidth: 1.03, headHeight: 1.025, headDepth: 1.025,
  } }),
  characterAsset({ id: "neutral-mannequin", label: "人物 · 中性", ageBand: "adult", sex: "neutral", height: 1.72, heads: 7.45, legRatio: .515, shoulderRatio: .245, hipRatio: .205, waistRatio: .17 }),
  characterAsset({ id: "toddler", label: "人物 · 幼儿", ageBand: "toddler-2-3", sex: "neutral", height: .94, heads: 5.0, legRatio: .43, shoulderRatio: .22, hipRatio: .20, waistRatio: .185, upperArmRatio: .19, forearmRatio: .145, build: .88 }),
  characterAsset({ id: "pregnant-female", label: "女性 · 孕期", ageBand: "adult", sex: "female", height: 1.64, heads: 7.3, legRatio: .51, shoulderRatio: .24, hipRatio: .25, waistRatio: .19, bodyType: "pregnant", armBuild: 1.02, legBuild: 1.08, depthBuild: 1.14, chestVolume: .56, abdomenVolume: .52, gluteVolume: .60, derivedBase: {
    source: "standard-female.glb", baseStature: 1.63,
    chestWidth: [1.02, 1.05, 1.05], chestDepth: [1.03, 1.07, 1.08], breastWidth: 1.05, breastHeight: 1.04, breastDepth: 1.07,
    bellyWidth: [1.06, 1.16, 1.10], bellyDepth: [1.12, 1.42, 1.25], pelvisWidth: 1.08, pelvisDepth: 1.12,
    shoulderOffset: 1.01, hipOffset: 1.04, shoulderMass: 1.02, armBuild: 1.02,
    upperArmBuild: [1.00, 1.04, 1.02], forearmBuild: [1.00, 1.03, 1.01],
    thighBuild: [1.02, 1.08, 1.10], calfBuild: [1.01, 1.06, 1.02], neckBuild: 1.01,
  } }),
  { id: "hero-bot", label: "角色 · 机械", description: "造型角色 · 高 1.82 m", directory: "characters", collections: ["characters", "stylized"], tags: ["角色 · 机械", "机械", "robot"], using: "humanoid-character", parameters: { rigProfile: "hypit-humanoid", rig: humanoidRigDeclaration }, model: humanoid({ name: "角色 · 机械", height: 1.82, heads: 7.5, legRatio: .52, shoulderRatio: .265, hipRatio: .20, waistRatio: .175, build: 1.04 }), previewModel: humanoid({ name: "角色 · 机械 Preview", height: 1.82, heads: 7.5, legRatio: .52, shoulderRatio: .265, hipRatio: .20, waistRatio: .175, build: 1.04, pose: "standing" }) },
  ...geometryAssets,
  { id: "round-table", label: "圆桌", description: "家具 · 高 0.75 m", directory: "props", collections: ["objects", "furniture"], tags: ["圆桌", "桌子", "家具", "table"], using: "prop", parameters: { boundsM: { width: 1.2, height: .75, depth: 1.2 } }, model: { name: "Round Table", materials: [material("Dark Oak", [0.22, .14, .09, 1], .56), material("Metal", palette.graphite, .32, .5)], parts: [part("Top", "cylinder", 0, [0, .70, 0], [1.2, .10, 1.2]), part("Stem", "cylinder", 1, [0, .36, 0], [.16, .64, .16]), part("Base", "cylinder", 1, [0, .05, 0], [.58, .10, .58])] } },
  { id: "lounge-chair", label: "椅子", description: "家具 · 高 0.9 m", directory: "props", collections: ["objects", "furniture"], tags: ["椅子", "座椅", "家具", "chair"], using: "prop", parameters: { boundsM: { width: .52, height: .9, depth: .55 } }, model: { name: "Chair", materials: [material("Upholstery", palette.rose, .88), material("Frame", palette.graphite, .44, .3)], parts: [part("Seat", "box", 0, [0, .45, 0], [.52, .10, .50]), part("Back", "box", 0, [0, .69, -.22], [.52, .48, .10], [-.08, 0, 0]), part("Leg.FL", "cylinder", 1, [-.20, .20, .18], [.055, .40, .055]), part("Leg.FR", "cylinder", 1, [.20, .20, .18], [.055, .40, .055]), part("Leg.BL", "cylinder", 1, [-.20, .20, -.18], [.055, .40, .055]), part("Leg.BR", "cylinder", 1, [.20, .20, -.18], [.055, .40, .055])] } },
  { id: "four-step", label: "楼梯", description: "建筑 · 高 1.5 m", directory: "props", collections: ["objects", "architecture"], tags: ["台阶", "楼梯", "建筑", "stairs"], using: "prop", parameters: { boundsM: { width: 1.8, height: 1.5, depth: 2.4 } }, model: { name: "Stairs", materials: [material("Concrete", palette.stone, .96)], parts: [0, 1, 2, 3, 4, 5].map((index) => part(`Step.${index + 1}`, "box", 0, [0, .125 + index * .125, -.98 + index * .38], [1.8, .25 + index * .25, .48])) } },
  ...objectAssets,
  ...environmentAssets,
  ...cameraAssets,
  { id: "display-pedestal", label: "展示台", description: "拍摄与舞台 · 高 0.94 m", directory: "props", collections: ["objects", "production"], tags: ["展示台", "产品台", "舞台", "pedestal"], using: "prop", parameters: {}, model: { name: "Display Pedestal", materials: [material("Plaster", palette.ivory, .9), material("Trim", palette.rose, .62)], parts: [part("Base", "cylinder", 0, [0, .08, 0], [.9, .16, .9]), part("Body", "cylinder", 0, [0, .48, 0], [.66, .72, .66]), part("Top", "cylinder", 1, [0, .89, 0], [.78, .10, .78])] } },
  { id: "softbox", label: "柔光箱", description: "拍摄与舞台 · 高 2.06 m", directory: "props", collections: ["objects", "production"], tags: ["柔光箱", "灯光", "拍摄", "softbox"], using: "light-prop", parameters: { lightType: "area" }, model: { name: "Softbox", materials: [material("Housing", palette.graphite, .4, .35), material("Diffusion", [1, .88, .68, 1], .98)], parts: [part("Stand", "cylinder", 0, [0, .78, 0], [.08, 1.56, .08]), part("Foot", "cylinder", 0, [0, .06, 0], [.65, .08, .65]), part("Lamp", "box", 0, [0, 1.72, 0], [.88, .68, .22], [-.12, 0, 0]), part("Diffuser", "box", 1, [0, 1.72, .13], [.72, .54, .04], [-.12, 0, 0])] } },
];

for (const asset of assets) {
  const directory = join(assetRoot, asset.directory, asset.id);
  const moduleName = asset.using === "world-environment"
    ? "@hypit/scene-environment"
    : "@project/scene-assets";
  await mkdir(directory, { recursive: true });
  await rm(join(directory, asset.sourceModel !== undefined || asset.derivedModel !== undefined ? "model.gltf" : "model.glb"), { force: true });
  await rm(join(directory, asset.sourcePreviewModel !== undefined || asset.derivedPreviewModel !== undefined ? "preview.gltf" : "preview.glb"), { force: true });
  if (asset.sourceModel !== undefined) {
    await copyFile(join(humanBaseRoot, asset.sourceModel), join(directory, "model.glb"));
  } else if (asset.derivedModel !== undefined) {
    const source = await readFile(join(humanBaseRoot, asset.derivedModel.source));
    await writeFile(join(directory, "model.glb"), deformHumanBase(source, asset.derivedModel));
  } else if (asset.model !== undefined) {
    await writeFile(join(directory, "model.gltf"), `${JSON.stringify(buildGltf(asset.model), undefined, 2)}\n`);
  }
  if (asset.sourcePreviewModel !== undefined) {
    await copyFile(join(humanBaseRoot, asset.sourcePreviewModel), join(directory, "preview.glb"));
  } else if (asset.derivedPreviewModel !== undefined) {
    const source = await readFile(join(humanBaseRoot, asset.derivedPreviewModel.source));
    await writeFile(join(directory, "preview.glb"), deformHumanBase(source, asset.derivedPreviewModel, true));
  } else if (asset.previewModel !== undefined) {
    await writeFile(join(directory, "preview.gltf"), `${JSON.stringify(buildGltf(asset.previewModel), undefined, 2)}\n`);
  }
  const preview = asset.sourcePreviewModel !== undefined
    ? { path: "preview.glb", mediaType: "model/gltf-binary" }
    : asset.derivedPreviewModel !== undefined
      ? { path: "preview.glb", mediaType: "model/gltf-binary" }
    : asset.previewModel === undefined ? undefined : { path: "preview.gltf", mediaType: "model/gltf+json" };
  const model = asset.sourceModel !== undefined
    ? { path: "model.glb", mediaType: "model/gltf-binary" }
    : asset.derivedModel !== undefined
      ? { path: "model.glb", mediaType: "model/gltf-binary" }
    : asset.model === undefined ? undefined : { path: "model.gltf", mediaType: "model/gltf+json" };
  await writeFile(join(directory, `${asset.id}.scene-asset.json`), `${JSON.stringify({
    format: "hypit.scene-asset@1",
    id: asset.id,
    name: asset.label,
    using: { module: { name: moduleName }, name: asset.using },
    ...(preview === undefined ? {} : { preview }),
    resources: model === undefined ? {} : { model },
    parameters: asset.parameters,
  }, undefined, 2)}\n`);
}

await writeFile(join(assetRoot, "library.scene-library.json"), `${JSON.stringify({
  format: "hypit.scene-library@1",
  id: "project-scene-assets",
  name: "项目场景资产",
  collections: [
    { id: "characters", label: "角色", icon: "person", children: [
      { id: "people", label: "基础人物", children: [] },
      { id: "stylized", label: "造型角色", children: [] },
      { id: "groups", label: "多人组合", children: [] },
    ] },
    { id: "objects", label: "物体", icon: "object", children: [
      { id: "geometry", label: "几何体", children: [] },
      { id: "furniture", label: "家具", children: [] },
      { id: "architecture", label: "建筑", children: [] },
      { id: "nature", label: "自然", children: [] },
      { id: "street", label: "街道", children: [] },
      { id: "office", label: "办公", children: [] },
      { id: "kitchen", label: "厨房", children: [] },
      { id: "bathroom", label: "卫浴", children: [] },
      { id: "daily", label: "日用", children: [] },
      { id: "production", label: "拍摄与舞台", children: [] },
    ] },
    { id: "environments", label: "环境", icon: "image", children: [
      { id: "world", label: "世界环境", children: [] },
    ] },
    { id: "cameras", label: "机位", icon: "camera", children: [] },
  ],
  entries: assets.map((asset) => ({
    id: asset.id,
    label: asset.label,
    description: asset.description,
    asset: { path: `${asset.directory}/${asset.id}/${asset.id}.scene-asset.json` },
    collections: asset.collections,
    tags: asset.tags,
  })),
}, undefined, 2)}\n`);

console.log(`Generated ${assets.length} Scene Assets in ${assetRoot}`);
