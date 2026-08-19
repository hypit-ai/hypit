import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const service = join(dirname(fileURLToPath(import.meta.url)), "..");

test("the stack owns the complete service without granting media semantics extra authority", async () => {
  const template = await readFile(join(service, "template.yaml"), "utf8");
  for (const resource of [
    "AWS::Logs::LogGroup",
    "AWS::IAM::Role",
    "AWS::Lambda::LayerVersion",
    "AWS::Lambda::Function",
    "AWS::Lambda::Version",
  ]) assert.equal(template.includes(resource), true, `${resource} is absent from the stack`);

  assert.match(template, /s3:GetObject[\s\S]*s3:PutObject/u);
  assert.doesNotMatch(template, /Action:\s*["']?s3:\*/u);
  assert.doesNotMatch(template, /Resource:\s*["']?\*["']?/u);
  assert.match(template, /ReservedConcurrentExecutions: !Ref ReservedConcurrency/u);
  assert.match(template, /UpdateRuntimeOn: FunctionUpdate/u);
  assert.match(template, /HYPIT_FFMPEG_LIBRARY_PATH: \/opt\/lib/u);
  assert.equal((template.match(/DeletionPolicy: RetainExceptOnCreate/gu) ?? []).length, 3);
  assert.equal((template.match(/UpdateReplacePolicy: Retain/gu) ?? []).length, 3);
  assert.match(template, /FunctionVersionArn:[\s\S]*MediaFunctionVersion/u);
  assert.doesNotMatch(template, /!Join \[":", \[!GetAtt MediaFunction\.Arn/u);
});

test("deployment separates reviewable planning from exact change-set execution", async () => {
  const script = await readFile(join(service, "deploy.sh"), "utf8");
  assert.match(script, /operation[^\n]+plan/u);
  assert.match(script, /operation[^\n]+apply/u);
  assert.match(script, /cloudformation create-change-set/u);
  assert.match(script, /cloudformation describe-change-set/u);
  assert.match(script, /cloudformation execute-change-set/u);
  assert.doesNotMatch(script, /cloudformation deploy/u);
  assert.match(script, /functions\/\$\{function_hash\}\.zip/u);
  assert.match(script, /layers\/\$\{layer_hash\}\.zip/u);
});

test("the Layer builder pins source, architecture, license and the only installed surface", async () => {
  const builder = await readFile(join(service, "build-layer.mjs"), "utf8");
  assert.match(builder, /38f5363bef58d74547e5055846d76d8b20bb2872a87b0aab71611b010b437a6f/u);
  assert.match(builder, /linux64-gpl-shared-8\.0\.tar\.xz/u);
  assert.match(builder, /\["bin\/ffmpeg", "bin\/ffprobe", "lib", "LICENSE\.txt"\]/u);
  assert.match(builder, /magic\.readUInt16LE\(18\) !== 62/u);
  assert.match(builder, /GPL-3\.0-or-later/u);
  assert.match(builder, /verbatimSymlinks: true/u);
  assert.match(builder, /isAbsolute\(target\)/u);
  assert.match(builder, /await stat\(resolved\)/u);
});
