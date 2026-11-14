import {
  assertGpuCompositionProgram,
  type GpuCompositionProgram,
} from "@hypit/gpu-composition-program";

import {
  assertHtmlProgram,
  htmlArtifactUri,
  type HtmlArtifact,
  type HtmlProgram,
  type HtmlVideoSource,
} from "@hypit/html-program";
import type { SpatialTransform } from "@hypit/spatial/algebra";
import {
  composeTemporalMaps,
  exactTemporalValueFromFrames,
  sealLocalTemporalDomain,
  sealTemporalMap,
  type ExactTemporalValue,
  type FrameSpan,
  type TemporalMap,
} from "@hypit/temporal";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pictureExtent(value: GpuCompositionProgram["inputs"][number]["picture"]["source"]) {
  const picture = value.interpretation;
  let width = picture.codedWidth * picture.sampleAspectRatio.numerator
    / picture.sampleAspectRatio.denominator;
  let height = picture.codedHeight;
  if (picture.rotationDegrees === 90 || picture.rotationDegrees === 270) [width, height] = [height, width];
  return { width, height };
}

function spans(samples: readonly (unknown | null)[]): FrameSpan[] {
  const result: FrameSpan[] = [];
  for (const [frame, sample] of samples.entries()) {
    if (sample === null) continue;
    const previous = result.at(-1);
    if (previous?.endFrameExclusive === frame) {
      result[result.length - 1] = { startFrame: previous.startFrame, endFrameExclusive: frame + 1 };
    } else result.push({ startFrame: frame, endFrameExclusive: frame + 1 });
  }
  return result;
}

function sampledTemporalMap(
  id: string,
  positions: readonly (ExactTemporalValue | null)[],
  start: number,
  end: number,
  program: GpuCompositionProgram,
  source: Parameters<typeof sealLocalTemporalDomain>[0],
): TemporalMap {
  const target = sealLocalTemporalDomain({
    id: `${id}:output-time`,
    duration: exactTemporalValueFromFrames(end - start, program.sampling),
  });
  return sealTemporalMap({ stages: [{
    target,
    source: sealLocalTemporalDomain(source),
    pieces: positions.slice(start, end).flatMap((position, index) => position === null ? [] : [{
      target: {
        start: exactTemporalValueFromFrames(index, program.sampling),
        end: exactTemporalValueFromFrames(index + 1, program.sampling),
      },
      sourceAtStart: structuredClone(position),
      rate: { numerator: 0, denominator: 1 },
    }]),
  }] });
}

function rgba(value: string): readonly [number, number, number, number] {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/iu.exec(value);
  assert(match !== null, "WebGPU Composition clear colour must be #RRGGBB or #RRGGBBAA.");
  const rgb = match[1]!;
  return [
    Number.parseInt(rgb.slice(0, 2), 16) / 255,
    Number.parseInt(rgb.slice(2, 4), 16) / 255,
    Number.parseInt(rgb.slice(4, 6), 16) / 255,
    match[2] === undefined ? 1 : Number.parseInt(match[2], 16) / 255,
  ];
}

