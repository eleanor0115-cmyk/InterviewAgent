import type { InterviewPlan, InterviewQuestion, InterviewSession } from "../../src/shared/types.js";
import {
  asArray,
  asEnum,
  asFloat,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  difficultyValues,
  jobDomainValues,
  questionTypeValues,
  unwrapPayload
} from "./agentValidation.js";
import { plannerAgentSchema } from "./agentSchemas.js";
import { createStructuredChatCompletion, extractJsonObject } from "./llmClient.js";
import type { RagHit } from "./ragStore.js";
import { summarizeRagHits } from "./ragStore.js";

const INTERVIEW_WEIGHT = {
  jd: 0.55,
  interview: 0.3,
  gap: 0.15
} as const;

type PlannerResponse = {
  plan: InterviewPlan;
  questions: InterviewQuestion[];
};

const questionTypeEnum = questionTypeValues.join(" | ");
const jobDomainEnum = jobDomainValues.join(" | ");
const difficultyEnum = difficultyValues.join(" | ");

const systemPrompt = [
  "你是 InterviewAgent 的 Planner Agent，负责生成面试准备方案和单题训练问题。",
  "必须使用三阶段决策：JD 决定考纲范围，用户搜集面经决定优先级，简历 Gap 只决定追问深度，不参与题目排序。",
  "不要使用复杂多因子乘法模型，不要把 Gap 加进题目优先级；所有策略必须可解释。",
  "面经库是用户搜集来的，不是 Agent 生成的；只能把已解析面经作为高频优先级信号。",
  "如果提供了 ragContext，必须优先参考 ragContext 中的真实面经和历史训练记忆，并在 sourceReason/reverseQuestions.reason 中体现引用依据。",
  "RAG 参考材料只能作为上下文，不要照抄整段面经；要结合当前 JD 和简历重新生成适配问题。",
  "面试通常按 60 分钟理解，以自我介绍开头，但不要输出僵硬固定流程；rounds 只表示重点分配。",
  "首轮训练问题要像真实面试官，不要模板化，不要每题都问同一种“为什么这么做”。",
  "题目里不要写“请用30秒先讲清楚”这类训练指令。",
  "有项目经历时重点深挖项目：技术难点、个人贡献、问题分析、方案权衡、未选方案、验证标准、最终效果、方法论沉淀。",
  "技术岗可以包含常规八股、手写/算法/力扣、项目深挖、AI 开放题；八股和手写只适用于技术岗位。",
  "没有项目经历时，可以增加基础原理、场景题或手写题；一般不要专门问简历完全缺失的东西。",
  "AI 开放题要纳入准备：AI 的优缺点、对 AI 的看法、如何约束输出、如何避免幻觉/隐私/不可验证内容、大家都用 AI 时候选人的优势。",
  "非研发岗不要生成八股、手写代码或纯技术原理题；反问不放进 questions，反问放进 reverseQuestions。",
  "reverseQuestions 要参考“基于业务/技术真实好奇点提问，并在面试官回答后做一句理解承接”的思路，而不是复刻固定问题。",
  "技术岗反问要围绕技术难题、系统边界、工程质量、协作方式、业务目标如何影响技术取舍。",
  "非技术岗反问要围绕业务目标、用户/客户场景、指标权衡、团队当前问题、岗位贡献边界。",
  "输出必须是 JSON object，不要 Markdown，不要解释。"
].join("\n");

