import type { EvaluationResult, InterviewQuestion, QuestionType } from "../../src/shared/types.js";
import {
  asArray,
  asMemoryLevel,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  unwrapPayload
} from "./agentValidation.js";
import { evaluationAgentSchema } from "./agentSchemas.js";
import { executeStructuredAgent } from "./agentExecutor.js";

type EvaluationInput = Pick<InterviewQuestion, "question" | "expectedPoints" | "tags"> & {
  answer: string;
  type?: QuestionType;
};

const systemPrompt = [
  "你是 InterviewAgent 的 Evaluation Agent，负责给候选人的单题回答评分。",
  "评分必须基于当前问题、候选人回答、预期要点和标签，不要使用关键词命中规则。",
  "评分维度固定为 relevance、depth、structure、evidence、reflection，范围 0-100。",
  "relevance 看是否扣题，depth 看分析和权衡，structure 看表达组织，evidence 看数据/事实/验证，reflection 看复盘和方法论。",
  "如果是项目题，要特别判断：核心问题是否清楚、技术难点是否真实、为什么这么设计、其他方案为什么没选、个人贡献和最终效果是否可信。",
  "如果是 AI 开放题，要特别判断：是否有真实场景、是否说明 AI 适合/不适合的边界、是否有约束和验证机制、是否体现个人差异化判断。",
  "建议答案不是标准答案背诵，而是回答框架和可补充方向。",
  "memoryUpdates 只记录后续训练标签，不要包含姓名、手机、邮箱等隐私。",
  "输出必须是 JSON object，不要 Markdown，不要解释。"
].join("\n");

function buildUserPrompt(input: EvaluationInput) {
  return JSON.stringify(
    {
      outputSchema: {
        score: "number 0-100",
        dimensionScores: {
          relevance: "number 0-100",
          depth: "number 0-100",
          structure: "number 0-100",
          evidence: "number 0-100",
          reflection: "number 0-100"
        },
        strengths: ["string"],
        weaknesses: ["string"],
        missingPoints: ["string"],
        suggestedAnswer: ["string"],
        nextPractice: ["string"],
        memoryUpdates: [{ tag: "string", level: "weak | medium | strong", reason: "string" }]
      },
      input
    },
    null,
    2
  );
}

function normalizeEvaluation(value: unknown): EvaluationResult {
  const payload = unwrapPayload(value, ["evaluation", "result", "data"], "evaluationResponse");
  const dimensionScores = asRecord(payload.dimensionScores, "evaluationResponse.dimensionScores");
  const memoryUpdates = asArray(payload.memoryUpdates, "evaluationResponse.memoryUpdates")
    .map((item) => {
      const update = asRecord(item, "evaluationResponse.memoryUpdates[]");
      return {
        tag: asString(update.tag, "evaluationResponse.memoryUpdates[].tag"),
        level: asMemoryLevel(update.level, "evaluationResponse.memoryUpdates[].level"),
        reason: asString(update.reason, "evaluationResponse.memoryUpdates[].reason")
      };
    })
    .slice(0, 6);

  return {
    score: asNumber(payload.score, "evaluationResponse.score", 0, 100),
    dimensionScores: {
      relevance: asNumber(dimensionScores.relevance, "evaluationResponse.dimensionScores.relevance", 0, 100),
      depth: asNumber(dimensionScores.depth, "evaluationResponse.dimensionScores.depth", 0, 100),
      structure: asNumber(dimensionScores.structure, "evaluationResponse.dimensionScores.structure", 0, 100),
      evidence: asNumber(dimensionScores.evidence, "evaluationResponse.dimensionScores.evidence", 0, 100),
      reflection: asNumber(dimensionScores.reflection, "evaluationResponse.dimensionScores.reflection", 0, 100)
    },
    strengths: asStringArray(payload.strengths, "evaluationResponse.strengths", 8),
    weaknesses: asStringArray(payload.weaknesses, "evaluationResponse.weaknesses", 8),
    missingPoints: asStringArray(payload.missingPoints, "evaluationResponse.missingPoints", 8),
    suggestedAnswer: asStringArray(payload.suggestedAnswer, "evaluationResponse.suggestedAnswer", 8),
    nextPractice: asStringArray(payload.nextPractice, "evaluationResponse.nextPractice", 8),
    memoryUpdates
  };
}

export async function evaluateAnswer(input: EvaluationInput): Promise<EvaluationResult> {
  return executeStructuredAgent({
    agentName: "evaluation",
    schema: evaluationAgentSchema,
    messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(input) }
    ],
    normalize: normalizeEvaluation
  });
}
