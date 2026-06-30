import type {
  JobKeyword,
  ProfileAnalysis,
  ResumeGap,
  ResumeStrength,
  RiskLevel
} from "../../src/shared/types.js";

type SkillRule = {
  name: string;
  aliases: string[];
  category: "frontend" | "backend" | "ai" | "data" | "quality" | "business" | "soft";
  baseWeight: number;
  prepare: string;
};

const skillRules: SkillRule[] = [
  {
    name: "React",
    aliases: ["react", "hooks", "jsx", "组件", "前端框架"],
    category: "frontend",
    baseWeight: 0.24,
    prepare: "准备组件设计、Hooks 原理、性能优化和工程实践案例。"
  },
  {
    name: "TypeScript",
    aliases: ["typescript", "ts", "类型", "泛型"],
    category: "frontend",
    baseWeight: 0.18,
    prepare: "补充类型建模、泛型约束、复杂表单类型安全相关表达。"
  },
  {
    name: "Vue",
    aliases: ["vue", "pinia", "组合式 api", "composition api"],
    category: "frontend",
    baseWeight: 0.18,
    prepare: "准备响应式原理、组件通信和工程迁移经验。"
  },
  {
    name: "Node.js",
    aliases: ["node", "node.js", "express", "fastify", "koa", "后端接口"],
    category: "backend",
    baseWeight: 0.2,
    prepare: "梳理接口设计、鉴权、错误处理、日志和性能定位案例。"
  },
  {
    name: "AI Agent",
    aliases: ["agent", "智能体", "llm", "大模型", "prompt", "rag", "ai 应用", "ai应用"],
    category: "ai",
    baseWeight: 0.24,
    prepare: "准备 Agent 职责拆分、结构化输出、失败重试和评估闭环。"
  },
  {
    name: "Prompt Engineering",
    aliases: ["prompt", "提示词", "结构化输出", "json 输出", "zod"],
    category: "ai",
    baseWeight: 0.16,
    prepare: "准备 Prompt 模板、JSON 校验、降级策略和可观测性说明。"
  },
  {
    name: "数据库",
    aliases: ["mysql", "postgresql", "sqlite", "数据库", "sql", "prisma", "索引"],
    category: "data",
    baseWeight: 0.18,
    prepare: "补齐数据模型、索引、事务、一致性和查询优化表达。"
  },
  {
    name: "工程化",
    aliases: ["vite", "webpack", "工程化", "ci", "构建", "monorepo", "eslint"],
    category: "quality",
    baseWeight: 0.14,
    prepare: "准备构建优化、代码规范、自动化检查和发布流程经验。"
  },
  {
    name: "性能优化",
    aliases: ["性能", "优化", "首屏", "缓存", "懒加载", "并发", "压测"],
    category: "quality",
    baseWeight: 0.16,
    prepare: "准备性能指标、定位方法、优化方案和上线效果数据。"
  },
  {
    name: "业务理解",
    aliases: ["业务", "指标", "增长", "转化", "用户", "场景", "需求"],
    category: "business",
    baseWeight: 0.16,
    prepare: "把技术方案和业务目标、指标、风险、收益联系起来。"
  },
  {
    name: "商业分析",
    aliases: ["行业", "商业模式", "竞品", "竞争壁垒", "商业等式", "价值主张"],
    category: "business",
    baseWeight: 0.16,
    prepare: "准备行业格局、公司价值主张、直接竞品和业务线核心商业等式。"
  },
  {
    name: "用户增长",
    aliases: ["用户增长", "增长", "留存", "转化", "拉新", "促活", "复购"],
    category: "business",
    baseWeight: 0.17,
    prepare: "准备增长漏斗、指标拆解、实验设计和数据验证案例。"
  },
  {
    name: "沟通协作",
    aliases: ["沟通", "协作", "跨部门", "推进", "owner", "负责"],
    category: "soft",
    baseWeight: 0.12,
    prepare: "准备一次跨角色推进、冲突处理或需求澄清的 STAR 案例。"
  },
  {
    name: "STAR 表达",
    aliases: ["star", "自我介绍", "面试表达", "复盘", "价值观", "压力面试"],
    category: "soft",
    baseWeight: 0.12,
    prepare: "把核心经历整理成 STAR：背景、任务、行动、结果，并埋下可追问钩子。"
  },
  {
    name: "工程思考",
    aliases: ["为什么", "权衡", "取舍", "方案", "设计", "方法论", "沉淀", "技术难点"],
    category: "quality",
    baseWeight: 0.18,
    prepare: "按背景、问题、技术难点、分析过程、方案、未选方案、效果、方法论来准备项目表达。"
  },
  {
    name: "系统设计",
    aliases: ["系统设计", "架构", "高并发", "扩展", "可用性", "限流", "降级"],
    category: "backend",
    baseWeight: 0.2,
    prepare: "准备容量估算、模块边界、状态流转、降级和监控告警。"
  }
];