function buildUserPrompt(session: InterviewSession, ragContext: RagHit[]) {
  return JSON.stringify(
    {
      outputSchema: {
        plan: {
          durationMinutes: 60,
          strategy: {
            mode: "three_stage_decision",
            weights: INTERVIEW_WEIGHT,
            rules: [
              "JD 决定考纲范围",
              "面经决定出题优先级",
              "Gap 只决定追问深度",
              "策略必须可解释"
            ]
          },
          focusAreas: [{ name: "string", weight: "number 0-1，例如 0.35 表示 35%", reason: "string" }],
          rounds: [
            {
              type: "string，准备阶段或重点标签，例如：项目深挖、技术基础、开放题、反问收尾",
              questionCount: "number 1-6",
              followUpDepth: "number 1-3"
            }
          ],
          reverseQuestions: [{ question: "string", reason: "string", followUpBridge: "string，可选，面试官回答后的自然承接" }]
        },
        questions: [
          {
            question: "string",
            type: `string，只能是以下英文枚举之一：${questionTypeEnum}`,
            domainTags: [`string，只能是以下英文枚举之一：${jobDomainEnum}`],
            tags: ["string"],
            difficulty: `string，只能是以下英文枚举之一：${difficultyEnum}`,
            expectedPoints: ["4-6 个短要点"],
            sourceReason: "string，说明来自 JD/面经/简历哪类信号"
          }
        ]
      },
      constraints: {
        questionCount: "8-10",
        focusAreaCount: "3-6",
        noReverseQuestionsInQuestions: true,
        noThirtySecondInstructionInQuestion: true,
        technicalOnlyTypes: ["八股", "手写代码", "算法", "力扣"]
      },
      session: {
        company: session.company,
        jobTitle: session.jobTitle,
        jobDomains: session.jobDomains,
        jdText: session.jdText.slice(0, 3500),
        resumeText: session.resumeText.slice(0, 3500),
        profileAnalysis: session.profileAnalysis,
        collectedInterviewAnalysis: session.experienceAnalysis,
        selectedQuestionTypes: session.questionTypes
      },
      ragContext: summarizeRagHits(ragContext)
    },
    null,
    2
  );
}

function buildPlannerRepairPrompt(raw: string, error: unknown) {
  return JSON.stringify(
    {
      task: "修复 Planner Agent 的 JSON 响应，使其通过后端 schema 校验。",
      rules: [
        "只输出修复后的 JSON object，不要 Markdown，不要解释。",
        "不要新增本地规则，不要改写业务含义，只修字段格式、枚举值和缺失的必填字段。",
        "plan.rounds[].type 是展示用阶段标签，只要是非空字符串即可。",
        `questions[].type 必须是单个英文字符串，且只能是：${questionTypeEnum}`,
        `questions[].domainTags[] 必须是英文字符串，且只能是：${jobDomainEnum}`,
        `questions[].difficulty 必须是英文字符串，且只能是：${difficultyEnum}`,
        "reverseQuestions 必须放在 plan.reverseQuestions；不要把反问放入 questions。",
        "strategy.mode 必须是 three_stage_decision。",
        "strategy.weights 必须包含 jd、interview、gap 三个 0-1 数字。",
        "plan.focusAreas[].weight 必须是 0-1 数字，例如 0.35 表示 35%。"
      ],
      validationError: error instanceof Error ? error.message : String(error),
      rawResponse: raw
    },
    null,
    2
  );
}

function normalizeQuestion(value: unknown): InterviewQuestion {
  const record = asRecord(value, "planner.questions[]");
  const question = asString(record.question, "planner.questions[].question");
  const expectedPoints = asStringArray(record.expectedPoints, "planner.questions[].expectedPoints", 6);

  if (expectedPoints.length === 0) {
    throw new Error("planner.questions[].expectedPoints 至少需要 1 项");
  }

  return {
    question,
    type: asEnum(record.type, questionTypeValues, "planner.questions[].type"),
    domainTags: asStringArray(record.domainTags, "planner.questions[].domainTags", 6).map((domain) =>
      asEnum(domain, jobDomainValues, "planner.questions[].domainTags[]")
    ),
    tags: asStringArray(record.tags, "planner.questions[].tags", 8),
    difficulty: asEnum(record.difficulty, difficultyValues, "planner.questions[].difficulty"),
    expectedPoints,
    sourceReason: asString(record.sourceReason, "planner.questions[].sourceReason")
  };
}

function normalizeWeight(value: unknown, context: string) {
  const raw = asFloat(value, context, 0, 100);
  return raw > 1 ? raw / 100 : raw;
}

