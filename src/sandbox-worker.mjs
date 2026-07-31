import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const implementation = await realpath(resolve(process.argv[2]));
  const packageRoot = await realpath(resolve(process.argv[3] ?? dirname(implementation)));
  if (!inside(packageRoot, implementation)) {
    throw new Error(`Kernel implementation escapes package root: ${implementation}`);
  }

  const context = vm.createContext(Object.create(null), {
    name: "svml-kernel-projector",
    codeGeneration: { strings: false, wasm: false },
  });
  context.__svmlSha256 = value => createHash("sha256").update(value).digest("hex");
  new vm.Script(`
    Object.defineProperty(Math, "random", {
      value() { throw new Error("SVK projector cannot use ambient randomness"); },
      writable: false,
      configurable: false
    });
    globalThis.Date = class ForbiddenDate {
      constructor() { throw new Error("SVK projector cannot use wall clock time"); }
      static now() { throw new Error("SVK projector cannot use wall clock time"); }
    };
    globalThis.fetch = undefined;
    globalThis.WebSocket = undefined;
    globalThis.EventSource = undefined;
    globalThis.XMLHttpRequest = undefined;
    globalThis.process = undefined;
    globalThis.require = undefined;
  `).runInContext(context, { timeout: 250 });

  const cache = new Map();
  const loadModule = async (file) => {
    const canonical = await realpath(file);
    if (!inside(packageRoot, canonical)) {
      throw new Error(`SVK import escapes package root: ${canonical}`);
    }
    const cached = cache.get(canonical);
    if (cached) return cached;
    const source = await readFile(canonical, "utf8");
    const module = new vm.SourceTextModule(source, {
      context,
      identifier: pathToFileURL(canonical).href,
      initializeImportMeta(meta) {
        meta.url = pathToFileURL(canonical).href;
      },
      importModuleDynamically(specifier) {
        throw new Error(`Dynamic import is forbidden in SVK projectors: ${specifier}`);
      },
    });
    cache.set(canonical, module);
    await module.link(async (specifier, referencing) => {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw new Error(`Only relative SVK imports are allowed: ${specifier}`);
      }
      return loadModule(fileURLToPath(new URL(specifier, referencing.identifier)));
    });
    return module;
  };

  const module = await loadModule(implementation);
  await module.evaluate({ timeout: 1000 });
  const implementationObject = module.namespace.default;
  if (!implementationObject || typeof implementationObject.project !== "function") {
    throw new Error(`${implementation} must default-export a projector object`);
  }
  context.__svmlKernel = implementationObject;
  context.__svmlInput = await stdin();
  const output = new vm.Script(`
    (() => {
      const context = JSON.parse(globalThis.__svmlInput);
      context.resolve = value => value;
      const stableJson = value => {
        if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
        if (value && typeof value === "object") {
          return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
        }
        return JSON.stringify(value);
      };
      context.digest = value => globalThis.__svmlSha256(stableJson(value));
      const frameRange = (startSec, endSec) => {
        const startFrame = Math.round(startSec * context.fps);
        const endFrameExclusive = Math.round(endSec * context.fps);
        if (endFrameExclusive < startFrame) throw new Error("manual range resolves backwards");
        return {
          startFrame,
          endFrameExclusive,
          startSec: startFrame / context.fps,
          endSec: endFrameExclusive / context.fps
        };
      };
      const endpoint = raw => {
        const value = String(raw).trim();
        if (value === "start") return 0;
        if (value === "end") return context.program.durationSec;
        const relative = /^(start|end)([+-])(\\d+(?:\\.\\d+)?)(ms|s)$/.exec(value);
        if (relative) {
          const base = relative[1] === "start" ? 0 : context.program.durationSec;
          const amount = Number(relative[3]) * (relative[4] === "ms" ? 0.001 : 1);
          return base + (relative[2] === "+" ? amount : -amount);
        }
        const absolute = /^(\\d+(?:\\.\\d+)?)(ms|s)$/.exec(value);
        if (absolute) return Number(absolute[1]) * (absolute[2] === "ms" ? 0.001 : 1);
        throw new Error("unsupported manual time expression: " + value);
      };
      const temporalContract = (path, kind) => {
        const contract = context.temporalContracts && context.temporalContracts[path];
        if (!contract || contract.kind !== kind) {
          throw new Error("undeclared " + kind + " temporal contract: " + String(path));
        }
        return contract;
      };
      context.selection = (value, path) => {
        const contract = temporalContract(path, "selection");
        let ranges;
        if (typeof value === "string") {
          if (value === "full") ranges = [frameRange(0, context.program.durationSec)];
          else {
            const parts = value.split("..");
            if (parts.length !== 2) throw new Error("manual span requires start .. end");
            ranges = [frameRange(endpoint(parts[0]), endpoint(parts[1]))];
          }
        } else {
          ranges = value && value.ranges;
        }
        if (!ranges) throw new Error("expected SelectionSet or ProgramSpan");
        if (contract.consume === "one" && ranges.length !== 1) {
          throw new Error("temporal cardinality expected one, received " + ranges.length);
        }
        return ranges;
      };
      context.moment = (value, path) => {
        const contract = temporalContract(path, "moment");
        const frames = typeof value === "string"
          ? [Math.round(endpoint(value) * context.fps)]
          : value && value.frames;
        if (!frames) throw new Error("expected MomentSet or manual ProgramPoint");
        if (contract.consume === "one" && frames.length !== 1) {
          throw new Error("temporal cardinality expected one, received " + frames.length);
        }
        return frames;
      };
      const result = globalThis.__svmlKernel.project(context);
      if (result && typeof result.then === "function") {
        throw new Error("isolated projector ABI v1 must be synchronous");
      }
      return JSON.stringify(result);
    })()
  `).runInContext(context, { timeout: 2000 });
  if (typeof output !== "string") throw new Error("SVK projector returned no JSON result");
  process.stdout.write(output);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
