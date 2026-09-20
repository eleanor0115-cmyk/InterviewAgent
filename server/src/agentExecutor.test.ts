import assert from "node:assert/strict";
import test from "node:test";
import { executeStructuredAgent } from "./agentExecutor.js";

const schema = {
  name: "executor_test",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: { value: { type: "number" } }
  }
};

test("AgentExecutor 在校验失败后统一修复一次", async () => {
  const outputs = ['{"wrong":1}', '{"value":2}'];
  const calls: string[] = [];
  const result = await executeStructuredAgent({
    agentName: "test_agent",
    schema,
    messages: [{ role: "user", content: "test" }],
    complete: async (_messages, _schema, context) => {
      calls.push(context?.agentName ?? "");
      return outputs.shift() ?? "{}";
    },
    normalize: (value) => {
      const record = value as Record<string, unknown>;
      if (typeof record.value !== "number") throw new Error("value is required");
      return record.value;
    }
  });

  assert.equal(result, 2);
  assert.deepEqual(calls, ["test_agent", "test_agent_repair"]);
});

test("AgentExecutor 超过修复次数后返回校验错误", async () => {
  await assert.rejects(
    executeStructuredAgent({
      agentName: "test_agent",
      schema,
      messages: [{ role: "user", content: "test" }],
      complete: async () => "{}",
      maxValidationRepairs: 1,
      normalize: () => {
        throw new Error("invalid result");
      }
    }),
    /invalid result/
  );
});
