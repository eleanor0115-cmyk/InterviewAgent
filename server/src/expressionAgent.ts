import type { ExpressionOptimization } from "../../src/shared/types.js";
import { asNumber, asRecord, asString, asStringArray, unwrapPayload } from "./agentValidation.js";
import { expressionAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

type ExpressionInput = {
  answer: string;
  question?: string;
  expectedPoints?: string[];
};

const systemPrompt = [
  "你是 InterviewAgent 的 Answer Optimization Agent，负责把候选人的回答优化成更扣题、更完整、更适合面试现场表达的版本。",
  "不要强制缩短回答，也不要追求 30 秒；如果原回答缺少关键要点，应适当补充结构、逻辑和表达承接。",
  "不要套模板，不要编造候选人没有提到的项目结果。",
  "优化目标：回答到题目要点上，先给结论，再交代背景/问题，再讲关键动作、方案权衡、个人贡献，最后用结果、验证标准或复盘收口。",
  "必须参考 question 和 expectedPoints，找出原回答没有覆盖或表达不清的部分，并把可优化建议直接落实到 optimized 里。",
  "如果原回答缺少事实或数据，只能提示需要补充，不能替候选人编数据。",
  "suggestions 输出 3-6 条可直接用于优化表达的具体修改建议，避免空泛建议。",
  "输出必须是 JSON object，不要 Markdown，不要解释。"
].join("\n");

function buildUserPrompt(input: ExpressionInput) {
  return JSON.stringify(
    {
      outputSchema: {
        original: "string",
        optimized: "string",
        structureScore: "number 0-100",
        structure: {
          conclusion: "string",
          background: "string",
          action: "string",
          result: "string"
        },
        suggestions: ["已经落实到 optimized 或需要候选人补充事实的表达建议"]
      },
      input
    },
    null,
    2
  );
}

function normalizeExpression(value: unknown): ExpressionOptimization {
  const payload = unwrapPayload(value, ["optimization", "result", "data"], "expressionResponse");
  const structure = asRecord(payload.structure, "expressionResponse.structure");

  return {
    original: asString(payload.original, "expressionResponse.original"),
    optimized: asString(payload.optimized, "expressionResponse.optimized"),
    structureScore: asNumber(payload.structureScore, "expressionResponse.structureScore", 0, 100),
    structure: {
      conclusion: asString(structure.conclusion, "expressionResponse.structure.conclusion"),
      background: asString(structure.background, "expressionResponse.structure.background"),
      action: asString(structure.action, "expressionResponse.structure.action"),
      result: asString(structure.result, "expressionResponse.structure.result")
    },
    suggestions: asStringArray(payload.suggestions, "expressionResponse.suggestions", 8)
  };
}

export async function optimizeAnswerExpression(input: ExpressionInput): Promise<ExpressionOptimization> {
  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(input) }
    ],
    expressionAgentSchema
  );

  return normalizeExpression(extractJsonObject(raw));
}
