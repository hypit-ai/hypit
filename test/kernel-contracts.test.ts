import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkSource } from "../src/compiler.js";

const brollKernel = fileURLToPath(
  new URL("../stdlib/broll-track.svk", import.meta.url),
);
const unsafeKernel = fileURLToPath(
  new URL("./fixtures/unsafe/unsafe.svk", import.meta.url),
);

async function checkBody(body: string): Promise<ReturnType<typeof checkSource>> {
  const directory = await mkdtemp(join(tmpdir(), "svml-kernel-contract-"));
  const file = join(directory, "main.svml");
  await writeFile(file, `<svml version="1">
  <import from="${brollKernel}"/>
  <import from="${unsafeKernel}"/>
  <script><segment id="main">Hello.</segment></script>
  <audio id="sound" src="./missing.wav"/>
  ${body}
  <unsafe id="root"/>
</svml>
`, "utf8");
  return checkSource(file);
}

test("Kernel child schemas reject unknown fields, wrong references and cardinality", async () => {
  await assert.rejects(
    checkBody('<broll-track id="broll" z="1"/>'),
    /kernel_child_cardinality/u,
  );
  await assert.rejects(
    checkBody(`
      <broll-track id="broll" z="1">
        <item id="one" source={sound} during="full"/>
      </broll-track>
    `),
    /plan_port_type/u,
  );
  await assert.rejects(
    checkBody(`
      <broll-track id="broll" z="1">
        <item id="one" source={sound} during="full" zoon="1"/>
      </broll-track>
    `),
    /kernel_field_unknown/u,
  );
});
