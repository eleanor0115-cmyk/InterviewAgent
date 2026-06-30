import type { ExpressionOptimization } from "../../src/shared/types.js";

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

function firstSentence(text: string) {
  return text
    .split(/[。！？!?]/)
    .map((item) => item.replace(/^[，,、；;\s]+/, "").trim())
    .find(Boolean) ?? text.trim();
}

function compact(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function optimizeThirtySecondAnswer(input: {
  answer: string;
  question?: string;
  expectedPoints?: string[];
}): ExpressionOptimization {
  const answer = input.answer.trim();
  const conclusion = /我|核心|重点|结论|认为/.test(answer)
    ? firstSentence(answer)
    : `我的核心结论是：${compact(firstSentence(answer), 42)}`;
  const background = hasAny(answer, ["背景", "场景", "项目", "业务", "用户"])
    ? compact((answer.match(/[^。！？!?]*(背景|场景|项目|业务|用户)[^。！？!?]*/)?.[0] ?? answer).replace(/^[，,、；;\s]+/, ""), 58)
    : "这个回答需要先补一句具体项目背景和约束。";
  const action = hasAny(answer, ["方案", "设计", "实现", "拆解", "权衡", "验证"])
    ? compact((answer.match(/[^。！？!?]*(方案|设计|实现|拆解|权衡|验证)[^。！？!?]*/)?.[0] ?? answer).replace(/^[，,、；;\s]+/, ""), 72)
    : "我会补充自己的关键动作：怎么拆问题、为什么这么选、怎么验证。";
  const result = hasAny(answer, ["结果", "提升", "降低", "%", "上线", "指标", "效率"])
    ? compact((answer.match(/[^。！？!?]*(结果|提升|降低|%|上线|指标|效率)[^。！？!?]*/)?.[0] ?? answer).replace(/^[，,、；;\s]+/, ""), 58)
    : "最后需要用指标、对比或验收标准收口。";
  const optimized = [conclusion, background, action, result].join("");
  const structureScore = clampScore(
    35 +
      (conclusion ? 12 : 0) +
      (background.includes("需要") ? 0 : 14) +
      (action.includes("补充") ? 0 : 18) +
      (result.includes("需要") ? 0 : 18) +
      Math.min(answer.length / 18, 8)
  );
  const suggestions = [
    !background.includes("需要") ? "" : "补一句真实背景和约束，避免直接进入技术名词。",
    !action.includes("补充") ? "" : "把“我用了什么”改成“我为什么这样设计”。",
    !result.includes("需要") ? "" : "补结果指标、上线效果或可验收证据。",
    optimized.length > 180 ? "30 秒版本仍偏长，可以再删掉过程细节，只保留结论、动作和结果。" : ""
  ].filter(Boolean);

  return {
    original: answer,
    optimized,
    structureScore,
    structure: {
      conclusion,
      background,
      action,
      result
    },
    suggestions
  };
}
