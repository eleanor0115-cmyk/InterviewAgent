import type { ExperienceAnalysis, ExperienceQuestion, JobDomain, QuestionType } from "../../src/shared/types.js";

type TagRule = {
  name: string;
  aliases: string[];
  type: QuestionType;
  domains: JobDomain[];
};

const tagRules: TagRule[] = [
  { name: "React", aliases: ["react", "hooks", "fiber", "组件", "状态管理"], type: "method_ability", domains: ["frontend"] },
  { name: "TypeScript", aliases: ["typescript", "ts", "类型", "泛型"], type: "method_ability", domains: ["frontend"] },
  { name: "Node.js", aliases: ["node", "express", "接口", "服务端"], type: "method_ability", domains: ["backend"] },
  { name: "AI Agent", aliases: ["agent", "大模型", "llm", "prompt", "rag", "ai"], type: "scenario_practice", domains: ["ai_engineering"] },
  { name: "项目深挖", aliases: ["项目", "为什么", "难点", "方案", "权衡", "指标", "效果"], type: "experience_validation", domains: ["general"] },
  { name: "系统设计", aliases: ["架构", "系统设计", "高并发", "扩展", "稳定性", "可用性"], type: "scenario_practice", domains: ["backend", "frontend"] },
  { name: "性能优化", aliases: ["性能", "优化", "缓存", "首屏", "加载", "并发"], type: "method_ability", domains: ["frontend", "backend"] },
  { name: "业务理解", aliases: ["业务", "用户", "增长", "转化", "留存", "指标", "商业"], type: "business_understanding", domains: ["operations", "product", "business"] },
  { name: "用户增长", aliases: ["用户增长", "用户分层", "拉新", "留存", "转化", "召回", "心智"], type: "scenario_practice", domains: ["operations"] },
  { name: "产品分析", aliases: ["需求", "竞品", "用户体验", "prd", "产品"], type: "scenario_practice", domains: ["product"] },
  { name: "数据分析", aliases: ["sql", "实验", "ab", "归因", "数据", "指标"], type: "method_ability", domains: ["data_analysis"] },
  { name: "沟通协作", aliases: ["协作", "沟通", "冲突", "推进", "跨部门"], type: "collaboration", domains: ["general"] },
  { name: "压力追问", aliases: ["质疑", "压力", "失败", "缺点", "不足", "真实性"], type: "pressure_challenge", domains: ["general"] },
  { name: "反问准备", aliases: ["反问", "团队目标", "业务问题", "用户分层"], type: "reverse_question", domains: ["general"] }
];

const questionOpeners = ["介绍", "讲讲", "说说", "为什么", "怎么", "如何", "是否", "有没有", "是什么", "区别", "原理"];

function normalize(text: string) {
  return text.toLowerCase();
}

function splitCandidates(text: string) {
  return text
    .split(/[\n。；;!?？！]/)
    .map((line) => line.replace(/^[-*、\d.\s]+/, "").trim())
    .filter((line) => line.length >= 4);
}

function inferTags(text: string) {
  const normalized = normalize(text);
  const tags = tagRules.filter((rule) => rule.aliases.some((alias) => normalized.includes(alias.toLowerCase()))).map((rule) => rule.name);
  return [...new Set(tags)];
}

function inferDomainTags(tags: string[]) {
  const domains = tags.flatMap((tag) => tagRules.find((rule) => rule.name === tag)?.domains ?? []);
  return [...new Set(domains.length > 0 ? domains : ["general"])] as JobDomain[];
}

function inferType(tags: string[], text: string): QuestionType {
  const normalized = normalize(text);
  if (/(反问|想请教|团队目标|业务问题)/i.test(normalized)) return "reverse_question";
  if (/(压力|质疑|失败|缺点|不足|真实性)/i.test(normalized)) return "pressure_challenge";
  if (/(沟通|协作|冲突|推进|价值观|跨部门)/i.test(normalized)) return "collaboration";
  if (/(案例|场景|方案|如果|如何做|怎么做|增长|转化|留存|系统设计)/i.test(normalized)) return "scenario_practice";
  if (/(项目|经历|为什么|权衡|指标|效果|难点|证明)/i.test(normalized)) return "experience_validation";
  if (/(原理|方法|工具|模型|框架|sql|react|node|typescript|agent|prompt)/i.test(normalized)) return "method_ability";
  if (/(业务|用户|商业|行业|公司|竞品)/i.test(normalized)) return "business_understanding";

  const matchedRule = tagRules.find((rule) => tags.includes(rule.name));
  return matchedRule?.type ?? "business_understanding";
}

