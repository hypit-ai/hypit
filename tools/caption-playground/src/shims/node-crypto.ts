const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);

const rotr = (value: number, bits: number): number => ((value >>> bits) | (value << (32 - bits))) >>> 0;

export function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const padded = new Uint8Array(((((bytes.length + 8) / 64) | 0) + 1) * 64);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer); const bits = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x1_0000_0000), false);
  view.setUint32(padded.length - 4, bits >>> 0, false);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const x = w[index - 15]!; const y = w[index - 2]!;
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) >>> 0;
    }
    let a=h[0]!,b=h[1]!,c=h[2]!,d=h[3]!,e=h[4]!,f=h[5]!,g=h[6]!,s=h[7]!;
    for (let index = 0; index < 64; index += 1) {
      const s1 = (rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0;
      const t1 = (s+s1+((e&f)^(~e&g))+K[index]!+w[index]!)>>>0;
      const s0 = (rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0;
      const t2 = (s0+((a&b)^(a&c)^(b&c)))>>>0;
      s=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    h[0]=(h[0]!+a)>>>0;h[1]=(h[1]!+b)>>>0;h[2]=(h[2]!+c)>>>0;h[3]=(h[3]!+d)>>>0;
    h[4]=(h[4]!+e)>>>0;h[5]=(h[5]!+f)>>>0;h[6]=(h[6]!+g)>>>0;h[7]=(h[7]!+s)>>>0;
  }
  return [...h].map((value) => value.toString(16).padStart(8,"0")).join("");
}

const encoder = new TextEncoder();
class Sha256Hash {
  #chunks: Uint8Array[] = [];
  update(chunk: string | Uint8Array): this { this.#chunks.push(typeof chunk === "string" ? encoder.encode(chunk) : chunk); return this; }
  digest(encoding?: string): string {
    if (encoding !== undefined && encoding !== "hex") throw new Error(`crypto shim supports hex, not ${encoding}`);
    const size = this.#chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const joined = new Uint8Array(size); let cursor = 0;
    for (const chunk of this.#chunks) { joined.set(chunk, cursor); cursor += chunk.length; }
    return sha256Hex(joined);
  }
}
export function createHash(algorithm: string): Sha256Hash {
  if (algorithm !== "sha256") throw new Error(`crypto shim supports sha256, not ${algorithm}`);
  return new Sha256Hash();
}
export default { createHash };