function matrix(value: SpatialTransform): readonly number[] {
  return value.kind === "affine"
    ? [value.xx, value.xy, value.tx, value.yx, value.yy, value.ty, 0, 0, 1]
    : [value.xx, value.xy, value.tx, value.yx, value.yy, value.ty, value.wx, value.wy, value.ww];
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function runtime(config: unknown): string {
  return `(() => {
const config = ${JSON.stringify(config)};
const canvas = document.getElementById('hypit-gpu-output');
let frame = 0;
let gpu;
const shader = \`
struct Params { row0: vec4f, row1: vec4f, row2: vec4f, region: vec4f };
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@vertex fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var positions = array<vec2f, 3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  return vec4f(positions[index], 0.0, 1.0);
}
@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let point = vec3f(position.x, position.y, 1.0);
  let projected = vec3f(dot(params.row0.xyz, point), dot(params.row1.xyz, point), dot(params.row2.xyz, point));
  if (projected.z == 0.0) { discard; }
  let source = projected.xy / projected.z;
  let origin = params.region.xy;
  let extent = params.region.zw;
  if (source.x < origin.x || source.y < origin.y || source.x >= origin.x + extent.x || source.y >= origin.y + extent.y) { discard; }
  return textureSample(sourceTexture, sourceSampler, (source - origin) / extent);
}\`;
async function initialize() {
  if (!navigator.gpu) throw new Error('Selected runtime has no WebGPU implementation.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('Selected runtime found no WebGPU adapter.');
  const device = await adapter.requestDevice();
  const outputContext = canvas.getContext('2d');
  if (!outputContext) throw new Error('Selected runtime cannot create a capture canvas.');
  const format = 'rgba8unorm';
  const outputTexture = device.createTexture({ size: [config.width, config.height], format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const outputBytesPerRow = Math.ceil(config.width * 4 / 256) * 256;
  const outputBuffer = device.createBuffer({ size: outputBytesPerRow * config.height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const module = device.createShaderModule({ code: shader });
  const pipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vertex' },
    fragment: { module, entryPoint: 'fragment', targets: [{ format, blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    } }] }, primitive: { topology: 'triangle-list' } });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const layers = config.layers.map(layer => {
    const upload = document.createElement('canvas');
    upload.width = layer.width;
    upload.height = layer.height;
    const uploadContext = upload.getContext('2d', { alpha: true });
    if (!uploadContext) throw new Error(\`GPU Composition input \${layer.id} cannot create an upload canvas.\`);
    const texture = device.createTexture({ size: [layer.width, layer.height], format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
    const uniform = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: sampler }, { binding: 1, resource: texture.createView() },
      { binding: 2, resource: { buffer: uniform } },
    ] });
    return { ...layer, upload, uploadContext, texture, uniform, bind };
  });
  device.lost.then(info => { window.__hypitHtmlVisualError = \`WebGPU device lost: \${info.message}\`; });
  // Keep the Adapter reachable for the complete capture. Some Dawn hosts release the
  // external instance when only Device wrappers remain during headless frame capture.
  return { adapter, device, outputContext, outputTexture, outputBuffer, outputBytesPerRow, pipeline, layers };
}
window.__hypitCaptureRoots = [canvas];
window.__hypitFrameProgram = Object.freeze({
  frameCount: config.frameCount,
  async prepare() {},
  async applyFrame(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= config.frameCount) throw new Error('GPU Composition frame is outside its domain.');
    frame = value;
  },
});
window.__hypitAfterSourceFrames = async () => {
  let stage = 'initializing Dawn';
  try {
    gpu ??= initialize();
    const { device, outputContext, outputTexture, outputBuffer, outputBytesPerRow, pipeline, layers } = await gpu;
    const active = [];
    for (const layer of layers) {
      const sample = layer.samples[frame];
      if (sample === null) continue;
      const plane = document.getElementById(layer.elementId);
      const source = plane?.querySelector('[data-hypit-source-frame-canvas], [data-hypit-source-frame-image]');
      if (!(source instanceof HTMLCanvasElement || source instanceof HTMLImageElement)) {
        throw new Error(\`GPU Composition input \${layer.id} has no decoded source frame.\`);
      }
      stage = \`uploading \${layer.id}\`;
      layer.uploadContext.clearRect(0, 0, layer.width, layer.height);
      layer.uploadContext.drawImage(source, 0, 0, layer.width, layer.height);
      device.queue.copyExternalImageToTexture({ source: layer.upload }, { texture: layer.texture, premultipliedAlpha: false },
        { width: layer.width, height: layer.height });
      const m = sample.matrix;
      device.queue.writeBuffer(layer.uniform, 0, new Float32Array([
        m[0],m[1],m[2],0, m[3],m[4],m[5],0, m[6],m[7],m[8],0,
        sample.region[0],sample.region[1],sample.region[2],sample.region[3],
      ]));
      active.push(layer);
    }
    stage = 'creating the command encoder';
    device.pushErrorScope('validation');
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: outputTexture.createView(),
      clearValue: { r: config.clear[0], g: config.clear[1], b: config.clear[2], a: config.clear[3] },
      loadOp: 'clear', storeOp: 'store' }] });
    pass.setPipeline(pipeline);
    for (const layer of active) {
      pass.setBindGroup(0, layer.bind);
      pass.draw(3);
    }
    stage = 'submitting the composition pass';
    pass.end();
    encoder.copyTextureToBuffer({ texture: outputTexture }, { buffer: outputBuffer, bytesPerRow: outputBytesPerRow },
      { width: config.width, height: config.height });
    device.queue.submit([encoder.finish()]);
    const validation = await device.popErrorScope();
    if (validation) throw new Error(\`Dawn validation: \${validation.message}\`);
    await device.queue.onSubmittedWorkDone();
    stage = 'reading the composed frame';
    await outputBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(outputBuffer.getMappedRange());
    const pixels = new Uint8ClampedArray(config.width * config.height * 4);
    for (let y = 0; y < config.height; y += 1) {
      pixels.set(mapped.subarray(y * outputBytesPerRow, y * outputBytesPerRow + config.width * 4),
        y * config.width * 4);
    }
    outputBuffer.unmap();
    outputContext.putImageData(new ImageData(pixels, config.width, config.height), 0, 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(\`WebGPU Composition failed while \${stage}: \${message}\`);
  }
};
})();`;
}

/** Compile the GPU programme for Dawn while preserving the existing delivery providers. */
export function compileGpuCompositionProgramToWebGpuHtmlProgram(
  program: GpuCompositionProgram,
): HtmlProgram {
  assertGpuCompositionProgram(program);
  const inputById = new Map(program.inputs.map((input) => [input.id, input]));
  const artifactsByResource = new Map<string, HtmlArtifact>();
  const videoSources: HtmlVideoSource[] = [];
  const planes: string[] = [];
  const runtimeLayers: Array<{
    readonly id: string;
    readonly elementId: string;
    readonly width: number;
    readonly height: number;
    readonly samples: readonly ({ readonly matrix: readonly number[]; readonly region: readonly number[] } | null)[];
  }> = [];
  for (const [index, layer] of program.layers.entries()) {
    const input = inputById.get(layer.input)!;
    const active = spans(layer.samples);
    if (active.length === 0) continue;
    const startFrame = active[0]!.startFrame;
    const endFrameExclusive = active.at(-1)!.endFrameExclusive;
    const id = `gpu-layer-${index + 1}`;
    const elementId = `${id}-source`;
    const positions = layer.samples.map((sample) => sample?.at ?? null);
    const temporal = sampledTemporalMap(id, positions, startFrame, endFrameExclusive,
      program, input.picture.sampling.stages[0]!.target);
    videoSources.push({
      id,
      elementId,
      kind: "media",
      startFrame,
      endFrameExclusive,
      usage: { kind: "frames", spans: active },
      source: structuredClone(input.picture.source),
      sampling: composeTemporalMaps(temporal, input.picture.sampling),
    });
    const artifact = input.picture.source.source;
    if (!artifactsByResource.has(artifact.resource)) {
      artifactsByResource.set(artifact.resource, {
        id: `artifact-${artifactsByResource.size + 1}`,
        kind: "bytes",
        artifact: structuredClone(artifact),
        usage: { kind: "always" },
      });
    }
    const artifactId = artifactsByResource.get(artifact.resource)!.id;
    const extent = pictureExtent(input.picture.source);
    assert(Number.isSafeInteger(extent.width) && Number.isSafeInteger(extent.height),
      `WebGPU Composition input ${input.id} requires an integer display extent.`);
    planes.push(`<span id="${elementId}" data-hypit-media-display-plane style="position:fixed;left:-20000px;top:0;width:${extent.width}px;height:${extent.height}px;opacity:0;pointer-events:none"><span data-hypit-media-payload-host style="position:relative;display:block;width:100%;height:100%"><video muted playsinline data-hypit-artifact-src="${htmlArtifactUri(artifactId)}"></video><span data-hypit-decoded-media-slot style="position:absolute;inset:0"></span></span></span>`);
    runtimeLayers.push({
      id,
      elementId,
      width: extent.width,
      height: extent.height,
      samples: layer.samples.map((sample) => sample === null ? null : ({
        matrix: matrix(sample.mapping.transform),
        region: [sample.mapping.source.region.x, sample.mapping.source.region.y,
          sample.mapping.source.region.width, sample.mapping.source.region.height],
      })),
    });
  }
  const config = {
    width: program.canvas.width,
    height: program.canvas.height,
    frameCount: program.frameCount,
    clear: rgba(program.canvas.clearColor),
    layers: runtimeLayers,
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
#hypit-gpu-output{display:block;width:${program.canvas.width}px;height:${program.canvas.height}px}
</style></head><body><canvas id="hypit-gpu-output" width="${program.canvas.width}" height="${program.canvas.height}"></canvas>${planes.join("")}<script>${runtime(config)}</script></body></html>`;
  const document: HtmlProgram = {
    frameRate: structuredClone(program.sampling.frameRate),
    frameCount: program.frameCount,
    canvas: { width: program.canvas.width, height: program.canvas.height },
    artifacts: [...artifactsByResource.values()],
    videoSources,
    html,
  };
  assertHtmlProgram(document);
  return document;
}