function inferDifficulty(text: string, tags: string[]): "easy" | "medium" | "hard" {
  if (/(为什么|权衡|取舍|高并发|扩展|失败|压力|指标|证明|规模|10 倍|10倍)/i.test(text)) return "hard";
  if (tags.length >= 2 || /(实现|原理|优化|方案|项目)/i.test(text)) return "medium";
  return "easy";
}

function normalizeQuestion(line: string) {
  if (/[？?]$/.test(line)) return line;
  if (questionOpeners.some((opener) => line.includes(opener))) return `${line}？`;
  return `请你说明${line}。`;
}

function questionKey(question: string) {
  return question.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function extractQuestions(text: string) {
  const candidates = splitCandidates(text);
  const questionMap = new Map<string, ExperienceQuestion>();

  for (const candidate of candidates) {
    const looksLikeQuestion =
      /[？?]/.test(candidate) || questionOpeners.some((opener) => candidate.includes(opener)) || /(问|追问|面试官)/.test(candidate);

    if (!looksLikeQuestion) continue;

    const question = normalizeQuestion(candidate.replace(/^(?:面试官问|追问|问|Q)[:：\s]*/i, "").trim());
    const tags = inferTags(question);
    const finalTags = tags.length > 0 ? tags : ["项目深挖"];
    const key = questionKey(question);
    const existing = questionMap.get(key);

    if (existing) {
      existing.frequency += 1;
      continue;
    }

    questionMap.set(key, {
      question,
      type: inferType(finalTags, question),
      domainTags: inferDomainTags(finalTags),
      tags: finalTags,
      difficulty: inferDifficulty(question, finalTags),
      frequency: 1,
      source: "用户粘贴面经"
    });
  }

  return [...questionMap.values()];
}

function buildHotTags(questions: ExperienceQuestion[]) {
  const counts = new Map<string, number>();
  for (const question of questions) {
    for (const tag of question.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + question.frequency);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function levelByCount(count: number): "low" | "medium" | "high" {
  if (count >= 4) return "high";
  if (count >= 2) return "medium";
  return "low";
}

function inferCompanyStyle(questions: ExperienceQuestion[]): ExperienceAnalysis["companyStyle"] {
  const projectCount = questions.filter((question) => question.type === "experience_validation").length;
  const basicCount = questions.filter((question) => question.type === "method_ability").length;
  const pressureCount = questions.filter((question) => question.type === "pressure_challenge" || question.difficulty === "hard").length;
  const commonPatterns = new Set<string>();

  if (projectCount > 0) commonPatterns.add("喜欢围绕项目追问为什么这么设计、如何证明效果");
  if (basicCount > 0) commonPatterns.add("会检查岗位相关基础概念和实现原理");
  if (pressureCount > 0) commonPatterns.add("可能质疑项目真实性、方案权衡和指标归因");
  if (questions.some((question) => question.tags.includes("业务理解"))) commonPatterns.add("关注候选人是否能把动作和业务指标连接起来");

  return {
    projectDepth: levelByCount(projectCount),
    basicKnowledge: levelByCount(basicCount),
    pressureLevel: levelByCount(pressureCount),
    commonPatterns: [...commonPatterns]
  };
}

export function analyzeExperience(input: {
  company: string;
  jobTitle: string;
  experienceText: string;
  jdText?: string;
  resumeText?: string;
}): ExperienceAnalysis {
  const extracted = extractQuestions(input.experienceText);
  const questions = extracted.length > 0 ? extracted : [];
  const sortedQuestions = questions.sort((a, b) => b.frequency - a.frequency || difficultyRank(b.difficulty) - difficultyRank(a.difficulty));
  const hotTags = buildHotTags(sortedQuestions);
  const companyStyle = inferCompanyStyle(sortedQuestions);

  return {
    questions: sortedQuestions.slice(0, 30),
    companyStyle,
    hotTags,
    summary: {
      questionCount: sortedQuestions.length,
      hardestTags: sortedQuestions
        .filter((question) => question.difficulty === "hard")
        .flatMap((question) => question.tags)
        .filter((tag, index, arr) => arr.indexOf(tag) === index)
        .slice(0, 5),
      recommendedFocus: hotTags.slice(0, 5).map((tag) => tag.name)
    }
  };
}

function difficultyRank(difficulty: ExperienceQuestion["difficulty"]) {
  return { easy: 1, medium: 2, hard: 3 }[difficulty];
}