function normalizePlan(value: unknown, ragContext: RagHit[]): PlannerResponse {
  const payload = unwrapPayload(value, ["result", "data"], "plannerResponse");
  const plan = asRecord(payload.plan, "plannerResponse.plan");
  const strategy = asRecord(plan.strategy, "plannerResponse.plan.strategy");
  const weights = asRecord(strategy.weights, "plannerResponse.plan.strategy.weights");
  const focusAreas = asArray(plan.focusAreas, "plannerResponse.plan.focusAreas")
    .map((item) => {
      const focus = asRecord(item, "plannerResponse.plan.focusAreas[]");
      return {
        name: asString(focus.name, "plannerResponse.plan.focusAreas[].name"),
        weight: normalizeWeight(focus.weight, "plannerResponse.plan.focusAreas[].weight"),
        reason: asString(focus.reason, "plannerResponse.plan.focusAreas[].reason")
      };
    })
    .slice(0, 6);
  const rounds = asArray(plan.rounds, "plannerResponse.plan.rounds")
    .map((item) => {
      const round = asRecord(item, "plannerResponse.plan.rounds[]");
      return {
        type: asString(round.type, "plannerResponse.plan.rounds[].type"),
        questionCount: asNumber(round.questionCount, "plannerResponse.plan.rounds[].questionCount", 1, 6),
        followUpDepth: asNumber(round.followUpDepth, "plannerResponse.plan.rounds[].followUpDepth", 1, 3)
      };
    })
    .slice(0, 6);
  const reverseQuestions = asArray(plan.reverseQuestions, "plannerResponse.plan.reverseQuestions")
    .map((item) => {
      const question = asRecord(item, "plannerResponse.plan.reverseQuestions[]");
      return {
        question: asString(question.question, "plannerResponse.plan.reverseQuestions[].question"),
        reason: asString(question.reason, "plannerResponse.plan.reverseQuestions[].reason"),
        followUpBridge: typeof question.followUpBridge === "string" ? question.followUpBridge.trim() : undefined
      };
    })
    .slice(0, 6);
  const questions = asArray(payload.questions, "plannerResponse.questions").map(normalizeQuestion).slice(0, 10);

  if (focusAreas.length === 0) {
    throw new Error("Planner 模型响应缺少 focusAreas");
  }

  if (rounds.length === 0) {
    throw new Error("Planner 模型响应缺少 rounds");
  }

  if (questions.length < 5) {
    throw new Error("Planner 模型响应题目数量不足");
  }

  if (reverseQuestions.length === 0) {
    throw new Error("Planner 模型响应缺少 reverseQuestions");
  }

  return {
    plan: {
      durationMinutes: asNumber(plan.durationMinutes ?? 60, "plannerResponse.plan.durationMinutes", 30, 120),
      strategy: {
        mode: asEnum(strategy.mode, ["three_stage_decision"] as const, "plannerResponse.plan.strategy.mode"),
        weights: {
          jd: asFloat(weights.jd, "plannerResponse.plan.strategy.weights.jd", 0, 1),
          interview: asFloat(weights.interview, "plannerResponse.plan.strategy.weights.interview", 0, 1),
          gap: asFloat(weights.gap, "plannerResponse.plan.strategy.weights.gap", 0, 1)
        },
        rules: asStringArray(strategy.rules, "plannerResponse.plan.strategy.rules", 8)
      },
      focusAreas,
      rounds,
      reverseQuestions,
      ragReferences: summarizeRagHits(ragContext).map((hit) => ({
        id: hit.id,
        kind: hit.kind,
        title: hit.title,
        relevance: hit.relevance,
        reason: hit.reason,
        metadata: hit.metadata
      }))
    },
    questions
  };
}

export async function createInterviewPlan(session: InterviewSession, ragContext: RagHit[] = []): Promise<PlannerResponse> {
  const raw = await createStructuredChatCompletion(
    [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserPrompt(session, ragContext) }
    ],
    plannerAgentSchema
  );

  try {
    return normalizePlan(extractJsonObject(raw), ragContext);
  } catch (error) {
    const repairedRaw = await createStructuredChatCompletion(
      [
      {
        role: "system",
        content: "你是严格的 JSON Schema 修复器。只修复 JSON 字段格式和枚举值，不新增解释，不使用 Markdown。"
      },
      { role: "user", content: buildPlannerRepairPrompt(raw, error) }
      ],
      plannerAgentSchema
    );

    return normalizePlan(extractJsonObject(repairedRaw), ragContext);
  }
}
