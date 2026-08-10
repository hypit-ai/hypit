export type AnimatedWebpFrame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly disposeToBackground: boolean;
  readonly blend: boolean;
  readonly image: Uint8Array;
};

export type AnimatedWebp = {
  readonly width: number;
  readonly height: number;
  readonly background: readonly [number, number, number, number];
  readonly loopCount: number;
  readonly frames: readonly AnimatedWebpFrame[];
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function u24(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | bytes[offset + 1]! << 8 | bytes[offset + 2]! << 16;
}

function u32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function chunk(id: string, payload: Uint8Array): Uint8Array {
  const result = new Uint8Array(8 + payload.byteLength + (payload.byteLength & 1));
  for (let index = 0; index < 4; index += 1) result[index] = id.charCodeAt(index);
  new DataView(result.buffer).setUint32(4, payload.byteLength, true);
  result.set(payload, 8);
  return result;
}

function riff(chunks: readonly Uint8Array[]): Uint8Array {
  const payloadBytes = chunks.reduce((sum, value) => sum + value.byteLength, 0);
  const result = new Uint8Array(12 + payloadBytes);
  result.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(result.buffer).setUint32(4, 4 + payloadBytes, true);
  result.set([0x57, 0x45, 0x42, 0x50], 8);
  let offset = 12;
  for (const value of chunks) {
    result.set(value, offset);
    offset += value.byteLength;
  }
  return result;
}

function frameImage(payload: Uint8Array, width: number, height: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let hasAlpha = false;
  while (offset + 8 <= payload.byteLength) {
    const id = ascii(payload, offset, 4);
    const size = u32(payload, offset + 4);
    const end = offset + 8 + size;
    if (end > payload.byteLength) throw new Error("Animated WebP frame chunk is truncated");
    if (id === "ALPH") hasAlpha = true;
    if (id === "ALPH" || id === "VP8 " || id === "VP8L") {
      chunks.push(chunk(id, payload.subarray(offset + 8, end)));
    }
    offset = end + (size & 1);
  }
  if (!chunks.some((value) => ascii(value, 0, 4) === "VP8 " || ascii(value, 0, 4) === "VP8L")) {
    throw new Error("Animated WebP frame has no image payload");
  }
  if (hasAlpha && chunks.some((value) => ascii(value, 0, 4) === "VP8 ")) {
    const extended = new Uint8Array(10);
    extended[0] = 0x10;
    const widthMinusOne = width - 1;
    const heightMinusOne = height - 1;
    extended[4] = widthMinusOne & 0xff;
    extended[5] = widthMinusOne >> 8 & 0xff;
    extended[6] = widthMinusOne >> 16 & 0xff;
    extended[7] = heightMinusOne & 0xff;
    extended[8] = heightMinusOne >> 8 & 0xff;
    extended[9] = heightMinusOne >> 16 & 0xff;
    chunks.unshift(chunk("VP8X", extended));
  }
  return riff(chunks);
}

/** Parse only the animated WebP container facts FFmpeg currently cannot expose. */
export function parseAnimatedWebp(bytes: Uint8Array): AnimatedWebp | undefined {
  if (bytes.byteLength < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return undefined;
  const declaredEnd = 8 + u32(bytes, 4);
  if (declaredEnd > bytes.byteLength || declaredEnd < 12) throw new Error("WebP RIFF size is invalid");
  let width: number | undefined;
  let height: number | undefined;
  let background: readonly [number, number, number, number] = [0, 0, 0, 0];
  let loopCount = 0;
  const frames: AnimatedWebpFrame[] = [];
  let offset = 12;
  while (offset + 8 <= declaredEnd) {
    const id = ascii(bytes, offset, 4);
    const size = u32(bytes, offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > declaredEnd) throw new Error(`WebP ${id} chunk is truncated`);
    const payload = bytes.subarray(start, end);
    if (id === "VP8X") {
      if (size !== 10) throw new Error("WebP VP8X chunk is invalid");
      width = u24(payload, 4) + 1;
      height = u24(payload, 7) + 1;
    } else if (id === "ANIM") {
      if (size !== 6) throw new Error("WebP ANIM chunk is invalid");
      background = [payload[2]!, payload[1]!, payload[0]!, payload[3]!];
      loopCount = payload[4]! | payload[5]! << 8;
    } else if (id === "ANMF") {
      if (size < 16) throw new Error("WebP ANMF chunk is invalid");
      const frameWidth = u24(payload, 6) + 1;
      const frameHeight = u24(payload, 9) + 1;
      const durationMs = u24(payload, 12);
      if (durationMs < 1) throw new Error("Animated WebP frame duration must be positive");
      frames.push({
        x: u24(payload, 0) * 2,
        y: u24(payload, 3) * 2,
        width: frameWidth,
        height: frameHeight,
        durationMs,
        disposeToBackground: (payload[15]! & 1) !== 0,
        blend: (payload[15]! & 2) === 0,
        image: frameImage(payload.subarray(16), frameWidth, frameHeight),
      });
    }
    offset = end + (size & 1);
  }
  if (frames.length === 0) return undefined;
  if (width === undefined || height === undefined) throw new Error("Animated WebP has no canvas size");
  if (frames.some((frame) => frame.x + frame.width > width! || frame.y + frame.height > height!)) {
    throw new Error("Animated WebP frame escapes its canvas");
  }
  return { width, height, background, loopCount, frames };
}

function clear(canvas: Uint8Array, animation: AnimatedWebp, frame: AnimatedWebpFrame): void {
  for (let y = frame.y; y < frame.y + frame.height; y += 1) {
    for (let x = frame.x; x < frame.x + frame.width; x += 1) {
      const target = (y * animation.width + x) * 4;
      canvas.set(animation.background, target);
    }
  }
}

function blendPixel(canvas: Uint8Array, target: number, source: Uint8Array, sourceOffset: number): void {
  const sourceAlpha = source[sourceOffset + 3]!;
  if (sourceAlpha === 255) {
    canvas.set(source.subarray(sourceOffset, sourceOffset + 4), target);
    return;
  }
  if (sourceAlpha === 0) return;
  const destinationAlpha = canvas[target + 3]!;
  const inverse = 255 - sourceAlpha;
  const outputAlpha255 = sourceAlpha * 255 + destinationAlpha * inverse;
  for (let channel = 0; channel < 3; channel += 1) {
    const numerator = source[sourceOffset + channel]! * sourceAlpha * 255
      + canvas[target + channel]! * destinationAlpha * inverse;
    canvas[target + channel] = Math.round(numerator / outputAlpha255);
  }
  canvas[target + 3] = Math.round(outputAlpha255 / 255);
}

export function compositeAnimatedWebpFrame(
  canvas: Uint8Array,
  animation: AnimatedWebp,
  frame: AnimatedWebpFrame,
  decoded: Uint8Array,
): Uint8Array {
  if (decoded.byteLength !== frame.width * frame.height * 4) {
    throw new Error("Decoded WebP frame dimensions differ from the container");
  }
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const source = (y * frame.width + x) * 4;
      const target = ((frame.y + y) * animation.width + frame.x + x) * 4;
      if (frame.blend) blendPixel(canvas, target, decoded, source);
      else canvas.set(decoded.subarray(source, source + 4), target);
    }
  }
  const snapshot = canvas.slice();
  if (frame.disposeToBackground) clear(canvas, animation, frame);
  return snapshot;
}

export function createAnimatedWebpCanvas(animation: AnimatedWebp): Uint8Array {
  const canvas = new Uint8Array(animation.width * animation.height * 4);
  for (let offset = 0; offset < canvas.byteLength; offset += 4) canvas.set(animation.background, offset);
  return canvas;
}

export function pamRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.byteLength !== width * height * 4) throw new Error("PAM frame byte count is invalid");
  const header = Buffer.from(`P7\nWIDTH ${width}\nHEIGHT ${height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`, "ascii");
  return Buffer.concat([header, rgba]);
}
