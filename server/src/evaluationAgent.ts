import type { EvaluationResult, InterviewQuestion, QuestionType } from "../../src/shared/types.js";

type EvaluationInput = Pick<InterviewQuestion, "question" | "expectedPoints" | "tags"> & {
  answer: string;
  type?: QuestionType;
};

const signalGroups = {
  structure: ["首先", "其次", "最后", "第一", "第二", "背景", "问题", "方案", "结果", "总结"],
  depth: ["为什么", "权衡", "取舍", "边界", "复杂度", "架构", "设计", "风险", "验证"],
  evidence: ["数据", "%", "提升", "降低", "上线", "指标", "转化", "留存", "成本", "收益"],
  reflection: ["复盘", "沉淀", "方法论", "下次", "不足", "改进", "经验"],
  aiJudgment: ["AI", "大模型", "Prompt", "Agent", "幻觉", "隐私", "人工", "校验", "约束", "可验证", "边界"]
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreBySignals(answer: string, signals: string[]) {
  const matched = signals.filter((signal) => answer.includes(signal)).length;
  return clampScore(45 + matched * 12);
}

function expectedPointHit(answer: string, point: string) {
  const words = point
    .split(/[，,、\s/]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return words.length > 0 && words.some((word) => answer.includes(word));
}

function getMissingPoints(answer: string, expectedPoints: string[]) {
  return expectedPoints.filter((point) => !expectedPointHit(answer, point));
}

function buildStrengths(scores: EvaluationResult["dimensionScores"]) {
  const strengths: string[] = [];
  if (scores.structure >= 70) strengths.push("回答有基本结构，面试官比较容易跟上你的叙述。");
  if (scores.depth >= 70) strengths.push("有解释方案原因和权衡，能体现个人思考。");
  if (scores.evidence >= 70) strengths.push("包含结果或指标意识，项目可信度更高。");
  if (scores.reflection >= 70) strengths.push("有复盘和方法论沉淀，能从经历上升到能力。");
  return strengths.length > 0 ? strengths : ["回答已经覆盖问题本身，可以继续补强细节和证据。"];
}

function buildWeaknesses(scores: EvaluationResult["dimensionScores"], missingPoints: string[]) {
  const weaknesses: string[] = [];
  if (scores.structure < 65) weaknesses.push("结构不够清晰，建议按“背景-问题-方案-结果-复盘”重组。");
  if (scores.depth < 65) weaknesses.push("方案选择的原因和取舍不够明显，容易被继续追问“为什么”。");
  if (scores.evidence < 65) weaknesses.push("缺少指标、数据或对比依据，结果说服力偏弱。");
  if (scores.reflection < 65) weaknesses.push("方法论沉淀不足，还没有把项目经验转成可迁移能力。");
  if (missingPoints.length > 0) weaknesses.push(`预期要点仍缺少：${missingPoints.slice(0, 3).join("、")}。`);
  return weaknesses;
}

function buildSuggestedAnswer(input: EvaluationInput) {
  const isAiOpenQuestion =
    input.tags.some((tag) => /AI 开放题|AI 优缺点|AI 约束|差异化优势/.test(tag)) ||
    /AI|大模型|LLM|Agent|Prompt|幻觉|隐私|Cursor|Copilot/i.test(input.question);

  if (isAiOpenQuestion) {
    return [
      "先用一句话说明你对 AI 的判断：它适合提升效率和扩展思路，但不能替代问题定义、事实校验和最终责任。",
      "再结合一个真实场景讲任务如何拆分：哪些步骤交给 AI，哪些关键判断、边界设定和验收标准由你负责。",
      "最后补充约束机制和个人优势：结构化输出、人工审核、隐私边界、结果验证，以及你如何把 AI 输出变成可交付成果。"
    ];
  }

  return [
    "先用一句话交代项目背景和你负责的范围。",
    "再说明核心问题、约束条件和你为什么选择该方案。",
    "补充关键动作、协作对象、指标结果，以及这件事沉淀出的方法论。"
  ];
}

export function evaluateAnswer(input: EvaluationInput): EvaluationResult {
  const answer = input.answer.trim();
  const missingPoints = getMissingPoints(answer, input.expectedPoints);
  const relevance = clampScore(100 - missingPoints.length * 14 + Math.min(answer.length / 12, 15));
  const dimensionScores = {
    relevance,
    depth: scoreBySignals(answer, signalGroups.depth),
    structure: scoreBySignals(answer, signalGroups.structure),
    evidence: scoreBySignals(answer, signalGroups.evidence),
    reflection: scoreBySignals(answer, signalGroups.reflection)
  };
  const score = clampScore(
    dimensionScores.relevance * 0.28 +
      dimensionScores.depth * 0.24 +
      dimensionScores.structure * 0.18 +
    dimensionScores.evidence * 0.18 +
    dimensionScores.reflection * 0.12
  );
  const weaknesses = buildWeaknesses(dimensionScores, missingPoints);
  const weakTags = input.tags.filter((tag) => missingPoints.some((point) => point.includes(tag) || tag.includes(point)));
  const memoryTags = weakTags.length > 0 ? weakTags : score < 70 ? input.tags.slice(0, 2) : input.tags.slice(0, 1);

  return {
    score,
    dimensionScores,
    strengths: buildStrengths(dimensionScores),
    weaknesses,
    missingPoints,
    suggestedAnswer: buildSuggestedAnswer(input),
    nextPractice:
      weaknesses.length > 0
        ? weaknesses.slice(0, 3)
        : ["继续练习高压追问，把边界条件、失败预案和复盘讲得更自然。"],
    memoryUpdates: memoryTags.map((tag) => ({
      tag,
      level: score >= 82 ? "strong" : score >= 70 ? "medium" : "weak",
      reason: score >= 82 ? "本轮回答覆盖较充分。" : "本轮回答仍需要继续练习。"
    }))
  };
}
