import { nanoid } from "nanoid";
import type { ChatMessage, JsonSchemaDefinition } from "./llmClient.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

type CompletionFunction = typeof createStructuredChatCompletion;

export async function executeStructuredAgent<T>(input: {
  agentName: string;
  schema: JsonSchemaDefinition;
  messages: ChatMessage[];
  normalize: (value: unknown) => T;
  schemaVersion?: string;
  maxValidationRepairs?: number;
  complete?: CompletionFunction;
}) {
  const traceId = nanoid(12);
  const schemaVersion = input.schemaVersion ?? "v1";
  const maxValidationRepairs = input.maxValidationRepairs ?? 1;
  const complete = input.complete ?? createStructuredChatCompletion;
  let raw = await complete(input.messages, input.schema, {
    traceId,
    agentName: input.agentName,
    schemaVersion
  });

  for (let repairAttempt = 0; ; repairAttempt += 1) {
    try {
      return input.normalize(extractJsonObject(raw));
    } catch (error) {
      if (repairAttempt >= maxValidationRepairs) throw error;
      const message = error instanceof Error ? error.message : String(error);
      raw = await complete(
        [
          {
            role: "system",
            content: [
              "你是严格的 JSON 修复器。",
              "只修复字段、类型、枚举和缺失值，使结果满足给定 JSON Schema。",
              "不要改变原任务含义，不要补充解释或 Markdown。"
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              schema: input.schema.schema,
              validationError: message,
              invalidOutput: raw
            })
          }
        ],
        input.schema,
        {
          traceId,
          agentName: `${input.agentName}_repair`,
          schemaVersion
        }
      );
    }
  }
}