const projectSignals = ["项目", "负责", "实现", "设计", "上线", "优化", "重构", "平台", "系统", "模块"];
const metricSignals = ["%", "提升", "降低", "ms", "秒", "分钟", "小时", "天", "qps", "用户", "并发", "成本"];

function normalize(text: string) {
  return text.toLowerCase();
}

function splitEvidence(text: string) {
  return text
    .split(/[\n。；;.!?？]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesAny(text: string, aliases: string[]) {
  const normalized = normalize(text);
  return aliases.some((alias) => normalized.includes(alias.toLowerCase()));
}

function findEvidence(lines: string[], aliases: string[], limit = 3) {
  return lines.filter((line) => includesAny(line, aliases)).slice(0, limit);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundWeight(value: number) {
  return Number(value.toFixed(2));
}

function riskFromWeight(weight: number, hasResumeMatch: boolean): RiskLevel {
  if (hasResumeMatch) return weight >= 0.22 ? "medium" : "low";
  if (weight >= 0.22) return "high";
  if (weight >= 0.15) return "medium";
  return "low";
}

function detectRoleDirection(jobTitle: string, jdText: string) {
  const text = normalize(`${jobTitle} ${jdText}`);

  if (/(ai|agent|llm|大模型|智能体|算法)/i.test(text)) return "AI 应用工程";
  if (/(前端|frontend|react|vue|小程序)/i.test(text)) return "前端工程";
  if (/(后端|backend|java|node|go|服务端)/i.test(text)) return "后端工程";
  if (/(产品|需求|增长|运营)/i.test(text)) return "产品与业务";
  return "综合软件工程";
}

function detectSeniority(jdText: string, resumeText: string) {
  const text = normalize(`${jdText} ${resumeText}`);

  if (/(架构|负责人|owner|主导|带领|mentor|高并发|复杂系统)/i.test(text)) return "偏高级，面试会关注架构判断和方案权衡";
  if (/(实习|校招|基础|培养|应届)/i.test(text)) return "偏校招/实习，面试会关注基础、项目真实性和学习能力";
  return "偏中级，面试会关注项目落地、技术深度和业务理解";
}

function buildJobKeywords(jdText: string) {
  const jdLines = splitEvidence(jdText);
  const matched = skillRules
    .map((rule) => {
      const evidence = findEvidence(jdLines, rule.aliases);
      if (evidence.length === 0) return undefined;

      const frequencyBoost = Math.min(evidence.length * 0.03, 0.12);
      const weight = clamp(rule.baseWeight + frequencyBoost, 0.08, 0.34);

      return {
        name: rule.name,
        weight,
        reason: `${rule.name} 在 JD 中出现，属于 ${categoryLabel(rule.category)} 能力要求。`,
        evidence
      };
    })
    .filter(Boolean) as JobKeyword[];

  if (matched.length === 0) {
    return [
      {
        name: "项目表达",
        weight: 0.24,
        reason: "JD 未出现明确技术关键词，先以项目经历和表达结构作为主要考察点。",
        evidence: jdLines.slice(0, 2)
      },
      {
        name: "业务理解",
        weight: 0.2,
        reason: "需要从岗位描述中提炼业务目标和候选人贡献。",
        evidence: jdLines.slice(0, 2)
      }
    ];
  }

  const total = matched.reduce((sum, item) => sum + item.weight, 0);
  return matched
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      weight: roundWeight(item.weight / total)
    }));
}

function categoryLabel(category: SkillRule["category"]) {
  const labels: Record<SkillRule["category"], string> = {
    frontend: "前端工程",
    backend: "后端/架构",
    ai: "AI 工程化",
    data: "数据与存储",
    quality: "工程质量",
    business: "业务理解",
    soft: "协作沟通"
  };

  return labels[category];
}

