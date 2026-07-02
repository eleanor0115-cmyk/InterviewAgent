import type { ProfileAnalysis } from "../../src/shared/types.js";
import { profileAgentSchema } from "./agentSchemas.js";
import { extractJsonObject, createStructuredChatCompletion, hasLlmConfig } from "./llmClient.js";
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
  "反问建议不要模板化，要基于岗位域自适应：技术岗围绕技术难题、系统边界、工程质量、协作方式和业务目标如何影响技术取舍；运营/产品/商业岗可以围绕用户/客户场景、指标权衡、团队当前问题和岗位贡献，并引导候选人在面试官回答后做一句自己的理解承接。",
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

function normalizeProfileAnalysis(analysis: ProfileAnalysis): ProfileAnalysis {
  const seen = new Set<string>();
  const priority = analysis.summary.preparationPriority
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 4);

  if (priority.length === 0) {
    throw new Error("Profile Analyzer 模型响应缺少 preparationPriority");
  }

  return {
    ...analysis,
    summary: {
      ...analysis.summary,
      preparationPriority: priority
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

  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(input) }
    ],
    profileAgentSchema
  );
  const parsed = extractJsonObject(raw);
  const analysis = normalizeProfileAnalysis(profileAnalysisSchema.parse(parsed));

  return {
    analysis,
    source: "llm"
  };
}
