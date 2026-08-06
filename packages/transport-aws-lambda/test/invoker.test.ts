import assert from "node:assert/strict";
import test from "node:test";

import {
  AwsLambdaJsonInvoker,
} from "@svml/transport-aws-lambda";
import type { LambdaInvocationClient } from "@svml/transport-aws-lambda";

test("Lambda transport uses synchronous JSON and leaves Endpoint semantics to its caller", async () => {
  let invocation: Parameters<LambdaInvocationClient["invoke"]>[0] | undefined;
  const client: LambdaInvocationClient = {
    async invoke(input) {
      invocation = input;
      const request = JSON.parse(new TextDecoder().decode(input.payload));
      return {
        statusCode: 200,
        payload: new TextEncoder().encode(JSON.stringify({ accepted: request.job })),
      };
    },
  };
  const transport = new AwsLambdaJsonInvoker({
    functionName: "whisperx-dev",
    qualifier: "live",
    client,
  });
  assert.deepEqual(await transport.invoke({ job: "operation:1" }), { accepted: "operation:1" });
  assert.equal(invocation?.functionName, "whisperx-dev");
  assert.equal(invocation?.qualifier, "live");
});

test("Lambda function errors and invalid JSON responses fail at the transport boundary", async () => {
  const failed = new AwsLambdaJsonInvoker({
    functionName: "failed",
    client: {
      async invoke() {
        return {
          statusCode: 200,
          functionError: "Unhandled",
          payload: new TextEncoder().encode('{"message":"boom"}'),
        };
      },
    },
  });
  await assert.rejects(failed.invoke({}), /failed \(Unhandled\)/u);

  const invalid = new AwsLambdaJsonInvoker({
    functionName: "invalid",
    client: {
      async invoke() {
        return {
          statusCode: 200,
          payload: new TextEncoder().encode('{"value":'),
        };
      },
    },
  });
  await assert.rejects(invalid.invoke({}), /JSON/u);
});