function buildResumeStrengths(resumeText: string, keywords: JobKeyword[]): ResumeStrength[] {
  const resumeLines = splitEvidence(resumeText);
  const strengths = keywords
    .map((keyword) => {
      const rule = skillRules.find((item) => item.name === keyword.name);
      const aliases = rule?.aliases ?? [keyword.name];
      const evidence = findEvidence(resumeLines, aliases, 4);

      if (evidence.length === 0) return undefined;

      const hasProjectSignal = evidence.some((line) => projectSignals.some((signal) => line.includes(signal)));
      return {
        title: hasProjectSignal ? `${keyword.name} 项目经验匹配` : `${keyword.name} 能力有简历证据`,
        evidence,
        matchedKeywords: [keyword.name]
      };
    })
    .filter(Boolean) as ResumeStrength[];

  const projectEvidence = resumeLines
    .filter((line) => projectSignals.some((signal) => line.includes(signal)))
    .slice(0, 3);

  if (projectEvidence.length > 0) {
    strengths.unshift({
      title: "具备可追问的项目经历",
      evidence: projectEvidence,
      matchedKeywords: keywords.slice(0, 3).map((keyword) => keyword.name)
    });
  }

  const metricEvidence = resumeLines
    .filter((line) => metricSignals.some((signal) => normalize(line).includes(signal.toLowerCase())))
    .slice(0, 3);

  if (metricEvidence.length > 0) {
    strengths.push({
      title: "简历中出现结果指标",
      evidence: metricEvidence,
      matchedKeywords: ["业务结果", "量化表达"]
    });
  }

  return dedupeByTitle(strengths).slice(0, 6);
}

function buildGaps(jdText: string, resumeText: string, keywords: JobKeyword[]): ResumeGap[] {
  const jdLines = splitEvidence(jdText);
  const resumeLines = splitEvidence(resumeText);

  const keywordGaps = keywords.map((keyword) => {
    const rule = skillRules.find((item) => item.name === keyword.name);
    const aliases = rule?.aliases ?? [keyword.name];
    const resumeEvidence = findEvidence(resumeLines, aliases);
    const missingFromResume = resumeEvidence.length === 0;
    const risk = riskFromWeight(keyword.weight, !missingFromResume);

    return {
      name: keyword.name,
      risk,
      suggestion: missingFromResume
        ? `${rule?.prepare ?? `补充 ${keyword.name} 的项目案例、技术细节和结果指标。`}`
        : `已有 ${keyword.name} 证据，建议继续准备实现细节、权衡取舍和失败边界。`,
      missingFromResume,
      jdEvidence: keyword.evidence.length > 0 ? keyword.evidence : findEvidence(jdLines, aliases)
    };
  });

  const hasMetric = metricSignals.some((signal) => normalize(resumeText).includes(signal.toLowerCase()));
  if (!hasMetric) {
    keywordGaps.push({
      name: "结果量化",
      risk: "medium",
      suggestion: "为核心项目补充上线效果、性能指标、效率提升或业务收益，避免只讲做了什么。",
      missingFromResume: true,
      jdEvidence: jdLines.slice(0, 2)
    });
  }

  const hasTradeoff = /(权衡|取舍|为什么|方案|对比|替代|trade[- ]?off)/i.test(resumeText);
  if (!hasTradeoff) {
    keywordGaps.push({
      name: "技术权衡",
      risk: "medium",
      suggestion: "准备每个核心方案为什么这么做、为什么不用其他方案、边界和代价是什么。",
      missingFromResume: true,
      jdEvidence: jdLines.slice(0, 2)
    });
  }

  return keywordGaps.sort((a, b) => riskRank(b.risk) - riskRank(a.risk)).slice(0, 8);
}

function riskRank(risk: RiskLevel) {
  return { low: 1, medium: 2, high: 3 }[risk];
}

function dedupeByTitle(items: ResumeStrength[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.title)) return false;
    seen.add(item.title);
    return true;
  });
}

function calculateMatchScore(keywords: JobKeyword[], strengths: ResumeStrength[], gaps: ResumeGap[]) {
  const matchedNames = new Set(strengths.flatMap((strength) => strength.matchedKeywords));
  const weightedMatch = keywords.reduce((sum, keyword) => {
    return sum + (matchedNames.has(keyword.name) ? keyword.weight : keyword.weight * 0.35);
  }, 0);
  const highRiskPenalty = gaps.filter((gap) => gap.risk === "high").length * 7;
  const mediumRiskPenalty = gaps.filter((gap) => gap.risk === "medium").length * 3;

  return Math.round(clamp(weightedMatch * 100 - highRiskPenalty - mediumRiskPenalty + 12, 35, 92));
}

export function analyzeProfile(input: {
  company: string;
  jobTitle: string;
  jdText: string;
  resumeText: string;
}): ProfileAnalysis {
  const jobKeywords = buildJobKeywords(input.jdText);
  const resumeStrengths = buildResumeStrengths(input.resumeText, jobKeywords);
  const gaps = buildGaps(input.jdText, input.resumeText, jobKeywords);
  const matchScore = calculateMatchScore(jobKeywords, resumeStrengths, gaps);

  return {
    jobKeywords,
    resumeStrengths,
    gaps,
    summary: {
      matchScore,
      roleDirection: detectRoleDirection(input.jobTitle, input.jdText),
      senioritySignal: detectSeniority(input.jdText, input.resumeText),
      preparationPriority: gaps.slice(0, 4).map((gap) => gap.name)
    }
  };
}
