import type { ProfileAnalysis } from "../../src/shared/types.js";
import { extractJsonObject, createJsonChatCompletion, hasLlmConfig } from "./llmClient.js";
import { profileAnalysisSchema } from "./schemas.js";

type ProfileAgentInput = {
  company: string;
  jobTitle: string;
  jdText: string;
  resumeText: string;
};

const systemPrompt = [
  "你是 InterviewAgent 的 Profile Analyzer Agent。",
  "任务：基于公司、岗位 JD 和候选人简历，输出结构化岗位关键词、简历优势、能力短板和准备优先级。",
  "分析时先建立业务上下文：宏观行业、微观公司、业务线/产品线的核心商业等式。最终只输出规定 JSON，但 reason、suggestion、summary 要体现这些判断。",
  "提取岗位关键词时，要区分硬技能和软技能。硬技能包括技术栈、增长、数据、系统设计、AI 工程化等；软技能包括跨部门协同、owner 意识、需求澄清、项目推进、抗压沟通等。",
  "简历优势不能只写做了什么，要判断候选人是否体现工程思考：项目背景、核心问题、技术难点、分析过程、方案选择、未选方案、最终效果、方法论沉淀。",
  "能力短板要优先指出会被真实面试追问的风险：为什么这么设计、为什么不用其他方案、指标如何证明、规模扩大后怎么办、候选人是主导还是参与。",
  "建议要能直接转化为面试准备动作，例如 2 分钟自我介绍钩子、STAR 回答素材、高压追问准备、差异化话术、业务型反问或项目表达升级。",
  "summary.preparationPriority 必须输出 3-4 个短标签，不要写完整句；每项 4-10 个中文字符，例如：项目深挖、技术权衡、量化结果、AI 边界、反问准备、基础巩固。",
  "如果 JD、岗位名称、简历或面经出现 AI、大模型、LLM、Agent、Prompt、RAG、Copilot、Cursor 等信号，必须把 AI 开放题纳入准备重点：AI 的优点和局限、对 AI 的看法、如何约束 AI 输出、如何避免幻觉/隐私泄露/不可验证内容、大家都用 AI 时候选人的差异化优势。",
  "AI 开放题不要写成概念背诵或价值观口号，必须要求候选人结合真实项目或工具使用过程，说明问题定义、任务拆解、哪些环节适合交给 AI、哪些必须由人判断、验证标准、风险边界和最终可交付结果。",
  "反问建议不要模板化，要基于业务目标、用户分层、场景频次、团队当前问题、岗位贡献和指标权衡，并引导候选人在面试官回答后做一句自己的理解承接。",
  "输出不要像背 AI 答案；保持具体、克制、可追问，避免空泛词。",
  "必须只输出一个 JSON 对象，不要 Markdown，不要解释。",
  "评分要稳定，weight 取 0 到 1，小数最多两位，jobKeywords 的 weight 总和尽量接近 1。",
  "gaps 要区分简历完全缺失和已有证据但深度不足；suggestion 必须可执行。",
  "所有 evidence 必须来自输入原文的短句或短语，不要编造经历。"
].join("\n");

function buildUserPrompt(input: ProfileAgentInput) {
  return JSON.stringify(
    {
      outputSchema: {
        jobKeywords: [
          {
            name: "string",
            weight: "number 0-1",
            reason: "string",
            evidence: ["string"]
          }
        ],
        resumeStrengths: [
          {
            title: "string",
            evidence: ["string"],
            matchedKeywords: ["string"]
          }
        ],
        gaps: [
          {
            name: "string",
            risk: "low | medium | high",
            suggestion: "string",
            missingFromResume: "boolean",
            jdEvidence: ["string"]
          }
        ],
        summary: {
          matchScore: "number 0-100",
          roleDirection: "string",
          senioritySignal: "string",
          preparationPriority: ["3-4 short labels, each 4-10 Chinese characters"]
        }
      },
      input
    },
    null,
    2
  );
}

const priorityLabelRules: Array<[RegExp, string]> = [
  [/AI|大模型|LLM|Agent|Prompt|RAG|幻觉|模型|约束/i, "AI 边界"],
  [/项目|经历|深挖|技术难点|真实性/, "项目深挖"],
  [/权衡|取舍|方案|为什么|设计|替代/, "技术权衡"],
  [/量化|指标|数据|结果|效果|收益/, "量化结果"],
  [/自我介绍|STAR|表达|钩子|回答/, "表达结构"],
  [/反问|业务目标|用户分层|团队问题/, "反问准备"],
  [/八股|基础|原理|浏览器|手写|算法|力扣/, "基础巩固"],
  [/协作|沟通|跨部门|推进/, "协作案例"],
  [/业务|商业|行业|公司|竞品|用户|增长/, "业务理解"],
  [/性能|优化|首屏|渲染/, "性能优化"],
  [/安全|隐私|权限|XSS|CSRF|风控/, "安全边界"],
  [/系统|架构|并发|稳定|扩展/, "架构设计"]
];

function compactPriorityLabel(item: string) {
  const normalized = item.replace(/\s+/g, " ").trim();
  const matched = priorityLabelRules.find(([pattern]) => pattern.test(normalized));
  if (matched) return matched[1];

  const firstPhrase = normalized
    .split(/[，,。；;：:、]/)[0]
    .replace(/^(优先|重点|建议|需要|准备|补充|强化|完善|梳理)/, "")
    .trim();

  return firstPhrase.length > 10 ? firstPhrase.slice(0, 10) : firstPhrase;
}

function normalizeProfileAnalysis(analysis: ProfileAnalysis): ProfileAnalysis {
  const seen = new Set<string>();
  const priority = analysis.summary.preparationPriority
    .map(compactPriorityLabel)
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 4);

  return {
    ...analysis,
    summary: {
      ...analysis.summary,
      preparationPriority: priority.length > 0 ? priority : analysis.gaps.slice(0, 4).map((gap) => gap.name)
    }
  };
}

export async function analyzeProfileWithAgent(input: ProfileAgentInput): Promise<{
  analysis: ProfileAnalysis;
  source: "llm";
}> {
  if (!(await hasLlmConfig())) {
    throw new Error("未配置 OPENAI_API_KEY，请检查后端环境变量。");
  }

  const raw = await createJsonChatCompletion([
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(input) }
  ]);
  const parsed = extractJsonObject(raw);
  const analysis = normalizeProfileAnalysis(profileAnalysisSchema.parse(parsed));

  return {
    analysis,
    source: "llm"
  };
}
