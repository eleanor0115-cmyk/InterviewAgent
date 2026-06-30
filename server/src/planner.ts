import type {
  ExperienceAnalysis,
  ExperienceQuestion,
  InterviewPlan,
  InterviewQuestion,
  InterviewSession,
  JobDomain,
  JobKeyword,
  QuestionType,
  ResumeGap,
  RiskLevel
} from "../../src/shared/types.js";

const INTERVIEW_WEIGHT = {
  jd: 0.55,
  interview: 0.3,
  gap: 0.15
} as const;

type GapLevel = "strong" | "medium" | "weak" | "unknown";

type CandidateQuestion = {
  topic: string;
  question: string;
  type: QuestionType;
  domainTags: JobDomain[];
  tags: string[];
  difficulty: "easy" | "medium" | "hard";
  expectedPoints: string[];
  jdImportance: number;
  interviewFrequency: number;
  priority: number;
  gapLevel: GapLevel;
  followUpDepth: number;
  hasResumeEvidence: boolean;
  isMissingFromResume: boolean;
  reason: string;
};

const typeLabels: Record<QuestionType, string> = {
  business_understanding: "业务理解",
  experience_validation: "经历验证",
  method_ability: "能力方法",
  scenario_practice: "场景实战",
  collaboration: "协作沟通",
  pressure_challenge: "压力追问",
  reverse_question: "反问准备"
};

