import type { EvaluationResult, FollowUpQuestion, ReflectionResult } from "../../src/shared/types.js";

function hasQuestionWith(texts: string[], pattern: RegExp) {
  return texts.some((text) => pattern.test(text));
}

export function reflectInterviewResult(input: {
  question: string;
  answer: string;
  followUps: FollowUpQuestion[];
  evaluation?: EvaluationResult;
  expectedPoints: string[];
  tags: string[];
}): ReflectionResult {
  const issues: string[] = [];
  const revisedFollowUps: FollowUpQuestion[] = [];
  const followUpTexts = input.followUps.map((item) => `${item.question} ${item.reason} ${item.focus}`);
  const combined = `${input.question}\n${input.answer}\n${input.tags.join(" ")}`;
  const isAiQuestion = /AI|大模型|LLM|Agent|Prompt|RAG|幻觉|隐私/i.test(combined);

  if (!hasQuestionWith(followUpTexts, /为什么|权衡|取舍|不用|选择/)) {
    issues.push("追问缺少方案选择和技术权衡。");
    revisedFollowUps.push({
      question: "你为什么选择这个方案？当时有没有考虑过其他方案，最后为什么没有选？",
      reason: "Reflection 发现原追问没有覆盖方案权衡。",
      focus: "技术权衡"
    });
  }

  if (!hasQuestionWith(followUpTexts, /指标|验证|数据|证明|效果/)) {
    issues.push("追问缺少结果验证或指标证明。");
    revisedFollowUps.push({
      question: "这个结果你准备用什么指标证明？有没有上线前后的对比或验收标准？",
      reason: "Reflection 发现原追问没有覆盖结果证明。",
      focus: "结果验证"
    });
  }

  if (isAiQuestion && !hasQuestionWith(followUpTexts, /幻觉|隐私|边界|人工|约束|校验/)) {
    issues.push("AI 开放题缺少模型边界、幻觉或隐私约束追问。");
    revisedFollowUps.push({
      question: "如果 AI 输出出现幻觉，或者输入里包含敏感信息，你会怎么约束、校验和兜底？",
      reason: "Reflection 发现 AI 题没有追到工程边界。",
      focus: "AI 边界"
    });
  }

  if (input.evaluation && input.evaluation.score >= 85 && input.evaluation.weaknesses.length >= 3) {
    issues.push("评分较高但弱点较多，建议重新校准分数或明确扣分原因。");
  }

  if (input.evaluation && input.evaluation.score < 65 && input.evaluation.strengths.length >= 3) {
    issues.push("评分较低但亮点较多，建议确认是否过度扣分。");
  }

  const confidence = Math.max(58, 92 - issues.length * 12);

  return {
    verdict: issues.length > 0 ? "revise" : "pass",
    confidence,
    issues,
    revisedFollowUps: revisedFollowUps.slice(0, 3),
    revisedEvaluation: input.evaluation
  };
}
