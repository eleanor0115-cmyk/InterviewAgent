import type { FollowUpResult, InterviewQuestion, QuestionType } from "../../src/shared/types.js";

type FollowUpInput = Pick<InterviewQuestion, "question" | "expectedPoints" | "tags"> & {
  answer: string;
  type?: QuestionType;
  depth?: number;
};

const methodSignals = ["为什么", "选择", "权衡", "方案", "取舍", "考虑", "原因", "边界"];
const metricSignals = ["数据", "指标", "%", "提升", "降低", "转化", "留存", "耗时", "成本", "收益"];
const executionSignals = ["负责", "实现", "推进", "落地", "上线", "验证", "复盘", "协作"];
const aiSignals = ["AI", "大模型", "模型", "Prompt", "Agent", "幻觉", "隐私", "校验", "人工", "边界", "验证"];

function hasAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

function normalizeDepth(depth?: number) {
  if (!depth || Number.isNaN(depth)) return 2;
  return Math.max(1, Math.min(3, Math.round(depth)));
}

function pickMissingExpectedPoints(answer: string, expectedPoints: string[]) {
  return expectedPoints.filter((point) => {
    const keywords = point
      .split(/[，,、\s/]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);

    return keywords.length === 0 || !keywords.some((keyword) => answer.includes(keyword));
  });
}

export function generateFollowUps(input: FollowUpInput): FollowUpResult {
  const answer = input.answer.trim();
  const depth = normalizeDepth(input.depth);
  const missingPoints = pickMissingExpectedPoints(answer, input.expectedPoints);
  const followUps: FollowUpResult["followUps"] = [];
  const isAiOpenQuestion =
    input.tags.some((tag) => /AI 开放题|AI 优缺点|AI 约束|差异化优势/.test(tag)) ||
    /AI|大模型|LLM|Agent|Prompt|幻觉|隐私|Cursor|Copilot/i.test(input.question);

  if (answer.length < 80) {
    followUps.push({
      question: "你现在的回答还比较短，能按“背景-问题-方案-结果”补充一次完整版本吗？",
      reason: "回答长度不足，真实面试里容易被判断为经历不够具体。",
      focus: "结构完整性"
    });
  }

  if (isAiOpenQuestion && !hasAny(answer, aiSignals)) {
    followUps.push({
      question: "你能结合一个真实使用 AI 的场景展开吗？具体哪些步骤交给 AI，哪些判断必须由你负责？",
      reason: "AI 开放题不看概念态度，重点看真实使用过程、边界判断和人的责任。",
      focus: "AI 使用边界"
    });
  }

  if (isAiOpenQuestion && !/(约束|校验|审核|验证|风险|幻觉|隐私|权限|兜底|回滚)/.test(answer)) {
    followUps.push({
      question: "如果 AI 输出是错的、编的或泄露了不该给它的信息，你会怎么设计约束和验证机制？",
      reason: "真实 AI 应用面试常追问输出质量、隐私边界和失败处理。",
      focus: "AI 输出约束"
    });
  }

  if (isAiOpenQuestion && !/(优势|差异|判断|拆解|提问|标准|验证|交付|复盘)/.test(answer)) {
    followUps.push({
      question: "大家都会用 AI 的情况下，你的差异化优势具体体现在哪一步？是问题定义、任务拆解、验证标准，还是交付落地？",
      reason: "需要把“会用 AI”升级成“我有可验证的个人判断和交付能力”。",
      focus: "个人差异化优势"
    });
  }

  if (!hasAny(answer, methodSignals)) {
    followUps.push({
      question: "你为什么选择这个方案？当时有没有考虑过其他方案，最后为什么没有选？",
      reason: "回答里缺少设计理由和方案取舍，面试官通常会继续验证你的个人判断。",
      focus: "分析过程与权衡"
    });
  }

  if (!hasAny(answer, metricSignals)) {
    followUps.push({
      question: "这个结果你是怎么衡量的？有没有上线后的数据、指标或对比依据？",
      reason: "缺少数据支撑会让项目效果显得不够可信。",
      focus: "结果证明"
    });
  }

  if (!hasAny(answer, executionSignals)) {
    followUps.push({
      question: "这件事里你具体负责哪一部分？哪些关键动作是你亲自推进的？",
      reason: "需要区分团队成果和个人贡献，避免回答听起来像旁观复述。",
      focus: "个人贡献"
    });
  }

  for (const point of missingPoints) {
    followUps.push({
      question: `你刚才没有展开“${point}”，可以结合项目细节补充一下吗？`,
      reason: "该点属于当前问题的预期回答要素。",
      focus: point
    });
  }

  const deduped = followUps.filter(
    (item, index, list) => list.findIndex((candidate) => candidate.question === item.question) === index
  );

  return {
    followUps: deduped.slice(0, depth),
    summary:
      deduped.length > 0
        ? "建议优先补充设计理由、个人贡献和结果证明，让回答更像真实经历而不是结论复述。"
        : "这版回答已经覆盖主要信息，可以继续练习更高压的边界追问。"
  };
}