const typePriority: QuestionType[] = [
  "business_understanding",
  "experience_validation",
  "method_ability",
  "scenario_practice",
  "collaboration",
  "pressure_challenge",
  "reverse_question"
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function normalizeTopic(topic: string) {
  return topic.trim().toLowerCase();
}

function typeForTopic(name: string, fallback: QuestionType = "method_ability"): QuestionType {
  if (/反问|团队目标|业务问题/.test(name)) return "reverse_question";
  if (/压力|真实性|质疑/.test(name)) return "pressure_challenge";
  if (/沟通|协作|STAR|价值观|跨部门/.test(name)) return "collaboration";
  if (/业务理解|商业|行业|公司|用户增长/.test(name)) return "business_understanding";
  if (/项目|经历|权衡|工程思考|方法论|指标|结果|表达/.test(name)) return "experience_validation";
  if (/系统|架构|场景|方案|并发|扩展|稳定|AI|Agent/i.test(name)) return "scenario_practice";
  return fallback;
}

function inferDomainsForTopic(topic: string, session: InterviewSession): JobDomain[] {
  const domains = new Set<JobDomain>(session.jobDomains?.length ? session.jobDomains : ["general"]);
  if (/React|TypeScript|性能|前端/i.test(topic)) domains.add("frontend");
  if (/Node|接口|数据库|系统|架构/i.test(topic)) domains.add("backend");
  if (/AI|Agent|Prompt|RAG|大模型/i.test(topic)) domains.add("ai_engineering");
  if (/用户增长|用户分层|留存|转化|活动/i.test(topic)) domains.add("operations");
  if (/竞品|需求|产品/i.test(topic)) domains.add("product");
  if (/SQL|数据|指标|实验/i.test(topic)) domains.add("data_analysis");
  return [...domains];
}

function riskToGapLevel(risk?: RiskLevel, hasResumeSignal = false): GapLevel {
  if (!risk) return hasResumeSignal ? "strong" : "unknown";
  if (risk === "high") return "weak";
  if (risk === "medium") return "medium";
  return "strong";
}

function getDepth(gapLevel: GapLevel) {
  if (gapLevel === "strong") return 3;
  if (gapLevel === "medium") return 2;
  return 1;
}

function splitTextChunks(text: string) {
  return text
    .split(/[\n。；;.!?？]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8);
}

function aliasesForTopic(topic: string) {
  const aliases = new Set([topic]);
  const aliasMap: Record<string, string[]> = {
    React: ["React", "ReactJS", "组件", "状态", "渲染"],
    "JavaScript (含ES6)": ["JavaScript", "ES6", "前端开发", "交互"],
    "HTML/CSS/DOM": ["HTML", "CSS", "DOM", "页面", "UI", "交互"],
    Electron: ["Electron", "桌面端", "主进程", "渲染进程", "窗口"],
    "低代码/零代码平台": ["低代码", "零代码", "配置化", "动态渲染", "组件拖拽", "数据绑定"],
    大模型应用: ["大模型", "AI", "Prompt", "Cursor", "Claude", "智能伙伴"],
    协作与责任心: ["协作", "负责", "推进", "跨系统", "统一接入"],
    设计与编码习惯: ["组件化", "复用", "抽象", "一致性", "可维护性"],
    性能优化: ["性能", "懒加载", "固定表头", "渲染时间", "1s"],
    TypeScript: ["TypeScript", "类型", "泛型", "约束"]
  };

  for (const [key, values] of Object.entries(aliasMap)) {
    if (topic.includes(key) || key.includes(topic)) {
      values.forEach((value) => aliases.add(value));
    }
  }

  if (/低代码|零代码|配置化/.test(topic)) {
    ["低代码", "零代码", "配置化", "动态渲染", "组件拖拽", "数据绑定"].forEach((value) => aliases.add(value));
  }

  if (/大模型|AI|Prompt|Agent/i.test(topic)) {
    ["大模型", "AI", "Prompt", "Agent", "LLM", "RAG", "Cursor", "Claude", "智能伙伴"].forEach((value) =>
      aliases.add(value)
    );
  }

  if (/JavaScript|ES6|JS/i.test(topic)) {
    ["JavaScript", "ES6", "JS", "条件计算", "栏次联动", "跨表校验"].forEach((value) => aliases.add(value));
  }

  if (/HTML|CSS|DOM/i.test(topic)) {
    ["HTML", "CSS", "DOM", "表格", "固定表头", "滚动", "校验提示"].forEach((value) => aliases.add(value));
  }

  if (/协议|安全|HTTP|HTTPS|跨域|XSS|CSRF/i.test(topic)) {
    ["协议", "安全", "HTTP", "HTTPS", "跨域", "XSS", "CSRF"].forEach((value) => aliases.add(value));
  }

  if (/设计|编码|质量|习惯/.test(topic)) {
    ["组件化", "复用", "抽象", "一致性", "可维护性", "高质量"].forEach((value) => aliases.add(value));
  }

  return [...aliases].filter(Boolean);
}

function includesAny(text: string, keywords: string[]) {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function trimEvidence(text: string, maxLength = 76) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function findResumeEvidence(topic: string, session: InterviewSession) {
  const aliases = aliasesForTopic(topic);
  const strengthEvidence =
    session.profileAnalysis?.resumeStrengths
      .filter((strength) => strength.matchedKeywords.some((keyword) => includesAny(keyword, aliases)) || includesAny(strength.title, aliases))
      .flatMap((strength) => strength.evidence) ?? [];
  const resumeEvidence = splitTextChunks(session.resumeText).filter((chunk) => includesAny(chunk, aliases));

  return trimEvidence(strengthEvidence[0] ?? resumeEvidence[0] ?? "");
}

function findJdEvidence(topic: string, session: InterviewSession) {
  const keyword = session.profileAnalysis?.jobKeywords.find((item) => normalizeTopic(item.name) === normalizeTopic(topic));
  const directEvidence = keyword?.evidence[0];
  const aliases = aliasesForTopic(topic);
  const jdEvidence = splitTextChunks(session.jdText).find((chunk) => includesAny(chunk, aliases));
  return trimEvidence(directEvidence ?? jdEvidence ?? "");
}

function expectedPointsForTopic(topic: string, type: QuestionType, session: InterviewSession, gap?: ResumeGap) {
  if (gap?.missingFromResume) {
    return ["承认缺口但不回避", "用相近经历做迁移", "补齐路径和最小验证", "风险边界", "可落地时间表"];
  }

  if (type === "business_understanding") {
    return ["用户和使用场景", "核心指标或商业等式", "业务约束", "岗位可贡献点", "反问承接"];
  }

  if (type === "scenario_practice") {
    return ["目标拆解", "关键约束", "方案选择", "不能照搬的边界", "验证指标"];
  }

  if (type === "collaboration") {
    return ["冲突或分歧背景", "相关方诉求", "你的推进动作", "结果数据", "复盘方法"];
  }

  if (type === "pressure_challenge") {
    return ["个人职责边界", "关键判断证据", "非执行性贡献", "可量化结果", "被追问时的补充材料"];
  }

  if (type === "reverse_question") {
    return ["业务目标", "当前问题", "用户分层或场景频次", "指标权衡", "基于回答做承接"];
  }

  const resumeEvidence = findResumeEvidence(topic, session);
  if (resumeEvidence) {
    return ["具体项目片段", "核心问题", "方案权衡", "其他方案未选原因", "结果验证", "方法论沉淀"];
  }

  const common = ["具体场景", "个人判断", "方案权衡", "结果证据", "边界和复盘"];
  const map: Record<string, string[]> = {
    "AI Agent": ["Agent 职责拆分", "结构化输出校验", "失败重试/降级", "效果评估和可观测性"],
    React: ["组件边界", "状态管理", "渲染性能", "工程可维护性"],
    TypeScript: ["类型建模", "泛型约束", "边界类型", "维护成本下降"],
    "Node.js": ["接口设计", "错误处理", "鉴权和日志", "性能定位"],
    性能优化: ["指标定义", "瓶颈定位", "优化方案", "上线前后对比"],
    业务理解: ["业务目标", "核心指标", "用户/场景", "技术方案和指标关系"],
    商业分析: ["行业模式", "公司价值主张", "竞品差异", "商业等式"],
    用户增长: ["用户分层", "增长漏斗", "实验设计", "数据验证"],
    工程思考: ["问题分析过程", "方案权衡", "未选方案原因", "方法论沉淀"],
    技术权衡: ["可选方案", "选择标准", "代价和边界", "验证方式"],
    结果量化: ["原始指标", "目标指标", "实际收益", "归因说明"],
    "STAR 表达": ["Situation", "Task", "Action", "Result"],
    沟通协作: ["冲突背景", "利益相关方", "推进动作", "最终结果"]
  };

  return map[topic] ?? common;
}

function defaultQuestionForTopic(topic: string, type: QuestionType, session: InterviewSession, gap?: ResumeGap) {
  const resumeEvidence = findResumeEvidence(topic, session);
  const jdEvidence = findJdEvidence(topic, session);

  if (/协议|安全|HTTP|HTTPS|跨域|XSS|CSRF/i.test(topic)) {
    return "HTTP/HTTPS、浏览器缓存、跨域、XSS/CSRF 里你最熟的是哪一块？请结合前端项目讲一个真实风险点，以及你会怎么定位、验证和规避。";
  }

  if (gap?.missingFromResume) {
    return [
      `JD 明确提到「${topic}」${jdEvidence ? `（${jdEvidence}）` : ""}，但你的简历里没有直接证据。`,
      "如果面试官现在追问你这块短板，请你用一个已有项目的相近经验做迁移说明：你会怎么快速补齐、做什么最小 Demo 验证、哪些风险不能乱承诺？"
    ].join("");
  }

  if (/React/i.test(topic) && resumeEvidence) {
    return `你简历里写到「${resumeEvidence}」。这个场景如果用 React 做复杂表单和业务流程，最容易失控的是组件边界、状态流转还是渲染性能？请选一个具体问题讲清：你当时怎么拆，为什么这么拆，怎么证明这个设计没有把后续维护成本推高？`;
  }

  if (/JavaScript|ES6/i.test(topic) && resumeEvidence) {
    return "你做税务申报表时会遇到大量栏次联动、跨表校验和条件计算。请讲一个你实际处理过的 JS/ES6 逻辑：规则怎么组织，异常输入怎么兜住，为什么没有把逻辑直接堆在页面事件里？";
  }

  if (/HTML|CSS|DOM/i.test(topic) && resumeEvidence) {
    return "你提到复杂表单、UI 还原和交互一致性。面对税务表格这类 DOM 密集页面，你当时怎么设计结构和样式边界？如果出现固定表头、滚动、输入态和校验提示互相影响，你会怎么定位和取舍？";
  }

  if (/大模型|AI/i.test(topic) && resumeEvidence) {
    return `你简历里写到「${resumeEvidence}」。面试官如果追问“你只是用了工具，不是做 AI 应用”，你会怎么解释你的工程思考：Prompt 怎么拆、人工校验怎么做、哪些场景不能交给模型、效果怎么衡量？`;
  }

  if (/设计与编码习惯/.test(topic) && resumeEvidence) {
    return `JD 强调高质量设计和编码。请不要讲“我会封装组件”，就用「${resumeEvidence}」这个片段说明：你怎么判断哪些逻辑该抽象、哪些不该抽象，最后如何避免过度封装？`;
  }

  if (/协作|责任心/.test(topic) && resumeEvidence) {
    return `你简历里有「${resumeEvidence}」这类跨系统或多人配合的内容。请讲一次具体推进过程：当时谁依赖谁，卡点在哪里，你怎么澄清责任和验收标准，最后结果怎么证明？`;
  }

  if (resumeEvidence) {
    const questionByType: Record<QuestionType, string> = {
      business_understanding: `结合 JD 里的「${jdEvidence || topic}」和你简历中的「${resumeEvidence}」，你觉得这个岗位真正要解决的业务问题是什么？请说清用户场景、核心指标、约束，以及你能从哪个切入点贡献。`,
      experience_validation: `不要泛泛介绍项目。就你简历里的「${resumeEvidence}」展开一个具体片段：当时最难的问题是什么、你做了哪些个人判断、结果怎么证明、复盘后沉淀了什么方法？`,
      method_ability: `围绕「${topic}」，请基于你简历里的「${resumeEvidence}」讲一次具体技术决策：为什么这么设计、还比较过哪些方案、没选的原因是什么、上线后怎么验证？`,
      scenario_practice: `如果把你做过的「${resumeEvidence}」迁移到 JD 里的「${jdEvidence || topic}」场景，你会如何改造方案？哪些地方可以复用，哪些地方不能照搬？`,
      collaboration: `你简历里的「${resumeEvidence}」看起来涉及多人或跨系统配合。请讲一次具体协作推进：分歧点是什么、你怎么澄清标准和责任、最后结果如何？`,
      pressure_challenge: `如果面试官质疑「${resumeEvidence}」主要是团队成果、你只是执行，你会拿哪 3 个证据证明自己的判断、贡献和结果？`,
      reverse_question: `围绕 JD 里的「${jdEvidence || topic}」，请设计一个不模板化的反问：要能问出团队当前目标、用户场景或指标难点，并说明你会如何基于面试官回答做一句承接。`
    };

    return questionByType[type];
  }

  const questionByType: Record<QuestionType, string> = {
    business_understanding: `不要只解释「${topic}」概念。请结合 ${session.company} / ${session.jobTitle} 的真实业务，拆出用户、场景频次、核心指标和岗位贡献点。`,
    experience_validation: `围绕「${topic}」，请选一个你真实做过的小切口讲，不要讲项目全貌：背景是什么、你负责哪一步、为什么这么做、结果如何？`,
    method_ability: `围绕「${topic}」，请用一个具体项目动作来讲你的方法，而不是背定义：问题怎么发现、方案怎么选、怎么验证有效？`,
    scenario_practice: `假设入职后第一周就遇到「${topic}」相关需求，请给出一个可执行方案：先问哪些问题、先做什么验证、怎么判断是否值得继续做？`,
    collaboration: `请讲一个和「${topic}」相关的具体协作场景：谁和谁目标不一致、你怎么推动、最后用什么结果收口？`,
    pressure_challenge: `如果面试官认为你对「${topic}」讲得太泛，你会补充哪个真实细节来证明不是背答案？`,
    reverse_question: `围绕「${topic}」设计一个业务型反问，不要问“团队规划是什么”。请把问题落到用户、指标或当前业务难点上。`
  };

  return questionByType[type];
}

function createSyllabus(jobKeywords: JobKeyword[]) {
  const total = jobKeywords.reduce((sum, keyword) => sum + keyword.weight, 0) || 1;

  return jobKeywords.map((keyword) => ({
    topic: keyword.name,
    importance: clamp(Math.round((keyword.weight / total) * 10), 1, 10),
    normalizedImportance: keyword.weight / total,
    reason: `JD 决定考纲范围：${keyword.reason}`
  }));
}

function findQuestionForTopic(topic: string, experience?: ExperienceAnalysis): ExperienceQuestion | undefined {
  const normalized = normalizeTopic(topic);
  return experience?.questions.find((question) => question.tags.some((tag) => normalizeTopic(tag) === normalized));
}

function normalizedFrequency(topic: string, experience?: ExperienceAnalysis) {
  const hotTags = experience?.hotTags ?? [];
  const max = Math.max(...hotTags.map((tag) => tag.count), 1);
  const matched = hotTags.find((tag) => normalizeTopic(tag.name) === normalizeTopic(topic));
  return matched ? matched.count / max : 0;
}

function findGap(topic: string, gaps: ResumeGap[]) {
  const normalized = normalizeTopic(topic);
  const aliases = aliasesForTopic(topic).map(normalizeTopic);

  return gaps.find((gap) => {
    const gapName = normalizeTopic(gap.name);
    return gapName === normalized || gapName.includes(normalized) || aliases.some((alias) => gapName.includes(alias));
  });
}

function hasResumeStrength(topic: string, session: InterviewSession) {
  const normalized = normalizeTopic(topic);
  return Boolean(
    session.profileAnalysis?.resumeStrengths.some((strength) =>
      strength.matchedKeywords.some((keyword) => normalizeTopic(keyword) === normalized)
    )
  );
}

function getProjectEvidence(session: InterviewSession) {
  const strengths = session.profileAnalysis?.resumeStrengths ?? [];
  const evidence = strengths
    .flatMap((strength) => strength.evidence)
    .find((item) => /项目|负责|实现|优化|校验|渲染|组件|权限|数据|上线|效率|性能/.test(item));

  return trimEvidence(evidence ?? splitTextChunks(session.resumeText)[0] ?? "", 92);
}

function hasProjectExperience(session: InterviewSession) {
  return Boolean(getProjectEvidence(session));
}

function hasAiInterviewSignal(session: InterviewSession) {
  const text = [
    session.company,
    session.jobTitle,
    session.jdText,
    session.resumeText,
    session.experienceText,
    ...(session.profileAnalysis?.jobKeywords.map((keyword) => keyword.name) ?? [])
  ].join("\n");

  return (
    session.jobDomains?.some((domain) => ["frontend", "backend", "ai_engineering"].includes(domain)) ||
    /AI|人工智能|大模型|LLM|Agent|智能体|Prompt|RAG|AIGC|ChatGPT|DeepSeek|Cursor|Copilot/i.test(text)
  );
}

function createProjectDeepDiveQuestion(session: InterviewSession): CandidateQuestion | undefined {
  const evidence = getProjectEvidence(session);
  if (!evidence) return undefined;

  return {
    topic: "项目技术决策深挖",
    question: `你简历里写到「${evidence}」。这里真正的技术难点是什么？不要说业务复杂。请展开讲当时有哪些方案可选，你为什么选现在这个，没选的方案代价是什么，最后怎么验证效果？`,
    type: "experience_validation",
    domainTags: [...new Set<JobDomain>([...(session.jobDomains ?? ["general"]), "frontend"])],
    tags: ["项目深挖", "技术决策", "技术难点"],
    difficulty: "hard",
    expectedPoints: ["先结论后展开", "技术难点而非业务难度", "方案权衡", "未选方案代价", "结果验证", "方法论沉淀"],
    jdImportance: 0.7,
    interviewFrequency: 1,
    priority: 0.68,
    gapLevel: "strong",
    followUpDepth: 3,
    hasResumeEvidence: true,
    isMissingFromResume: false,
    reason: "大厂面试优先看项目深度：有项目经历时先深挖技术决策、技术难点、权衡和表达清晰度。"
  };
}

function createAiOpenQuestions(session: InterviewSession, hasProject: boolean): CandidateQuestion[] {
  if (!hasAiInterviewSignal(session)) return [];

  const domainTags = [...new Set<JobDomain>([...(session.jobDomains ?? ["general"]), "ai_engineering"])];
  const resumeEvidence = findResumeEvidence("大模型应用", session) || getProjectEvidence(session);
  const priority = hasProject ? 0.32 : 0.42;

  return [
    {
      topic: "AI 开放判断",
      question: resumeEvidence
        ? `你简历里有「${resumeEvidence}」这类经历。现在很多候选人都会用 AI 辅助开发或分析，你怎么看 AI 的优点和局限？请结合这个经历说明哪些环节适合交给 AI，哪些必须由人做判断。`
        : "现在很多候选人都会用 AI 辅助开发或分析。你怎么看 AI 的优点和局限？请结合一个真实使用场景说明哪些环节适合交给 AI，哪些必须由人做判断。",
      type: "method_ability",
      domainTags,
      tags: ["AI 开放题", "AI 优缺点", "个人判断"],
      difficulty: "medium",
      expectedPoints: ["真实使用场景", "优点和局限", "人的判断责任", "质量验证", "不能交给模型的边界"],
      jdImportance: 0.45,
      interviewFrequency: 0.65,
      priority,
      gapLevel: "medium",
      followUpDepth: 2,
      hasResumeEvidence: Boolean(resumeEvidence),
      isMissingFromResume: false,
      reason: "AI 开放题不按八股处理，重点考察候选人对工具边界、工程判断和真实使用经验的理解。"
    },
    {
      topic: "AI 输出约束",
      question:
        "如果团队把 AI 接入代码生成、内容生成或面试准备工具，你会怎么约束它的输出，避免幻觉、隐私泄露、不可验证内容或误导用户？",
      type: "scenario_practice",
      domainTags,
      tags: ["AI 开放题", "AI 约束", "安全边界"],
      difficulty: "hard",
      expectedPoints: ["输入边界", "结构化输出", "事实校验", "人工审核", "隐私与权限", "失败处理"],
      jdImportance: 0.42,
      interviewFrequency: 0.58,
      priority: priority - 0.04,
      gapLevel: "medium",
      followUpDepth: 2,
      hasResumeEvidence: Boolean(resumeEvidence),
      isMissingFromResume: false,
      reason: "AI 相关开放题常追问如何约束模型输出，考察工程落地、风险意识和可解释方案。"
    },
    {
      topic: "AI 时代个人优势",
      question:
        "在大家都会用 AI 的情况下，你觉得自己的优势是什么？请结合一个具体经历说明你如何提出好问题、拆解任务、验证结果，并把 AI 输出转化为可交付成果。",
      type: "pressure_challenge",
      domainTags,
      tags: ["AI 开放题", "差异化优势", "压力追问"],
      difficulty: "hard",
      expectedPoints: ["问题定义", "任务拆解", "验证标准", "个人贡献", "可交付结果", "复盘沉淀"],
      jdImportance: 0.4,
      interviewFrequency: 0.5,
      priority: priority - 0.08,
      gapLevel: "medium",
      followUpDepth: 2,
      hasResumeEvidence: Boolean(resumeEvidence),
      isMissingFromResume: false,
      reason: "当 AI 工具普及后，面试会更关注候选人的问题定义、判断标准、验证能力和差异化贡献。"
    }
  ];
}

function createFundamentalQuestions(session: InterviewSession, hasProject: boolean): CandidateQuestion[] {
  const frontend = session.jobDomains?.includes("frontend") ?? /前端|React|Vue|JavaScript|HTML|CSS/i.test(session.jdText);
  if (!frontend) return [];

  const basePriority = hasProject ? 0.18 : 0.42;
  const depth = hasProject ? 2 : 3;

  return [
    {
      topic: "前端八股基础",
      question: "浏览器从输入 URL 到页面渲染，中间经历了哪些关键步骤？你挑一个最熟的环节继续展开，比如网络、缓存、DOM/CSSOM、渲染流水线或 JS 执行。",
      type: "method_ability",
      domainTags: ["frontend"],
      tags: ["八股基础", "浏览器原理"],
      difficulty: "medium",
      expectedPoints: ["先结论后展开", "网络请求", "缓存策略", "渲染流程", "可追问细节"],
      jdImportance: 0.4,
      interviewFrequency: 0.6,
      priority: basePriority,
      gapLevel: "medium",
      followUpDepth: depth,
      hasResumeEvidence: false,
      isMissingFromResume: false,
      reason: hasProject ? "有项目经历时八股保留为基础校验，不抢项目深挖主线。" : "项目证据不足时提高基础题和原理题比例。"
    },
    {
      topic: "手写代码",
      question: "请现场实现一个 debounce 或 throttle，并说明边界情况，比如 this/参数透传、首次触发、取消、定时器清理。写完后说一下你会如何测试它。",
      type: "scenario_practice",
      domainTags: ["frontend"],
      tags: ["手写代码", "力扣/手撕", "JavaScript"],
      difficulty: "medium",
      expectedPoints: ["核心实现", "边界情况", "可读性", "测试用例", "复杂度"],
      jdImportance: 0.35,
      interviewFrequency: 0.5,
      priority: hasProject ? 0.14 : 0.36,
      gapLevel: "medium",
      followUpDepth: depth,
      hasResumeEvidence: false,
      isMissingFromResume: false,
      reason: "大厂前端可能出现手写代码或力扣变体，需要保留可训练题。"
    }
  ];
}

function buildCandidates(session: InterviewSession): CandidateQuestion[] {
  const profile = session.profileAnalysis;
  const experience = session.experienceAnalysis;
  const syllabus = createSyllabus(profile?.jobKeywords ?? []);
  const gaps = profile?.gaps ?? [];
  const projectDriven = hasProjectExperience(session);

  const baseTopics =
    syllabus.length > 0
      ? syllabus
      : [
          {
            topic: "项目深挖",
            importance: 8,
            normalizedImportance: 0.5,
            reason: "缺少 JD 结构化考纲，默认从项目深挖开始。"
          },
          {
            topic: "工程思考",
            importance: 7,
            normalizedImportance: 0.3,
            reason: "缺少 JD 结构化考纲，默认考察为什么这么设计。"
          },
          {
            topic: "业务理解",
            importance: 6,
            normalizedImportance: 0.2,
            reason: "缺少 JD 结构化考纲，默认考察业务理解。"
          }
        ];

  const jdCandidates = baseTopics.map((item) => {
    const experienceQuestion = findQuestionForTopic(item.topic, experience);
    const interviewFrequency = normalizedFrequency(item.topic, experience);
    const priority = item.normalizedImportance * INTERVIEW_WEIGHT.jd + interviewFrequency * INTERVIEW_WEIGHT.interview;
    const gap = findGap(item.topic, gaps);
    const gapLevel = riskToGapLevel(gap?.risk, hasResumeStrength(item.topic, session));
    const followUpDepth = getDepth(gapLevel);
    const type = experienceQuestion?.type ?? typeForTopic(item.topic);
    const domainTags = [...new Set([...(experienceQuestion?.domainTags ?? []), ...inferDomainsForTopic(item.topic, session)])];
    const resumeEvidence = findResumeEvidence(item.topic, session);

    return {
      topic: item.topic,
      question: defaultQuestionForTopic(item.topic, type, session, gap),
      type,
      domainTags,
      tags: [...new Set([item.topic, typeLabels[type], ...(experienceQuestion?.tags ?? [])])],
      difficulty: followUpDepth >= 3 ? "hard" : experienceQuestion?.difficulty ?? "medium",
      expectedPoints: expectedPointsForTopic(item.topic, type, session, gap),
      jdImportance: item.normalizedImportance,
      interviewFrequency,
      priority: gap?.missingFromResume ? priority * 0.15 : priority,
      gapLevel,
      followUpDepth,
      hasResumeEvidence: Boolean(resumeEvidence),
      isMissingFromResume: Boolean(gap?.missingFromResume),
      reason: [
        `${item.reason}`,
        `面经决定优先级：频率归一化 ${round(interviewFrequency)}`,
        `priority = JD ${round(item.normalizedImportance)} * ${INTERVIEW_WEIGHT.jd} + 面经 ${round(interviewFrequency)} * ${INTERVIEW_WEIGHT.interview} = ${round(priority)}`,
        `Gap 不参与排序，仅控制追问深度：${gapLevel} -> ${followUpDepth}`
      ].join("；")
    };
  });

  const selectedJdCandidates = jdCandidates.filter((candidate) => {
    if (!projectDriven) return true;
    if (candidate.isMissingFromResume) return false;
    if (candidate.hasResumeEvidence) return true;

    return /八股|基础|协议|安全|JavaScript|ES6|HTML|CSS|DOM|React|TypeScript/i.test(candidate.topic);
  });

  return [
    createProjectDeepDiveQuestion(session),
    ...selectedJdCandidates,
    ...createAiOpenQuestions(session, projectDriven),
    ...createFundamentalQuestions(session, projectDriven)
  ].filter((candidate): candidate is CandidateQuestion => Boolean(candidate));
}

function buildFocusAreas(candidates: CandidateQuestion[]): InterviewPlan["focusAreas"] {
  const total = candidates.reduce((sum, candidate) => sum + candidate.priority, 0) || 1;
  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8)
    .map((candidate) => ({
      name: candidate.topic,
      weight: round(candidate.priority / total),
      reason: candidate.reason
    }));
}

function buildRounds(candidates: CandidateQuestion[], selectedTypes: QuestionType[]): InterviewPlan["rounds"] {
  const typeScores = new Map<QuestionType, { priority: number; maxDepth: number }>();

  for (const candidate of candidates) {
    const current = typeScores.get(candidate.type) ?? { priority: 0, maxDepth: 1 };
    current.priority += candidate.priority;
    current.maxDepth = Math.max(current.maxDepth, candidate.followUpDepth);
    typeScores.set(candidate.type, current);
  }

  for (const type of selectedTypes) {
    const current = typeScores.get(type) ?? { priority: 0.05, maxDepth: 1 };
    typeScores.set(type, current);
  }

  const total = [...typeScores.values()].reduce((sum, item) => sum + item.priority, 0) || 1;

  return [...typeScores.entries()]
    .sort((a, b) => {
      const scoreDiff = b[1].priority - a[1].priority;
      if (scoreDiff !== 0) return scoreDiff;
      return typePriority.indexOf(a[0]) - typePriority.indexOf(b[0]);
    })
    .slice(0, 5)
    .map(([type, item]) => ({
      type,
      questionCount: clamp(Math.round((item.priority / total) * 8), 1, 4),
      followUpDepth: item.maxDepth
    }));
}

function getSelectedQuestionTypes(session: InterviewSession): QuestionType[] {
  if (session.questionTypes?.length) return session.questionTypes;
  return ["business_understanding", "experience_validation", "method_ability", "scenario_practice"];
}

function buildInitialQuestions(candidates: CandidateQuestion[]): InterviewQuestion[] {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();

  return sorted
    .filter((candidate) => {
      if (seen.has(candidate.question)) return false;
      seen.add(candidate.question);
      return true;
    })
    .slice(0, 10)
    .map((candidate) => ({
      question: candidate.question,
      type: candidate.type,
      domainTags: candidate.domainTags,
      tags: candidate.tags,
      difficulty: candidate.difficulty,
      expectedPoints: candidate.expectedPoints,
      sourceReason: candidate.reason
    }));
}

export function createInterviewPlan(session: InterviewSession): {
  plan: InterviewPlan;
  questions: InterviewQuestion[];
} {
  const candidates = buildCandidates(session);
  const focusAreas = buildFocusAreas(candidates);

  const plan: InterviewPlan = {
    durationMinutes: 60,
    strategy: {
      mode: "three_stage_decision",
      weights: INTERVIEW_WEIGHT,
      rules: [
        "JD 决定考纲范围",
        "面经决定出题优先级",
        "Gap 不参与题目排序，只决定追问深度",
        "AI 开放题考察认知边界、约束方案和个人判断，不按八股定义题处理",
        "所有题目必须保留可解释 reason"
      ]
    },
    focusAreas,
    rounds: buildRounds(candidates, getSelectedQuestionTypes(session))
  };

  return {
    plan,
    questions: buildInitialQuestions(candidates)
  };
}
