import type { EvaluationResult, FollowUpQuestion, ReflectionResult } from "../../src/shared/types.js";
import {
  asArray,
  asEnum,
  asMemoryLevel,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  unwrapPayload
} from "./agentValidation.js";
import { reflectionAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";

type ReflectionInput = {
  question: string;
  answer: string;
  followUps: FollowUpQuestion[];
  evaluation?: EvaluationResult;
  expectedPoints: string[];
  tags: string[];
};

const systemPrompt = [
  "你是 InterviewAgent 的 Reflection Agent，负责复查追问和评分是否一致、是否遗漏关键追问。",
  "不要用固定检查规则；要结合问题、回答、追问、评分结果做二次判断。",
  "如果原追问已经足够，verdict 输出 pass；如果缺少关键追问或评分明显矛盾，输出 revise 并给出 revisedFollowUps/revisedEvaluation。",
  "AI 开放题要检查是否覆盖真实场景、人的判断边界、约束验证、幻觉/隐私风险和个人差异化优势。",
  "输出必须是 JSON object，不要 Markdown，不要解释。"
].join("\n");

function buildUserPrompt(input: ReflectionInput) {
  return JSON.stringify(
    {
      outputSchema: {
        verdict: "pass | revise",
        confidence: "number 0-100",
        issues: ["string"],
        revisedFollowUps: [{ question: "string", reason: "string", focus: "string" }],
        revisedEvaluation: "可选，结构同 EvaluationResult"
      },
      input
    },
    null,
    2
  );
}

function normalizeFollowUps(value: unknown): FollowUpQuestion[] {
  return asArray(value, "reflectionResponse.revisedFollowUps")
    .map((item) => {
      const followUp = asRecord(item, "reflectionResponse.revisedFollowUps[]");
      return {
        question: asString(followUp.question, "reflectionResponse.revisedFollowUps[].question"),
        reason: asString(followUp.reason, "reflectionResponse.revisedFollowUps[].reason"),
        focus: asString(followUp.focus, "reflectionResponse.revisedFollowUps[].focus")
      };
    })
    .slice(0, 3);
}

function normalizeEvaluation(value: unknown): EvaluationResult | undefined {
  if (!value) return undefined;
  const payload = asRecord(value, "reflectionResponse.revisedEvaluation");
  const dimensionScores = asRecord(payload.dimensionScores, "reflectionResponse.revisedEvaluation.dimensionScores");
  const memoryUpdates = asArray(payload.memoryUpdates ?? [], "reflectionResponse.revisedEvaluation.memoryUpdates")
    .map((item) => {
      const update = asRecord(item, "reflectionResponse.revisedEvaluation.memoryUpdates[]");
      return {
        tag: asString(update.tag, "reflectionResponse.revisedEvaluation.memoryUpdates[].tag"),
        level: asMemoryLevel(update.level, "reflectionResponse.revisedEvaluation.memoryUpdates[].level"),
        reason: asString(update.reason, "reflectionResponse.revisedEvaluation.memoryUpdates[].reason")
      };
    })
    .slice(0, 6);

  return {
    score: asNumber(payload.score, "reflectionResponse.revisedEvaluation.score", 0, 100),
    dimensionScores: {
      relevance: asNumber(dimensionScores.relevance, "reflectionResponse.revisedEvaluation.dimensionScores.relevance", 0, 100),
      depth: asNumber(dimensionScores.depth, "reflectionResponse.revisedEvaluation.dimensionScores.depth", 0, 100),
      structure: asNumber(dimensionScores.structure, "reflectionResponse.revisedEvaluation.dimensionScores.structure", 0, 100),
      evidence: asNumber(dimensionScores.evidence, "reflectionResponse.revisedEvaluation.dimensionScores.evidence", 0, 100),
      reflection: asNumber(dimensionScores.reflection, "reflectionResponse.revisedEvaluation.dimensionScores.reflection", 0, 100)
    },
    strengths: asStringArray(payload.strengths ?? [], "reflectionResponse.revisedEvaluation.strengths", 8),
    weaknesses: asStringArray(payload.weaknesses ?? [], "reflectionResponse.revisedEvaluation.weaknesses", 8),
    missingPoints: asStringArray(payload.missingPoints ?? [], "reflectionResponse.revisedEvaluation.missingPoints", 8),
    suggestedAnswer: asStringArray(payload.suggestedAnswer ?? [], "reflectionResponse.revisedEvaluation.suggestedAnswer", 8),
    nextPractice: asStringArray(payload.nextPractice ?? [], "reflectionResponse.revisedEvaluation.nextPractice", 8),
    memoryUpdates
  };
}

function normalizeReflection(value: unknown): ReflectionResult {
  const payload = unwrapPayload(value, ["reflection", "result", "data"], "reflectionResponse");

  return {
    verdict: asEnum(payload.verdict, ["pass", "revise"] as const, "reflectionResponse.verdict"),
    confidence: asNumber(payload.confidence, "reflectionResponse.confidence", 0, 100),
    issues: asStringArray(payload.issues, "reflectionResponse.issues", 8),
    revisedFollowUps: normalizeFollowUps(payload.revisedFollowUps ?? []),
    revisedEvaluation: normalizeEvaluation(payload.revisedEvaluation)
  };
}

export async function reflectInterviewResult(input: ReflectionInput): Promise<ReflectionResult> {
  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(input) }
    ],
    reflectionAgentSchema
  );

  return normalizeReflection(extractJsonObject(raw));
}
